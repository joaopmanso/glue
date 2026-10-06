import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { TAURI_MOCK } from './tauri-mock';
import { homeDisk } from './homeDisk';

// GLUE Home's settings window (home/ui), with its Rust side replaced by e2e/tauri-mock.ts.
const GLUE = 'C:\\Users\\dj\\Documents\\GLUE';
const HOME = 'http://localhost:5176/';
// The website's GLUE folder on this computer: one profile, one collection with two music folders.
const LIBRARY = {
  'mco.json': JSON.stringify({ schemaVersion: 1, profiles: [{ id: 'p1', name: 'Nova', color: '#fff' }], lastProfile: 'p1' }),
  'profiles/p1/profile.json': JSON.stringify({ schemaVersion: 1, id: 'p1', name: 'Nova', color: '#fff', createdAt: '', collections: [{ id: 'c1', name: 'My collection' }], lastCollection: 'c1' }),
  'profiles/p1/collections/c1/collection.json': JSON.stringify({ schemaVersion: 1, id: 'c1', name: 'My collection', createdAt: '', roots: [{ id: 'r1', name: 'Music', absPath: null, handleKey: 'x', addedAt: '' }, { id: 'r2', name: 'Promos', absPath: null, handleKey: 'y', addedAt: '' }, { id: 'r3', name: 'Crates', absPath: null, handleKey: 'z', addedAt: '' }] }),
  // A song in each music folder (GLUE Home checks where a folder is with one of its songs).
  'profiles/p1/collections/c1/tracks/ab.json': JSON.stringify({ schemaVersion: 1, items: {
    ab01: { id: 'ab01', rootId: 'r1', relPath: 'Sets/a.mp3', importPath: null, fileName: 'a.mp3' },
    ab02: { id: 'ab02', rootId: 'r2', relPath: 'x.mp3', importPath: null, fileName: 'x.mp3' },
    ab03: { id: 'ab03', rootId: 'r3', relPath: 'y.mp3', importPath: null, fileName: 'y.mp3' } } }),
};

