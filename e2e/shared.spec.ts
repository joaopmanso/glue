/* One collection, the same on every device (ADR 0094): the desktop shares its collection, the laptop adds
   it and sees the desktop's songs, and a change made on the laptop reaches the desktop at once. Two
   browsers against a stand-in GLUE Cloud with the shared collection's rules (cloud/src/shared.ts). */
import { test, expect, chromium, type Page, type BrowserContext, type WebSocketRoute } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL('../tests/fixtures/' + name, import.meta.url));
const MUSIC = ['flac-96k-24.flac', 'mp3-128k.mp3', 'aiff-44k-24.aiff', 'aac-128k.m4a'];

async function browserFor(baseURL: string | undefined): Promise<{ ctx: BrowserContext; page: Page; done: () => Promise<void> }> {
  const dir = mkdtempSync(join(tmpdir(), 'mco-shared-'));
  const ctx = await chromium.launchPersistentContext(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 1600, height: 900 } });
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

/** GLUE Cloud's shared collections, in memory, with the same rules, and the account's merged groups. */
function fakeCloud() {
  const user = { id: 'u1', email: 'dj@example.com', name: 'DJ', picture: null };
  const groups: { id: string; name: string; members: { device: string; profile: string; collection: string }[] }[] = [];
  const devices = [{ id: 'b1', kind: 'browser', name: 'Desktop', platform: '', createdAt: 1, lastSeen: 1, role: 'device' }, { id: 'b2', kind: 'browser', name: 'Laptop', platform: '', createdAt: 2, lastSeen: 2, role: 'device' }];
  // GLUE Cloud's shared collections, in memory, with the same rules.
  const cols = new Map<string, { name: string; seq: number; files: Map<string, { rev: number; hash: string; data: string | null; by?: string; at?: number }> }>();
  const socks: Record<string, WebSocketRoute | null> = {};
  const offline = new Set<string>();   // devices that can't reach GLUE Cloud's shared collection
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
      if (p === '/v1/sync' && m === 'GET') return json({ thisDevice: me, profiles: [] });
      if (p === '/v1/sync/links') return json({ groups });
      if (p === '/v1/sync/manifest') return json({ need: [] });
      if (p === '/v1/sync/ops' && m === 'GET') return json({ ops: [] });
      if (p === '/v1/turn') return json({ iceServers: [], ttl: 0 });
      if (p === '/v1/shared' && m === 'GET') return json({ collections: [...cols].map(([id, c]) => ({ id, name: c.name, seq: c.seq, stats: null, updatedAt: 1 })) });
      if (p === '/v1/shared' && m === 'POST') { const b = req.postDataJSON(); if (!cols.has(b.id)) cols.set(b.id, { name: b.name, seq: 0, files: new Map() }); return json({ id: b.id, name: b.name, seq: cols.get(b.id)!.seq }); }
      const sh = /^\/v1\/shared\/([\w-]+)\/(changes|bundle|push)$/.exec(p), c = sh ? cols.get(sh[1]) : undefined;
      if (sh && offline.has(me)) return r.abort('internetdisconnected');
      if (sh && c) {
        if (sh[2] === 'changes') { const since = Number(u.searchParams.get('since')); return json({ seq: c.seq, more: false, files: [...c.files].filter(([, f]) => f.rev > since).map(([path, f]) => ({ path, rev: f.rev, hash: f.hash, deleted: f.data === null, by: f.by, at: f.at })) }); }
        if (sh[2] === 'bundle') return r.fulfill({ contentType: 'text/plain', body: (req.postDataJSON().paths as string[]).filter(x => c.files.get(x)?.data).map(x => [x, c.files.get(x)!.rev, c.files.get(x)!.hash, c.files.get(x)!.data].join('\t')).join('\n') });
        const rev = ++c.seq, stored: string[] = [], stale: string[] = [];
        for (const line of (req.postData() ?? '').split('\n').filter(Boolean)) {
          const [path, base, hash, , data] = line.split('\t'), cur = c.files.get(path);
          if ((cur?.rev ?? 0) !== Number(base) && !(cur?.data === null && Number(base) === 0)) { stale.push(path); continue; }
          c.files.set(path, { rev, hash, data: data === '-' ? null : data, by: me, at: Date.now() }); stored.push(path);
        }
        if (stored.length) broadcast({ type: 'shared', collection: sh[1], seq: rev, from: me });
        return json({ rev: stored.length ? rev : null, stored, stale });
      }
      return json({ ok: true });
    });
    await page.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, ws => {
      socks[me] = ws;
      const online = Object.keys(socks).filter(k => socks[k]);
      for (const w of Object.values(socks)) w?.send(JSON.stringify({ type: 'presence', online }));
    });
  };

  return { cols, socks, offline, groups, broadcast, route };
}

