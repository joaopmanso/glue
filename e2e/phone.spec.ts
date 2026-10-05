/* A device without a library of its own (a phone), signed in (ADR 0077, 0101): the account's collection
   opens by itself in the phone layout (ADR 0078), kept in the browser's storage; its songs stream from the
   desktop's GLUE Home (ADR 0076), and a rating or a title edit goes up to the account's copy. Against a stand-in GLUE Cloud; GLUE
   Home's real service page runs with its Rust side stood in (e2e/tauri-mock.ts). */
import { test as base, expect, type Page } from '@playwright/test';
import { launch } from './launch';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TAURI_MOCK } from './tauri-mock';
import { homeDisk } from './homeDisk';
import { SharedCloudServer } from '../tests/sharedCloud';

const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-phone-'));
    const ctx = await launch(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 390, height: 844 }, hasTouch: true });
    try { await use(ctx.pages()[0] ?? await ctx.newPage()); }
    finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
  },
});
const fixture = (name: string) => fileURLToPath(new URL('../tests/fixtures/' + name, import.meta.url));

test('a phone signs in and the account’s collection opens by itself: songs stream from the desktop, a rating goes up (ADR 0077, 0101)', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const user = { id: 'u1', email: 'dj@example.com', name: 'DJ', picture: null };
  const devices = [
    { id: 'ph', kind: 'browser', name: 'iPhone', platform: 'iPhone', createdAt: 3, lastSeen: 3 },
    { id: 'desk', kind: 'browser', name: 'Desktop', platform: 'Win32', createdAt: 1, lastSeen: 1 },
    { id: 'hdesk', kind: 'home', name: 'Desktop', platform: 'win32', createdAt: 2, lastSeen: 2, companionOf: 'desk' },
  ];
  // The account's collection in GLUE Cloud (the shared form, ADR 0094): four songs, all with a copy on the
  // desktop (member "desk", the browser its GLUE Home is the companion of), and a playlist.
  const pid = 'pdesk', cid = 'cdesk';
  const song = (id: string, title: string, file: string) => ({ id, fileName: file, title, artist: 'Kloudmen', album: '', genre: 'Techno', label: '', comment: '', year: '2019', duration: 4, format: null, addedAt: '2026-09-01T00:00:00Z',
    copies: { desk: { status: 'linked', rootId: 'deskroot', relPath: file, importPath: null, size: 5, mtime: 1, sources: [] } } });
  // dk03's cover is only in its file's tags: the phone gets it from the desktop's GLUE Home (ADR 0082).
  const tracks = { dk01: song('dk01', 'Genorale', 'Genorale.flac'), dk02: song('dk02', 'Manyaro', 'Manyaro.mp3'), dk03: song('dk03', 'Covered', 'Covered.mp3'), dk04: song('dk04', 'Aiffy', 'Aiffy.aiff') };
  const meta = { schemaVersion: 1, id: cid, name: 'My collection', createdAt: '', shared: true, rootsBy: { desk: [{ id: 'deskroot', name: 'Music', absPath: null, handleKey: 'x', addedAt: '' }] }, members: { desk: { profile: pid, name: 'Desktop' } } };
  // The account's collection: GLUE Cloud's real code, on an in-memory database (ADR 0106).
  const server = new SharedCloudServer();
  await server.seed(cid, 'My collection', {
    'collection.json': { text: JSON.stringify(meta), rev: 1 },
    'tracks/dk.json': { text: JSON.stringify({ schemaVersion: 1, items: tracks }), rev: 2 },
    'lists/l1.json': { text: JSON.stringify({ schemaVersion: 1, id: 'l1', kind: 'playlist', name: 'Friday', parentId: null, position: 0, notes: '', items: ['dk02', 'dk01'], origin: null, createdAt: '' }), rev: 3 },
  }, 'desk', 3);
  // The account's profile, seeded by the desktop (ADR 0113).
  await server.seedProfiles([{ id: pid, name: '404', color: '#7cc7ff' }]);
  const cloudFile = async (path: string) => JSON.parse(await server.current(cid, path) ?? '{}');
  /** The songs as the account's copy has them now. */
  const cloudTracks = async () => (await cloudFile('tracks/dk.json')).items as Record<string, { rating?: number; title: string; copies: Record<string, { unwritten?: string[] }> }>;
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
    if (p === '/v1/me') return json({ user, thisDevice: 'ph', devices, sessions: [] });
    // The relay (ADR 0081): an address that doesn't exist, so the connection stays direct.
    if (p === '/v1/turn') { turnAsked.push('phone'); return json({ iceServers: [{ urls: ['turn:relay.invalid:3478?transport=udp'], username: 'u', credential: 'c' }], ttl: 86400 }); }
    // The account's collections (cloud/src/shared.ts, the same rules).
    const a = await server.answer(m, u, req.postData(), 'ph');
    if (a) return r.fulfill({ status: a.status, contentType: a.type, body: a.body });
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
    [`profiles/${pid}/collections/${cid}/collection.json`]: JSON.stringify(meta),
    [`profiles/${pid}/collections/${cid}/tracks/dk.json`]: JSON.stringify({ schemaVersion: 1, items: tracks }),
  };
  // Its GLUE folder and the songs' files, on disk: GLUE Home's engine reads them (ADR 0154).
  const deskHome = await homeDisk(glue, { 'Genorale.flac': readFileSync(fixture('flac-96k-24.flac')), 'Manyaro.mp3': readFileSync(fixture('mp3-128k.mp3')), 'Covered.mp3': readFileSync(fixture('mp3-cover.mp3')), 'Aiffy.aiff': readFileSync(fixture('aiff-44k-24.aiff')) });
  await deskHome.wire(home);
  const disk = Object.fromEntries(['Genorale.flac', 'Manyaro.mp3', 'Covered.mp3', 'Aiffy.aiff'].map(n => [join(deskHome.music, n), [...readFileSync(join(deskHome.music, n))]]));
  await home.addInitScript(({ glue, disk }) => {
    const w = window as unknown as Record<string, unknown>; w.__glue = glue; w.__disk = disk;
    localStorage.setItem('home-config', JSON.stringify({ deviceId: 'hdesk', token: 't', name: 'Desktop', user: { email: 'dj@example.com', name: 'DJ' }, incoming: null, running: true, askedAutostart: true, glue: 'C:\\Users\\dj\\Documents\\GLUE', maxSessions: 1 }));
    // (maxSessions 1, ADR 0133: the phone's tab connecting again still gets in, replacing its own session.)
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
  await expect(all).toContainText('4', { timeout: 30_000 });
  // As the account's profile, 404: never one made from the account's name (the iPhone made "Joao Manso", 2026-09-30).
  await expect.poll(() => page.evaluate(async () => { try { return JSON.parse(await (await (await (await navigator.storage.getDirectory()).getFileHandle('mco.json')).getFile()).text()); } catch { return null; } }), { timeout: 20_000 }).toMatchObject({ aliases: [{ id: 'pdesk', name: '404' }], lastAlias: 'pdesk' });
  // Kept in the browser's own storage (a GLUE folder there); the phone isn't a member of the collection
  // (it holds no copies).
  expect(await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); const names: string[] = []; for await (const [n] of (r as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) names.push(n); return names; })).toContain('mco.json');
  expect(Object.keys((await cloudFile('collection.json')).members)).toEqual(['desk']);
  // A session with the desktop's GLUE Home (ADR 0133), opened by itself before anything was asked: GLUE Home lists it.
  const sessionsNow = () => home.evaluate(() => ((window as unknown as { __status?: { sessions?: { list: { name: string; open: boolean }[] } } }).__status?.sessions?.list ?? []).filter(s => s.open).map(s => s.name));
  await expect.poll(sessionsNow, { timeout: 30_000 }).toEqual(['iPhone']);

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
  // An AIFF (this browser doesn't play AIFF) streams too, as WAV worked out a piece at a time (ADR 0088):
  // it plays with no whole-song download first.
  const aiffRow = page.locator('#phone-songs .row', { hasText: 'Aiffy' });
  await aiffRow.click();
  await expect(page.locator('#phone-play')).toHaveAttribute('aria-label', 'Pause', { timeout: 30_000 });
  // GLUE Home was asked for parts of it (range), never for the whole song (get).
  const served = () => home.evaluate(() => Object.keys((window as unknown as { __status?: { served?: Record<string, unknown> } }).__status?.served ?? {}));
  await expect.poll(served, { timeout: 10_000 }).toContain('range');
  await home.waitForTimeout(2500);
  expect(await served()).not.toContain('get');
  await expect(page.locator('#phone')).not.toContainText('getting it from');
  await page.click('#phone-play');

  // A rating, from the song's sheet, goes up to the account's copy (every device takes it in).
  await row.locator('.dots').click();
  await page.locator('#phone-sheet').getByRole('button', { name: 'Rate 4' }).click({ position: { x: 20, y: 13 } });
  await expect.poll(async () => (await cloudTracks()).dk02.rating, { timeout: 15_000 }).toBe(4);
  // So does its song info: the title, from Edit info; the desktop's copy is marked for its file (ADR 0097).
  await row.locator('.dots').click();
  await page.locator('#phone-sheet [data-m="info"]').click();
  await page.fill('#edit-info [data-f="title"]', 'Manyaro (Edit)');
  await page.click('#info-save');
  await expect.poll(async () => (await cloudTracks()).dk02.title, { timeout: 15_000 }).toBe('Manyaro (Edit)');
  expect((await cloudTracks()).dk02.copies.desk.unwritten).toEqual(['title']);

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
  // Sent on the session (its own channel), not on a connection of its own: still the one session.
  expect(await sessionsNow()).toEqual(['iPhone']);

  // Next time on the phone: it opens by itself again, with the song it sent waiting on the desktop (TO BE
  // SORTED, ADR 0046).
  await page.reload();
  await expect(page.locator('#phone-library [data-view="all"]')).toContainText('5', { timeout: 30_000 });
  // The same tab again: its new session replaced the old one, even with room for only one.
  await expect.poll(sessionsNow, { timeout: 30_000 }).toEqual(['iPhone']);
  // A song's page asks GLUE Home for its full analysis: GLUE Home makes it, and keeps its waveform too,
  // for the Overview's waveform look on other devices (ADR 0085).
  await page.locator('#phone-library [data-view="all"]').click();
  await page.locator('#phone-songs .row', { hasText: 'Genorale' }).locator('.dots').click();
  await page.locator('#phone-sheet [data-m="details"]').click();
  // (Made by its engine into its cache folder, ADR 0154.)
  const waves = () => { const d = join(deskHome.fake.cacheDir, 'w', 'pdesk', 'cdesk'); return existsSync(d) ? readdirSync(d, { recursive: true }).filter(n => String(n).endsWith('.bin')).length : 0; };
  await expect.poll(waves, { timeout: 90_000 }).toBeGreaterThan(0);
  // Its cover was looked up: "Wrong cover" tells GLUE Home, which won't show or look for it again.
  await page.locator('#wrong-cover').click();
  await expect(page.locator('#wrong-cover')).toHaveCount(0);
  expect(await home.evaluate(() => Object.entries((window as unknown as { __cache: Record<string, number[]> }).__cache).filter(([k]) => k.startsWith('f/')).map(([, v]) => new TextDecoder().decode(new Uint8Array(v)).split(String.fromCharCode(10))[0]))).toContain('x');
  await home.close();
  await deskHome.done();
  expect(errors).toEqual([]);
});
