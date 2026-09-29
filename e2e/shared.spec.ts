/* One collection, the same on every device (ADR 0094): the desktop shares its collection, the laptop adds
   it and sees the desktop's songs, and a change made on the laptop reaches the desktop at once. Two
   browsers against a stand-in GLUE Cloud with the shared collection's rules (cloud/src/shared.ts). */
import { test, expect, type Page, type BrowserContext, type WebSocketRoute } from '@playwright/test';
import { launch } from './launch';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SharedCloudServer } from '../tests/sharedCloud';

const fixture = (name: string) => fileURLToPath(new URL('../tests/fixtures/' + name, import.meta.url));
const MUSIC = ['flac-96k-24.flac', 'mp3-128k.mp3', 'aiff-44k-24.aiff', 'aac-128k.m4a'];

async function browserFor(baseURL: string | undefined): Promise<{ ctx: BrowserContext; page: Page; done: () => Promise<void> }> {
  const dir = mkdtempSync(join(tmpdir(), 'mco-shared-'));
  const ctx = await launch(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 1600, height: 900 } });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: (o: { id?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async (o) =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(o.id === 'mco-home' ? 'MCO' : 'Music', { create: true });
  });
  page.on('dialog', d => void d.accept());
  return { ctx, page, done: async () => { await ctx.close(); rmSync(dir, { recursive: true, force: true }); } };
}
async function seed(page: Page, music: string[]) {
  await page.goto('./#/analyze');
  const files = music.map(n => ({ n, b: readFileSync(fixture(n)).toString('base64') }));
  await page.evaluate(async files => {
    const root = await navigator.storage.getDirectory();
    const dir = await (await root.getDirectoryHandle('Music', { create: true })).getDirectoryHandle('Sets', { create: true });
    for (const f of files) { const w = await (await dir.getFileHandle(f.n, { create: true })).createWritable(); await w.write(Uint8Array.from(atob(f.b), c => c.charCodeAt(0))); await w.close(); }
  }, files);
}

/** GLUE Cloud's shared collections (the account's collections), in memory, with the same rules. */
function fakeCloud() {
  const user = { id: 'u1', email: 'dj@example.com', name: 'DJ', picture: null };
  const devices = [{ id: 'b1', kind: 'browser', name: 'Desktop', platform: '', createdAt: 1, lastSeen: 1, role: 'device' }, { id: 'b2', kind: 'browser', name: 'Laptop', platform: '', createdAt: 2, lastSeen: 2, role: 'device' }];
  // GLUE Cloud's shared collections: the real code, on an in-memory database (ADR 0106).
  const server = new SharedCloudServer();
  const socks: Record<string, WebSocketRoute | null> = {};
  const offline = new Set<string>();   // devices that can't reach GLUE Cloud's shared collection
  const leaves: { collection: string; remove: boolean }[] = [];   // cloud sync turned off (ADR 0102)
  const broadcast = (m: unknown) => { for (const w of Object.values(socks)) w?.send(JSON.stringify(m)); };
  const route = async (page: Page, me: string) => {
    await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `
      window.google = { accounts: { id: { initialize(o) { window.__gcb = o.callback; }, disableAutoSelect() {},
        renderButton(el) { const b = document.createElement('button'); b.id = 'fake-google'; b.textContent = 'Sign in with Google'; b.onclick = () => window.__gcb({ credential: 'fake' }); el.appendChild(b); } } } };` }));
    await page.route('https://glue-api.joaopmanso.workers.dev/v1/**', async r => {
      const req = r.request(), u = new URL(req.url()), p = u.pathname, m = req.method();
      const json = (b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
      if (p === '/v1/auth/google' || p === '/v1/auth/refresh') return json({ access: 'a-' + me, refresh: 'r-' + me, deviceId: me, user });
      if (p === '/v1/me') return json({ user, thisDevice: me, devices, sessions: [] });
      if (p === '/v1/turn') return json({ iceServers: [], ttl: 0 });
      const lv = /^\/v1\/shared\/([\w-]+)\/leave$/.exec(p);
      if (lv) leaves.push({ collection: lv[1], remove: req.postDataJSON().remove === true });
      if (/^\/v1\/shared\/[\w-]+\//.test(p) && offline.has(me)) return r.abort('internetdisconnected');
      const a = await server.answer(m, u, req.postData(), me);
      if (a) return r.fulfill({ status: a.status, contentType: a.type, body: a.body });
      return json({ ok: true });
    });
    await page.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, ws => {
      socks[me] = ws;
      const online = Object.keys(socks).filter(k => socks[k]);
      for (const w of Object.values(socks)) w?.send(JSON.stringify({ type: 'presence', online }));
    });
  };

  server.onPush = broadcast;
  const firstId = async () => (await server.collections())[0] ?? '';
  const pathsOf = async () => { const id = await firstId(); return id ? [...await server.paths(id)] : []; };
  return { server, firstId, pathsOf, socks, offline, leaves, broadcast, route };
}