test('a shared collection: the laptop adds the desktop’s and sees its songs; a rating there shows on the desktop at once; a clash asks, and the answer reaches both', async ({ baseURL }) => {
  test.setTimeout(240_000);
  const { cols, socks, offline, route } = fakeCloud();
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
    await desk.page.click('#share-collection');
    await expect(desk.page.locator('#shared-chip')).toHaveText('Shared', { timeout: 30_000 });
    await expect.poll(() => [...cols.values()][0]?.files.size ?? 0, { timeout: 20_000 }).toBeGreaterThan(3);
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
    const cid = [...cols.keys()][0];
    await expect(lap.page.locator(`#collection-pick option[value="__join:${cid}"]`)).toHaveCount(1, { timeout: 20_000 });
    await lap.page.selectOption('#collection-pick', '__join:' + cid);
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
    const seqBefore = cols.get(cid)!.seq;
    await rename(desk.page, 'Friday', 'Friday night');
    await expect.poll(() => cols.get(cid)!.seq, { timeout: 20_000 }).toBeGreaterThan(seqBefore);
    // Back online: GLUE Cloud's news reaches it, and the box asks.
    offline.delete('b2');
    socks.b2?.send(JSON.stringify({ type: 'shared', collection: cid, seq: cols.get(cid)!.seq, from: 'b1' }));
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
const idsOf = (page: Page) => page.evaluate(async () => {
  type D = { entries(): AsyncIterable<[string, FileSystemDirectoryHandle]> };
  const profs = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('MCO')).getDirectoryHandle('profiles');
  for await (const [pid, h] of (profs as unknown as D).entries()) for await (const [cid] of (await h.getDirectoryHandle('collections') as unknown as D).entries()) return { pid, cid };
  return null;
});

test('a merged collection moves into the shared one: the same songs become one, the laptop’s playlist reaches the desktop (ADR 0096)', async ({ baseURL }) => {
  test.setTimeout(240_000);
  const { cols, groups, route } = fakeCloud();
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
    await desk.page.click('#share-collection');
    await expect(desk.page.locator('#shared-chip')).toHaveText('Shared', { timeout: 30_000 });
    await expect.poll(() => [...cols.values()][0]?.files.size ?? 0, { timeout: 20_000 }).toBeGreaterThan(3);
    const d = (await idsOf(desk.page))!;

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
    await lap.page.click('#new-playlist'); await lap.page.keyboard.type('Lap set'); await lap.page.keyboard.press('Enter');
    await expect(lap.page.locator('.lside .tree .name', { hasText: 'Lap set' })).toHaveCount(1);
    await expect(lap.page.locator('#saving')).toBeHidden({ timeout: 20_000 });
    const l = (await idsOf(lap.page))!;
    groups.push({ id: 'g1', name: 'Main', members: [{ device: 'b1', profile: d.pid, collection: d.cid }, { device: 'b2', profile: l.pid, collection: l.cid }] });
    await lap.page.click('#account-btn');
    await lap.page.click('#fake-google');
    await lap.page.keyboard.press('Escape');

    // "Move into shared": one collection, the songs once each; the laptop's own play here, the rest are the desktop's.
    await lap.page.locator('.lside .name', { hasText: 'All tracks' }).click();
    await lap.page.click('#move-shared', { timeout: 30_000 });
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
    // The backup came first.
    expect(await lap.page.evaluate(async () => {
      const b = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('MCO')).getDirectoryHandle('backups');
      const names: string[] = []; for await (const [n] of (b as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) names.push(n);
      return names.some(n => n.startsWith('pre-shared-'));
    })).toBe(true);
    expect([...cols.values()][0].files.size).toBeGreaterThan(3);
  } finally { await desk.done(); await lap.done(); }
});