test('GLUE Home settings: asks about starting with the computer; connects with a code as this computer’s companion; finds the GLUE folder and music folders', async ({ page }) => {
  const claims: Record<string, unknown>[] = [];
  const ctx = page.context();
  await ctx.route('https://glue-api.joaopmanso.workers.dev/v1/**', async r => {
    const p = new URL(r.request().url()).pathname, body = r.request().postDataJSON() ?? {};
    const json = (b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (p === '/v1/pairing/claim') { claims.push(body); return body.code === 'WRONG-CODE' ? json({ error: 'that code isn’t valid' }, 401) : json({ deviceId: 'h' + claims.length, token: 't' + claims.length, name: body.name, user: { email: 'dj@example.com', name: 'DJ' }, companionOf: { id: 'b1', name: 'Desktop' } }); }
    if (p === '/v1/auth/device') return json({ access: 'a' });
    return json({ error: 'not found' }, 404);
  });
  await ctx.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, ws => { ws.send(JSON.stringify({ type: 'presence', online: ['h1'] })); ws.onMessage(() => {}); });
  await ctx.addInitScript(TAURI_MOCK);
  // On disk (GLUE Home's engine looks, ADR 0154): Music (found in the usual place), Promos (found by the drive search),
  // Crates (nowhere to be found until it's picked).
  const d = await homeDisk(LIBRARY, { 'Sets/a.mp3': Buffer.from('x') });
  const promos = join(d.tmp, 'drives', 'E', 'DJ', 'Promos'), crates = join(d.tmp, 'Picked', 'Crates');
  d.fake.tell({ known: { music: d.music, home: join(d.tmp, 'drives'), sep } });
  for (const [dir, f] of [[promos, 'x.mp3'], [crates, 'y.mp3']]) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, f), 'x'); }
  await d.wire(ctx);
  await ctx.addInitScript(({ glue, lib }) => { const w = window as unknown as Record<string, unknown>; w.__glueFolder = glue; w.__glue = lib; }, { glue: d.glue, lib: LIBRARY });
  await page.goto(HOME + 'index.html');
  // The service window runs next to it (the tray's Start / Stop go there).
  const service = await ctx.newPage();
  await service.goto(HOME + 'service.html');

  // First launch: asked once whether to start with the computer (the stand-in answers yes).
  await expect.poll(() => page.evaluate(() => localStorage.getItem('autostart'))).toBe('1');
  await expect(page.locator('#at-login')).toBeChecked();
  await expect(page.locator('#state-pill')).toHaveText('Not connected');
  await expect(page.locator('#incoming')).toContainText('GLUE Incoming');
  // The duplicates folder (ADR 0070), and a desktop window: at its smallest size (640 × 460) the
  // window never scrolls; only the pane does, and the pages on the left jump to their section.
  await expect(page.locator('#duplicates')).toContainText('GLUE duplicates');
  await expect(page.locator('#dup-inside')).toHaveCount(0);   // not inside a music folder (Music is one here)
  await page.setViewportSize({ width: 640, height: 460 });
  expect(await page.evaluate(() => [document.documentElement.scrollWidth <= innerWidth, document.documentElement.scrollHeight <= innerHeight])).toEqual([true, true]);
  await page.click('nav [data-page="updates"]');
  await expect(page.locator('#check-updates')).toBeInViewport();
  await expect(page.locator('nav [data-page="updates"]')).toHaveClass(/on/);
  if (process.env.SHOTS) { await page.setViewportSize({ width: 760, height: 540 }); await page.click('nav [data-page="service"]'); await page.screenshot({ path: process.env.SHOTS + '/home-window.png' }); }
  await page.setViewportSize({ width: 1920, height: 960 });
  await expect(page.locator('#device-name')).toHaveValue('Studio PC');
  // Codes only: no email or Google sign-in.
  await expect(page.locator('#email, #password, #google')).toHaveCount(0);
  // The website's GLUE folder is found; every collection is shared, its music folders found by themselves.
  await expect(page.locator('#glue-folder')).toHaveText(d.glue);
  await expect(page.locator('#choose-glue')).toHaveCount(0);
  const coll = page.locator('#collections [data-collection="c1"]');
  await expect(coll).toContainText('My collection');
  await expect(coll).toContainText('2 of 3 music folders found', { timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('home-config')!).folders)).toEqual({ r1: d.music, r2: promos });
  // Only a folder that can't be found is asked for (and checked with its song).
  await page.locator('#missing-folders summary').click();
  await expect(page.locator('#missing-folders')).toContainText('Crates');
  await page.evaluate(f => { (window as unknown as { __pick: string }).__pick = f; }, crates);
  await page.locator('#missing-folders [data-root="r3"] button').click();
  await expect(coll).toContainText('3 of 3 music folders found');
  await expect(page.locator('#missing-folders')).toHaveCount(0);
  // A collection can be kept to this computer.
  await coll.locator('input').uncheck();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('home-config')!).serve)).toEqual({ 'p1/c1': false });
  await coll.locator('input').check();

  // A wrong code, then the right one: connected, and the service goes online.
  await page.fill('#code', 'WRONG-CODE');
  await page.click('#use-code');
  await expect(page.locator('#error')).toContainText('isn’t valid');
  await page.fill('#code', 'ABCD-EFGH');
  await page.click('#use-code');
  await expect(page.locator('#account')).toContainText('dj@example.com');
  await expect(page.locator('#state-pill')).toHaveText('Online', { timeout: 15_000 });
  await expect(service.locator('#state')).toContainText('Online as Studio PC');
  expect(claims[1]).toMatchObject({ code: 'ABCD-EFGH', name: 'Studio PC' });
  expect(claims[1].replaces).toBeUndefined();

  // Connecting again with a new code replaces the previous device (it proves it's its own).
  await page.locator('details summary', { hasText: 'Connect again' }).click();
  await page.fill('#code-again', 'K7QM-2XPB');
  await page.locator('details button[type="submit"]').click();
  await expect.poll(() => claims.length).toBe(3);
  expect(claims[2]).toMatchObject({ code: 'K7QM-2XPB', replaces: { deviceId: 'h2', token: 't2' } });

  // Stop, Start and Restart reach the service.
  await page.click('#svc-stop');
  await expect(page.locator('#state-pill')).toHaveText('Stopped');
  await page.click('#svc-start');
  await expect(page.locator('#state-pill')).toHaveText('Online');
  await page.click('#svc-restart');
  await expect(page.locator('#state-pill')).toHaveText('Online');

  // Another incoming folder; the library in the browser.
  await page.click('#choose-incoming');
  await expect(page.locator('#incoming')).toHaveText('D:\\Incoming');
  await page.click('#open-library');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opened?: string }).__opened)).toBe('library');

  // Updates: up to date, then a newer version installs and restarts GLUE Home.
  await expect(page.locator('#version')).toHaveText('GLUE Home 0.2.0');
  await page.click('#check-updates');
  await expect(page.locator('#update-state')).toHaveText('You have the latest version.');
  await page.evaluate(() => { (window as unknown as { __update: string }).__update = '0.3.0'; });
  await page.click('#check-updates');
  await expect(page.locator('#update-state')).toHaveText('Version 0.3.0 is available.');
  await page.click('#install-update');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __restarted?: boolean }).__restarted)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __installed?: string }).__installed)).toBe('0.3.0');
  await expect(page.locator('#auto-update')).toBeChecked();
  await page.locator('#auto-update').uncheck();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('home-config')!).autoUpdate)).toBe(false);

  // Disconnect; then the website to get a code; asked about starting with the computer only once.
  await page.getByRole('button', { name: 'Disconnect this computer' }).click();
  await expect(page.locator('#state-pill')).toHaveText('Not connected');
  await page.click('#get-code');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opened?: string }).__opened)).toBe('https://joaopmanso.github.io/glue/');
  await page.reload();
  await expect(page.locator('#glue-folder')).toHaveText(d.glue);
  expect(await page.evaluate(() => (window as unknown as { __calls: string[] }).__calls.filter(c => c === 'plugin:dialog|message').length)).toBe(0);
  await d.done();
});