test('cloud sync: the desktop’s collection is the account’s by itself; the laptop, with nothing of its own, takes it; a rating there shows on the desktop at once; a clash asks, and the answer reaches both (ADR 0101)', async ({ baseURL }) => {
  test.setTimeout(240_000);
  const { server, firstId, pathsOf, socks, offline, route } = fakeCloud();
  const desk = await browserFor(baseURL), lap = await browserFor(baseURL);
  try {
    // The desktop: its music, signed in, and "Share".
    await route(desk.page, 'b1');
    await seed(desk.page, MUSIC);
    await desk.page.goto('./');
    await desk.page.click('#choose-home');
    await desk.page.fill('#profile-name', 'DJ Test');
    await desk.page.getByRole('button', { name: 'Create profile' }).click();
    await desk.page.click('#onb-skip');
    await desk.page.click('#add-folder');
    await expect(desk.page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
    await expect(desk.page.locator('.an')).toContainText('All analysed', { timeout: 120_000 });
    await desk.page.click('#account-btn');
    await desk.page.click('#fake-google');
    await desk.page.keyboard.press('Escape');
    // Cloud sync is on: signed in, the collection is the account's by itself (ADR 0101).
    await expect(desk.page.locator('#shared-chip')).toHaveText('Synced', { timeout: 30_000 });
    await expect.poll(async () => (await pathsOf()).length, { timeout: 20_000 }).toBeGreaterThan(3);
    await expect(desk.page.locator('.tr')).toHaveCount(4);

    // The laptop: no music of its own; it adds the shared collection, and sees the desktop's songs.
    await route(lap.page, 'b2');
    await seed(lap.page, []);
    await lap.page.goto('./');
    await lap.page.click('#choose-home');
    await lap.page.fill('#profile-name', 'DJ Test');
    await lap.page.getByRole('button', { name: 'Create profile' }).click();
    await lap.page.click('#onb-skip');
    await lap.page.click('#account-btn');
    await lap.page.click('#fake-google');
    await lap.page.keyboard.press('Escape');
    const cid = await firstId();
    // Nothing of its own yet: it takes the account's collection by itself.
    await expect(lap.page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
    await expect(lap.page.locator('#shared-chip')).toBeVisible();
    const row = lap.page.locator('.tr', { hasText: 'Fixture FLAC' });
    // The desktop's song (no GLUE Home there to stream it): it plays where it is.
    await expect(row.locator('.pbtn')).toHaveCount(0);
    // A rating on the laptop: on the desktop at once (GLUE Cloud tells it), with its file still its own.
    await row.hover();
    await row.locator('.c-rate button').nth(3).click({ position: { x: 10, y: 6 } });
    await expect(desk.page.locator('.tr', { hasText: 'Fixture FLAC' }).locator('.stars')).toHaveAttribute('aria-valuenow', '4', { timeout: 30_000 });
    await expect(desk.page.locator('.tr', { hasText: 'Fixture FLAC' }).locator('.pbtn')).toHaveCount(1);

    // A clash (ADR 0095): a playlist renamed on the laptop while it's offline, and on the desktop too.
    await desk.page.click('#new-playlist'); await desk.page.keyboard.type('Friday'); await desk.page.keyboard.press('Enter');
    await expect(lap.page.locator('.lside .tree .name', { hasText: 'Friday' })).toHaveCount(1, { timeout: 30_000 });
    const rename = async (page: Page, from: string, to: string) => {
      await page.locator('.lside .tree .item', { hasText: from }).click({ button: 'right' });
      await page.locator('.cmenu [data-m="rename"]').click();
      await page.keyboard.press('Control+A'); await page.keyboard.type(to); await page.keyboard.press('Enter');
      await expect(page.locator('.lside .tree .name', { hasText: to })).toHaveCount(1);
    };
    offline.add('b2');
    await rename(lap.page, 'Friday', 'Friday late');
    await expect(lap.page.locator('#saving')).toBeHidden({ timeout: 20_000 });
    const seqBefore = (await server.counts(cid)).seq;
    await rename(desk.page, 'Friday', 'Friday night');
    await expect.poll(async () => (await server.counts(cid)).seq, { timeout: 20_000 }).toBeGreaterThan(seqBefore);
    // Back online: GLUE Cloud's news reaches it, and the box asks.
    offline.delete('b2');
    socks.b2?.send(JSON.stringify({ type: 'shared', collection: cid, seq: (await server.counts(cid)).seq, from: 'b1' }));
    const box = lap.page.locator('#clashes');
    await expect(box).toContainText('1 change clashes with Desktop', { timeout: 30_000 });
    await expect(box).toContainText('Here: Friday late');
    await expect(box).toContainText('Desktop');
    await expect(box).toContainText('Friday night');
    await expect(lap.page.locator('.lside .tree .name', { hasText: 'Friday night' })).toHaveCount(1);   // theirs until answered
    await box.locator('[data-keep="mine"]').click();
    await expect(box).toHaveCount(0);
    await expect(lap.page.locator('.lside .tree .name', { hasText: 'Friday late' })).toHaveCount(1);
    await expect(desk.page.locator('.lside .tree .name', { hasText: 'Friday late' })).toHaveCount(1, { timeout: 30_000 });
  } finally { await desk.done(); await lap.done(); }
});

/** This browser's (only) profile and collection, from its GLUE folder. */
test('a laptop with songs of its own is asked once: put into the account’s collection, the same songs become one, its playlist reaches the desktop (ADR 0096, 0101)', async ({ baseURL }) => {
  test.setTimeout(240_000);
  const { firstId, pathsOf, route } = fakeCloud();
  const desk = await browserFor(baseURL), lap = await browserFor(baseURL);
  try {
    // The desktop shares its collection.
    await route(desk.page, 'b1');
    await seed(desk.page, MUSIC);
    await desk.page.goto('./');
    await desk.page.click('#choose-home');
    await desk.page.fill('#profile-name', 'DJ Test');
    await desk.page.getByRole('button', { name: 'Create profile' }).click();
    await desk.page.click('#onb-skip');
    await desk.page.click('#add-folder');
    await expect(desk.page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
    await desk.page.click('#account-btn');
    await desk.page.click('#fake-google');
    await desk.page.keyboard.press('Escape');
    // Cloud sync is on: signed in, the collection is the account's by itself (ADR 0101).
    await expect(desk.page.locator('#shared-chip')).toHaveText('Synced', { timeout: 30_000 });
    await expect.poll(async () => (await pathsOf()).length, { timeout: 20_000 }).toBeGreaterThan(3);

    // The laptop: two of the same songs and a playlist of its own, in a collection merged with the desktop's.
    await route(lap.page, 'b2');
    await seed(lap.page, ['flac-96k-24.flac', 'mp3-128k.mp3']);
    await lap.page.goto('./');
    await lap.page.click('#choose-home');
    await lap.page.fill('#profile-name', 'DJ Test');
    await lap.page.getByRole('button', { name: 'Create profile' }).click();
    await lap.page.click('#onb-skip');
    await lap.page.click('#add-folder');
    await expect(lap.page.locator('.tr')).toHaveCount(2, { timeout: 30_000 });
    await expect(lap.page.locator('.an')).toContainText('All analysed', { timeout: 90_000 });   // their details, in this browser's cache
    await lap.page.click('#new-playlist'); await lap.page.keyboard.type('Lap set'); await lap.page.keyboard.press('Enter');
    await expect(lap.page.locator('.lside .tree .name', { hasText: 'Lap set' })).toHaveCount(1);
    await expect(lap.page.locator('#saving')).toBeHidden({ timeout: 20_000 });
    await lap.page.click('#account-btn');
    await lap.page.click('#fake-google');
    await lap.page.keyboard.press('Escape');

    // "Move into shared": one collection, the songs once each; the laptop's own play here, the rest are the desktop's.
    // Signed in, the account already has a collection: asked once (ADR 0101).
    await expect(lap.page.locator('#join-box')).toContainText('My collection', { timeout: 30_000 });
    await lap.page.click('#join-into-go');
    await expect(lap.page.locator('#join-box')).toHaveCount(0, { timeout: 30_000 });
    await lap.page.locator('.lside .name', { hasText: 'All tracks' }).click();
    await expect(lap.page.locator('#shared-chip')).toBeVisible({ timeout: 30_000 });
    await expect(lap.page.locator('.notice')).toContainText('2 songs were already there, 0 came in');
    await expect(lap.page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
    await expect(lap.page.locator('.tr', { hasText: 'Fixture FLAC' }).locator('.pbtn')).toHaveCount(1);
    await expect(lap.page.locator('.tr', { hasText: 'aiff-44k-24' }).locator('.pbtn')).toHaveCount(0);
    await expect(lap.page.locator('.lside .tree .name', { hasText: 'Lap set' })).toHaveCount(1);
    await expect(lap.page.locator('#collection-pick option')).toHaveCount(2);   // the shared one and “New”: the old one is out of the list
    // On the desktop: the laptop's playlist, and still four songs.
    await expect(desk.page.locator('.lside .tree .name', { hasText: 'Lap set' })).toHaveCount(1, { timeout: 30_000 });
    await expect(desk.page.locator('.tr')).toHaveCount(4);
    // The laptop's analyses came along to the account's collection, in this browser's cache (ADR 0102).
    const cid = await firstId();
    const cached = (col: string) => lap.page.evaluate(async col => {
      type D = { entries(): AsyncIterable<[string, FileSystemHandle]> };
      let n = 0;
      try {
        const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('cache')).getDirectoryHandle('details');
        const c = await d.getDirectoryHandle(col);
        for await (const [, sh] of (c as unknown as D).entries()) if (sh.kind === 'directory') for await (const [n2] of (sh as unknown as D).entries()) if (n2.endsWith('.json')) n++;
      } catch { /* none */ }
      return n;
    }, col);
    await expect.poll(() => cached(cid), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    // The backup came first.
    expect(await lap.page.evaluate(async () => {
      const b = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('MCO')).getDirectoryHandle('backups');
      const names: string[] = []; for await (const [n] of (b as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) names.push(n);
      return names.some(n => n.startsWith('pre-shared-'));
    })).toBe(true);
    expect((await pathsOf()).length).toBeGreaterThan(3);
  } finally { await desk.done(); await lap.done(); }
});

test('duplicates found on the desktop show on the laptop: the 2× badge on the desktop’s songs (ADR 0098)', async ({ baseURL }) => {
  test.setTimeout(240_000);
  const { execFileSync } = await import('node:child_process');
  const ff = process.env.FFMPEG || 'ffmpeg';
  try { execFileSync(ff, ['-version'], { stdio: 'ignore' }); } catch { test.skip(true, 'needs ffmpeg to make an MP3 rip'); }
  // The same 40 s synthetic recording as a WAV and as a delayed 48 kHz MP3, and a different one (as in library.spec).
  const make = (seed: number) => {
    let s = seed; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const sr = 44100, x = new Float32Array(sr * 40);
    for (let t0 = 0; t0 < 40; t0 += 0.25) {
      const f = 110 * Math.pow(2, Math.floor(r() * 36) / 12), amp = 0.1 + r() * 0.2, a = Math.floor(t0 * sr);
      for (let i = a; i < Math.min(x.length, a + sr * 0.6); i++) { const t = (i - a) / sr; x[i] += amp * Math.exp(-t * 6) * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t)); }
    }
    const wav = Buffer.alloc(44 + x.length * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + x.length * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(x.length * 2, 40);
    for (let i = 0; i < x.length; i++) wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
    return wav;
  };
  const tmp = mkdtempSync(join(tmpdir(), 'mco-dup-shared-'));
  writeFileSync(join(tmp, 'a.wav'), make(11)); writeFileSync(join(tmp, 'c.wav'), make(99));
  execFileSync(ff, ['-loglevel', 'error', '-y', '-i', join(tmp, 'a.wav'), '-af', 'adelay=1300', '-ar', '48000', '-b:a', '128k', join(tmp, 'b.mp3')]);
  const files = [['HHH 04 RADIX.wav', 'a.wav'], ['HHH-Bebida.mp3', 'b.mp3'], ['Something else.wav', 'c.wav']].map(([n, f]) => ({ n, b: readFileSync(join(tmp, f)).toString('base64') }));
  const { firstId, pathsOf, route } = fakeCloud();
  const desk = await browserFor(baseURL), lap = await browserFor(baseURL);
  try {
    await route(desk.page, 'b1');
    await desk.page.goto('./#/analyze');
    await desk.page.evaluate(async files => {
      const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Music', { create: true });
      for (const f of files) { const w = await (await d.getFileHandle(f.n, { create: true })).createWritable(); await w.write(Uint8Array.from(atob(f.b), c => c.charCodeAt(0))); await w.close(); }
    }, files);
    await desk.page.goto('./');
    await desk.page.click('#choose-home');
    await desk.page.fill('#profile-name', 'DJ Test');
    await desk.page.getByRole('button', { name: 'Create profile' }).click();
    await desk.page.click('#onb-skip');
    await desk.page.click('#add-folder');
    await expect(desk.page.locator('.tr')).toHaveCount(3, { timeout: 30_000 });
    await expect(desk.page.locator('.an')).toContainText('All analysed', { timeout: 90_000 });
    await expect(desk.page.locator('.tr', { hasText: 'HHH 04 RADIX' }).locator('.dup')).toHaveText('2×', { timeout: 30_000 });
    await expect(desk.page.locator('.tr')).toHaveCount(2);
    await desk.page.click('#account-btn');
    await desk.page.click('#fake-google');
    await desk.page.keyboard.press('Escape');
    // Cloud sync is on: signed in, the collection is the account's by itself (ADR 0101).
    await expect(desk.page.locator('#shared-chip')).toHaveText('Synced', { timeout: 30_000 });
    // The desktop's matches go up with the collection.
    await expect.poll(async () => (await pathsOf()).some(p => p === 'dupes/b1.json'), { timeout: 30_000 }).toBe(true);

    // The laptop: no music; the desktop's two rips are one group here too.
    await route(lap.page, 'b2');
    await lap.page.goto('./');
    await lap.page.click('#choose-home');
    await lap.page.fill('#profile-name', 'DJ Test');
    await lap.page.getByRole('button', { name: 'Create profile' }).click();
    await lap.page.click('#onb-skip');
    await lap.page.click('#account-btn');
    await lap.page.click('#fake-google');
    await lap.page.keyboard.press('Escape');
    // Nothing of its own yet: it takes the account's collection by itself.
    await expect(lap.page.locator('.tr', { hasText: 'HHH 04 RADIX' }).locator('.dup')).toHaveText('2×', { timeout: 30_000 });
    // One row per song there too: the best copy with its badge.
    await expect(lap.page.locator('.tr')).toHaveCount(2);
    await expect(lap.page.locator('.tr', { hasText: 'HHH-Bebida' })).toHaveCount(0);
    await expect(lap.page.locator('.tr', { hasText: 'Something else' }).locator('.dup')).toHaveCount(0);
  } finally { await desk.done(); await lap.done(); rmSync(tmp, { recursive: true, force: true }); }
});

const REKORDBOX = `<?xml version="1.0" encoding="UTF-8"?><DJ_PLAYLISTS Version="1.0.0"><PRODUCT Name="rekordbox" Version="7.0.0"/>
<COLLECTION Entries="2">
<TRACK TrackID="1" Name="Hi-res claim" Artist="Tester" AverageBpm="120.00" Tonality="8A" Location="file://localhost/C:/Users/dj/Music/Sets/flac-96k-24.flac"/>
<TRACK TrackID="2" Name="Lossy one" Artist="Tester" Location="file://localhost/C:/Users/dj/Music/Sets/mp3-128k.mp3"/>
</COLLECTION>
<PLAYLISTS><NODE Type="0" Name="ROOT" Count="1"><NODE Name="Friday" Type="1" KeyType="0" Entries="2"><TRACK Key="2"/><TRACK Key="1"/></NODE></NODE></PLAYLISTS></DJ_PLAYLISTS>`;

test('the desktop’s DJ library on the laptop: with the desktop’s name, not read here, and its playlists imported from here (ADR 0099)', async ({ baseURL }) => {
  test.setTimeout(240_000);
  const { firstId, pathsOf, leaves, route } = fakeCloud();
  const desk = await browserFor(baseURL), lap = await browserFor(baseURL);
  try {
    // The desktop: its rekordbox library, then shared.
    await route(desk.page, 'b1');
    await seed(desk.page, []);
    await desk.page.goto('./');
    await desk.page.click('#choose-home');
    await desk.page.fill('#profile-name', 'DJ Test');
    await desk.page.getByRole('button', { name: 'Create profile' }).click();
    await desk.page.click('#onb-skip');
    await desk.page.setInputFiles('#import-input', { name: 'rekordbox.xml', mimeType: 'text/xml', buffer: Buffer.from(REKORDBOX) });
    await expect(desk.page.locator('.tr')).toHaveCount(2, { timeout: 30_000 });
    await desk.page.click('#account-btn');
    await desk.page.click('#fake-google');
    await desk.page.keyboard.press('Escape');
    // Cloud sync is on: signed in, the collection is the account's by itself (ADR 0101).
    await expect(desk.page.locator('#shared-chip')).toHaveText('Synced', { timeout: 30_000 });
    await expect.poll(async () => (await pathsOf()).some(p => p.startsWith('sources/')), { timeout: 30_000 }).toBe(true);
    // On the desktop it's its own: Refresh, and no computer's name.
    await expect(desk.page.locator('#dj-libs [data-dj-where]')).toHaveCount(0);
    await expect(desk.page.locator('#dj-libs [data-dj-refresh]')).toHaveCount(1);

    // The laptop adds the collection: the library is the desktop's.
    await route(lap.page, 'b2');
    await seed(lap.page, []);
    await lap.page.goto('./');
    await lap.page.click('#choose-home');
    await lap.page.fill('#profile-name', 'DJ Test');
    await lap.page.getByRole('button', { name: 'Create profile' }).click();
    await lap.page.click('#onb-skip');
    await lap.page.click('#account-btn');
    await lap.page.click('#fake-google');
    await lap.page.keyboard.press('Escape');
    // Nothing of its own yet: it takes the account's collection by itself.
    await expect(lap.page.locator('.tr')).toHaveCount(2, { timeout: 30_000 });
    await expect(lap.page.locator('#dj-libs [data-dj-where]')).toHaveText('Desktop');
    await expect(lap.page.locator('#dj-libs [data-dj-refresh]')).toHaveCount(0);
    await expect(lap.page.locator('#dj-libs .tools')).toHaveCount(0);   // removed only where it is

    // Its playlists come into GLUE from here, and reach the desktop.
    await lap.page.locator('#dj-libs [data-dj-open]').click();
    await lap.page.locator('#dj-libs [data-dj-all]').click();
    await expect(lap.page.locator('.notice')).toContainText('1 playlist');
    await expect(lap.page.locator('.lside .tree .name', { hasText: 'rekordbox' })).toHaveCount(1);   // its folder, Friday inside
    await expect(lap.page.locator('.tr')).toHaveCount(2);
    await expect(desk.page.locator('.lside .tree .name', { hasText: 'rekordbox' })).toHaveCount(1, { timeout: 30_000 });

    // Cloud sync off on the desktop (ADR 0102): asked first; it keeps its collection; the account's copy
    // is to go in 30 days (asked for here).
    await desk.page.locator('.top .who').click();
    const sw = desk.page.locator('[data-sync]');
    await expect(sw).toHaveAttribute('aria-pressed', 'true');
    await sw.click();
    await expect(desk.page.locator('#sync-off')).toContainText('keeps its collections');
    await desk.page.check('#sync-off-remove');
    await desk.page.click('#sync-off-go');
    await expect(sw).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => leaves, { timeout: 10_000 }).toEqual([{ collection: await firstId(), remove: true }]);
  } finally { await desk.done(); await lap.done(); }
});
