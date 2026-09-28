/* A device without a library of its own (a phone), signed in (ADR 0077): the account's library opens by
   itself from GLUE Cloud in the phone layout (ADR 0078), nothing is made there, its songs stream from the
   desktop's GLUE Home (ADR 0076), and a rating goes to the desktop. Against a stand-in GLUE Cloud; GLUE
   Home's real service page runs with its Rust side stood in (e2e/tauri-mock.ts). */
import { test as base, expect, chromium, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { TAURI_MOCK } from './tauri-mock';

const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-phone-'));
    const ctx = await chromium.launchPersistentContext(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 390, height: 844 }, hasTouch: true });
    try { await use(ctx.pages()[0] ?? await ctx.newPage()); }
    finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
  },
});
const fixture = (name: string) => fileURLToPath(new URL('../tests/fixtures/' + name, import.meta.url));
const gz = (o: unknown) => gzipSync(Buffer.from(JSON.stringify(o))).toString('base64');

test('a phone signs in and the library opens by itself: songs stream from the desktop, a rating goes there (ADR 0077)', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const user = { id: 'u1', email: 'dj@example.com', name: 'DJ', picture: null };
  const devices = [
    { id: 'ph', kind: 'browser', name: 'iPhone', platform: 'iPhone', createdAt: 3, lastSeen: 3 },
    { id: 'desk', kind: 'browser', name: 'Desktop', platform: 'Win32', createdAt: 1, lastSeen: 1 },
    { id: 'hdesk', kind: 'home', name: 'Desktop', platform: 'win32', createdAt: 2, lastSeen: 2, companionOf: 'desk' },
  ];
  // The desktop's collection in the cloud: two songs, their analyses, a playlist.
  const pid = 'pdesk', cid = 'cdesk';
  const song = (id: string, title: string, file: string) => ({ id, status: 'linked', rootId: 'deskroot', relPath: file, importPath: null, fileName: file, size: 5, mtime: 1, title, artist: 'Kloudmen', album: '', genre: 'Techno', label: '', comment: '', year: '2019', duration: 4, format: null, addedAt: '2026-09-01T00:00:00Z', sources: [] });
  // dk03's cover is only in its file's tags: the phone gets it from the desktop's GLUE Home (ADR 0082).
  const tracks = { dk01: song('dk01', 'Genorale', 'Genorale.flac'), dk02: song('dk02', 'Manyaro', 'Manyaro.mp3'), dk03: song('dk03', 'Covered', 'Covered.mp3') };
  const files = new Map<string, { hash: string; data: string }>([
    [`collections/${cid}/collection.json`, { hash: 'h1', data: gz({ schemaVersion: 1, id: cid, name: 'My collection', createdAt: '', roots: [{ id: 'deskroot', name: 'Music', absPath: null, handleKey: 'x', addedAt: '' }] }) }],
    [`collections/${cid}/tracks/dk.json`, { hash: 'h2', data: gz({ schemaVersion: 1, items: tracks }) }],
    [`collections/${cid}/lists/l1.json`, { hash: 'h3', data: gz({ schemaVersion: 1, id: 'l1', kind: 'playlist', name: 'Friday', parentId: null, position: 0, notes: '', items: ['dk02', 'dk01'], origin: null, createdAt: '' }) }],
  ]);
  const ops: { device: string; profile: string; collection: string; op: unknown }[] = [];
  const turnAsked: string[] = [];
  await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { id: { initialize(o) { window.__gcb = o.callback; }, disableAutoSelect() {},
      renderButton(el) { const b = document.createElement('button'); b.className = 'fake-google'; b.textContent = 'Sign in with Google'; b.onclick = () => window.__gcb({ credential: 'fake' }); el.appendChild(b); } } } };` }));
  await page.route('https://glue-api.joaopmanso.workers.dev/v1/**', async r => {
    const req = r.request(), u = new URL(req.url()), m = req.method(), p = u.pathname;
    const json = (b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (p === '/v1/health') return json({ ok: true });
    if (p === '/v1/auth/google') return json({ access: 'a', refresh: 'r', deviceId: 'ph', user });
    if (p === '/v1/auth/refresh') return json({ access: 'a', refresh: 'r', deviceId: 'ph' });
    if (p === '/v1/me') return json({ user, thisDevice: 'ph', devices });
    // The relay (ADR 0081): an address that doesn't exist, so the connection stays direct.
    if (p === '/v1/turn') { turnAsked.push('phone'); return json({ iceServers: [{ urls: ['turn:relay.invalid:3478?transport=udp'], username: 'u', credential: 'c' }], ttl: 86400 }); }
    if (p === '/v1/sync' && m === 'GET') return json({ thisDevice: 'ph', profiles: [{ device: { id: 'desk', name: 'Desktop', kind: 'browser' }, profile: { id: pid, name: 'DJ', color: null }, stats: { collections: [{ id: cid, name: 'My collection', tracks: 2 }] }, files: files.size, stored: files.size, bytes: 1, updatedAt: Date.now(), complete: true }] });
    if (p === '/v1/sync/links' && m === 'GET') return json({ groups: [] });
    if (p === '/v1/sync/ops' && m === 'POST') { for (const o of req.postDataJSON().ops) ops.push(o); return json({ queued: 1 }); }
    if (p === '/v1/sync/ops' && m === 'GET') return json({ ops: [] });
    if (p === `/v1/sync/desk/${pid}` && m === 'GET') return json({ files: [...files].map(([path, x]) => ({ path, hash: x.hash, size: 1, stored: x.data.length })) });
    if (p === `/v1/sync/desk/${pid}/bundle`) return r.fulfill({ contentType: 'text/plain', body: (req.postDataJSON().paths as string[]).filter(x => files.has(x)).map(x => x + '\t' + files.get(x)!.hash + '\t' + files.get(x)!.data).join('\n') });
    return json({ error: 'not found' }, 404);
  });
  // The signaling room, relaying the handshake between the phone and the desktop's GLUE Home.
  const socks: Record<string, import('@playwright/test').WebSocketRoute | null> = {};
  const presence = () => { const online = Object.keys(socks).filter(k => socks[k]); for (const w of Object.values(socks)) w?.send(JSON.stringify({ type: 'presence', online })); };
  const room = (me: string) => (ws: import('@playwright/test').WebSocketRoute) => {
    socks[me] = ws; presence();
    ws.onMessage(raw => { const j = JSON.parse(String(raw)); if (j.type === 'signal') socks[j.to]?.send(JSON.stringify({ type: 'signal', from: me, data: j.data })); });
  };
  await page.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, room('ph'));

  // The desktop's GLUE Home: its GLUE folder (read only) and the songs' files.
  const home = await page.context().newPage();
  await home.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => {
    if (new URL(r.request().url()).pathname === '/v1/turn') { turnAsked.push('home'); return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ iceServers: [{ urls: ['turn:relay.invalid:3478?transport=udp'], username: 'u', credential: 'c' }], ttl: 86400 }) }); }
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ access: 'h' }) });
  });
  await home.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, room('hdesk'));
  await home.addInitScript(TAURI_MOCK);
  const glue = {
    'mco.json': JSON.stringify({ schemaVersion: 1, profiles: [{ id: pid, name: 'DJ', color: '#fff' }], lastProfile: pid }),
    [`profiles/${pid}/profile.json`]: JSON.stringify({ schemaVersion: 1, id: pid, name: 'DJ', color: '#fff', createdAt: '', collections: [{ id: cid, name: 'My collection' }], lastCollection: cid }),
    [`profiles/${pid}/collections/${cid}/collection.json`]: JSON.stringify({ schemaVersion: 1, id: cid, name: 'My collection', createdAt: '', roots: [{ id: 'deskroot', name: 'Music', absPath: null, handleKey: 'x', addedAt: '' }] }),
    [`profiles/${pid}/collections/${cid}/tracks/dk.json`]: JSON.stringify({ schemaVersion: 1, items: tracks }),
  };
  const disk = { 'C:\\Users\\dj\\Music\\Genorale.flac': [...readFileSync(fixture('flac-96k-24.flac'))], 'C:\\Users\\dj\\Music\\Manyaro.mp3': [...readFileSync(fixture('mp3-128k.mp3'))], 'C:\\Users\\dj\\Music\\Covered.mp3': [...readFileSync(fixture('mp3-cover.mp3'))] };
  await home.addInitScript(({ glue, disk }) => {
    const w = window as unknown as Record<string, unknown>; w.__glue = glue; w.__disk = disk;
    localStorage.setItem('home-config', JSON.stringify({ deviceId: 'hdesk', token: 't', name: 'Desktop', user: { email: 'dj@example.com', name: 'DJ' }, incoming: null, running: true, askedAutostart: true, glue: 'C:\\Users\\dj\\Documents\\GLUE' }));
  }, { glue, disk });
  await home.goto('http://localhost:5176/service.html');
  await expect(home.locator('#state')).toContainText('Online as Desktop');
  // The cover services (ADR 0086), stood in: Deezer knows "Genorale" (no cover in its tags), with a picture.
  await home.evaluate(async () => {
    const c = new OffscreenCanvas(40, 40), g = c.getContext('2d')!; g.fillStyle = '#c33'; g.fillRect(0, 0, 40, 40);
    const jpg = [...new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg' })).arrayBuffer())];
    (window as unknown as { __web: Record<string, unknown> }).__web = {
      'https://api.deezer.com/search?limit=10&q=artist%3A%22Kloudmen%22%20track%3A%22Genorale%22': JSON.stringify({ data: [{ title: 'Genorale', artist: { name: 'Kloudmen' }, album: { cover_xl: 'https://e-cdns-images.dzcdn.net/images/cover/gen/1000x1000.jpg' } }] }),
      'https://e-cdns-images.dzcdn.net/images/cover/gen/': jpg,
    };
  });

  // The phone: no GLUE folder. Signing in opens the library by itself, in the phone layout (ADR 0078).
  await page.goto('./');
  await expect(page.locator('#homepage')).toBeVisible();
  await page.locator('#cloud-panel .fake-google').click();
  const all = page.locator('#phone-library [data-view="all"]');
  await expect(all).toContainText('3', { timeout: 30_000 });
  await expect(page.locator('#phone .cloud')).toContainText('Desktop');
  // Nothing was made on the phone.
  expect(await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); const names: string[] = []; for await (const [n] of (r as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) names.push(n); return names.filter(n => n !== 'cache'); })).toEqual([]);

  // A song streams from the desktop's GLUE Home.
  await all.click();
  // Its cover, from the desktop's GLUE Home, which read it from the song's tags.
  await expect(page.locator('#phone-songs .row', { hasText: 'Covered' }).locator('.cov.has img')).toBeVisible({ timeout: 30_000 });
  // "Genorale" has none in its tags: the desktop's GLUE Home looked it up on a cover service (only the
  // artist and title went out), and the phone shows it.
  await expect(page.locator('#phone-songs .row', { hasText: 'Genorale' }).locator('.cov.has img')).toBeVisible({ timeout: 60_000 });
  const asked = await home.evaluate(() => (window as unknown as { __webAsked?: string[] }).__webAsked ?? []);
  expect(asked.some(u => u.includes('Genorale'))).toBe(true);
  expect(asked.every(u => /^https:\/\/(api\.deezer\.com|itunes\.apple\.com|musicbrainz\.org|coverartarchive\.org|e-cdns-images\.dzcdn\.net)\//.test(u))).toBe(true);
  const row = page.locator('#phone-songs .row', { hasText: 'Manyaro' });
  await expect(row).not.toHaveClass(/off/, { timeout: 20_000 });
  await row.click();
  await expect(page.locator('#phone-play')).toHaveAttribute('aria-label', 'Pause', { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').some(e => e.name.includes('/__stream/')))).toBe(true);
  // Both ends asked GLUE Cloud for the relay before connecting.
  expect(turnAsked).toContain('phone');
  expect(turnAsked).toContain('home');
  await page.click('#phone-play');

  // A rating, from the song's sheet, goes to the desktop (applied there when GLUE opens).
  await row.locator('.dots').click();
  await page.locator('#phone-sheet').getByRole('button', { name: 'Rate 4' }).click({ position: { x: 20, y: 13 } });
  await expect.poll(() => ops.length, { timeout: 10_000 }).toBe(1);
  expect(ops[0]).toMatchObject({ device: 'desk', profile: pid, collection: cid, op: { t: 'track', rating: 4 } });
  // So does its song info (ADR 0087): the title, from Edit info; the desktop's GLUE Home is told at once.
  await row.locator('.dots').click();
  await page.locator('#phone-sheet [data-m="info"]').click();
  await page.fill('#edit-info [data-f="title"]', 'Manyaro (Edit)');
  await page.click('#info-save');
  await expect.poll(() => ops.length, { timeout: 10_000 }).toBe(2);
  expect(ops[1]).toMatchObject({ device: 'desk', profile: pid, collection: cid, op: { t: 'track', info: { title: 'Manyaro (Edit)' } } });
  await expect.poll(() => home.evaluate(() => (window as unknown as { __editsWaiting?: number }).__editsWaiting ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);

  // A song from the phone goes to the desktop's GLUE Home (its incoming folder), with no collection here:
  // More › the desktop's ⋯ › Send songs.
  await page.locator('.tabs [data-tab="more"]').click();
  const desk = page.locator('#devices [data-device="desk"]');
  await expect(desk).toContainText('GLUE Home', { timeout: 15_000 });
  await desk.locator('.more').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#phone-sheet #send-songs').click();
  await (await chooser).setFiles([fixture('mp3-cover.mp3')]);
  await expect(page.locator('#send-panel')).toContainText('Sent to Desktop', { timeout: 30_000 });
  expect(await home.evaluate(() => (window as unknown as { __files: { name: string; done: boolean }[] }).__files.filter(f => f.done).map(f => f.name))).toEqual(['mp3-cover.mp3']);

  // Next time on the phone: it opens by itself again.
  await page.reload();
  await expect(page.locator('#phone-library [data-view="all"]')).toContainText('3', { timeout: 30_000 });
  // A song's page asks GLUE Home for its full analysis: GLUE Home makes it, and keeps its waveform too,
  // for the Overview's waveform look on other devices (ADR 0085).
  await page.locator('#phone-library [data-view="all"]').click();
  await page.locator('#phone-songs .row', { hasText: 'Genorale' }).locator('.dots').click();
  await page.locator('#phone-sheet [data-m="details"]').click();
  await expect.poll(() => home.evaluate(() => Object.keys((window as unknown as { __cache: Record<string, number[]> }).__cache).filter(k => k.startsWith('w/pdesk/cdesk/')).length), { timeout: 90_000 }).toBeGreaterThan(0);
  // Its cover was looked up: "Wrong cover" tells GLUE Home, which won't show or look for it again.
  await page.locator('#wrong-cover').click();
  await expect(page.locator('#wrong-cover')).toHaveCount(0);
  expect(await home.evaluate(() => Object.entries((window as unknown as { __cache: Record<string, number[]> }).__cache).filter(([k]) => k.startsWith('f/')).map(([, v]) => new TextDecoder().decode(new Uint8Array(v)).split(String.fromCharCode(10))[0]))).toContain('x');
  await home.close();
  expect(errors).toEqual([]);
});