test('GLUE Home reminds of events that need music, once a day each; Check now; off (ADR 0074)', async ({ page }) => {
  const ctx = page.context();
  await ctx.addInitScript(TAURI_MOCK);
  const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const ev = (id: string, name: string, inDays: number, extra: Record<string, unknown>) => ({ id, name, starts: day(inDays) + 'T23:00', ends: null, setStart: null, setEnd: null, venue: 'Club', address: '', city: '', lineup: [], flyer: null, url: '', notes: '', status: 'planned', remindDays: 7, folderId: null, lists: [], createdAt: '', ...extra });
  const base = 'profiles/p1/collections/c1';
  const glue = { ...LIBRARY,
    [base + '/events.json']: JSON.stringify({ schemaVersion: 1, items: {
      e1: ev('e1', 'Lux', 2, { folderId: 'f1' }),                 // its folder holds an empty playlist: needs music
      e2: ev('e2', 'Fabric', 3, { lists: ['l2'] }),               // a playlist with a song is assigned
      e3: ev('e3', 'Far away', 30, {}),                           // not yet
      e4: ev('e4', 'Called off', 1, { status: 'cancelled' }) } }),
    [base + '/lists/f1.json']: JSON.stringify({ id: 'f1', kind: 'folder', name: 'Lux', parentId: 'ev', items: [], event: 'e1' }),
    [base + '/lists/v1.json']: JSON.stringify({ id: 'v1', kind: 'playlist', name: 'Set', parentId: 'f1', items: [] }),
    [base + '/lists/l2.json']: JSON.stringify({ id: 'l2', kind: 'playlist', name: 'Peak', parentId: null, items: ['ab01'] }) };
  const d = await homeDisk(glue);
  await d.wire(ctx);
  await ctx.addInitScript(({ g, lib }) => { const w = window as unknown as Record<string, unknown>; w.__glueFolder = g; w.__glue = lib; w.__disk = {}; }, { g: d.glue, lib: glue });
  await page.goto(HOME + 'index.html');
  const service = await ctx.newPage();
  await service.goto(HOME + 'service.html');
  const notes = () => service.evaluate(() => (window as unknown as { __notes: { title: string; body: string }[] }).__notes);
  await expect(page.locator('#glue-folder')).toHaveText(d.glue);
  await expect(page.locator('#reminders')).toBeChecked();
  await page.click('#remind-now');
  await expect.poll(notes).toHaveLength(1);
  expect((await notes())[0]).toEqual({ title: 'Lux needs music', body: expect.stringMatching(/in 2 days at Club. Open GLUE › Calendar/) });
  await expect(page.locator('#remind-state')).toContainText('1 event needs music');
  // Once a day: the hourly look doesn't repeat it (Check now does).
  await service.evaluate(() => localStorage.getItem('glue-home-reminded')).then(v => expect(Object.keys(JSON.parse(v!))).toEqual(['c1/e1']));
  await page.click('#remind-now');
  await expect.poll(notes).toHaveLength(2);
  // Off.
  await page.locator('#reminders').uncheck();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('home-config')!).reminders)).toBe(false);
  await expect(page.locator('#remind-now')).toBeDisabled();
  await d.done();
});

test('GLUE Home opens with a gluehome://pair link and connects', async ({ page }) => {
  await page.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => {
    const p = new URL(r.request().url()).pathname, body = r.request().postDataJSON() ?? {};
    const json = (b: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (p === '/v1/pairing/claim' && body.code === 'K7QM-2XPB') return json({ deviceId: 'h3', token: 't3', name: body.name, user: { email: 'dj@example.com', name: 'DJ' } });
    return r.fulfill({ status: 404, body: '{}' });
  });
  await page.addInitScript(TAURI_MOCK);
  await page.addInitScript(() => { (window as unknown as { __deepLink: string[] }).__deepLink = ['gluehome://pair?code=K7QM-2XPB']; localStorage.setItem('home-config', JSON.stringify({ deviceId: null, token: null, name: 'Mac mini', user: null, incoming: null, running: true, askedAutostart: true })); });
  await page.goto(HOME + 'index.html');
  await expect(page.locator('#account')).toContainText('dj@example.com');
  await expect(page.locator('#account')).toContainText('Mac mini');
});

test('GLUE Home shows what it was asked since it started, the most time first, and copies it (ADR 0083)', async ({ page }) => {
  await page.addInitScript(TAURI_MOCK);
  await page.addInitScript(() => localStorage.setItem('home-config', JSON.stringify({ deviceId: null, token: null, name: 'Desk', user: null, incoming: null, running: true, askedAutostart: true })));
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: HOME.slice(0, -1) });
  await page.goto(HOME + 'index.html');
  await page.locator('#activity summary').click();
  const rows = page.locator('#activity tbody tr');
  await expect(rows).toHaveCount(2);
  // The mock's counts: 40 local-link lists took 30 ms, 3 file reads 12 ms.
  await expect(rows.nth(0)).toContainText('This computer’s GLUE website: /fs/list');
  await expect(rows.nth(1)).toContainText('Reading files: file_read');
  await expect(rows.nth(1)).toContainText('3.1 MB');
  await page.click('#activity-copy');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^GLUE Home .*running 2 min\r?\n.*\/fs\/list\t40\t30 ms/);   // Windows' clipboard ends lines with \r\n
});

test('GLUE Home’s window says what it’s doing: the analysis, a pause button, and a toast for each new event (ADR 0103)', async ({ page }) => {
  await page.addInitScript(TAURI_MOCK);
  await page.addInitScript(() => localStorage.setItem('home-config', JSON.stringify({ deviceId: null, token: null, name: 'Desk', user: null, incoming: null, running: true, askedAutostart: true })));
  await page.goto(HOME + 'index.html');
  const status = (analysing: Record<string, unknown>, events: { at: number; text: string }[]) => page.evaluate(({ analysing, events }) => {
    (window as unknown as { __tauriEvent: (e: string, p: unknown) => void }).__tauriEvent('status', { state: 'online', text: 'Online', running: true, receiving: null, received: [], analysing, events });
  }, { analysing, events });
  const base = { paused: false, running: 2, current: ['Genorale', 'Manyaro'], left: 118, done: 40, failed: 1, waiting: 3, by: 'home' };
  await status(base, [{ at: Date.now() - 60_000, text: 'Analysing 160 songs' }]);
  await page.click('nav [data-page="now"]');
  await expect(page.locator('#an-state')).toHaveText('Analysing 2 at a time · 120 left');
  await expect(page.locator('#an-current li')).toHaveText(['Genorale', 'Manyaro']);
  await expect(page.locator('#sec-now')).toContainText('Analysed since GLUE Home started: 40 · 1 couldn’t be read · 3 waiting to go into the library');
  await expect(page.locator('#events')).toContainText('Analysing 160 songs');
  await expect(page.locator('.toast')).toHaveCount(0);   // what happened before the window opened isn't a toast
  // Something new: a toast, for a few seconds.
  await status(base, [{ at: Date.now(), text: 'Received Covered.mp3 from iPhone' }, { at: Date.now() - 60_000, text: 'Analysing 160 songs' }]);
  await expect(page.locator('.toast')).toHaveText('Received Covered.mp3 from iPhone');
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 10_000 });
  // Pause: kept in the settings (the service follows them).
  await page.click('#an-pause');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('home-config') ?? '{}').analysisPaused)).toBe(true);
  await status({ ...base, paused: true, running: 0, current: [] }, []);
  await expect(page.locator('#an-state')).toHaveText('Paused · 118 songs to analyse');
  await expect(page.locator('#an-pause')).toHaveText('Resume analysis');
  // Songs at a time: automatic unless set (ADR 0105).
  await expect(page.locator('#an-workers option').first()).toHaveText(/^Automatic \(\d+\)$/);
  await page.selectOption('#an-workers', '8');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('home-config') ?? '{}').analysisWorkers)).toBe(8);
  // From each network folder: no limit unless set, the user's to tune (ADR 0136).
  await expect(page.locator('#net-workers')).toHaveValue('0');
  await page.selectOption('#net-workers', '4');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('home-config') ?? '{}').networkAtOnce)).toBe(4);
  // Where the library opens (ADR 0151): GLUE Home's own window unless set to the browser.
  await expect(page.locator('#library-in')).toHaveValue('window');
  await page.selectOption('#library-in', 'browser');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('home-config') ?? '{}').libraryIn)).toBe('browser');
  // How fast, and a suggestion from it.
  const speed = { perMin: 42, localMBs: 85, netMBs: 22, localReadMs: 300, netReadMs: 5200, analyseMs: 900, songs: 84, netSongs: 30, history: [0, 0, 6, 12, 20, 26, 30, 34, 38, 40, 36, 42, 44, 40, 38, 42, 46, 44, 42, 40] };
  await status({ ...base, speed, steps: { reading: 6, analysing: 2 }, suggestion: 'Songs on network folders spend most of their time being read: fewer at once from each network folder (try 4) leaves places for songs on this computer’s drives.' }, []);
  const panel = page.locator('#an-speed');
  await expect(panel.locator('[data-k="per-min"] b')).toHaveText('42');
  await expect(panel.locator('[data-k="per-min"] .spark i')).toHaveCount(20);
  await expect(panel.locator('[data-k="local"] b')).toHaveText('85 MB/s');
  await expect(panel.locator('[data-k="net"] b')).toHaveText('22 MB/s');
  await expect(panel.locator('[data-k="places"] .mv')).toHaveText('6 reading · 2 analysing · of 8');
  await expect(panel.locator('[data-k="time"] .mv')).toHaveText('5.2 s reading · 900 ms analysing');
  await expect(page.locator('#an-suggest')).toContainText('try 4');
  if (process.env.SHOTS) await page.locator('#sec-now').screenshot({ path: 'test-results/speed-panel.png' });
});

test('GLUE Home checks its native engine against the songs it analysed: a sample, the tally, the ones that differ (ADR 0147)', async ({ page }) => {
  const ctx = page.context();
  await ctx.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ access: 'a' }) }));
  await ctx.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, ws => { ws.send(JSON.stringify({ type: 'presence', online: ['h1'] })); ws.onMessage(() => {}); });
  await ctx.addInitScript(TAURI_MOCK);
  const lib = { ...LIBRARY, 'profiles/p1/collections/c1/tracks/ab.json': JSON.stringify({ schemaVersion: 1, items: {
    ab01: { id: 'ab01', rootId: 'r1', relPath: 'Sets/a.mp3', importPath: null, fileName: 'a.mp3' },
    ab02: { id: 'ab02', rootId: 'r1', relPath: 'Sets/b.flac', importPath: null, fileName: 'b.flac' },
    ab03: { id: 'ab03', rootId: 'r1', relPath: 'Sets/c.flac', importPath: null, fileName: 'c.flac' } } }) };
  const d = await homeDisk(lib, { 'Sets/a.mp3': Buffer.from('x'), 'Sets/b.flac': Buffer.from('x'), 'Sets/c.flac': Buffer.from('x') });
  await d.wire(ctx);
  await ctx.addInitScript(({ glue, lib, music }) => {
    const w = window as unknown as Record<string, unknown>; w.__glueFolder = glue; w.__glue = lib;
    // Analysed here: a.mp3 and b.flac (c.flac not yet).
    const cache = w.__cache as Record<string, number[]>;
    for (const id of ['ab01', 'ab02']) cache[`s/p1/c1/ab/${id}.json`] = [123, 125];
    w.__verifyAnswer = { ab02: { kind: 'differs', name: 'b.flac', ms: 3000, diffs: ['label: "Hi-res" vs "Upsampled"'] } };
    if (!localStorage.getItem('home-config')) localStorage.setItem('home-config', JSON.stringify({ deviceId: 'h1', token: 't1', name: 'Desktop', user: { email: 'dj@example.com', name: 'DJ' }, incoming: null, askedAutostart: true, running: true, analysisPaused: true, glue, folders: { r1: music } }));
  }, { glue: d.glue, lib, music: d.music });
  await page.goto(HOME + 'index.html');
  const service = await ctx.newPage();
  await service.goto(HOME + 'service.html');
  await page.click('nav [data-page="now"]');
  await page.selectOption('#vf-n', '100');
  await page.click('#vf-start');
  await expect(page.locator('#vf-state')).toContainText('Checked 2 of 2 · 1 the same · 0 close (lossy) · 1 differ', { timeout: 15_000 });
  await expect(page.locator('#vf-state')).toContainText('2.0 s a song natively');
  await expect(page.locator('#vf-odd')).toContainText('b.flac: label: "Hi-res" vs "Upsampled"');
  expect((await service.evaluate(() => (window as unknown as { __verified: string[] }).__verified)).sort()).toEqual(['ab01', 'ab02']);
  await expect(page.locator('#vf-start')).toBeVisible();
  await d.done();
});

test('GLUE Home whose settings never said running or stopped goes online, and stays so as other settings are saved', async ({ page }) => {
  const ctx = page.context();
  let connects = 0;
  await ctx.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ access: 'a' }) }));
  await ctx.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, ws => { connects++; ws.send(JSON.stringify({ type: 'presence', online: ['h1'] })); ws.onMessage(() => {}); });
  await ctx.addInitScript(TAURI_MOCK);
  // Its engine, which is in the room (ADR 0158).
  const d = await homeDisk({});
  await d.wire(ctx, { link: false });
  // Paired long ago; Start or Stop never pressed, so the settings have no `running` at all.
  await ctx.addInitScript(({ glue }) => {
    const w = window as unknown as Record<string, unknown>; w.__glueFolder = glue; w.__glue = {};
    if (!localStorage.getItem('home-config')) localStorage.setItem('home-config', JSON.stringify({ deviceId: 'h1', token: 't1', name: 'Desktop', user: { email: 'dj@example.com', name: 'DJ' }, incoming: null, askedAutostart: true, glue }));
  }, { glue: GLUE });
  const service = await ctx.newPage();
  await service.goto(HOME + 'service.html');
  await expect(service.locator('#state')).toContainText('Online as Desktop', { timeout: 15_000 });
  // Other settings saved meanwhile (the tokens GLUE Home makes itself, a pause): still online, not reconnected.
  await service.evaluate(() => { const c = JSON.parse(localStorage.getItem('home-config')!); localStorage.setItem('home-config', JSON.stringify({ ...c, analysisPaused: true })); (window as unknown as { __tauriEvent: (e: string, p: unknown) => void }).__tauriEvent('config', { ...c, analysisPaused: true }); });
  await service.waitForTimeout(1000);
  await expect(service.locator('#state')).toContainText('Online as Desktop');
  expect(connects).toBe(1);
  await d.done();
});
