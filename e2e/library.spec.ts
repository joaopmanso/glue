import { test as base, expect, chromium, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TAURI_MOCK } from './tauri-mock';

// A real (temporary) browser profile: in Playwright's default incognito-like contexts, reading a
// stored folder handle back from IndexedDB after a reload closes the browser.
const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-e2e-'));
    const ctx = await chromium.launchPersistentContext(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 1920, height: 960 } });
    try { await use(ctx.pages()[0] ?? await ctx.newPage()); }
    finally { await ctx.close(); rmSync(dir, { recursive: true, force: true });}
  },
});

// The folder pickers can't be driven by a test, so they're replaced with folders in the
// origin-private file system (same FileSystemDirectoryHandle API). Everything else is real.
const fixture = (name: string) => fileURLToPath(new URL('../tests/fixtures/' + name, import.meta.url));
const MUSIC = ['flac-96k-24.flac', 'mp3-128k.mp3', 'aiff-44k-24.aiff', 'aac-128k.m4a'];

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: (o: { id?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async (o) => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(o.id === 'mco-home' ? ((window as unknown as { __home?: string }).__home ?? 'MCO') : o.id === 'mco-libraries' ? 'NI' : 'Music', { create: true });
    };
    // "+ Songs": returns the files named in window.__pick from Music/Sets.
    (window as unknown as { showOpenFilePicker: () => Promise<FileSystemFileHandle[]> }).showOpenFilePicker = async () => {
      const sets = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Music')).getDirectoryHandle('Sets');
      return Promise.all(((window as unknown as { __pick: string[] }).__pick ?? []).map(n => sets.getFileHandle(n)));
    };
  });
});
test.afterEach(() => expect(errors).toEqual([]));

async function seed(page: Page, music = MUSIC) {
  await page.goto('./#/analyze');
  const files = music.map(n => ({ n, b: readFileSync(fixture(n)).toString('base64') }));
  await page.evaluate(async files => {
    const root = await navigator.storage.getDirectory();
    for (const name of ['MCO', 'Music']) await root.removeEntry(name, { recursive: true }).catch(() => {});
    await new Promise(r => { const q = indexedDB.deleteDatabase('mco'); q.onsuccess = q.onerror = r; });
    const dir = await (await root.getDirectoryHandle('Music', { create: true })).getDirectoryHandle('Sets', { create: true });
    for (const f of files) {
      const w = await (await dir.getFileHandle(f.n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(f.b), c => c.charCodeAt(0))); await w.close();
    }
  }, files);
}

/** Every DJ library's playlists brought into GLUE (they're browsed, and imported on demand: ADR 0063). */
async function importAllDj(page: Page) {
  await expect(page.locator('[data-dj-open]').first()).toBeVisible({ timeout: 30_000 });
  for (const b of await page.locator('[data-dj-open]').all()) if (await b.getAttribute('aria-label') !== 'Hide its playlists') await b.click();
  for (const b of await page.locator('[data-dj-all]').all()) await b.click();
  for (const b of await page.locator('[data-dj-open][aria-label="Hide its playlists"]').all()) await b.click();
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();   // an import shows GLUE's copy; back to all
}

const REKORDBOX = `<?xml version="1.0" encoding="UTF-8"?><DJ_PLAYLISTS Version="1.0.0"><PRODUCT Name="rekordbox" Version="7.0.0"/>
<COLLECTION Entries="3">
<TRACK TrackID="1" Name="Hi-res claim" Artist="Tester" AverageBpm="120.00" Tonality="8A" Rating="255" Location="file://localhost/C:/Users/dj/Music/Sets/flac-96k-24.flac"/>
<TRACK TrackID="2" Name="Lossy one" Artist="Tester" Location="file://localhost/C:/Users/dj/Music/Sets/mp3-128k.mp3"/>
<TRACK TrackID="3" Name="Not on this computer" Artist="Nobody" Location="file://localhost/D:/Elsewhere/gone.wav"/>
</COLLECTION>
<PLAYLISTS><NODE Type="0" Name="ROOT" Count="1"><NODE Name="Friday" Type="1" KeyType="0" Entries="3"><TRACK Key="2"/><TRACK Key="1"/><TRACK Key="3"/></NODE></NODE></PLAYLISTS></DJ_PLAYLISTS>`;

test('profile, collection, import, link folder, background analysis, playlists, track detail', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');   // the "add your music" step
  await expect(page.locator('.top .who')).toContainText('DJ Test');

  // Import first: tracks arrive unlinked, with their playlist.
  await page.setInputFiles('#import-input', { name: 'rekordbox.xml', mimeType: 'text/xml', buffer: Buffer.from(REKORDBOX) });
  await expect(page.locator('.notice')).toContainText('3 tracks');
  await expect(page.locator('.tr')).toHaveCount(3);
  await expect(page.locator('.tr').first()).toContainText('no file');

  // Then link the music folder: two imported tracks match by path, two files are new.
  await page.click('#add-folder');
  await expect(page.locator('.notice')).toContainText('2 new tracks, 2 imported tracks linked', { timeout: 30_000 });
  await expect(page.locator('.tr')).toHaveCount(5);

  // Background analysis fills in quality for every linked track.
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 90_000 });
  const lossy = page.locator('.tr', { hasText: 'Lossy one' });
  await expect(lossy.locator('.q')).not.toHaveText('…');
  await expect(page.locator('.tr', { hasText: 'Not on this computer' })).toContainText('no file');

  // The library's playlists are browsed where they are (ADR 0063): nothing was imported into GLUE's
  // playlists; under DJ libraries, Friday shows its songs in its order, then comes into GLUE on demand,
  // inside the library's folder.
  await expect(page.locator('.lside .tree .name', { hasText: 'Friday' })).toHaveCount(0);
  await page.locator('[data-dj-open]').first().click();
  const fri = page.locator('#dj-libs .item.dj', { hasText: 'Friday' });
  await fri.locator('.name').click();
  await expect(page.locator('.tr .c-title')).toHaveText(['Lossy one', 'Hi-res claim', 'Not on this computer']);
  await fri.hover(); await fri.locator('.tools .more').click();
  await page.locator('[data-dj-import]').click();
  await expect(page.locator('.notice')).toContainText('Imported “Friday” into GLUE');
  await expect(page.locator('.lside .tree .name', { hasText: /^Friday/ })).toHaveCount(1);
  await expect(page.locator('.tr .c-title')).toHaveText(['Lossy one', 'Hi-res claim', 'Not on this computer']);   // GLUE's copy, shown
  await expect(fri.locator('.ingl')).toBeVisible();

  // A new playlist, filled by dragging a row onto it.
  await page.click('#new-playlist');
  await page.keyboard.type('Warm-up'); await page.keyboard.press('Enter');
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  await page.locator('.tr', { hasText: 'aiff-44k-24' }).dragTo(page.locator('.lside .item', { hasText: 'Warm-up' }));
  await expect(page.locator('.notice')).toContainText('Added 1 track to Warm-up');
  // "Add to playlist" lists them as the sidebar does (ADR 0062): the user's own, then each import.
  await page.locator('.tr', { hasText: 'aiff-44k-24' }).locator('.c-title').click();
  const groups = await page.locator('.selbar select[aria-label="Add to playlist"] optgroup').evaluateAll(gs => gs.map(g => [g.getAttribute('label'), [...g.querySelectorAll('option')].map(o => o.textContent!.replace(/ /g, ' ').trim())]));
  expect(groups).toEqual([['Your playlists', ['Warm-up']], ['Rekordbox ↓ · replaced when you import it again', ['📁 Rekordbox', 'Friday']]]);

  // Everything is on disk: reload and it's all still there.
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator('.tr')).toHaveCount(5, { timeout: 20_000 });
  await page.locator('.lside .name', { hasText: 'Warm-up' }).click();
  await expect(page.locator('.tr .c-title')).toHaveText(['aiff-44k-24']);

  // Track detail: the full Speklone analysis plus what rekordbox knew.
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  await page.locator('.tr', { hasText: 'Hi-res claim' }).dblclick();
  await expect(page.locator('.detail h2').first()).toHaveText('Hi-res claim');
  await expect(page.locator('#v-pill')).not.toHaveText('', { timeout: 30_000 });
  await expect(page.locator('.dj')).toContainText('rekordbox');
  await expect(page.locator('.dj')).toContainText('8A');
  await expect(page.locator('.detail')).toContainText('Friday');
  await expect(page.locator('#m-bpm')).toBeVisible();   // the fixtures are too short for a tempo
  await expect(page.locator('#play-btn')).toBeEnabled();
});

test('a DJ library found in the GLUE folder: browsed, imported on demand, and read again on Refresh (ADR 0063, 0065)', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  const writeXml = (xml: string) => page.evaluate(async xml => {
    const home = await (await navigator.storage.getDirectory()).getDirectoryHandle('MCO');
    const w = await (await home.getFileHandle('rekordbox.xml', { create: true })).createWritable(); await w.write(xml); await w.close();
  }, xml);
  await writeXml(REKORDBOX);
  await page.reload();   // opening the collection looks for libraries
  await page.locator('#dj-libs .addlib').click({ timeout: 30_000 });
  await expect(page.locator('#dj-libs .appicon[aria-label="rekordbox"]').first()).toBeVisible();   // its app's badge
  await expect(page.locator('.notice')).toContainText('3 tracks');
  await page.locator('[data-dj-open]').click();
  const dj = (name: string) => page.locator('#dj-libs .item.dj', { hasText: name });
  await dj('Friday').hover(); await dj('Friday').locator('.tools .more').click();
  await page.locator('[data-dj-import]').click();
  await expect(page.locator('.lside .tree .name', { hasText: /^Friday/ })).toHaveCount(1);
  // Imported playlists show their app's badge in the Playlists pane (the user's follow-up, 2026-09-27).
  await expect(page.locator('.lside .tree .name', { hasText: /^Friday/ }).locator('.imp .appicon[aria-label="rekordbox"]')).toBeVisible();
  // Changed in rekordbox: Friday renamed, a playlist added. In the browser alone GLUE reads it again on
  // Refresh (live following is GLUE Home's).
  await page.waitForTimeout(1500);
  await writeXml(REKORDBOX.replace('Name="Friday"', 'Name="Friday late"').replace('</NODE></PLAYLISTS>', '<NODE Name="Saturday" Type="1" KeyType="0" Entries="1"><TRACK Key="1"/></NODE></NODE></PLAYLISTS>'));
  await page.locator('[data-dj-refresh]').click();
  await expect(page.locator('.lside .tree .name', { hasText: /^Friday late/ })).toHaveCount(1, { timeout: 20_000 });
  await expect(dj('Saturday')).toHaveCount(1);
  await expect(page.locator('.lside .tree .name', { hasText: /^Saturday/ })).toHaveCount(0);   // only what was imported
  await expect(page.locator('.notice')).toContainText('rekordbox changed its playlists');
});

test('imports an Engine DJ m.db and a Serato database with crates', async ({ page }) => {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE Track (id INTEGER PRIMARY KEY, path TEXT, filename TEXT, title TEXT, artist TEXT, bpmAnalyzed REAL, key INTEGER, length INTEGER);
    CREATE TABLE Playlist (id INTEGER PRIMARY KEY, title TEXT, parentListId INTEGER, nextListId INTEGER);
    CREATE TABLE PlaylistEntity (id INTEGER PRIMARY KEY, listId INTEGER, trackId INTEGER, nextEntityId INTEGER);
    INSERT INTO Track VALUES (1,'../Sets/flac-96k-24.flac','flac-96k-24.flac','Engine one','E',126,1,4),(2,'../Sets/mp3-128k.mp3','mp3-128k.mp3','Engine two','E',128,3,4);
    INSERT INTO Playlist VALUES (1,'Peak time',0,0);
    INSERT INTO PlaylistEntity VALUES (1,1,2,2),(2,1,1,0);`);
  const mdb = Buffer.from(db.export()); db.close();

  const u32 = (n: number) => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
  const text = (s: string) => [...s].flatMap(ch => [ch.charCodeAt(0) >> 8, ch.charCodeAt(0) & 255]);
  const field = (tag: string, data: number[]) => [...tag].map(c => c.charCodeAt(0)).concat(u32(data.length), data);
  const serato = Buffer.from([...field('vrsn', text('2.0/Serato Scratch LIVE Database')),
    ...field('otrk', [...field('pfil', text('Users/dj/Music/Sets/aiff-44k-24.aiff')), ...field('tsng', text('Serato one')), ...field('tbpm', text('122'))])]);
  const crate = Buffer.from([...field('vrsn', text('1.0/Serato ScratchLive Crate')), ...field('otrk', field('ptrk', text('Users/dj/Music/Sets/aiff-44k-24.aiff')))]);

  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');   // the "add your music" step
  await page.click('#add-folder');
  await expect(page.locator('.notice')).toContainText('4 new tracks', { timeout: 30_000 });

  await page.setInputFiles('#import-input', [
    { name: 'm.db', mimeType: 'application/octet-stream', buffer: mdb },
    { name: 'database V2', mimeType: 'application/octet-stream', buffer: serato },
    { name: 'Warm%%Opening.crate', mimeType: 'application/octet-stream', buffer: crate },
  ]);
  await expect(page.locator('.notice')).toContainText('Engine DJ', { timeout: 30_000 });
  await expect(page.locator('.notice')).toContainText('Serato');
  await expect(page.locator('.tr')).toHaveCount(4);   // every imported track matched a file already there
  // Their playlists come into GLUE on demand (ADR 0063): all of both libraries here.
  for (const b of await page.locator('[data-dj-open]').all()) await b.click();
  for (const b of await page.locator('[data-dj-all]').all()) await b.click();

  await page.locator('.lside .tree .name', { hasText: 'Engine DJ' }).click();
  await page.locator('.lside .tree .name', { hasText: 'Peak time' }).click();
  await expect(page.locator('.tr')).toHaveCount(2);
  await expect(page.locator('.tr .c-title').first()).toHaveAttribute('title', 'mp3-128k.mp3');   // Engine's linked-list order
  await expect(page.locator('.tr [data-c="key"]').first()).not.toHaveText('');
  await page.locator('.lside .tree .name', { hasText: 'Serato' }).click();
  await page.locator('.lside .tree .name', { hasText: 'Warm' }).click();
  await page.locator('.lside .tree .name', { hasText: 'Opening' }).click();
  await expect(page.locator('.tr')).toHaveCount(1);
});

test('adds single songs, links them to imports, and keeps them across reloads', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');   // the "add your music" step
  await page.setInputFiles('#import-input', { name: 'rekordbox.xml', mimeType: 'text/xml', buffer: Buffer.from(REKORDBOX) });
  await expect(page.locator('.tr')).toHaveCount(3);

  // Two songs on their own: one matches an imported track (linked, not duplicated), one is new.
  await page.evaluate(() => { (window as unknown as { __pick: string[] }).__pick = ['mp3-128k.mp3', 'aiff-44k-24.aiff']; });
  await page.click('#add-songs');
  await expect(page.locator('.notice')).toContainText('Added 1 song, 1 linked to imported track');
  await expect(page.locator('.tr')).toHaveCount(4);
  await expect(page.locator('.tr', { hasText: 'Lossy one' })).not.toContainText('no file');
  await page.click('#add-songs');
  await expect(page.locator('.notice')).toContainText('2 already in the collection');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 60_000 });
  await expect(page.locator('.tr', { hasText: 'aiff-44k-24' }).locator('.q')).toHaveText('Caution');

  await page.locator('.lside .name', { hasText: 'Added songs' }).click();
  await expect(page.locator('.tr')).toHaveCount(2);

  // Still there after a reload, and the track page can read the file.
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 20_000 });
  await page.locator('.tr', { hasText: 'aiff-44k-24' }).dblclick();
  const allow = page.getByRole('button', { name: 'Allow and analyse' });
  await expect(page.locator('#v-pill').or(allow)).toBeVisible({ timeout: 30_000 });
  if (await allow.isVisible()) await allow.click();
  await expect(page.locator('#v-pill')).not.toHaveText('', { timeout: 30_000 });
  await expect(page.locator('.detail')).toContainText('added on its own');

  // Adding the whole folder later adopts the loose songs instead of duplicating them.
  await page.locator('.crumbs a').click();
  await page.click('#add-folder');
  await expect(page.locator('.notice')).toContainText('1 new track, 1 imported track linked', { timeout: 30_000 });   // the other 2 were adopted
  await expect(page.locator('.tr')).toHaveCount(5);
  await expect(page.locator('.lside .name', { hasText: 'Added songs' })).toHaveCount(0);

  // Remove one from the collection.
  await page.locator('.tr', { hasText: 'aiff-44k-24' }).click();
  page.once('dialog', d => d.accept());
  await page.click('#remove-tracks');
  await expect(page.locator('.tr')).toHaveCount(4);
});

test('plays from the library and drops tracks onto playlists, new or in a closed folder', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');   // the "add your music" step
  await page.setInputFiles('#import-input', { name: 'rekordbox.xml', mimeType: 'text/xml', buffer: Buffer.from(REKORDBOX) });
  await importAllDj(page);
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(5, { timeout: 30_000 });

  // Player bar: play a row, pause, next.
  const row = page.locator('.tr', { hasText: 'aiff-44k-24' });
  await row.hover();
  await row.locator('.pbtn').click();
  await expect(page.locator('#lib-now')).toHaveText('aiff-44k-24');
  await expect(page.locator('#lib-play')).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 });
  await page.click('#lib-play');
  await expect(page.locator('#lib-play')).toHaveAttribute('aria-label', 'Play');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('#lib-now')).not.toHaveText('aiff-44k-24');
  await expect(row).not.toHaveClass(/playing/);

  // Drop onto "+ Playlist": a new playlist with that track.
  await page.locator('.tr', { hasText: 'Fixture AAC' }).dragTo(page.locator('#new-playlist'));
  await page.keyboard.type('Opener'); await page.keyboard.press('Enter');
  await expect(page.locator('.lside .item', { hasText: 'Opener' })).toContainText('1');

  // Hovering over the closed "rekordbox" folder opens it; drop onto its playlist.
  const src = page.locator('.tr', { hasText: 'aiff-44k-24' });
  await src.hover(); await page.mouse.down();
  await page.locator('.lside .tree .name', { hasText: 'Rekordbox' }).hover();
  await page.waitForTimeout(800);
  const box = (await page.locator('.lside .name', { hasText: 'Friday' }).boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 4 });   // a real move: drop needs a dragover first
  await page.mouse.up();
  await expect(page.locator('.lside .item', { hasText: 'Friday' })).toContainText('4');

  // Repeated drops keep working.
  for (const t of ['Lossy one', 'Hi-res claim']) await page.locator('.tr', { hasText: t }).dragTo(page.locator('.lside .item', { hasText: 'Opener' }));
  await expect(page.locator('.lside .item', { hasText: 'Opener' })).toContainText('3');
});

test('the first question: how GLUE is used here; "Just this computer" uploads nothing even when signed in (ADR 0092)', async ({ page }) => {
  await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { id: { initialize(o) { window.__gcb = o.callback; }, disableAutoSelect() {},
      renderButton(el) { const b = document.createElement('button'); b.className = 'fake-google'; b.textContent = 'Sign in with Google'; b.onclick = () => window.__gcb({ credential: 'fake' }); el.appendChild(b); } } } };` }));
  const asked: string[] = [];
  const user = { id: 'u1', email: 'dj@example.com', name: 'DJ', picture: null };
  await page.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => {
    const p = new URL(r.request().url()).pathname; asked.push(p);
    const json = (b: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (p === '/v1/auth/google') return json({ access: 'a', refresh: 'r', deviceId: 'b1', user });
    if (p === '/v1/auth/refresh') return json({ access: 'a', refresh: 'r', deviceId: 'b1' });
    if (p === '/v1/me') return json({ user, thisDevice: 'b1', devices: [], sessions: [] });
    if (p === '/v1/sync') return json({ thisDevice: 'b1', profiles: [] });
    if (p === '/v1/sync/links') return json({ groups: [] });
    if (p === '/v1/pairing') return json({ code: 'ABCD-EFGH', expiresAt: Date.now() + 600_000 });
    return json({ ok: true });
  });
  await page.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, () => {});
  await seed(page);
  await page.goto('./');
  // Four ways; "Just this computer" first, and its folder choice right there.
  await expect(page.locator('#how-use .mode')).toHaveCount(4);
  await expect(page.locator('#how-use [data-mode="local"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#choose-home')).toBeVisible();
  // With GLUE Home: the download, then sign-in, a code, and GLUE Home's own folder window.
  await page.click('#how-use [data-mode="home"]');
  await expect(page.locator('#how-use')).toContainText('Install GLUE Home');
  await expect(page.locator('#how-use a.dl')).toHaveCount(2);
  // Signed in (GLUE Cloud, below), the code for GLUE Home.
  await page.locator('#cloud-panel .fake-google').click();
  await page.click('#how-get-code');
  await expect(page.locator('#how-code')).toHaveText('ABCD-EFGH');
  await expect(page.locator('#how-open-home')).toHaveAttribute('href', /ABCD-EFGH/);
  // Another device: sign in only.
  await page.click('#how-use [data-mode="other"]');
  await expect(page.locator('#how-use')).toContainText('your library opens by itself');
  // Just this computer, although signed in: its profile doesn't sync.
  await page.click('#how-use [data-mode="local"]');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  await page.waitForTimeout(25_000);                                   // longer than a sync would wait to upload
  expect(asked.filter(p => p.startsWith('/v1/sync/manifest') || p.startsWith('/v1/sync/files'))).toEqual([]);
  // The profile screen says what this computer is, and how to change it.
  await page.locator('.top .who').click();
  await expect(page.locator('#this-computer')).toHaveAttribute('data-mode', 'local');
  await expect(page.locator('#this-computer #turn-on-sync')).toBeVisible();
});

test('a deleted playlist or folder goes to Recently deleted, and Restore puts it back with what was in it (ADR 0090)', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  await page.click('#new-folder'); await page.keyboard.type('Gigs'); await page.keyboard.press('Enter');
  await page.click('#new-playlist'); await page.keyboard.type('Friday'); await page.keyboard.press('Enter');
  const names = () => page.locator('.lside .tree .name').allTextContents().then(a => a.map(x => x.trim()));
  // Friday into Gigs (from its menu), then Gigs deleted with everything in it.
  const node = (n: string) => page.locator('.lside .tree .name', { hasText: n }).first();
  await node('Friday').click({ button: 'right' });
  await page.locator('.cmenu [data-m="move-to"]').click();
  await page.locator('.cmenu .citem', { hasText: 'Gigs' }).click();
  await expect.poll(names).toContain('Gigs');
  page.once('dialog', d => void d.accept());
  await node('Gigs').click({ button: 'right' });
  await page.locator('.cmenu [data-m="delete"]').click();
  await expect.poll(names).toEqual([]);
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  // Recently deleted: Gigs, with one playlist inside.
  await page.click('#open-bin');
  const e = page.locator('#bin li').first();
  await expect(e).toContainText('Gigs');
  await expect(e).toContainText('1 inside');
  await e.getByRole('button', { name: 'Restore' }).click();
  await expect(page.locator('#bin-empty')).toBeVisible();
  await page.keyboard.press('Escape');
  // Gigs is back, with Friday inside (opened to see it); still so after a reload.
  const opened = async () => { await expect.poll(names).toContain('Gigs'); if (!(await names()).includes('Friday')) await page.locator('.lside .tree li', { has: page.locator('.name', { hasText: 'Gigs' }) }).first().locator('.twist').first().click(); await expect.poll(names).toEqual(['Gigs', 'Friday']); };
  await opened();
  await page.reload();
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  await opened();
});

test('organises playlists (drag, menu, colours) and rates tracks in half stars', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');   // the "add your music" step
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  for (const n of ['A', 'B', 'C']) { await page.click('#new-playlist'); await page.keyboard.type(n); await page.keyboard.press('Enter'); }
  await page.click('#new-folder'); await page.keyboard.type('Gigs'); await page.keyboard.press('Enter');
  const names = () => page.locator('.lside .tree .name').allTextContents().then(a => a.map(x => x.trim()));
  expect(await names()).toEqual(['A', 'B', 'C', 'Gigs']);
  // The rows fit the sidebar (no sideways scroll), and the handle beside it makes it wider (remembered).
  const side = page.locator('.lside');
  expect(await side.evaluate(el => { const r = el.getBoundingClientRect().right; return [...el.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > r + 0.5).length; })).toBe(0);
  const w0 = (await side.boundingBox())!.width, h = (await page.locator('.splitter').boundingBox())!;
  await page.mouse.move(h.x + 5, h.y + 100); await page.mouse.down();
  await page.mouse.move(h.x + 105, h.y + 100, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => Math.round((await side.boundingBox())!.width - w0)).toBe(100);
  expect(await page.evaluate(() => localStorage.getItem('mco.sideWidth'))).toBe(String(Math.round(w0) + 100));
  await page.locator('.splitter').dblclick();
  await expect.poll(async () => Math.round((await side.boundingBox())!.width)).toBe(Math.round(w0));

  // Drag C above A.
  const item = (n: string) => page.locator('.lside .tree .item', { has: page.locator('.name', { hasText: new RegExp('^' + n + '$') }) });
  const drop = async (from: string, to: string, frac: number) => {
    const a = (await item(from).boundingBox())!, b = (await item(to).boundingBox())!;
    await page.mouse.move(a.x + 90, a.y + a.height / 2); await page.mouse.down();   // on the name (the icon drags out)
    await page.mouse.move(b.x + 90, b.y + b.height * frac, { steps: 6 });
    await page.mouse.up();
  };
  await drop('C', 'A', 0.15);
  expect(await names()).toEqual(['C', 'A', 'B', 'Gigs']);
  // Drag B into the folder (middle of the folder row).
  await drop('B', 'Gigs', 0.5);
  await expect(item('Gigs').locator('.twist')).toHaveAttribute('aria-label', 'Collapse');
  expect(await names()).toEqual(['C', 'A', 'Gigs', 'B']);
  // Menu (⋯, or right-click, ADR 0067): move B back to the top level, then up, and colour it.
  await item('B').hover(); await item('B').locator('.more').click();
  await page.locator('.cmenu [data-m="move-to"]').click();
  await page.locator('.cmenu [data-move-to=""]').click();
  expect(await names()).toEqual(['C', 'A', 'Gigs', 'B']);   // top level, at the end
  await item('B').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move up' }).click();
  expect(await names()).toEqual(['C', 'A', 'B', 'Gigs']);
  await item('B').click({ button: 'right' });
  await page.locator('.cmenu .sw').nth(3).click();
  await expect(item('B').locator('.icon')).toHaveClass(/colored/);
  await expect(page.locator('.cmenu')).toHaveCount(0);

  // Drag a track onto a playlist: highlight with "+", then added.
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  const row = page.locator('.tr', { hasText: 'aiff-44k-24' });
  const r = (await row.boundingBox())!, t = (await item('A').boundingBox())!;
  await page.mouse.move(r.x + 340, r.y + r.height / 2); await page.mouse.down();   // on the title (the overview plays)
  await page.mouse.move(t.x + 60, t.y + t.height / 2, { steps: 8 });
  await expect(item('A').locator('.plus')).toBeVisible();
  await expect(page.locator('.tag')).toContainText('Add aiff-44k-24 to A');
  await page.mouse.up();
  await expect(item('A')).toContainText('1');
  await expect(page.locator('.tag')).toHaveCount(0);

  // Half-star rating: the left half of the 4th star is 3.5.
  const stars = row.locator('.c-rate button');
  await stars.nth(3).click({ position: { x: 2, y: 6 } });
  await expect(row.locator('.stars')).toHaveAttribute('aria-valuenow', '3.5');
  await stars.nth(4).click({ position: { x: 10, y: 6 } });
  await expect(row.locator('.stars')).toHaveAttribute('aria-valuenow', '5');
  await stars.nth(4).click({ position: { x: 10, y: 6 } });   // same value again clears
  await expect(row.locator('.stars')).toHaveAttribute('aria-valuenow', '0');
  await stars.nth(2).click({ position: { x: 10, y: 6 } });
  // Survives a reload, along with order and colour.
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator('.tr', { hasText: 'aiff-44k-24' }).locator('.stars')).toHaveAttribute('aria-valuenow', '3', { timeout: 20_000 });
  expect(await names()).toEqual(['C', 'A', 'B', 'Gigs']);
  await expect(item('B').locator('.icon')).toHaveClass(/colored/);
});

test('right-click menus: songs (one or many, mouse or keyboard), playlists, tags, Library entries, columns and filters (ADR 0067)', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  const row = (t: string) => page.locator('.tr', { hasText: t });
  const cm = page.locator('.cmenu'), m = (k: string) => cm.locator('[data-m="' + k + '"]');
  // Enough playlists for "Add to playlist" to get a find field.
  for (let i = 1; i <= 8; i++) { await page.click('#new-playlist'); await page.keyboard.type('Set ' + i); await page.keyboard.press('Enter'); }
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();

  // One song: right-click selects it and shows its menu. No "Send to": no other computer here.
  await row('Fixture FLAC').locator('.c-title').click({ button: 'right' });
  await expect(cm).toHaveCount(1);
  await expect(row('Fixture FLAC')).toHaveClass(/sel/);
  await expect(cm.locator('.chead').first()).toHaveText('Fixture FLAC');
  await expect(m('details')).toBeVisible();
  await expect(m('prepare')).toBeVisible();
  await expect(page.locator('[data-send-home]')).toHaveCount(0);
  // A scroll that doesn't move the song leaves it open (the one that brought the ⋯ into view comes a
  // frame after the click); one that moves it closes it.
  await page.locator('.lside').evaluate(el => el.dispatchEvent(new Event('scroll')));
  await page.locator('.table .body').evaluate(el => el.dispatchEvent(new Event('scroll')));
  await page.waitForTimeout(100);
  await expect(cm).toHaveCount(1);
  await page.locator('.table .body .spacer').evaluate(el => { el.style.marginTop = '40px'; el.parentElement!.dispatchEvent(new Event('scroll')); });
  await expect(cm).toHaveCount(0);
  await page.locator('.table .body .spacer').evaluate(el => { el.style.marginTop = ''; });
  await row('Fixture FLAC').locator('.c-title').click({ button: 'right' });
  await page.keyboard.press('Escape');
  await expect(cm).toHaveCount(0);
  // Shift+right-click leaves the browser's own menu alone.
  await row('Fixture FLAC').locator('.c-title').click({ button: 'right', modifiers: ['Shift'] });
  await expect(cm).toHaveCount(0);

  // Two songs: the selection stays; Add to playlist › New playlist… puts both in it.
  await row('Fixture MP3').locator('.c-title').click({ modifiers: ['Control'] });
  await row('Fixture MP3').locator('.c-title').click({ button: 'right' });
  await expect(cm.locator('.chead').first()).toHaveText('2 songs selected');
  page.once('dialog', d => void d.accept('Warm-up'));
  await m('add').hover();
  if (process.env.SHOTS) { await expect(cm).toHaveCount(2); await page.screenshot({ path: process.env.SHOTS + '/menu-songs.png' }); }
  await cm.locator('[data-m="new-playlist"]').click();
  await expect(page.locator('.notice')).toContainText('Added 2 songs to Warm-up');
  await expect(page.locator('.lside .tree .item', { hasText: 'Warm-up' })).toContainText('2');
  // A rating on both at once.
  await row('Fixture MP3').locator('.c-title').click({ button: 'right' });
  await cm.locator('.cstars button').nth(3).click({ position: { x: 12, y: 7 } });
  await expect(cm).toHaveCount(0);
  for (const t of ['Fixture FLAC', 'Fixture MP3']) await expect(row(t).locator('.stars')).toHaveAttribute('aria-valuenow', '4');

  // The keyboard: a letter jumps, → opens the submenu with its find field, Enter picks.
  await row('Fixture MP3').locator('.c-title').click({ button: 'right' });
  await expect(cm).toBeFocused();
  await page.keyboard.press('a');
  await expect(m('queue')).toHaveClass(/\bon\b/);   // “Add to queue” (ADR 0068)…
  await page.keyboard.press('a');
  await expect(m('add')).toHaveClass(/\bon\b/);     // …then the next one: “Add to playlist”
  await page.keyboard.press('ArrowRight');
  await expect(cm).toHaveCount(2);
  await expect(cm.nth(1).locator('input')).toBeFocused();
  await page.keyboard.type('warm');
  await page.keyboard.press('Enter');
  await expect(cm).toHaveCount(0);
  await expect(page.locator('.notice')).toContainText('in Warm-up already');
  // The table's menu key (Shift+F10) opens the selection's menu too.
  await page.locator('.table .body').focus();
  await page.keyboard.press('Shift+F10');
  await expect(cm.locator('.chead').first()).toHaveText('2 songs selected');
  await page.keyboard.press('Escape');
  await expect(page.locator('.table .body')).toBeFocused();   // focus goes back where it was

  // In a playlist: "Remove from Warm-up".
  await page.locator('.lside .tree .name', { hasText: 'Warm-up' }).click();
  await row('Fixture MP3').locator('.c-title').click({ button: 'right' });
  await m('remove-here').click();
  await expect(page.locator('.tr')).toHaveCount(1);

  // A playlist in the sidebar: rename from its menu.
  const pl = page.locator('.lside .tree .item', { hasText: 'Warm-up' });
  await pl.click({ button: 'right' });
  await expect(pl).toHaveClass(/menued/);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/menu-playlist.png' });
  await m('rename').click();
  await page.keyboard.press('Control+A'); await page.keyboard.type('Opener'); await page.keyboard.press('Enter');
  await expect(page.locator('.lside .tree .name', { hasText: 'Opener' })).toBeVisible();

  // A tag in the sidebar puts itself on the selected songs.
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  await row('aiff-44k-24').locator('.c-title').click();
  page.once('dialog', d => void d.accept('Peak'));
  await page.click('#new-tag');
  await row('Fixture FLAC').locator('.c-title').click();
  await page.locator('.lside .tagitem', { hasText: 'Peak' }).click({ button: 'right' });
  await m('tag-on').click();
  await expect(page.locator('.lside .tagitem', { hasText: 'Peak' }).locator('.n')).toHaveText('2');
  // Right-clicking a tag in a row offers "Show only" that tag.
  await row('Fixture FLAC').locator('.tg', { hasText: 'Peak' }).click({ button: 'right' });
  await expect(m('only')).toHaveText(/Show only tag “Peak”/);
  await m('only').click();
  await expect(page.locator('.tr')).toHaveCount(2);
  await page.locator('.selbar').getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('.selbar .chip')).toHaveText('Peak×');   // what's filtered, removable
  await page.click('#clear-filters');

  // Library entries: hide one, and bring it back.
  await page.locator('.lside [data-view="recent"]').click({ button: 'right' });
  await m('hide-view').click();
  await expect(page.locator('.lside [data-view="recent"]')).toHaveCount(0);
  await page.click('#hidden-views');
  await cm.locator('[data-view-shown="recent"]').click();
  await expect(cm.locator('[data-view-shown="recent"]')).toHaveAttribute('aria-checked', 'true');   // stays open, ticked
  await page.keyboard.press('Escape');
  await expect(page.locator('.lside [data-view="recent"]')).toHaveCount(1);

  // A column's header: hide it.
  await page.locator('.th[data-col="genre"]').click({ button: 'right' });
  await m('hide-col').click();
  await expect(page.locator('.th[data-col="genre"]')).toHaveCount(0);

  // Filters: right-click one in the Filter menu to hide it; it comes back from there.
  await page.click('#filter-btn');
  await page.locator('#filter-menu fieldset[data-group="format"] legend').click({ button: 'right' });
  await m('hide-filter').click();
  await expect(page.locator('#filter-menu fieldset[data-group="format"]')).toHaveCount(0);
  await expect(page.locator('#hidden-filters')).toContainText('Format');
  await page.locator('#hidden-filters button').click();
  await expect(page.locator('#filter-menu fieldset[data-group="format"]')).toHaveCount(1);
  await page.keyboard.press('Escape');

  // Remove from collection, from the menu.
  page.once('dialog', d => void d.accept());
  await row('aac').locator('.c-title').click({ button: 'right' });
  await m('remove').click();
  await expect(page.locator('.tr')).toHaveCount(3);

  // The selection bar's ⋯ opens the same menu.
  await row('Fixture FLAC').locator('.c-title').click();
  await page.click('#sel-more');
  await m('details').click();
  await expect(page).toHaveURL(/#\/track\//);
});

test('the user’s list, batch 1: the selection bar stays put, playlists on Details, back to the library, Prepare by default, the queue’s order, the sidebar folds', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  const row = (t: string) => page.locator('.tr', { hasText: t });
  const m = (k: string) => page.locator('.cmenu [data-m="' + k + '"]');

  // Selecting a song doesn't move the rows (a double-click opened the wrong song as they jumped).
  const y0 = (await row('Fixture FLAC').boundingBox())!.y;
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/b1-selbar-none.png', clip: { x: 0, y: 150, width: 1920, height: 160 } });
  await expect(page.locator('#auto-from')).toBeDisabled();
  await row('Fixture MP3').locator('.c-title').click();
  await expect(page.locator('#auto-from')).toBeEnabled();
  expect((await row('Fixture FLAC').boundingBox())!.y).toBe(y0);
  await row('Fixture AAC').locator('.c-title').click({ modifiers: ['Control'] });
  expect((await row('Fixture FLAC').boundingBox())!.y).toBe(y0);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/b1-selbar-two.png', clip: { x: 0, y: 150, width: 1920, height: 160 } });

  // In three playlists: Details shows two and "+1 more".
  for (const n of ['One', 'Two', 'Three']) {
    await row('Fixture FLAC').locator('.c-title').click({ button: 'right' });
    page.once('dialog', d => void d.accept(n));
    await m('add').hover(); await page.locator('.cmenu [data-m="new-playlist"]').click();
  }
  await row('Fixture FLAC').dblclick();
  await expect(page.locator('#more-lists')).toHaveText('+1 more');
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/b1-details.png', clip: { x: 0, y: 100, width: 1920, height: 400 } });
  await page.click('#more-lists');
  await expect(page.locator('.cmenu .citem')).toHaveCount(3);
  await page.keyboard.press('Escape');

  // Prepare becomes the default once used, until Details is chosen again.
  await page.click('#tab-prepare');
  await page.locator('.crumbs a').click();
  await row('Fixture MP3').dblclick();
  await expect(page).toHaveURL(/\/prepare$/);
  await page.click('#tab-details');
  await page.locator('.crumbs a').click();
  await row('Fixture MP3').dblclick();
  await expect(page).toHaveURL(/#\/track\/[\w-]+$/);
  await page.locator('.crumbs a').click();

  // The profile screen: "Back to the library", and the logo.
  await page.locator('button.who').click();
  await expect(page.locator('#back-to-library')).toBeVisible();
  await page.click('#back-to-library');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 20_000 });
  await page.locator('button.who').click();
  await page.click('#home-link');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 20_000 });

  // The queue: "Next from" reorders by dragging; "Played before" clears.
  await page.click('#player-repeat'); await page.click('#player-repeat');   // repeat one: the 4-second fixtures mustn't move on meanwhile
  const top = page.locator('.tr').first();
  await top.hover(); await top.locator('.pbtn').click();
  await expect(page.locator('#lib-play')).toHaveAttribute('aria-label', 'Pause', { timeout: 20_000 });
  await page.click('#lib-play');   // paused: the 4-second fixtures would move on by themselves
  await page.click('#player-expand');
  const later = page.locator('#next-from .qr .qt b');
  await expect(later).toHaveCount(3);
  const names = await later.allTextContents();
  await page.locator('#next-from .qr').nth(2).dragTo(page.locator('#next-from .qr').nth(0), { targetPosition: { x: 40, y: 3 } });
  await expect(later).toHaveText([names[2], names[0], names[1]]);
  await page.click('#player-next');
  await expect(page.locator('#clear-played')).toBeVisible();
  await page.click('#clear-played');
  await expect(page.locator('#clear-played')).toHaveCount(0);
  await page.click('#player-expand');

  // The sidebar folds away (button or Ctrl+B), remembered.
  await page.click('#side-toggle');
  await expect(page.locator('.lside')).toHaveCount(0);
  await expect(page.locator('#side-show')).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/b1-folded.png' });
  await page.locator('.table .body').focus();
  await page.keyboard.press('Control+b');
  await expect(page.locator('.lside')).toBeVisible();
});

test('the user’s list, batch 2: columns resize and fit (kept), the Overview as a waveform (also for songs analysed before)', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 60_000 });

  // Drag the Artist header's right edge: 80 px wider.
  const th = (k: string) => page.locator('.th[data-col="' + k + '"]');
  const w0 = (await th('artist').boundingBox())!.width;
  const b = (await th('artist').locator('.rz').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 80, b.y + b.height / 2, { steps: 6 }); await page.mouse.up();
  await expect.poll(async () => Math.round((await th('artist').boundingBox())!.width - w0)).toBeGreaterThanOrEqual(75);
  // Double-click the Title's edge: it fits its longest title (these are short).
  await th('title').locator('.rz').dblclick();
  await expect.poll(async () => (await th('title').boundingBox())!.width).toBeLessThan(160);
  // Kept over a reload.
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 20_000 });
  expect(Math.round((await th('artist').boundingBox())!.width - w0)).toBeGreaterThanOrEqual(75);
  expect((await th('title').boundingBox())!.width).toBeLessThan(160);

  // The Overview as a waveform: right-click its header.
  await th('wave').click({ button: 'right' });
  await page.click('.cmenu [data-m="ov-waveform"]');
  await expect(page.locator('.tr .wave canvas').first()).toHaveAttribute('height', '44', { timeout: 20_000 });
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/b2-waveform.png', clip: { x: 0, y: 200, width: 1920, height: 200 } });
  // Songs analysed before waveforms existed get theirs from the stored analysis.
  await page.evaluate(async () => { const c = await (await navigator.storage.getDirectory()).getDirectoryHandle('cache'); await c.removeEntry('wthumbs', { recursive: true }); });
  await page.reload();
  await expect(page.locator('.tr .wave canvas')).toHaveCount(4, { timeout: 30_000 });
  await expect(page.locator('.tr .wave canvas').first()).toHaveAttribute('height', '44');
  // And back to the spectrogram.
  await th('wave').click({ button: 'right' });
  await page.click('.cmenu [data-m="ov-spectrogram"]');
  await expect(page.locator('.tr .wave canvas').first()).toHaveAttribute('height', '16');
});

test('the player: a queue (menu, drags, reorder, remove), shuffle and repeat, kept over a reload; the open player, the visualiser, the output (ADR 0068)', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  const row = (t: string) => page.locator('.tr', { hasText: t });
  const m = (k: string) => page.locator('.cmenu [data-m="' + k + '"]');
  const upNext = page.locator('#up-next .qr .qt b');

  // Nothing playing: queue two songs from their menu; Play next goes first.
  await row('Fixture MP3').locator('.c-title').click({ button: 'right' });
  await m('queue').click();
  await expect(page.locator('.notice')).toContainText('Queued 1 song. Press play to start.');
  await row('aac').locator('.c-title').click({ button: 'right' });
  await m('play-next').click();
  await expect(page.locator('#player-expand .badge')).toHaveText('2');
  await page.click('#player-expand');
  await expect(page.locator('#player-panel')).toBeVisible();
  await expect(upNext).toHaveText(['Fixture AAC', 'Fixture MP3']);

  // Play starts the first queued song.
  await page.click('#lib-play');
  await expect(page.locator('#lib-play')).toHaveAttribute('aria-label', 'Pause', { timeout: 20_000 });
  await expect(page.locator('.qr.now')).toContainText('Fixture AAC');
  await expect(upNext).toHaveText(['Fixture MP3']);
  // A song started from the table: the rest of the list comes after what's queued.
  await row('Fixture FLAC').hover(); await row('Fixture FLAC').locator('.pbtn').click();
  await expect(page.locator('.qr.now')).toContainText('Fixture FLAC');
  await expect(page.locator('.qsec', { hasText: 'Next from All tracks' })).toBeVisible();
  await page.click('#player-next');
  await expect(page.locator('.qr.now')).toContainText('Fixture MP3', { timeout: 20_000 });
  await expect(page.locator('#up-next')).toHaveCount(0);

  // A song dragged from the table onto the queue; two, then reordered by dragging; × removes.
  await row('aiff-44k-24').dragTo(page.locator('.qdrop'));
  await row('aac').dragTo(page.locator('.qdrop'));
  await expect(upNext).toHaveText(['aiff-44k-24', 'Fixture AAC']);
  await page.locator('#up-next .qr', { hasText: 'Fixture AAC' }).dragTo(page.locator('#up-next .qr', { hasText: 'aiff' }), { targetPosition: { x: 40, y: 3 } });
  await expect(upNext).toHaveText(['Fixture AAC', 'aiff-44k-24']);
  await page.locator('#up-next .qr', { hasText: 'aiff' }).hover();
  await page.locator('#up-next .qr', { hasText: 'aiff' }).locator('.qx').click();
  await expect(upNext).toHaveText(['Fixture AAC']);

  // Shuffle and repeat (off → all → one).
  await page.click('#player-shuffle');
  await expect(page.locator('#player-shuffle')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#player-repeat'); await page.click('#player-repeat');
  await expect(page.locator('#player-repeat')).toHaveAttribute('aria-label', 'Repeat: one');

  // The output: the default one, and a note that drivers come with GLUE Home.
  await page.click('#player-output');
  await expect(page.locator('.cmenu [role="menuitemcheckbox"]', { hasText: 'Default output' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.cmenu')).toContainText('ASIO');
  await page.keyboard.press('Escape');

  // The visualiser: loads when shown, draws into a canvas, switches themes; hidden again.
  await page.click('#viz-on');
  await expect(page.locator('#player-panel .stage canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#viz-theme option')).toHaveCount(8);
  await page.selectOption('#viz-theme', 'warp');
  await expect(page.locator('#viz-theme')).toHaveValue('warp');
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/player-viz.png' });
  await page.click('#viz-off');
  await expect(page.locator('#player-panel .stage')).toHaveCount(0);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/player-queue.png' });

  // Reloaded: the same song (not playing) and the same queue; shuffle and repeat too.
  await page.click('#lib-play');
  await expect(page.locator('#lib-play')).toHaveAttribute('aria-label', 'Play');
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.waitForTimeout(600);   // the queue is written a moment after it changes
  await page.reload();
  await expect(page.locator('#lib-now')).toHaveText('Fixture MP3', { timeout: 20_000 });
  await page.click('#player-expand');
  await expect(upNext).toHaveText(['Fixture AAC']);
  await expect(page.locator('#player-repeat')).toHaveAttribute('aria-label', 'Repeat: one');
  await page.click('#lib-play');
  await expect(page.locator('#lib-play')).toHaveAttribute('aria-label', 'Pause', { timeout: 20_000 });
  await expect(page.locator('.qr.now')).toContainText('Fixture MP3');
});

test('drops on folders and "+ Playlist", reorders playlist rows, columns and notes', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');   // the "add your music" step
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  await page.click('#new-folder'); await page.keyboard.type('Gigs'); await page.keyboard.press('Enter');
  const item = (n: string) => page.locator('.lside .tree .item', { has: page.locator('.name', { hasText: new RegExp('^' + n + '$') }) });
  const dragRow = async (title: string, to: { x: number; y: number }, during?: () => Promise<void>) => {
    const r = (await page.locator('.tr', { hasText: title }).boundingBox())!;
    await page.mouse.move(r.x + 300, r.y + r.height / 2); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    if (during) await during();
    await page.mouse.up();
  };
  const centre = async (sel: import('@playwright/test').Locator, fy = 0.5) => { const b = (await sel.boundingBox())!; return { x: b.x + 40, y: b.y + b.height * fy }; };

  // "+ Playlist" lights up (no full-page overlay) and makes a playlist with the track.
  await dragRow('Fixture AAC', await centre(page.locator('#new-playlist')), async () => {
    await expect(page.locator('#new-playlist')).toHaveClass(/hot/);
    await expect(page.locator('#new-playlist')).toHaveCSS('position', 'static');
  });
  await page.keyboard.type('Warm'); await page.keyboard.press('Enter');
  await expect(item('Warm')).toContainText('1');

  // A folder is also a playlist (as in Engine DJ): dropping on it adds the track to it.
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  await dragRow('Fixture MP3', await centre(item('Gigs')), async () => { await expect(item('Gigs').locator('.plus')).toBeVisible(); });
  await expect(item('Gigs')).toContainText('1');
  await item('Gigs').locator('.name').click();
  await expect(page.locator('.tr')).toHaveCount(1);
  await expect(page.locator('.tr')).toContainText('Fixture MP3');
  expect((await page.locator('.lside .tree .name').allTextContents()).map(x => x.trim().replace(/\d+$/, '').trim())).toEqual(['Gigs', 'Warm']);

  // Playlist rows: add three, reorder by dragging (default order is "#"), then keep a sorted order.
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  for (const t of ['Fixture FLAC', 'aiff-44k-24']) await dragRow(t, await centre(item('Warm')));
  await item('Warm').locator('.name').click();
  const titles = () => page.locator('.tr .c-title').allTextContents();
  await expect(page.locator('.thead [role="columnheader"]').first()).toHaveAttribute('aria-sort', 'ascending');
  expect(await titles()).toEqual(['Fixture AAC', 'Fixture FLAC', 'aiff-44k-24']);
  await dragRow('aiff-44k-24', await centre(page.locator('.tr').first(), 0.2));
  expect(await titles()).toEqual(['aiff-44k-24', 'Fixture AAC', 'Fixture FLAC']);
  await page.locator('.thead [data-col="title"]').click();
  await page.click('#keep-order');
  expect(await titles()).toEqual(['aiff-44k-24', 'Fixture AAC', 'Fixture FLAC'].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  await expect(page.locator('.thead [role="columnheader"]').first()).toHaveAttribute('aria-sort', 'ascending');

  // Columns: hide Album, drag Artist before Title.
  await page.click('#columns-btn');
  await page.locator('#columns-menu label', { hasText: 'Album' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.thead [data-col="album"]')).toHaveCount(0);
  const a = (await page.locator('.thead [data-col="artist"]').boundingBox())!, t = (await page.locator('.thead [data-col="title"]').boundingBox())!;
  await page.mouse.move(a.x + 10, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(t.x + 5, t.y + t.height / 2, { steps: 6 }); await page.mouse.up();
  const heads = () => page.locator('.thead [data-col]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.col));
  { const h = await heads(); expect(h.indexOf('artist')).toBeLessThan(h.indexOf('title')); }

  // Notes: an icon opens the editor; the text isn't shown in the table.
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  const row = page.locator('.tr', { hasText: 'Fixture FLAC' });
  await row.hover(); await row.locator('.note').click();
  await page.locator('.noteed textarea').fill('Mix out at the breakdown');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.noteed')).toHaveCount(0);
  await expect(row.locator('.note')).toHaveClass(/has/);
  await expect(page.locator('.tr', { hasText: 'Mix out' })).toHaveCount(0);

  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 20_000 });
  { const h = await heads(); expect(h.indexOf('artist')).toBeLessThan(h.indexOf('title')); }
  await expect(page.locator('.tr', { hasText: 'Fixture FLAC' }).locator('.note')).toHaveClass(/has/);
  await page.locator('.tr', { hasText: 'Fixture FLAC' }).dblclick();
  await expect(page.locator('#track-notes')).toHaveValue('Mix out at the breakdown');
});

test('track pages keep their analysis, and the playing track keeps playing', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');   // the "add your music" step
  await page.click('#add-folder');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 60_000 });

  // The background analysis stored the full result: even the first visit doesn't analyse.
  let busySeen = false;
  await page.exposeFunction('busySeen', () => { busySeen = true; });
  await page.evaluate(() => new MutationObserver(() => { if (document.querySelector('.detail .status')) (window as unknown as { busySeen: () => void }).busySeen(); }).observe(document.body, { childList: true, subtree: true }));
  await page.locator('.tr', { hasText: 'Fixture FLAC' }).dblclick();
  await expect(page.locator('#v-pill')).toHaveText('Upsampled', { timeout: 30_000 });
  await expect(page.locator('.detail .src')).toHaveText('Stored analysis');
  expect(busySeen).toBe(false);
  await page.locator('.crumbs a').click();
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 20_000 });
  await page.locator('.tr', { hasText: 'Fixture FLAC' }).dblclick();
  await expect(page.locator('.detail .src')).toHaveText('Stored analysis', { timeout: 10_000 });
  await expect(page.locator('#v-pill')).toHaveText('Upsampled');
  await expect(page.locator('#evidence')).toContainText('Content stops at 11.0 kHz');
  expect(await page.evaluate(() => [...document.querySelectorAll('.detail *')].filter(e => { const cs = getComputedStyle(e); return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight && e.tagName !== 'TEXTAREA'; }).length)).toBe(0);
  await expect(page.locator('.detail .status')).toHaveCount(0);   // no "Computing spectrum…"
  // Re-analyse on demand.
  await page.click('#reanalyse');
  await expect(page.locator('.detail .src')).toHaveText('Just analysed', { timeout: 30_000 });

  // Play from the library, open that track's page, come back: playback never stops.
  await page.locator('.crumbs a').click();
  const row = page.locator('.tr', { hasText: 'aiff-44k-24' });
  await row.hover(); await row.locator('.pbtn').click();
  await expect(page.locator('#lib-play')).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 });
  // The fixtures are 4 s long: loop them so "still playing" means something.
  await page.evaluate(() => { const loopAll = () => document.querySelectorAll('audio').forEach(a => { a.loop = true; }); loopAll(); setInterval(loopAll, 200); });
  await row.locator('.c-title').dblclick();
  await expect(page.locator('#v-pill')).not.toHaveText('', { timeout: 30_000 });
  await expect(page.locator('#play-btn')).toHaveAttribute('aria-label', 'Pause');
  await page.locator('.crumbs a').click();
  await expect(page.locator('#lib-play')).toHaveAttribute('aria-label', 'Pause');
  await row.locator('.c-title').dblclick();   // second visit: stored analysis, still playing
  await expect(page.locator('.detail .src')).toHaveText('Stored analysis', { timeout: 10_000 });
  await expect(page.locator('#play-btn')).toHaveAttribute('aria-label', 'Pause');
});

test('finds the same recording under different names and formats', async ({ page }) => {
  const { execFileSync } = await import('node:child_process');
  const { writeFileSync: wf, readFileSync: rf, mkdtempSync: md } = await import('node:fs');
  const ff = process.env.FFMPEG || 'ffmpeg';
  try { execFileSync(ff, ['-version'], { stdio: 'ignore' }); } catch { test.skip(true, 'needs ffmpeg to make an MP3 rip'); }
  // A 40 s synthetic track as WAV, the same audio as a 48 kHz MP3 with 1.3 s of extra lead-in, and a different track.
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
  const dir = md(join(tmpdir(), 'mco-dup-'));
  wf(join(dir, 'a.wav'), make(11)); wf(join(dir, 'c.wav'), make(99));
  execFileSync(ff, ['-loglevel', 'error', '-y', '-i', join(dir, 'a.wav'), '-af', 'adelay=1300', '-ar', '48000', '-b:a', '128k', join(dir, 'b.mp3')]);
  const files = [['HHH 04 RADIX.wav', 'a.wav'], ['HHH-Bebida.mp3', 'b.mp3'], ['Something else.wav', 'c.wav']].map(([n, f]) => ({ n, b: rf(join(dir, f)).toString('base64') }));
  await page.goto('./#/analyze');
  await page.evaluate(async files => {
    const root = await navigator.storage.getDirectory();
    for (const name of ['MCO', 'Music', 'cache']) await root.removeEntry(name, { recursive: true }).catch(() => {});
    const d = await root.getDirectoryHandle('Music', { create: true });
    for (const f of files) { const w = await (await d.getFileHandle(f.n, { create: true })).createWritable(); await w.write(Uint8Array.from(atob(f.b), c => c.charCodeAt(0))); await w.close(); }
  }, files);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');   // the "add your music" step
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 90_000 });

  // The two rips are one group; the WAV is the best copy; the other track isn't involved.
  const dupItem = page.locator('.lside .name', { hasText: 'Duplicates' });
  await expect(dupItem).toContainText('1', { timeout: 20_000 });
  await expect(page.locator('.tr', { hasText: 'HHH 04 RADIX' }).locator('.dup')).toHaveText('2×');
  await expect(page.locator('.tr', { hasText: 'Something else' }).locator('.dup')).toHaveCount(0);
  // The "2×" opens Duplicates on that track's group, with the track highlighted.
  await page.locator('.tr', { hasText: 'HHH 04 RADIX' }).first().locator('.dup').click();
  const grp = page.locator('#dupes .grp');
  await expect(grp).toHaveCount(1);
  await expect(grp.locator('li.focus')).toHaveCount(1);
  await expect(grp.locator('li.focus')).toBeInViewport();
  await expect(grp).toContainText('Same recording');
  await expect(grp.locator('li')).toHaveCount(2);
  await expect(grp.locator('li.best')).toContainText('HHH 04 RADIX');

  // Kept for next time: the result, and the fingerprints packed by shard, so duplicates show the moment
  // a collection opens (with thousands of songs they took a minute or two, 2026-09-27).
  const kept = await page.evaluate(async () => {
    const c = await (await navigator.storage.getDirectory()).getDirectoryHandle('cache');
    const list = async (d: FileSystemDirectoryHandle) => { const out: [string, FileSystemHandle][] = []; for await (const e of (d as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) out.push(e); return out; };
    const results = (await list(await c.getDirectoryHandle('dupes'))).length;
    let packs = 0;
    for (const [, col] of await list(await c.getDirectoryHandle('fp'))) for (const [, sh] of await list(col as FileSystemDirectoryHandle)) if (sh.kind === 'directory') for (const [n] of await list(sh as FileSystemDirectoryHandle)) if (n === 'pack.bin') packs++;
    return { results, packs };
  });
  expect(kept.results).toBe(1);
  expect(kept.packs).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('.tr')).toHaveCount(3, { timeout: 20_000 });
  await expect(page.locator('.tr', { hasText: 'HHH 04 RADIX' }).locator('.dup')).toHaveText('2×', { timeout: 2_000 });
  await page.locator('.tr', { hasText: 'HHH 04 RADIX' }).first().locator('.dup').click();
  await expect(grp).toHaveCount(1);

  // Songs analysed in another browser have no fingerprint in this one: they're made again here and
  // the group comes back (as when the GLUE folder is shared between computers).
  await page.evaluate(async () => { const c = await (await navigator.storage.getDirectory()).getDirectoryHandle('cache'); await c.removeEntry('fp', { recursive: true }); });
  await page.click('#dupes-rescan');
  await expect(page.locator('#dupes-missing')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#dupes .grp')).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator('#dupes-missing')).toHaveCount(0, { timeout: 60_000 });

  // "Not duplicates" hides the group, also after a reload.
  await grp.getByRole('button', { name: 'Not duplicates' }).click();
  await expect(page.locator('#dupes .grp')).toHaveCount(0);
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator('.tr')).toHaveCount(3, { timeout: 20_000 });
  await page.waitForTimeout(2500);
  await expect(page.locator('.tr .dup')).toHaveCount(0);
});

test('onboarding, backup, delete everything, restore on a fresh start', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  // Step 1 warns when the chosen folder looks like a music folder.
  await page.evaluate(() => { (window as unknown as { __home?: string }).__home = 'Music'; });
  await page.click('#choose-home');
  await expect(page.locator('.card.warn')).toContainText('looks like a music folder');
  await page.evaluate(() => { (window as unknown as { __home?: string }).__home = 'MCO'; });
  await page.click('#choose-other');
  // Step 2 and 3.
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.locator('.stepper li.on')).toContainText('Add your music');
  await page.click('#onb-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  await page.click('#new-playlist'); await page.keyboard.type('Keepers'); await page.keyboard.press('Enter');
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  await page.locator('.tr', { hasText: 'aiff-44k-24' }).locator('.c-rate button').nth(3).click({ position: { x: 10, y: 6 } });
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });

  // Backup from "Who's using MCO?".
  await page.locator('.top .who').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.pcard', { hasText: 'DJ Test' }).locator('.backup-btn').click()]);
  expect(dl.suggestedFilename()).toMatch(/^GLUE backup - DJ Test - \d{4}-\d\d-\d\d\.zip$/);
  const zip = join(mkdtempSync(join(tmpdir(), 'mco-bk-')), dl.suggestedFilename());
  await dl.saveAs(zip);

  // Delete everything: back to step 1, MCO's files gone, the music untouched.
  await page.click('#danger-toggle');
  await expect(page.locator('#danger-go')).toBeDisabled();
  await page.fill('#danger-confirm', 'delete');
  await page.click('#danger-go');
  await expect(page.locator('#choose-home')).toBeVisible({ timeout: 10_000 });
  const left = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(), names: string[] = [];
    for await (const [n] of (await root.getDirectoryHandle('MCO') as unknown as { entries(): AsyncIterable<[string]> }).entries()) names.push(n);
    let music = 0;
    for await (const _ of (await (await root.getDirectoryHandle('Music')).getDirectoryHandle('Sets') as unknown as { entries(): AsyncIterable<unknown> }).entries()) music++;
    return { names, music };
  });
  expect(left).toEqual({ names: [], music: 4 });

  // Restore the zip on the start screen.
  await page.setInputFiles('#restore-input', zip);
  await expect(page.locator('.card.side')).toContainText('Backup of DJ Test');
  await page.click('#choose-home');
  await expect(page.locator('.top .who')).toContainText('DJ Test', { timeout: 15_000 });
  await expect(page.locator('.lside .item', { hasText: 'Keepers' })).toBeVisible();
  await expect(page.locator('.tr')).toHaveCount(4);
  await expect(page.locator('.tr', { hasText: 'aiff-44k-24' }).locator('.stars')).toHaveAttribute('aria-valuenow', '4');
  // The music folder has to be found again (its permission can't travel in a zip).
  await page.getByRole('button', { name: 'Find folder' }).click();
  await expect(page.getByRole('button', { name: 'Find folder' })).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('.tr .q', { hasText: 'no file' })).toHaveCount(0);
});

test('drags a track out as a file copy and a playlist out as an M3U8', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.setInputFiles('#import-input', { name: 'rekordbox.xml', mimeType: 'text/xml', buffer: Buffer.from(REKORDBOX) });
  await importAllDj(page);
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(5, { timeout: 30_000 });
  // Record what each native drag carries.
  await page.evaluate(() => document.addEventListener('dragstart', e => {
    const dt = e.dataTransfer!;
    (window as unknown as { __drag: Record<string, string> }).__drag = { url: dt.getData('DownloadURL'), text: dt.getData('text/plain') };
  }));
  const drag = async (el: import('@playwright/test').Locator) => {
    const b = (await el.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(300);   // hover: the file gets ready
    await page.mouse.down(); await page.mouse.move(b.x + 200, b.y + 40, { steps: 5 }); await page.mouse.up();
    return page.evaluate(() => (window as unknown as { __drag: Record<string, string> }).__drag);
  };
  const row = page.locator('.tr', { hasText: 'Hi-res claim' });
  await row.hover();
  const t = await drag(row.locator('.grip'));
  expect(t.url).toMatch(/^audio\/flac:flac-96k-24\.flac:blob:/);
  expect(t.text).toBe(String.raw`C:\Users\dj\Music\Sets\flac-96k-24.flac`);
  const size = await page.evaluate(async u => (await (await fetch(u)).blob()).size, t.url.split(':').slice(2).join(':'));
  expect(size).toBe(968141);

  await page.locator('.lside .tree .name', { hasText: 'Rekordbox' }).click();
  const p = await drag(page.locator('.lside .item', { hasText: 'Friday' }).locator('.drag-out'));
  expect(p.url).toMatch(/^audio\/x-mpegurl:Friday\.m3u8:blob:/);
  expect(p.text).toContain('#EXTM3U');
  expect(p.text).toContain('#EXTINF:4,Tester - Lossy one' + '\r\n' + String.raw`C:\Users\dj\Music\Sets\mp3-128k.mp3`);
  expect(p.text).toContain('D:/Elsewhere/gone.wav');   // not found on this computer: its imported path is kept
});

test('themes: pick a theme and dark / light on the profile screen; it sticks', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-folder');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 60_000 });
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'stick');                 // the default (2026-09-25)
  for (const id of ['classic', 'stick', 'studio', 'riso', 'moss']) for (const mode of ['dark', 'light']) {
    await page.locator('.top .who').click();
    await page.click('#theme-' + id); await page.click('#mode-' + mode);
    await expect(html).toHaveAttribute('data-theme', id);
    await expect(html).toHaveAttribute('data-mode', mode);
    if (process.env.SHOTS && mode === 'dark') await page.screenshot({ path: `${process.env.SHOTS}/th-picker-${id}.png` });
    await page.locator('.profile', { hasText: 'DJ Test' }).click();
    await expect(page.locator('.tr')).toHaveCount(4);
    if (process.env.SHOTS) {
      await page.locator('.tr', { hasText: 'Fixture FLAC' }).click();
      await page.screenshot({ path: `${process.env.SHOTS}/th-lib-${id}-${mode}.png` });
      await page.locator('.tr', { hasText: 'Fixture FLAC' }).dblclick();
      await expect(page.locator('#v-pill')).not.toHaveText('', { timeout: 30_000 });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${process.env.SHOTS}/th-detail-${id}-${mode}.png` });
      await page.locator('.crumbs a').click();
    }
  }
  // The header button flips the mode; the choice survives a reload.
  await page.click('#mode-toggle');
  await expect(html).toHaveAttribute('data-mode', 'dark');
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'moss');
  await expect(html).toHaveAttribute('data-mode', 'dark');
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(font).toContain('Geist');
});

test('builds a playlist from a track: seed first, included tracks kept, saved as a playlist', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-folder');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 60_000 });
  await expect(page.locator('.brand h1 a')).toHaveAccessibleName('GLUE, Global Library Unified Exporter');

  await page.locator('.tr', { hasText: 'Fixture FLAC' }).click();
  await page.click('#auto-from');
  await expect(page.locator('#auto-dialog')).toBeVisible();
  await expect(page.locator('#auto-dialog .tchip.seed')).toContainText('Fixture FLAC');
  await expect(page.locator('#auto-count')).toHaveValue('4');             // 20, or fewer when the collection is smaller
  await page.fill('#auto-search', 'aiff');
  await page.locator('#auto-dialog .results button', { hasText: 'aiff-44k-24' }).click();
  await page.fill('#auto-count', '3');
  await page.click('#auto-go');
  const rows = page.locator('#auto-list li');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('Fixture FLAC');
  await expect(page.locator('#auto-list')).toContainText('aiff-44k-24');
  await page.click('#auto-again');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('Fixture FLAC');
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/auto.png' });
  await page.fill('#auto-name', 'Warm-up auto');
  await page.click('#auto-save');
  await expect(page.locator('#auto-dialog')).toHaveCount(0);
  await expect(page.locator('.lside .item', { hasText: 'Warm-up auto' })).toContainText('3');
  await expect(page.locator('.tr').first()).toContainText('Fixture FLAC');
  // "+ Auto" works without a starting track.
  await page.click('#new-auto');
  await expect(page.locator('#auto-dialog')).toContainText('No starting track');
  await page.keyboard.press('Escape');
  await expect(page.locator('#auto-dialog')).toHaveCount(0);
});

test('background analysis can be switched off per collection; chosen tracks can still be analysed', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.locator('label.switch').click();                        // off before any music arrives
  await expect(page.locator('#auto-analyse')).not.toBeChecked();
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await expect(page.locator('.an')).toContainText('4 not analysed');
  await expect(page.locator('.tr .q', { hasText: '…' })).toHaveCount(4);

  await page.locator('.tr', { hasText: 'Fixture FLAC' }).click();
  await page.click('#analyse-selected');
  await expect(page.locator('.an')).toContainText('3 not analysed', { timeout: 30_000 });
  await expect(page.locator('.tr', { hasText: 'Fixture FLAC' }).locator('.q')).toHaveText('Upsampled');

  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 20_000 });
  await expect(page.locator('#auto-analyse')).not.toBeChecked();
  await page.waitForTimeout(2000);
  await expect(page.locator('.an')).toContainText('3 not analysed');
  await page.locator('label.switch').click();
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 60_000 });
});

test('the playlist builder fits smaller windows: nothing cut off, everything reachable', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-folder');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 60_000 });
  // Many playlists make the options column long.
  for (let i = 0; i < 30; i++) { await page.click('#new-playlist'); await page.keyboard.type('Set ' + i); await page.keyboard.press('Enter'); }
  // Scroll like a person: the mouse wheel over the options (scrollIntoView can move clipped content and hide the bug).
  const onScreen = (sel: string) => page.locator(sel).evaluate(el => {
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    return y > 0 && y < innerHeight && document.elementFromPoint(x, y)?.closest('#' + el.id) != null;
  });
  const wheelTo = async (sel: string, over: string) => {
    for (let i = 0; i < 40 && !(await onScreen(sel)); i++) {
      const b = (await page.locator(over).boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, Math.max(b.y + 10, Math.min(b.y + b.height - 10, page.viewportSize()!.height - 10)));
      await page.mouse.wheel(0, 300);
    }
    expect(await onScreen(sel), sel + ' reachable by scrolling').toBe(true);   // no automatic scroll-into-view
  };
  for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 620], [1024, 560], [760, 900], [390, 700]]) {
    await page.setViewportSize({ width: w, height: h });
    // 760 px and narrower: the phone layout (ADR 0078), where it's in the Playlists tab.
    if (w <= 760) { await page.locator('.tabs [data-tab="playlists"]').click(); await page.click('#phone-new-auto'); }
    else await page.click('#new-auto');
    const head = (await page.locator('#auto-h').boundingBox())!;
    expect(head.y, `title visible at ${w}x${h}`).toBeGreaterThanOrEqual(0);
    await wheelTo('#auto-go', '#auto-dialog form');
    await page.click('#auto-go');
    await wheelTo('#auto-save', '#auto-dialog .res');
    // Nothing wider than the dialog, and the track names get room.
    expect(await page.locator('#auto-dialog').evaluate(el => el.scrollWidth - el.clientWidth), `no sideways overflow at ${w}x${h}`).toBeLessThanOrEqual(1);
    expect((await page.locator('#auto-list .who').first().boundingBox())!.width, `names readable at ${w}x${h}`).toBeGreaterThan(80);
    await page.keyboard.press('Escape');
  }
});

test('with several tracks selected, the playlist builder includes them all', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-folder');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 60_000 });
  await page.locator('.tr', { hasText: 'Fixture MP3' }).click();
  await page.locator('.tr', { hasText: 'aiff-44k-24' }).click({ modifiers: ['Control'] });
  await page.locator('.tr', { hasText: 'Fixture AAC' }).click({ modifiers: ['Control'] });
  await expect(page.locator('#auto-from')).toHaveText('Build playlist with these 3');
  await page.click('#auto-from');
  await expect(page.locator('#auto-dialog .tchip')).toHaveCount(3);   // one start + two to include
  await expect(page.locator('#auto-count')).toHaveValue('4');
  await page.fill('#auto-count', '3');
  await page.click('#auto-go');
  const list = page.locator('#auto-list');
  for (const t of ['Fixture MP3', 'aiff-44k-24', 'Fixture AAC']) await expect(list).toContainText(t);
  await expect(page.locator('#auto-list li')).toHaveCount(3);
});

test('finds DJ libraries in allowed folders and adds / updates them with one click', async ({ page }) => {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs(), db = new SQL.Database();
  db.run(`CREATE TABLE Track (id INTEGER PRIMARY KEY, path TEXT, filename TEXT, title TEXT, artist TEXT, bpmAnalyzed REAL, key INTEGER, length INTEGER);
    CREATE TABLE Playlist (id INTEGER PRIMARY KEY, title TEXT, parentListId INTEGER, nextListId INTEGER);
    CREATE TABLE PlaylistEntity (id INTEGER PRIMARY KEY, listId INTEGER, trackId INTEGER, nextEntityId INTEGER);
    INSERT INTO Track VALUES (1,'../Sets/flac-96k-24.flac','flac-96k-24.flac','Engine one','E',126,1,4);
    INSERT INTO Playlist VALUES (1,'Peak time',0,0); INSERT INTO PlaylistEntity VALUES (1,1,1,0);`);
  const mdb = Buffer.from(db.export()).toString('base64'); db.close();
  const nml = `<?xml version="1.0" encoding="UTF-8"?><NML VERSION="19"><COLLECTION ENTRIES="1"><ENTRY TITLE="Traktor one" ARTIST="T"><LOCATION DIR="/:Users/:dj/:Music/:Sets/:" FILE="mp3-128k.mp3" VOLUME="C:"/></ENTRY></COLLECTION><PLAYLISTS><NODE TYPE="FOLDER" NAME="$ROOT"><SUBNODES COUNT="0"></SUBNODES></NODE></PLAYLISTS></NML>`;
  await seed(page);
  await page.evaluate(async ({ mdb, rb, nml }) => {
    const root = await navigator.storage.getDirectory();
    const put = async (dir: FileSystemDirectoryHandle, path: string[], data: Uint8Array | string) => {
      let d = dir; for (const p of path.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      const w = await (await d.getFileHandle(path[path.length - 1], { create: true })).createWritable(); await w.write(new Blob([data as BlobPart])); await w.close();
    };
    const music = await root.getDirectoryHandle('Music');
    await put(music, ['Engine Library', 'Database2', 'm.db'], Uint8Array.from(atob(mdb), c => c.charCodeAt(0)));
    await put(await root.getDirectoryHandle('MCO', { create: true }), ['rekordbox.xml'], rb);
    await root.removeEntry('NI', { recursive: true }).catch(() => {});
    await put(await root.getDirectoryHandle('NI', { create: true }), ['Traktor 3.11.0', 'collection.nml'], nml);
  }, { mdb, rb: REKORDBOX, nml });
  await page.goto('./');
  await page.click('#choose-home');
  await page.click('#use-anyway');   // the export is already in it, so it isn't empty
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });

  // Found without browsing: Engine DJ in Music, rekordbox exported into the MCO folder.
  const libs = page.locator('#dj-libs');
  await expect(libs.locator('.found', { hasText: 'Engine DJ library' })).toBeVisible({ timeout: 15_000 });
  await expect(libs.locator('.found', { hasText: 'rekordbox XML' })).toContainText('MCO/rekordbox.xml');
  await libs.locator('.found', { hasText: 'rekordbox XML' }).getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('.notice')).toContainText('3 tracks', { timeout: 15_000 });
  await expect(libs.locator('.found', { hasText: 'rekordbox XML' })).toHaveCount(0);
  await libs.locator('.found', { hasText: 'Engine DJ library' }).getByRole('button', { name: 'Add' }).click();
  await expect(libs.locator('.item', { hasText: 'Engine DJ' })).toBeVisible({ timeout: 15_000 });

  // Traktor lives elsewhere: "Look in…" once, and it's found (and remembered).
  await page.click('#find-libs');
  await expect(libs.locator('.found', { hasText: 'Traktor collection' })).toBeVisible({ timeout: 15_000 });

  // A new rekordbox export: Update.
  await page.waitForTimeout(1200);
  await page.evaluate(async rb => {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('MCO');
    const w = await (await d.getFileHandle('rekordbox.xml')).createWritable(); await w.write(rb.replace('Lossy one', 'Lossy one (edit)')); await w.close();
  }, REKORDBOX);
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator('.tr')).toHaveCount(5, { timeout: 20_000 });
  const upd = libs.locator('.item', { hasText: 'rekordbox' }).getByRole('button', { name: 'Update' });
  await expect(upd).toBeVisible({ timeout: 15_000 });
  await expect(libs.locator('.found', { hasText: 'Traktor collection' })).toBeVisible();   // the place was remembered
  await upd.click();
  await expect(upd).toHaveCount(0, { timeout: 15_000 });
});

test('rows show a mini spectrogram: click plays from that spot; imported ratings become the track’s own', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.setInputFiles('#import-input', { name: 'rekordbox.xml', mimeType: 'text/xml', buffer: Buffer.from(REKORDBOX) });
  await importAllDj(page);
  await page.click('#add-folder');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 60_000 });
  const wave = (t: string) => page.locator('.tr', { hasText: t }).locator('[data-c="wave"] .wave');
  await expect(wave('Hi-res claim').locator('canvas')).toBeVisible({ timeout: 10_000 });
  expect(await page.locator('.tr [data-c="wave"] canvas').count()).toBe(4);   // the unlinked import has none
  // Drawn: not all black.
  const lit = await wave('Hi-res claim').locator('canvas').evaluate((c: HTMLCanvasElement) => { const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) n++; return n; });
  expect(lit).toBeGreaterThan(100);
  // Click the middle: that track plays from about 2 s of 4.
  const b = (await wave('Hi-res claim').boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.locator('#lib-now')).toHaveText('Hi-res claim');
  await expect(wave('Hi-res claim').locator('.head')).toBeVisible();
  await page.click('#lib-play');   // pause, so the position stays put
  await expect(page.locator('#lib-player .seek .mono').first()).toHaveText(/^0:0[1-3]$/, { timeout: 5000 });
  // rekordbox Rating 255 → 5 stars, as the track's own (not dimmed).
  await expect(page.locator('.tr', { hasText: 'Hi-res claim' }).locator('.stars')).toHaveAttribute('aria-valuenow', '5');
  await expect(page.locator('.tr', { hasText: 'Hi-res claim' }).locator('.stars')).not.toHaveClass(/dim/);
});

test('filters the table by quality and format', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-folder');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 60_000 });
  // All columns at once never widen the page: the header's buttons stay on screen and the table scrolls sideways.
  for (const w of [1590, 1280, 1024]) {
    await page.setViewportSize({ width: w, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), 'page fits at ' + w).toBeLessThanOrEqual(w);
    const m = (await page.locator('#mode-toggle').boundingBox())!;
    expect(m.x + m.width, 'mode toggle on screen at ' + w).toBeLessThanOrEqual(w);
    // Only the rows scroll: their vertical scroll bar is at the table's visible edge, not past it.
    const b = (await page.locator('.table .body').boundingBox())!;
    expect(b.x + b.width, 'rows end on screen at ' + w).toBeLessThanOrEqual(w);
    if (w === 1024) {
      expect(await page.locator('.table .body').evaluate(e => e.scrollWidth > e.clientWidth), 'columns scroll sideways at 1024').toBe(true);
      // Scrolling the rows sideways takes the header along.
      await page.locator('.table .body').evaluate(e => { e.scrollLeft = 200; e.dispatchEvent(new Event('scroll')); });
      await expect.poll(() => page.locator('.table .hwrap').evaluate(e => e.scrollLeft)).toBe(200);
    }
  }
  await page.setViewportSize({ width: 1920, height: 960 });
  await page.click('#filter-btn');
  const menu = page.locator('#filter-menu');
  await expect(menu).toContainText('Caution');
  for (const f of ['MP3', 'FLAC', 'AIFF', 'AAC']) await expect(menu).toContainText(f);
  await menu.locator('label', { hasText: 'Caution' }).click();
  await expect(page.locator('.tr')).toHaveCount(2);                      // the MP3 and the AIFF
  await menu.locator('label', { hasText: 'MP3' }).click();               // and MP3: both groups together
  await expect(page.locator('.tr')).toHaveCount(1);
  await expect(page.locator('.tr')).toContainText('Fixture MP3');
  await expect(page.locator('#filter-btn')).toContainText('2');
  await page.keyboard.press('Escape');
  await page.click('#clear-filters');
  await expect(page.locator('.tr')).toHaveCount(4);
  // A row's quality badge filters by it.
  await page.locator('.tr', { hasText: 'Fixture FLAC' }).locator('.qbtn').click();
  await expect(page.locator('.tr')).toHaveCount(1);
  await expect(page.locator('.selbar')).toContainText('Upsampled');
});

test('tags: on tracks and playlists, in the sidebar, filters, insights and the playlist builder', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-folder');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 60_000 });
  const row = (t: string) => page.locator('.tr', { hasText: t });

  // Tag one track from its Tags cell (new tags are made on Enter), then two at once from the selection bar.
  await row('Fixture FLAC').hover();
  await row('Fixture FLAC').locator('.c-tags').click();
  const ed = page.locator('#tag-editor');
  await expect(ed).toBeVisible();
  await page.fill('#tag-input', 'Peak'); await page.keyboard.press('Enter');
  await page.fill('#tag-input', '#vocal'); await page.keyboard.press('Enter');
  await expect(ed.locator('.chips')).toContainText('Peak');
  await expect(ed.locator('.chips')).toContainText('vocal');
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/tag-editor.png' });
  await page.keyboard.press('Escape');
  await expect(ed).toHaveCount(0);
  await expect(row('Fixture FLAC').locator('.c-tags')).toContainText('Peak');
  await row('Fixture FLAC').click();
  await row('Fixture MP3').click({ modifiers: ['Control'] });
  await page.click('#tag-selected');
  await expect(ed.locator('label', { hasText: 'vocal' }).locator('input')).toHaveJSProperty('indeterminate', true);   // on one of the two
  await ed.locator('.tag.part', { hasText: 'vocal' }).locator('.nm').click();                                          // "partly" → on both
  await expect(ed.locator('label', { hasText: 'vocal' }).locator('input')).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(row('Fixture MP3').locator('.c-tags')).toContainText('vocal');

  // The sidebar lists tags with their counts; a tag shows its tracks; dropping tracks on a tag tags them.
  const side = (t: string) => page.locator('.lside .tagitem', { hasText: t });
  await expect(side('vocal').locator('.n')).toHaveText('2');
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  const r = (await row('aac').boundingBox())!, to = (await side('Peak').boundingBox())!;
  await page.mouse.move(r.x + 300, r.y + r.height / 2); await page.mouse.down();
  await page.mouse.move(to.x + 40, to.y + to.height / 2, { steps: 8 });
  await expect(side('Peak').locator('.plus')).toBeVisible();
  await page.mouse.up();
  await expect(side('Peak').locator('.n')).toHaveText('2');
  await side('Peak').locator('.name').click();
  await expect(page.locator('.lib h2')).toContainText('Tagged “Peak”');
  await expect(page.locator('.tr')).toHaveCount(2);

  // Column headers open their value filters (every value listed, tick to show only those).
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  await page.locator('.thead [data-col="quality"]').hover();
  await page.click('[data-hf="quality"]');
  const hf = page.locator('#head-filter');
  await expect(hf).toContainText('Caution');
  await expect(hf).toContainText('Upsampled');
  await hf.locator('label', { hasText: 'Caution' }).click();
  await expect(page.locator('.tr')).toHaveCount(2);
  await hf.locator('label.all').click();
  await expect(page.locator('.tr')).toHaveCount(4);
  await page.click('[data-hf="tags"]');
  await expect(hf).toContainText('No tags');
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/tags-filter.png' });
  await hf.locator('label', { hasText: 'vocal' }).click();
  await expect(page.locator('.tr')).toHaveCount(2);
  await expect(page.locator('[data-hf="tags"]')).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await page.click('#clear-filters');
  await expect(page.locator('.tr')).toHaveCount(4);

  // A playlist shows its insights (length, tempo, keys, a Venn of its tags) and has tags of its own.
  page.once('dialog', d => d.accept('Friday'));
  await row('Fixture FLAC').click();
  await row('Fixture MP3').click({ modifiers: ['Control'] });
  await row('aac').click({ modifiers: ['Control'] });
  await page.selectOption('.selbar select', '__new');
  await page.locator('.lside .tree .name', { hasText: 'Friday' }).click();
  const ins = page.locator('#playlist-insights');
  await expect(ins).toBeVisible();
  await expect(ins.locator('.venn')).toBeVisible();
  // Peak: FLAC + AAC, vocal: FLAC + MP3 → Peak only 1, vocal only 1, both 1.
  await expect(ins.locator('.venn text[data-region="3"]')).toHaveText('1');
  await expect(ins.locator('.venn text[data-region="1"]')).toHaveText('1');
  await expect(ins.locator('.venn text[data-region="2"]')).toHaveText('1');
  await page.click('#list-tags');
  await page.fill('#tag-input', 'Friday night'); await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(ins.locator('.ltags')).toContainText('Friday night');
  await expect(side('Friday night')).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/insights.png' });
  await page.click('#insights-btn');
  await expect(ins).toHaveCount(0);
  await page.click('#insights-btn');
  await expect(ins).toBeVisible();

  // The builder looks at tags by default: the starting track's own; "Only these" keeps just tracks with them.
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  await row('aiff-44k-24').click();
  await page.click('#auto-from');
  await expect(page.locator('#auto-tags')).toBeChecked();
  await expect(page.locator('#auto-tag-list .tg')).toHaveCount(0);                 // the AIFF has no tags
  await page.selectOption('#auto-tag-list select', 'vocal');
  await page.click('#tags-only');
  await page.fill('#auto-count', '4');
  await page.click('#auto-go');
  const items = page.locator('#auto-list li');
  await expect(items).toHaveCount(3);                                               // the AIFF (start) + the two vocal tracks
  await expect(page.locator('#auto-list')).not.toContainText('aac');
  await expect(items.first().locator('.wave canvas')).toBeVisible();                // each track has its overview, to scrub
  await expect(page.locator('#auto-insights')).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/auto-tags.png' });
  // Clicking a row's overview plays it from there.
  const w = (await items.nth(1).locator('.wave').boundingBox())!;
  await page.mouse.click(w.x + w.width * 0.5, w.y + w.height / 2);
  await expect(items.nth(1).locator('.wave.playing')).toBeVisible({ timeout: 10_000 });
  await page.fill('#auto-name', 'Vocal auto');
  await page.click('#auto-save');
  await expect(page.locator('#playlist-insights .ltags')).toContainText('vocal');   // saved with the tags it looked for
});

test('opening another track’s page doesn’t stop what’s playing; playing there switches', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-folder');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 60_000 });
  const row = page.locator('.tr', { hasText: 'aiff-44k-24' });
  await row.hover(); await row.locator('.pbtn').click();
  await expect(page.locator('#lib-play')).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 });
  await page.locator('.tr', { hasText: 'Fixture FLAC' }).dblclick();
  await expect(page.locator('#v-pill')).toHaveText('Upsampled', { timeout: 30_000 });
  // This page's player waits; the AIFF plays on (the fixtures are 4 s long, so it may have ended).
  await expect(page.locator('#play-btn')).toHaveAttribute('aria-label', 'Play');
  await expect(page.locator('#other-playing')).toContainText('aiff-44k-24');
  await expect(page.locator('#other-playing')).toContainText(/Still playing|Paused/);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/other-playing.png' });
  await page.click('#play-btn');                                                    // play this track instead
  await expect(page.locator('#play-btn')).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 });
  await expect(page.locator('#other-playing')).toHaveCount(0);
  await page.locator('.crumbs a').click();
  await expect(page.locator('#lib-now')).toHaveText('Fixture FLAC');
});

test('GLUE account: Google sign-in, devices, pairing a GLUE Home, staying signed in, signing out', async ({ page }) => {
  // A GLUE Home running on the test computer (the local link, 47400–47409) mustn't take part.
  await page.route(/^http:\/\/127\.0\.0\.1:4740\d\//, r => r.abort());
  // Google's script, the API and the signaling room are stand-ins; the website code is real.
  await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { id: { initialize(o) { window.__gcb = o.callback; }, disableAutoSelect() {},
      renderButton(el) { const b = document.createElement('button'); b.id = 'fake-google'; b.textContent = 'Sign in with Google'; b.onclick = () => window.__gcb({ credential: 'fake-id-token' }); el.appendChild(b); } } } };` }));
  const devices = [{ id: 'b1', kind: 'browser', name: 'Edge on Windows', platform: 'Win32', createdAt: 1, lastSeen: 1 }];
  let refreshes = 0, lastRefresh = '';
  const user = { id: 'u1', email: 'dj@example.com', name: 'DJ Test', picture: null };
  await page.route('https://glue-api.joaopmanso.workers.dev/v1/**', async r => {
    const u = new URL(r.request().url()), m = r.request().method(), json = (b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.pathname === '/v1/health') return json({ ok: true });
    if (u.pathname === '/v1/auth/google') { expect(r.request().postDataJSON().credential).toBe('fake-id-token'); lastRefresh = 'r0'; return json({ access: 'a0', refresh: 'r0', deviceId: 'b1', user }); }
    if (u.pathname === '/v1/auth/refresh') { const got = r.request().postDataJSON().refresh; if (got !== lastRefresh) return json({ error: 'sign in again' }, 401); lastRefresh = 'r' + ++refreshes; return json({ access: 'a' + refreshes, refresh: lastRefresh, deviceId: 'b1' }); }
    if (u.pathname === '/v1/auth/logout') return json({ ok: true });
    if (u.pathname === '/v1/me') return json({ user, thisDevice: 'b1', devices });
    if (u.pathname === '/v1/pairing' && m === 'POST') return json({ code: 'K7QM-2XPB', expiresAt: Date.now() + 600_000 });
    if (u.pathname === '/v1/devices/h1' && m === 'PATCH') { devices[1].name = r.request().postDataJSON().name; return json({ device: devices[1] }); }
    return json({ error: 'not found' }, 404);
  });
  let room: import('@playwright/test').WebSocketRoute | null = null;
  await page.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, ws => { room = ws; ws.send(JSON.stringify({ type: 'presence', online: ['b1'] })); ws.onMessage(() => {}); });

  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await expect(page.locator('#devices')).toHaveCount(0);                                  // no account: nothing changes
  await page.click('#account-btn');
  await expect(page.locator('#account-pop')).toContainText('optional');
  await page.click('#fake-google');
  await expect(page.locator('#account-btn')).toHaveText(/D/);
  const devs = page.locator('#devices');
  await expect(devs).toContainText('Edge on Windows');
  await expect(devs).toContainText('this browser');
  await expect(devs.locator('[data-device="b1"] .sw')).toHaveClass(/on/);

  // Pair a GLUE Home: the code shows; when the new device comes online the dialog closes itself.
  await page.click('#pair-home');
  await expect(page.locator('#pair-code')).toHaveText('K7QM-2XPB');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('#copy-code');
  await expect(page.locator('#copy-code')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('K7QM-2XPB');
  devices.push({ id: 'h1', kind: 'home', name: 'Studio PC', platform: 'win32', createdAt: 2, lastSeen: 2 });
  room!.send(JSON.stringify({ type: 'presence', online: ['b1', 'h1'] }));
  await expect(page.locator('#pair-dialog')).toHaveCount(0, { timeout: 15_000 });   // after the device list comes back
  await expect(devs.locator('[data-device="h1"]')).toContainText('GLUE Home · online');
  await expect(devs.locator('[data-device="h1"] .sw')).toHaveClass(/on/);
  page.once('dialog', d => d.accept('Studio'));
  await devs.locator('[data-device="h1"]').hover();
  await devs.locator('[data-device="h1"] .more').click();
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  await expect(devs.locator('[data-device="h1"]')).toContainText('Studio');
  room!.send(JSON.stringify({ type: 'presence', online: ['b1'] }));
  await expect(devs.locator('[data-device="h1"]')).toContainText(/seen \d+ days ago/);

  // A reload stays signed in (the refresh token rotates); signing out forgets it.
  await page.reload();
  await expect(page.locator('#devices')).toContainText('Studio', { timeout: 15_000 });
  expect(refreshes).toBeGreaterThan(0);
  await page.click('#account-btn');
  await page.click('#sign-out');
  await expect(page.locator('#account-btn')).toHaveText('Sign in');
  await expect(page.locator('#devices')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#account-btn')).toHaveText('Sign in', { timeout: 15_000 });
});

test('cloud sync: upload, open from the cloud, edits reach the owning device, merge two devices, clean up', async ({ page }) => {
  // A stand-in GLUE Cloud with the same API as cloud/src (tests/cloud.test.ts covers the real one).
  await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { id: { initialize(o) { window.__gcb = o.callback; }, disableAutoSelect() {},
      renderButton(el) { const b = document.createElement('button'); b.className = 'fake-google'; b.textContent = 'Sign in with Google'; b.onclick = () => window.__gcb({ credential: 'fake' }); el.appendChild(b); } } } };` }));
  const user = { id: 'u1', email: 'dj@example.com', name: 'DJ Test', picture: null };
  const devices = [{ id: 'b1', kind: 'browser', name: 'Laptop', platform: '', createdAt: 1, lastSeen: 1 }];
  type Stored = { name: string; stats: unknown; files: Map<string, { hash: string; size: number; data: string }>; updatedAt: number };
  const cloud = new Map<string, Stored>();                          // 'device/profile'
  let ops: { seq: number; device: string; profile: string; collection: string; op: unknown }[] = [], seq = 0;
  let links: { id: string; name: string; members: { device: string; profile: string; collection: string }[] }[] = [];
  let slow = false, offline = false, bundles = 0, hold: Promise<void> | null = null;
  const batches: number[] = [];
  await page.route('https://glue-api.joaopmanso.workers.dev/v1/**', async r => {
    const req = r.request(), u = new URL(req.url()), m = req.method(), p = u.pathname;
    const json = (b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (offline) return r.abort('internetdisconnected');
    if (slow && /^\/v1\/sync\/desk\//.test(p)) await new Promise(res => setTimeout(res, 1500));
    if (hold && /^\/v1\/sync(\/links)?$/.test(p)) await hold;
    if (p === '/v1/health') return json({ ok: true });
    if (p === '/v1/auth/google') return json({ access: 'a', refresh: 'r', deviceId: 'b1', user });
    if (p === '/v1/auth/refresh') return json({ access: 'a', refresh: 'r', deviceId: 'b1' });
    if (p === '/v1/me') return json({ user, thisDevice: 'b1', devices });
    if (p === '/v1/sync/manifest') {
      const b = req.postDataJSON(), key = 'b1/' + b.profile.id, s = cloud.get(key) ?? { name: b.profile.name, stats: null, files: new Map(), updatedAt: 0 };
      s.name = b.profile.name; s.stats = b.stats; s.updatedAt = Date.now();
      const keep = new Set(b.files.map((f: { path: string }) => f.path));
      for (const k of [...s.files.keys()]) if (!keep.has(k)) s.files.delete(k);
      cloud.set(key, s);
      return json({ need: b.files.filter((f: { path: string; hash: string }) => s.files.get(f.path)?.hash !== f.hash).map((f: { path: string }) => f.path) });
    }
    if (p === '/v1/sync/file' && m === 'PUT') {
      cloud.get('b1/' + u.searchParams.get('profile'))!.files.set(u.searchParams.get('path')!, { hash: u.searchParams.get('hash')!, size: Number(u.searchParams.get('size')), data: req.postData()! });
      return json({ ok: true });
    }
    if (p === '/v1/sync/files' && m === 'POST') {
      const s = cloud.get('b1/' + u.searchParams.get('profile'))!;
      const lines = req.postData()!.split('\n').filter(Boolean);
      batches.push(lines.length);
      for (const l of lines) { const [path, hash, size, data] = l.split('\t'); s.files.set(path, { hash, size: Number(size), data }); }
      return json({ ok: true, stored: lines.length });
    }
    if (p === '/v1/sync' && m === 'GET') return json({ thisDevice: 'b1', profiles: [...cloud].map(([k, s]) => { const [d, pid] = k.split('/'); return { device: { id: d, name: devices.find(x => x.id === d)!.name, kind: 'browser' }, profile: { id: pid, name: s.name, color: null }, stats: s.stats, files: s.files.size, stored: s.files.size, bytes: 1, updatedAt: s.updatedAt, complete: true }; }) });
    if (p === '/v1/sync' && m === 'DELETE') { cloud.clear(); ops = []; links = []; return json({ ok: true }); }
    if (p === '/v1/sync/links' && m === 'GET') return json({ groups: links });
    if (p === '/v1/sync/links' && m === 'POST') { const b = req.postDataJSON(); const g = { id: 'g1', name: b.name, members: b.members }; links = [g]; return json({ group: 'g1', name: b.name }); }
    if (p === '/v1/sync/ops' && m === 'POST') { for (const o of req.postDataJSON().ops) ops.push({ seq: ++seq, ...o }); return json({ queued: 1 }); }
    if (p === '/v1/sync/ops' && m === 'GET') { const d = u.searchParams.get('device') ?? 'b1', pid = u.searchParams.get('profile'); return json({ ops: ops.filter(o => o.device === d && o.profile === pid).map(o => ({ seq: o.seq, collection: o.collection, op: o.op, at: 1 })) }); }
    if (p === '/v1/sync/ops/ack') { const b = req.postDataJSON(); ops = ops.filter(o => !(o.device === 'b1' && o.profile === b.profile && o.seq <= b.upTo)); return json({ ok: true }); }
    const f = /^\/v1\/sync\/([\w-]+)\/([\w-]+)(\/file|\/bundle)?$/.exec(p);
    if (f && !f[3]) return json({ files: [...(cloud.get(f[1] + '/' + f[2])?.files ?? new Map())].map(([path, x]) => ({ path, hash: x.hash, size: x.size, stored: x.data.length })) });
    if (f && f[3] === '/bundle') {
      bundles++;
      const got = cloud.get(f[1] + '/' + f[2])!.files;
      return r.fulfill({ contentType: 'text/plain', body: (req.postDataJSON().paths as string[]).filter(x => got.has(x)).map(x => x + '\t' + got.get(x)!.hash + '\t' + got.get(x)!.data).join('\n') });
    }
    if (f && f[3]) return r.fulfill({ contentType: 'text/plain', body: cloud.get(f[1] + '/' + f[2])!.files.get(u.searchParams.get('path')!)!.data });
    return json({ error: 'not found' }, 404);
  });
  // The signaling room: presence, and handshakes relayed between the devices (a GLUE Home joins later).
  const socks: Record<string, import('@playwright/test').WebSocketRoute | null> = { b1: null };
  const presence = () => { const online = Object.keys(socks).filter(k => socks[k]); for (const w of Object.values(socks)) w?.send(JSON.stringify({ type: 'presence', online })); };
  const room = (me: string) => (ws: import('@playwright/test').WebSocketRoute) => {
    socks[me] = ws; presence();
    ws.onMessage(raw => { const j = JSON.parse(String(raw)); if (j.type === 'signal') socks[j.to]?.send(JSON.stringify({ type: 'signal', from: me, data: j.data })); });
  };
  await page.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, room('b1'));

  await seed(page);
  await page.goto('./');
  await expect(page.locator('#homepage')).toBeVisible();                      // the start page
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-folder');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 60_000 });

  // Sign in on the profile screen: Cloud sync is on by itself; opening the profile uploads it.
  await page.locator('.top .who').click();
  await page.locator('#cloud-panel .fake-google').click();
  await expect(page.locator('#cloud-panel')).toContainText('dj@example.com');
  await expect(page.locator('[data-sync]')).toContainText('Cloud sync on');
  await page.locator('.profile', { hasText: 'DJ Test' }).click();
  await expect.poll(() => [...cloud.values()][0]?.files.size ?? 0, { timeout: 20_000 }).toBeGreaterThan(3);
  const mine = [...cloud.values()][0];
  expect([...mine.files.keys()].some(k => /tracks\/\w+\.json$/.test(k))).toBe(true);
  expect(batches[0]).toBe(mine.files.size);                                    // one request for the whole first upload
  await expect(page.locator('[data-col="device"]')).toHaveCount(0);            // one device: no Device column

  // Open this device's collection from the cloud: the same four tracks; a rating made here is queued for the device.
  await page.locator('.top .who').click();
  await expect(page.locator('[data-sync]')).toContainText(/Synced/, { timeout: 20_000 });
  const item = page.locator('#cloud-panel [data-cloud^="b1/"]');
  await expect(item).toContainText('4 tracks');
  await item.getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('#cloud-banner')).toContainText('Laptop');
  await expect(page.locator('.tr')).toHaveCount(4);
  await expect(page.locator('.lside')).not.toContainText('DJ libraries');       // this-computer-only parts are hidden
  const row = page.locator('.tr', { hasText: 'Fixture FLAC' });
  await row.hover();
  await row.locator('.c-rate button').nth(3).click({ position: { x: 10, y: 6 } });
  await expect.poll(() => ops.length, { timeout: 10_000 }).toBe(1);
  expect(ops[0]).toMatchObject({ device: 'b1', op: { t: 'track', rating: 4 } });
  // Its track page says where the file is, without asking for permission first.
  await row.locator('.c-title').dblclick();
  await expect(page.locator('#track-elsewhere')).toContainText('Laptop');
  await expect(page.getByRole('button', { name: 'Allow and analyse' })).toHaveCount(0);
  await page.locator('.crumbs a').click();

  // Back on this computer, the waiting edit is applied to the local files and acknowledged.
  await page.click('#leave-cloud');                                            // opened from the profile screen: back there
  await expect(page.locator('#cloud-banner')).toHaveCount(0);
  await page.locator('.profile', { hasText: 'DJ Test' }).click();
  await expect(page.locator('.tr', { hasText: 'Fixture FLAC' }).locator('.stars')).toHaveAttribute('aria-valuenow', '4', { timeout: 15_000 });
  await expect.poll(() => ops.length, { timeout: 10_000 }).toBe(0);

  // A second device with the same collection plus a song and a playlist of its own.
  devices.push({ id: 'desk', kind: 'browser', name: 'Desktop', platform: '', createdAt: 2, lastSeen: 2 });
  const [key, copy] = [...cloud.entries()][0], pid = key.split('/')[1];
  const files = new Map(copy.files);
  const gz = (o: unknown) => gzipSync(Buffer.from(JSON.stringify(o))).toString('base64');
  const cid = [...files.keys()].find(k => /^collections\/\w+\/collection\.json$/.test(k))!.split('/')[1];
  const song = { id: 'zzdesk01', status: 'linked', rootId: 'deskroot', relPath: 'Desk Only Song.flac', importPath: null, fileName: 'Desk Only Song.flac', size: 5, mtime: 1, title: 'Desk Only Song', artist: 'Someone Else', album: '', genre: 'House', label: '', comment: '', year: '', duration: 200, format: null, addedAt: '2026-09-01T00:00:00Z', sources: [] };
  files.set(`collections/${cid}/tracks/zz.json`, { hash: 'h-zz', size: 1, data: gz({ schemaVersion: 1, items: { zzdesk01: song } }) });
  const summary = { v: 3, at: '2026-09-20T10:00:00Z', grade: 'info', label: 'Lossy · not hi-res', headline: 'Lossy MP3, not hi-res', fc: 16000, wall: true, full: false, effBits: null, declaredBits: 16, origin: 'MP3 encode', bpm: 90, key: { tonic: 9, mode: 'minor', margin: 0.2, tuning: 0 }, findings: [{ sev: 'ok', title: 'Bandwidth fits the format' }, { sev: 'info', title: 'Lossy by design' }], fileSize: 5, fileMtime: 1 };
  files.set(`collections/${cid}/analysis/zz.json`, { hash: 'h-azz', size: 1, data: gz({ schemaVersion: 1, items: { zzdesk01: summary } }) });
  files.set(`collections/${cid}/lists/dl1.json`, { hash: 'h-dl1', size: 1, data: gz({ schemaVersion: 1, id: 'dl1', kind: 'playlist', name: 'Desk list', parentId: null, position: 9, notes: '', items: ['zzdesk01'], origin: null, createdAt: '' }) });
  cloud.set('desk/' + pid, { ...copy, files, updatedAt: Date.now(), stats: { collections: [{ id: cid, name: 'My collection', tracks: 5 }] } });

  // Opening the collection again merges it with the desktop's by itself (same name), with a loading signal.
  slow = true;
  await page.locator('.top .who').click();
  await page.locator('.profile', { hasText: 'DJ Test' }).click();
  await expect(page.locator('#cloud-loading')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.tr')).toHaveCount(5, { timeout: 20_000 });
  slow = false;
  expect(links[0].members.map(x => x.device).sort()).toEqual(['b1', 'desk']);
  expect(bundles).toBeGreaterThan(0);                                          // many files per request
  await expect(page.locator('[data-col="device"]')).toHaveCount(1);
  const desk = page.locator('.tr', { hasText: 'Desk Only Song' });
  await expect(desk.locator('[data-c="device"]')).toHaveText('Desktop');
  await expect(page.locator('.tr', { hasText: 'Fixture FLAC' }).locator('[data-c="device"] .dv')).toHaveText(['Laptop', 'Desktop']);
  await expect(desk.locator('.pbtn')).toHaveCount(0);                          // plays where it is
  await expect(page.locator('.lside')).toContainText('Desk list');
  // Opening the collection again (the profile screen and back) deletes nothing on the desktop: its
  // playlists were once worked out as deleted against the reopened collection (2026-09-28, ADR 0089).
  await page.locator('.top .who').click();
  await page.locator('.profile', { hasText: 'DJ Test' }).click();
  await expect(page.locator('.lside')).toContainText('Desk list', { timeout: 20_000 });
  await page.waitForTimeout(4000);
  expect(ops.filter(o => (o.op as { t: string }).t === 'list-del')).toEqual([]);
  // Filter by device: from the column, and from the sidebar's Devices.
  await desk.locator('.dv').click();
  await expect(page.locator('.tr')).toHaveCount(5);                            // every song is on the desktop
  await expect(page.locator('#filter-btn')).toContainText('1');
  await desk.locator('.dv').click();                                           // again: off
  await expect(page.locator('#filter-btn b')).toHaveCount(0);
  const laptop = page.locator('#devices [data-device="b1"]');
  await laptop.locator('.dname').click();
  await expect(page.locator('.tr')).toHaveCount(4);
  await expect(laptop).toHaveClass(/sel/);
  await expect(page.locator('#devices [data-device="desk"]')).toContainText('5 songs');
  await expect(page.locator('#devices [data-device="desk"] .nostream')).toBeVisible();
  await laptop.locator('.dname').click();
  await expect(page.locator('.tr')).toHaveCount(5);
  // The ⋯ menu opens where it fits.
  await page.locator('#devices [data-device="desk"]').hover();
  await page.locator('#devices [data-device="desk"] .more').click();
  await expect(page.getByRole('menuitem', { name: 'Rename…' })).toBeInViewport();
  await page.keyboard.press('Escape');
  // Another device's song: its page says where it is, no permission step; a rating goes to the desktop.
  await desk.locator('.c-title').dblclick();
  await expect(page.locator('#track-elsewhere')).toContainText('Desktop');
  await expect(page.getByRole('button', { name: 'Allow and analyse' })).toHaveCount(0);
  // The same widgets as a local track, from the summary: verdict, readouts, tempo and key, evidence.
  const ra = page.locator('#remote-analysis');
  await expect(ra.locator('#v-pill')).toHaveText('Lossy · not hi-res');
  await expect(ra.locator('#readouts')).toContainText('16.0 kHz');
  await expect(ra.locator('#m-bpm')).toContainText('90');
  await expect(ra.locator('#m-key')).toHaveText('8A');
  await expect(ra.locator('#evidence')).toContainText('Lossy by design');
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/remote-track.png', fullPage: true });
  await page.locator('.crumbs a').click();
  // Songs on both devices are listed under Duplicates, with each device's copy.
  await page.locator('.lside button', { hasText: 'Duplicates' }).click();
  await expect(page.locator('#dupes-devices')).toContainText('4 songs');
  await expect(page.locator('#dupes [data-kind="devices"]').first().locator('.dchip')).toHaveText(['Laptop', 'Desktop']);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/dupes.png' });
  await page.locator('.lside button', { hasText: 'All tracks' }).click();
  await desk.hover();
  await desk.locator('.c-rate button').nth(4).click({ position: { x: 10, y: 6 } });
  await expect.poll(() => ops.find(o => o.device === 'desk')?.op, { timeout: 10_000 }).toMatchObject({ t: 'track', id: 'zzdesk01', rating: 5 });
  // GLUE Home on the desktop (its browser's companion, ADR 0045): the desktop's songs play here, and
  // their page analyses them in full. It reads the desktop's GLUE folder; the song's music folder
  // "Music" is found by its name.
  devices.push({ id: 'hdesk', kind: 'home', name: 'Desktop', platform: 'win32', createdAt: 3, lastSeen: 3, companionOf: 'desk' } as typeof devices[number]);
  const glue = {
    'mco.json': JSON.stringify({ schemaVersion: 1, profiles: [{ id: pid, name: 'DJ Test', color: '#fff' }], lastProfile: pid }),
    [`profiles/${pid}/collections/${cid}/collection.json`]: JSON.stringify({ schemaVersion: 1, id: cid, name: 'My collection', createdAt: '', roots: [{ id: 'deskroot', name: 'Music', absPath: null, handleKey: 'x', addedAt: '' }] }),
    [`profiles/${pid}/collections/${cid}/tracks/zz.json`]: JSON.stringify({ schemaVersion: 1, items: { zzdesk01: song } }),
  };
  const disk = { 'C:\\Users\\dj\\Music\\Desk Only Song.flac': [...readFileSync(fixture('flac-96k-24.flac'))] };
  const home = await page.context().newPage();
  await home.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ access: 'h' }) }));
  await home.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, room('hdesk'));
  await home.addInitScript(TAURI_MOCK);
  await home.addInitScript(({ glue, disk }) => {
    const w = window as unknown as Record<string, unknown>; w.__glue = glue; w.__disk = disk;
    localStorage.setItem('home-config', JSON.stringify({ deviceId: 'hdesk', token: 't', name: 'Desktop', user: { email: 'dj@example.com', name: 'DJ' }, incoming: null, running: true, askedAutostart: true, glue: 'C:\\Users\\dj\\Documents\\GLUE' }));
  }, { glue, disk });
  await home.goto('http://localhost:5176/service.html');
  await expect(home.locator('#state')).toContainText('Online as Desktop');
  const deskRow = page.locator('#devices [data-device="desk"]');
  await expect(deskRow).toContainText('GLUE Home on', { timeout: 15_000 });
  await expect(deskRow.locator('.stream')).toBeVisible();
  await expect(page.locator('#devices [data-device="hdesk"]')).toHaveCount(0);        // one row per computer
  await expect(desk.locator('.pbtn')).toHaveCount(1);                                  // it plays here now
  await desk.hover();
  await desk.locator('.pbtn').click();
  await expect(page.locator('#lib-now')).toHaveText('Desk Only Song');
  await expect(page.locator('#lib-play')).toHaveAttribute('aria-label', 'Pause', { timeout: 20_000 });
  // It streams (ADR 0076): byte ranges through the service worker, not the whole file first.
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').some(e => e.name.includes('/__stream/')))).toBe(true);
  await page.click('#lib-play');
  // Its mini spectrogram comes from the desktop's GLUE Home (made there: ADR 0046).
  await expect(desk.locator('.wave canvas')).toBeVisible({ timeout: 45_000 });
  // Its page: the full analysis from the desktop at once, without the audio; then it plays from there.
  await desk.locator('.c-title').dblclick();
  await expect(page.locator('#results')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#v-pill')).toHaveText(/\w/);
  await expect(page.locator('#track-elsewhere')).toHaveCount(0);                     // not the summary: the analysis itself
  await page.locator('.crumbs a').click();
  await home.close();

  // Nothing of the desktop's is saved into this computer's collection.
  expect([...cloud.get(key)!.files.keys()].some(k => k.endsWith('/zz.json') || k.endsWith('dl1.json'))).toBe(false);

  // A reload shows the merged collection from the copy at once (before the cloud answers), and
  // downloads nothing when nothing changed.
  let release = () => {};
  hold = new Promise(res => (release = res));
  const before = bundles;
  await page.reload();
  await expect(page.locator('.tr')).toHaveCount(5, { timeout: 20_000 });
  release(); hold = null;
  await expect(page.locator('#cloud-loading')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('.tr')).toHaveCount(5);
  expect(bundles).toBe(before);

  // Offline: a reload shows the merged collection from the copy in the GLUE folder.
  offline = true;
  await page.reload();
  await expect(page.locator('.tr')).toHaveCount(5, { timeout: 20_000 });
  offline = false;

  // Clean up the cloud: the desktop's songs leave the library.
  await page.reload();
  await expect(page.locator('#devices')).toContainText('Desktop', { timeout: 15_000 });
  await page.locator('.top .who').click();
  await page.click('#cloud-clean');
  await page.click('#cloud-clean-go');
  await expect(page.locator('#cloud-empty')).toBeVisible();
  expect(cloud.size).toBe(0);
});

test('email + password account, and the admin panel only for admins', async ({ page }) => {
  test.setTimeout(90_000);   // each sign-in stretches the password (PBKDF2, 300k rounds) in the browser
  let tier = 'paid', registered: Record<string, unknown> | null = null;
  const users = [{ id: 'u2', email: 'fan@example.com', name: 'Fan', tier: 'paid', createdAt: 1, providers: ['password'], devices: 1, lastSeen: Date.now(), bytes: 2048, profiles: 1 }];
  const calls: string[] = [];
  await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: 'window.google = { accounts: { id: { initialize() {}, renderButton() {}, disableAutoSelect() {} } } };' }));
  await page.route('https://glue-api.joaopmanso.workers.dev/v1/**', async r => {
    const req = r.request(), u = new URL(req.url()), m = req.method(), p = u.pathname;
    const json = (b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    const me = () => ({ id: 'u1', email: 'dj@example.com', name: 'DJ', picture: null, tier });
    if (p === '/v1/health') return json({ ok: true });
    if (p === '/v1/auth/register') { registered = req.postDataJSON(); return json({ access: 'a', refresh: 'r', deviceId: 'b1', user: me() }); }
    if (p === '/v1/auth/password') { const b = req.postDataJSON(); return b.key === (registered as { key?: string } | null)?.key ? json({ access: 'a', refresh: 'r', deviceId: 'b1', user: me() }) : json({ error: 'wrong email or password' }, 401); }
    if (p === '/v1/auth/refresh') return json({ access: 'a', refresh: 'r', deviceId: 'b1' });
    if (p === '/v1/auth/logout') return json({ ok: true });
    if (p === '/v1/me') return json({ user: me(), thisDevice: 'b1', devices: [{ id: 'b1', kind: 'browser', name: 'Edge', platform: '', createdAt: 1, lastSeen: 1 }] });
    if (p.startsWith('/v1/admin/')) {
      if (tier !== 'admin') return json({ error: 'admins only' }, 403);
      calls.push(m + ' ' + p);
      if (p === '/v1/admin/stats') return json({ users: { total: 1, byTier: { paid: 1 }, byProvider: { password: 1 }, new7: 1, new30: 1, active7: 1, signups: Array(30).fill(0).map((_, i) => i === 29 ? 1 : 0) }, devices: { byKind: { browser: 1 }, revoked: 0, seen24h: 1 }, sync: { profiles: 1, files: 12, bytes: 2048, merges: 0, pendingEdits: 0 }, housekeeping: { expiredCodes: 3, expiredSessions: 0, attempts: 2, oldEdits: 0 }, at: Date.now() });
      if (p === '/v1/admin/users') return json({ users });
      if (p === '/v1/admin/users/u2' && m === 'PATCH') { users[0].tier = req.postDataJSON().tier; return json({ ok: true }); }
      if (p === '/v1/admin/users/u2/cloud' && m === 'DELETE') { users[0].bytes = 0; return json({ ok: true }); }
      if (p === '/v1/admin/maintenance') return json({ removed: 3 });
    }
    return json({ error: 'not found' }, 404);
  });
  await page.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, ws => { ws.send(JSON.stringify({ type: 'presence', online: ['b1'] })); ws.onMessage(() => {}); });

  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'stick');        // GLUE Stick is the default theme
  // Register with an email and a password (the password is stretched in the browser; only a key is sent).
  await page.click('#account-btn');
  await page.click('#pw-swap');
  await page.fill('#pw-name', 'DJ');
  await page.fill('#pw-email', 'dj@example.com');
  await page.fill('#pw-password', 'short');
  await page.fill('#pw-confirm', 'short');
  await page.click('#pw-submit');
  await expect(page.locator('#pw-error')).toContainText('at least 8');
  await page.fill('#pw-password', 'correct horse battery');
  await page.fill('#pw-confirm', 'correct horse battery');
  await page.click('#pw-submit');
  await expect(page.locator('#account-btn')).toHaveText(/D/, { timeout: 15_000 });
  expect(registered).toMatchObject({ email: 'dj@example.com', name: 'DJ' });
  expect(JSON.stringify(registered)).not.toContain('correct horse');                 // never the password itself
  expect(String((registered as unknown as { key: string }).key)).toMatch(/^[\w-]{43}$/);
  // Sign out (the account menu is still open, now showing the account) and back in with the same password.
  await page.click('#sign-out');
  await page.click('#account-btn');
  await page.fill('#pw-email', 'dj@example.com');
  await page.fill('#pw-password', 'wrong password!');
  await page.click('#pw-submit');
  await expect(page.locator('#pw-error')).toContainText('Wrong email or password');
  await page.fill('#pw-password', 'correct horse battery');
  await page.click('#pw-submit');
  await expect(page.locator('#account-btn')).toHaveText(/D/, { timeout: 15_000 });

  // Not an admin: no Admin tab or link, and #/admin sends you back to the library.
  await expect(page.locator('#admin-tab')).toHaveCount(0);
  await expect(page.locator('#admin-link')).toHaveCount(0);
  await page.goto('./#/admin');
  await expect(page).toHaveURL(/#\/$/, { timeout: 15_000 });
  await expect(page.locator('#admin')).toHaveCount(0);
  expect(calls).toEqual([]);
  // Signed out, too (the account menu may still be open from signing in).
  if (!await page.locator('#sign-out').isVisible()) await page.click('#account-btn');
  await page.click('#sign-out');
  await page.goto('./#/admin');
  await expect(page).toHaveURL(/#\/$/, { timeout: 15_000 });
  await page.click('#account-btn');
  await page.fill('#pw-email', 'dj@example.com');
  await page.fill('#pw-password', 'correct horse battery');
  await page.click('#pw-submit');
  await expect(page.locator('#account-btn')).toHaveText(/D/, { timeout: 15_000 });

  // An admin sees the panel: statistics, users, tiers, clearing data, maintenance.
  tier = 'admin';
  await page.reload();
  await expect(page.locator('#admin-tab')).toBeVisible({ timeout: 15_000 });
  await page.click('#admin-tab');
  await expect(page.locator('#admin-stats')).toContainText('Users');
  await expect(page.locator('#admin-stats')).toContainText('2.0 KB');
  const row = page.locator('#admin-users [data-user="u2"]');
  await expect(row).toContainText('fan@example.com');
  await row.locator('select').selectOption('free');
  await expect.poll(() => users[0].tier).toBe('free');
  page.once('dialog', d => d.accept());
  await row.getByRole('button', { name: 'Clear cloud data' }).click();
  await expect.poll(() => users[0].bytes).toBe(0);
  await page.locator('#admin-maint').getByRole('button', { name: /Pairing codes/ }).click();
  await expect(page.locator('.admin .ok')).toContainText('3 removed');
});

test('send songs to a GLUE Home: from its menu and from the selection, peer to peer, into its incoming folder', async ({ page }) => {
  // The website (this laptop) and GLUE Home's real service page (home/ui, its Rust side stood in by
  // e2e/tauri-mock.ts) talk over a real WebRTC data channel; the test relays the handshake the way
  // the account's signaling room does.
  const ctx = page.context();
  await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { id: { initialize(o) { window.__gcb = o.callback; }, disableAutoSelect() {},
      renderButton(el) { const b = document.createElement('button'); b.id = 'fake-google'; b.textContent = 'Sign in with Google'; b.onclick = () => window.__gcb({ credential: 'fake' }); el.appendChild(b); } } } };` }));
  const user = { id: 'u1', email: 'dj@example.com', name: 'DJ Test', picture: null };
  // The desktop: its browser (d1) and its GLUE Home (h1, the browser's companion, ADR 0045).
  const devices = [{ id: 'b1', kind: 'browser', name: 'Laptop', platform: '', createdAt: 1, lastSeen: 1 }, { id: 'd1', kind: 'browser', name: 'Desktop', platform: '', createdAt: 2, lastSeen: 2 }, { id: 'h1', kind: 'home', name: 'Studio PC', platform: 'win32', createdAt: 3, lastSeen: 3, companionOf: 'd1' }];
  await ctx.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => {
    const p = new URL(r.request().url()).pathname, m = r.request().method();
    const json = (b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (p === '/v1/health') return json({ ok: true });
    if (p === '/v1/auth/google') return json({ access: 'a', refresh: 'r', deviceId: 'b1', user });
    if (p === '/v1/auth/refresh') return json({ access: 'a', refresh: 'r', deviceId: 'b1' });
    if (p === '/v1/auth/device') return json({ access: 'h' });
    if (p === '/v1/me') return json({ user, thisDevice: 'b1', devices });
    if (p === '/v1/sync' && m === 'GET') return json({ profiles: [] });
    if (p === '/v1/sync/links') return json({ groups: [] });
    if (p === '/v1/sync/manifest') return json({ need: [] });
    if (p === '/v1/sync/ops') return json({ ops: [] });
    return json({ error: 'not found' }, 404);
  });
  const socks: Record<string, import('@playwright/test').WebSocketRoute | null> = { b1: null, h1: null };
  const presence = () => { const online = Object.keys(socks).filter(k => socks[k]); for (const w of Object.values(socks)) w?.send(JSON.stringify({ type: 'presence', online })); };
  const room = (me: 'b1' | 'h1') => (ws: import('@playwright/test').WebSocketRoute) => {
    socks[me] = ws; presence();
    ws.onMessage(raw => { const j = JSON.parse(String(raw)); if (j.type === 'signal') socks[j.to]?.send(JSON.stringify({ type: 'signal', from: me, data: j.data })); });
  };
  await page.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, room('b1'));

  // GLUE Home on the "desktop": paired as h1, online.
  const home = await ctx.newPage();
  await home.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, room('h1'));
  await home.addInitScript(TAURI_MOCK);
  // Its GLUE folder: one collection with a music folder "Music" (D:\Music), where songs can be moved to.
  await home.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__glue = { 'mco.json': JSON.stringify({ profiles: [{ id: 'pd', name: 'DJ' }] }), 'profiles/pd/profile.json': JSON.stringify({ id: 'pd', name: 'DJ', collections: [{ id: 'cd', name: 'My collection' }] }), 'profiles/pd/collections/cd/collection.json': JSON.stringify({ id: 'cd', name: 'My collection', roots: [{ id: 'rm', name: 'Music', absPath: 'D:\\Music' }] }) };
    w.__disk = { 'D:\\Music\\x.mp3': [1] };
    localStorage.setItem('home-config', JSON.stringify({ deviceId: 'h1', token: 't', name: 'Studio PC', user: { email: 'dj@example.com', name: 'DJ' }, incoming: 'C:\\In', running: true, askedAutostart: true, glue: 'C:\\GLUE', folders: { rm: 'D:\\Music' } }));
  });
  await home.goto('http://localhost:5176/service.html');
  await expect(home.locator('#state')).toContainText('Online as Studio PC');

  // The laptop: a library with music, signed in; Studio PC is online in Devices.
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  await page.click('#account-btn');
  await page.click('#fake-google');
  // One row per computer: the desktop's GLUE Home shows on its browser's row.
  const studio = page.locator('#devices [data-device="d1"]');
  await expect(studio).toContainText('GLUE Home on', { timeout: 15_000 });
  await expect(studio).toContainText('drop songs to send');
  await expect(page.locator('#devices [data-device="h1"]')).toHaveCount(0);
  await expect(studio.locator('.stream')).toBeVisible();

  // ⋯ › Send songs…: two files from this computer.
  await studio.hover();
  await studio.locator('.more').click();
  const chooser = page.waitForEvent('filechooser');
  await page.click('#send-songs');
  await (await chooser).setFiles([fixture('mp3-128k.mp3'), fixture('flac-96k-24.flac')]);
  const panel = page.locator('#send-panel');
  await expect(panel).toContainText('Sent to Studio PC', { timeout: 30_000 });
  const got = async () => home.evaluate(() => (window as unknown as { __files: { name: string; chunks: number[][]; done: boolean }[] }).__files.map(f => ({ name: f.name, done: f.done, bytes: f.chunks.flat() })));
  let files = await got();
  expect(files.map(f => [f.name, f.done])).toEqual([['mp3-128k.mp3', true], ['flac-96k-24.flac', true]]);
  expect(Buffer.from(files[0].bytes).equals(readFileSync(fixture('mp3-128k.mp3')))).toBe(true);
  expect(Buffer.from(files[1].bytes).equals(readFileSync(fixture('flac-96k-24.flac')))).toBe(true);
  await panel.getByRole('button', { name: 'Dismiss' }).click();

  // From the library: right-click a song, "Send to Studio PC"; the name is taken there, so it's numbered.
  await page.locator('.tr', { hasText: 'Fixture MP3' }).locator('.c-title').click({ button: 'right' });
  await page.click('.cmenu [data-send-home="h1"]');
  await expect(panel).toContainText('saved as mp3-128k (2).mp3', { timeout: 30_000 });
  files = await got();
  expect(files[2]).toMatchObject({ name: 'mp3-128k (2).mp3', done: true });
  // GLUE Home lists what it received.
  await expect.poll(() => home.evaluate(() => JSON.parse(localStorage.getItem('home-config')!).received?.length)).toBe(3);
  await panel.getByRole('button', { name: 'Dismiss' }).click();

  // Tracks dragged from the table onto the desktop's row are sent there too.
  const aiff = page.locator('.tr', { hasText: 'aiff-44k-24' }).locator('.c-title');
  const from = (await aiff.boundingBox())!, to = (await studio.boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 40, { steps: 5 });
  await page.mouse.move(to.x + 40, to.y + to.height / 2, { steps: 10 });
  await expect(studio).toHaveClass(/droppable/);
  await page.mouse.up();
  await expect(panel).toContainText('Sent to Studio PC', { timeout: 30_000 });
  expect((await got()).map(f => f.name)).toContain('aiff-44k-24.aiff');
  await panel.getByRole('button', { name: 'Dismiss' }).click();

  // TO BE SORTED: what waits in the desktop's incoming folder, until it's moved into a music folder.
  const sorted = page.locator('.lside', { hasText: 'TO BE SORTED' });
  await expect(sorted).toBeVisible({ timeout: 40_000 });
  await page.locator('.lside').getByText('TO BE SORTED').click();
  // The songs sent from here are the tracks this computer has: one row each, on both computers
  // ("mp3-128k (2).mp3" is the same song as "mp3-128k.mp3").
  await expect(page.locator('.tr')).toHaveCount(3, { timeout: 40_000 });
  const first = page.locator('.tr', { hasText: 'Fixture FLAC' });
  await expect(first.locator('[data-c="device"] .dv')).toHaveText(['Laptop', 'Desktop']);
  // It plays from this computer's own file, without downloading.
  await first.hover();
  await first.locator('.pbtn').click();
  await expect(page.locator('#lib-play')).toHaveAttribute('aria-label', 'Pause', { timeout: 20_000 });
  await expect(page.locator('#lib-now')).not.toContainText('getting it from');
  await page.click('#lib-play');
  // Move it into the desktop's music folder "Music": it leaves TO BE SORTED.
  await first.locator('.c-title').click();
  await page.selectOption('#move-to', 'rm');
  await expect(page.locator('.tr')).toHaveCount(2, { timeout: 20_000 });
  expect(await home.evaluate(() => (window as unknown as { __files: { name: string; moved?: string }[] }).__files.find(f => f.name === 'flac-96k-24.flac')?.moved)).toBe('D:\\Music');
  // Opening the page again: TO BE SORTED is back as soon as the desktop's GLUE Home is online (not at
  // the next 30-second round).
  await page.reload();
  await page.locator('.lside').getByText('TO BE SORTED').click({ timeout: 15_000 });
  await expect(page.locator('.tr')).toHaveCount(2);
});

test('GLUE Home opens the library: a GLUE tab that is open comes forward; "Use this tab instead" moves the library', async ({ page }) => {
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await expect(page.locator('.lside')).toBeVisible();
  // The tray icon opens …/?open=home: this tab is open, so it's asked to come forward (its title flashes).
  const titles: string[] = [];
  await page.exposeFunction('__title', (t: string) => titles.push(t));
  await page.evaluate(() => new MutationObserver(() => (window as unknown as { __title: (t: string) => void }).__title(document.title)).observe(document.querySelector('title')!, { childList: true }));
  const second = await page.context().newPage();
  await second.goto('./?open=home#/');
  await expect.poll(() => titles.includes('● GLUE is here')).toBe(true);
  if (!second.isClosed()) {
    // The browser didn't let the new tab close itself: it offers to take over.
    await expect(second.locator('#tab-elsewhere')).toContainText('GLUE is open in another tab');
    await second.click('#use-this-tab');
    await expect(second.locator('.lside')).toBeVisible({ timeout: 15_000 });
    await expect(second.locator('.notice.warn')).toHaveCount(0);                  // it has the GLUE folder, not read-only
    await expect(page.locator('#tab-elsewhere')).toContainText('moved to another tab');
    await expect(second).toHaveURL(/\/glue\/#\/$/);                               // ?open=home is gone
  }
});

test('the website hands its mini spectrograms and analyses to this computer’s GLUE Home', async ({ page }) => {
  test.setTimeout(180_000);
  const ctx = page.context();
  await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { id: { initialize(o) { window.__gcb = o.callback; }, disableAutoSelect() {},
      renderButton(el) { const b = document.createElement('button'); b.id = 'fake-google'; b.textContent = 'Sign in with Google'; b.onclick = () => window.__gcb({ credential: 'fake' }); el.appendChild(b); } } } };` }));
  const user = { id: 'u1', email: 'dj@example.com', name: 'DJ Test', picture: null };
  // This browser (b1) and its own GLUE Home (h1).
  const devices = [{ id: 'b1', kind: 'browser', name: 'Desktop', platform: '', createdAt: 1, lastSeen: 1 }, { id: 'h1', kind: 'home', name: 'Desktop', platform: 'win32', createdAt: 2, lastSeen: 2, companionOf: 'b1' }];
  await ctx.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => {
    const p = new URL(r.request().url()).pathname, m = r.request().method();
    const json = (b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (p === '/v1/health') return json({ ok: true });
    if (p === '/v1/auth/google') return json({ access: 'a', refresh: 'r', deviceId: 'b1', user });
    if (p === '/v1/auth/refresh') return json({ access: 'a', refresh: 'r', deviceId: 'b1' });
    if (p === '/v1/auth/device') return json({ access: 'h' });
    if (p === '/v1/me') return json({ user, thisDevice: 'b1', devices });
    if (p === '/v1/sync' && m === 'GET') return json({ profiles: [] });
    if (p === '/v1/sync/links') return json({ groups: [] });
    if (p === '/v1/sync/manifest') return json({ need: [] });
    if (p === '/v1/sync/ops') return json({ ops: [] });
    return json({ error: 'not found' }, 404);
  });
  const socks: Record<string, import('@playwright/test').WebSocketRoute | null> = { b1: null, h1: null };
  const presence = () => { const online = Object.keys(socks).filter(k => socks[k]); for (const w of Object.values(socks)) w?.send(JSON.stringify({ type: 'presence', online })); };
  const room = (me: 'b1' | 'h1') => (ws: import('@playwright/test').WebSocketRoute) => {
    socks[me] = ws; presence();
    ws.onMessage(raw => { const j = JSON.parse(String(raw)); if (j.type === 'signal') socks[j.to]?.send(JSON.stringify({ type: 'signal', from: me, data: j.data })); });
  };
  await page.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, room('b1'));
  const home = await ctx.newPage();
  await home.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, room('h1'));
  await home.addInitScript(TAURI_MOCK);
  await home.addInitScript(() => localStorage.setItem('home-config', JSON.stringify({ deviceId: 'h1', token: 't', name: 'Desktop', user: { email: 'dj@example.com', name: 'DJ' }, incoming: null, running: true, askedAutostart: true })));
  await home.goto('http://localhost:5176/service.html');
  await expect(home.locator('#state')).toContainText('Online as Desktop');

  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-folder');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 60_000 });
  await page.click('#account-btn');
  await page.click('#fake-google');
  // Within a round (20 s): every track's mini spectrogram and full analysis, in GLUE Home's cache.
  const kept = () => home.evaluate(() => Object.keys((window as unknown as { __cache: Record<string, number[]> }).__cache));
  await expect.poll(async () => (await kept()).filter(k => k.startsWith('t/')).length, { timeout: 60_000 }).toBe(4);
  await expect.poll(async () => (await kept()).filter(k => k.startsWith('d/') && k.endsWith('.json')).length, { timeout: 30_000 }).toBe(4);
});

test('the local link: this computer’s GLUE Home answers the website directly, TO BE SORTED ready and playing without GLUE Cloud', async ({ page }) => {
  test.setTimeout(180_000);
  const ctx = page.context();
  await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { id: { initialize(o) { window.__gcb = o.callback; }, disableAutoSelect() {},
      renderButton(el) { const b = document.createElement('button'); b.id = 'fake-google'; b.textContent = 'Sign in with Google'; b.onclick = () => window.__gcb({ credential: 'fake' }); el.appendChild(b); } } } };` }));
  const user = { id: 'u1', email: 'dj@example.com', name: 'DJ Test', picture: null };
  const devices = [{ id: 'b1', kind: 'browser', name: 'Desktop', platform: '', createdAt: 1, lastSeen: 1 }, { id: 'h1', kind: 'home', name: 'Desktop', platform: 'win32', createdAt: 2, lastSeen: 2, companionOf: 'b1' }];
  let offline = false;
  await ctx.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => {
    if (offline) return r.abort('internetdisconnected');
    const p = new URL(r.request().url()).pathname, m = r.request().method();
    const json = (b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (p === '/v1/health') return json({ ok: true });
    if (p === '/v1/auth/google') return json({ access: 'a', refresh: 'r', deviceId: 'b1', user });
    if (p === '/v1/auth/refresh') return json({ access: 'a', refresh: 'r', deviceId: 'b1' });
    if (p === '/v1/auth/device') return json({ access: 'h' });
    if (p === '/v1/me') return json({ user, thisDevice: 'b1', devices });
    if (p === '/v1/sync' && m === 'GET') return json({ profiles: [] });
    if (p === '/v1/sync/links') return json({ groups: [] });
    if (p === '/v1/sync/manifest') return json({ need: [] });
    if (p === '/v1/sync/ops') return json({ ops: [] });
    return json({ error: 'not found' }, 404);
  });
  const socks: Record<string, import('@playwright/test').WebSocketRoute | null> = { b1: null, h1: null };
  const presence = () => { const online = Object.keys(socks).filter(k => socks[k]); for (const w of Object.values(socks)) w?.send(JSON.stringify({ type: 'presence', online })); };
  const room = (me: 'b1' | 'h1') => (ws: import('@playwright/test').WebSocketRoute) => {
    socks[me] = ws; presence();
    ws.onMessage(raw => { const j = JSON.parse(String(raw)); if (j.type === 'signal') socks[j.to]?.send(JSON.stringify({ type: 'signal', from: me, data: j.data })); });
  };
  await page.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, room('b1'));
  const home = await ctx.newPage();
  await home.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, room('h1'));
  await home.addInitScript(TAURI_MOCK);
  await home.addInitScript(() => { if (!localStorage.getItem('home-config')) localStorage.setItem('home-config', JSON.stringify({ deviceId: 'h1', token: 't', name: 'Desktop', user: { email: 'dj@example.com', name: 'DJ' }, incoming: null, running: true, askedAutostart: true })); });
  await home.goto('http://localhost:5176/service.html');
  await expect(home.locator('#state')).toContainText('Online as Desktop');
  // GLUE Home's local server (its Rust side, stood in by the test): hello, the incoming folder with
  // each song's analysis, its files, its cache; only with the token it gave (except hello).
  const hits: string[] = [], served = new Map<string, number[]>();
  await ctx.route('http://127.0.0.1:47400/**', async r => {
    const u = new URL(r.request().url());
    hits.push(u.pathname);
    const cors = { 'Access-Control-Allow-Origin': 'http://localhost:5174', 'Access-Control-Allow-Private-Network': 'true' };
    if (u.pathname === '/hello') return r.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ app: 'glue-home', version: '0.3.2', device: 'h1' }) });
    const token = await home.evaluate(() => JSON.parse(localStorage.getItem('home-config')!).localToken);
    if (u.searchParams.get('t') !== token) return r.fulfill({ status: 401, headers: cors, body: '{}' });
    // What this GLUE Home (before 0.5.0) doesn't have, like /fs/*, is "not found" at once.
    if (!['/incoming', '/incoming/file', '/cache'].includes(u.pathname)) return r.fulfill({ status: 404, headers: cors, body: '{}' });
    const n = u.pathname === '/incoming/file' ? u.searchParams.get('name') ?? '' : '';
    if (n && served.has(n)) {
      const all = Buffer.from(served.get(n)!), m = /bytes=(\d+)-(\d*)/.exec(r.request().headers()['range'] ?? '');
      const start = m ? Number(m[1]) : 0, end = m && m[2] ? Math.min(Number(m[2]), all.length - 1) : all.length - 1;
      return r.fulfill({ status: m ? 206 : 200, contentType: 'audio/flac', headers: { ...cors, 'Accept-Ranges': 'bytes', ...(m ? { 'Content-Range': 'bytes ' + start + '-' + end + '/' + all.length } : {}) }, body: all.subarray(start, end + 1) });
    }
    const w = await home.evaluate(() => { const x = window as unknown as { __files: { name: string; chunks: number[][]; done: boolean; moved?: string }[]; __cache: Record<string, number[]> }; return { files: x.__files.filter(f => f.done && !f.moved).map(f => ({ name: f.name, bytes: f.chunks.flat() })), cache: x.__cache }; });
    const dec = (b: number[] | undefined) => b ? JSON.parse(Buffer.from(b).toString()) : null;
    if (u.pathname === '/incoming') return r.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(w.files.map(f => ({ name: f.name, size: f.bytes.length, mtime: 1, path: 'C:\\In\\' + f.name, summary: dec(w.cache['i/' + f.name + '.summary.json']) }))) });
    if (u.pathname === '/incoming/file') {
      const f = w.files.find(x => x.name === u.searchParams.get('name'));
      if (f) served.set(f.name, served.get(f.name) ?? f.bytes);   // read once: the player asks for several ranges
      if (!f) return r.fulfill({ status: 404, headers: cors, body: '{}' });
      // Byte ranges, as the real one serves them (songs stream from it: ADR 0076).
      const m = /bytes=(\d+)-(\d*)/.exec(r.request().headers()['range'] ?? ''), all = Buffer.from(f.bytes);
      if (!m) return r.fulfill({ contentType: 'audio/flac', headers: { ...cors, 'Accept-Ranges': 'bytes' }, body: all });
      const start = Number(m[1]), end = m[2] ? Math.min(Number(m[2]), all.length - 1) : all.length - 1;
      return r.fulfill({ status: 206, contentType: 'audio/flac', headers: { ...cors, 'Accept-Ranges': 'bytes', 'Content-Range': 'bytes ' + start + '-' + end + '/' + all.length }, body: all.subarray(start, end + 1) });
    }
    if (u.pathname === '/cache') { const b = w.cache[u.searchParams.get('key')!]; return b ? r.fulfill({ contentType: 'application/octet-stream', headers: cors, body: Buffer.from(b) }) : r.fulfill({ status: 404, headers: cors, body: '{}' }); }
    return r.fulfill({ status: 404, headers: cors, body: '{}' });
  });

  // The desktop: an empty collection, signed in; its own GLUE Home is online.
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#account-btn');
  await page.click('#fake-google');
  const mine = page.locator('#devices [data-device="b1"]');
  await expect(mine).toContainText('GLUE Home on', { timeout: 15_000 });
  // A song arrives in its incoming folder (sent from here, as another computer would): GLUE Home
  // analyses it at once.
  await mine.hover();
  await mine.locator('.more').click();
  const chooser = page.waitForEvent('filechooser');
  await page.click('#send-songs');
  await (await chooser).setFiles([fixture('flac-96k-24.flac')]);
  await expect(page.locator('#send-panel')).toContainText('Sent to Desktop', { timeout: 30_000 });
  await expect.poll(() => home.evaluate(() => Object.keys((window as unknown as { __cache: Record<string, unknown> }).__cache).some(k => k.endsWith('.summary.json'))), { timeout: 60_000 }).toBe(true);
  // The website learns the local link (once, over the account's channel).
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mco.localHome')), { timeout: 40_000 }).toContain('47400');
  await expect(page.locator('#local-link')).toHaveText(' · linked directly');
  // A song's menu doesn't offer to send it to this computer's own GLUE Home: it's here already (the
  // selection bar once had "Send to Desktop" on the desktop).
  await page.locator('.lside').getByText('TO BE SORTED').click({ timeout: 20_000 });
  await page.locator('.tr', { hasText: 'flac-96k-24' }).locator('.c-title').click({ button: 'right' });
  await expect(page.locator('.cmenu [data-m="details"]')).toBeVisible();
  await expect(page.locator('.cmenu [data-send-home]')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Now without GLUE Cloud: a reload shows TO BE SORTED at once, analysed, from GLUE Home directly.
  offline = true;
  await page.reload();
  await page.locator('.lside').getByText('TO BE SORTED').click({ timeout: 20_000 });
  const song = page.locator('.tr', { hasText: 'flac-96k-24' });
  await expect(song).toHaveCount(1);
  await expect(song.locator('.q')).toHaveText(/\w/);                   // the analysis made when it arrived
  await expect(song.locator('.wave canvas')).toBeVisible({ timeout: 20_000 });
  await song.hover();
  await song.locator('.pbtn').click();
  await expect(page.locator('#lib-play')).toHaveAttribute('aria-label', 'Pause', { timeout: 20_000 });
  expect(hits).toContain('/incoming/file');
  // It streams (ADR 0076): the player keeps asking for ranges; stop it before the stand-in goes.
  await page.click('#lib-play');
  await ctx.unrouteAll({ behavior: 'ignoreErrors' });
});

test('covers: found at analysis, shown in the Cover column and on the track page, and read again from the tags when this browser lost them (ADR 0072)', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, ['mp3-cover.mp3', 'flac-cover.flac', 'mp3-128k.mp3']);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 90_000 });
  const cover = (name: string) => page.locator('.tr', { has: page.locator('.c-title[title="' + name + '"]') }).locator('.cell[data-c="cover"] img');
  await expect(cover('mp3-cover.mp3')).toBeVisible();
  await expect(cover('flac-cover.flac')).toBeVisible();
  await expect(cover('mp3-128k.mp3')).toHaveCount(0);
  // The same picture: one hash for both songs.
  const h1 = await page.locator('.tr', { has: page.locator('.c-title[title="mp3-cover.mp3"]') }).locator('.cov').getAttribute('data-cover');
  expect(h1).toMatch(/^[0-9a-f]{24}$/);
  await expect(page.locator('.tr', { has: page.locator('.c-title[title="flac-cover.flac"]') }).locator('.cov')).toHaveAttribute('data-cover', h1!);
  // Hovered: the large one.
  await cover('mp3-cover.mp3').hover();
  await expect(page.locator('img.big')).toBeVisible();
  expect(await page.locator('img.big').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(320);
  // Beside the cell it came from.
  const [cell, big] = [await cover('mp3-cover.mp3').boundingBox(), await page.locator('img.big').boundingBox()];
  expect(Math.abs(big!.x - (cell!.x + cell!.width + 8))).toBeLessThan(4);
  expect(big!.y).toBeLessThan(cell!.y + cell!.height);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/covers.png' });
  await page.mouse.move(900, 900);
  await expect(page.locator('img.big')).toHaveCount(0);
  // The track page.
  await page.locator('.tr', { has: page.locator('.c-title[title="mp3-cover.mp3"]') }).dblclick();
  await expect(page.locator('.th .cov img')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });

  // This browser lost its cache: read again from the files' tags (no analysis).
  await page.evaluate(async () => { const c = await (await navigator.storage.getDirectory()).getDirectoryHandle('cache'); await c.removeEntry('art', { recursive: true }); });
  await page.reload();
  await expect(page.locator('.tr')).toHaveCount(3, { timeout: 30_000 });
  await expect(cover('mp3-cover.mp3')).toBeVisible({ timeout: 20_000 });
  await expect(cover('flac-cover.flac')).toBeVisible();
  await expect(page.locator('.an')).toContainText('All analysed');
});

test('stats: the collection from its button, a playlist from its menu, the selected songs (the user\'s list, 2026-09-27)', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 90_000 });
  const dlg = page.locator('#stats-dialog');

  // The whole collection.
  await page.click('#stats-btn');
  await expect(dlg.locator('#stats-h')).toContainText('My collection');
  await expect(dlg.locator('#stat-songs b')).toHaveText('4');
  await expect(dlg.locator('#stat-formats .bname')).toHaveText(['AAC', 'AIFF', 'FLAC', 'MP3']);
  await expect(dlg.locator('#stat-grades i')).not.toHaveCount(0);
  await expect(dlg.locator('#stat-added .hb')).toHaveCount(1);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/stats.png' });
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);

  // Two songs in a playlist: from its menu.
  await page.locator('.tr').nth(0).locator('.c-title').click();
  await page.locator('.tr').nth(1).locator('.c-title').click({ modifiers: ['Control'] });
  await page.locator('.tr').nth(1).locator('.c-title').click({ button: 'right' });
  // The selected songs first.
  await page.locator('.cmenu [data-m="stats"]').click();
  await expect(dlg.locator('#stats-h')).toContainText('2 songs selected');
  await expect(dlg.locator('#stat-songs b')).toHaveText('2');
  await dlg.locator('.x').click();
  page.once('dialog', d => void d.accept('Gig'));
  await page.locator('.tr').nth(1).locator('.c-title').click({ button: 'right' });
  await page.locator('.cmenu [data-m="add"]').hover(); await page.locator('.cmenu [data-m="new-playlist"]').click();
  await page.locator('.lside .tree .name', { hasText: 'Gig' }).click({ button: 'right' });
  await page.locator('.cmenu [data-m="stats"]').click();
  await expect(dlg.locator('#stats-h')).toContainText('Gig');
  await expect(dlg.locator('#stat-songs b')).toHaveText('2');
  // A Library entry too.
  await page.keyboard.press('Escape');
  await page.locator('.lside .name', { hasText: 'All tracks' }).click({ button: 'right' });
  await page.locator('.cmenu [data-m="stats"]').click();
  await expect(dlg.locator('#stat-songs b')).toHaveText('4');
});

test('▶ on the row of the song its page loaded: the rest of the list comes after it', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 90_000 });
  const row = page.locator('.tr', { hasText: 'Fixture MP3' });
  // Its page loads it into the player, with no list.
  await row.dblclick();
  await page.click('#play-btn');
  await expect(page.locator('#play-btn')).toHaveAttribute('aria-label', /Pause/, { timeout: 20_000 });
  await page.click('#play-btn');
  await page.locator('.crumbs a').click();
  // ▶ on its row resumes it, and the other three follow.
  await row.hover(); await row.locator('.pbtn').click();
  await page.click('#player-expand');
  await expect(page.locator('#next-from .qr')).toHaveCount(3);
});

test('the user\'s list, 2026-09-28, batch A: "Not a problem" on a caution; renaming a playlist by a slow second click; confirming probable duplicates', async ({ page }) => {
  test.setTimeout(150_000);
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 90_000 });
  const attention = page.locator('.lside [data-view="attention"]');
  const before = Number((await attention.innerText()).match(/\d+$/)?.[0] ?? 0);
  expect(before).toBeGreaterThan(0);

  // A caution marked fine on its page: fine in the library too, and out of Needs attention; Undo.
  const aiff = page.locator('.tr', { hasText: 'aiff-44k-24' });
  await expect(aiff.locator('.q')).toHaveText('Caution');
  await aiff.dblclick();
  await page.click('#not-a-problem');
  await expect(page.locator('#track-verdict')).toHaveText('Marked fine');
  await page.locator('.crumbs a').click();
  await expect(aiff.locator('.q')).toHaveText('Marked fine');
  await expect(attention).toContainText(String(before - 1));
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(aiff.locator('.q')).toHaveText('Marked fine', { timeout: 20_000 });
  await aiff.locator('.c-title').click({ button: 'right' });
  await page.locator('.cmenu [data-m="unfine"]').click();
  await expect(aiff.locator('.q')).toHaveText('Caution');

  // A playlist renamed by clicking its name again after a moment.
  await page.click('#new-playlist'); await page.keyboard.type('Warm-up'); await page.keyboard.press('Enter');
  const pl = page.locator('.lside .tree .name', { hasText: 'Warm-up' });
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  await pl.click();                     // opens it
  await page.waitForTimeout(700);
  await pl.click();                     // a second click, later: rename
  await expect(page.locator('.lside .tree input')).toBeFocused();
  await page.keyboard.press('Control+a'); await page.keyboard.type('Opening'); await page.keyboard.press('Enter');
  await expect(page.locator('.lside .tree .name', { hasText: 'Opening' })).toHaveCount(1);

  // Two different recordings with the same artist and title: probable; confirmed, they're the same.
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  for (const name of ['Fixture MP3', 'Fixture FLAC']) {
    await page.locator('.tr', { hasText: name }).locator('.c-title').click({ button: 'right' });
    await page.locator('.cmenu [data-m="info"]').click();
    await page.fill('#edit-info [data-f="title"]', 'Same Song');
    await page.fill('#edit-info [data-f="artist"]', 'Same Artist');
    await page.click('#info-save');
  }
  await page.locator('.lside .name', { hasText: 'Duplicates' }).click();
  const grp = page.locator('#dupes .grp', { hasText: 'Same Song' });
  await expect(grp).toHaveAttribute('data-kind', 'probable', { timeout: 30_000 });
  await grp.locator('[data-confirm]').click();
  await expect(grp).toHaveAttribute('data-kind', 'same');
  await expect(grp).toContainText('you said it’s the same');
  await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await page.locator('.lside .name', { hasText: 'Duplicates' }).click();
  await expect(page.locator('#dupes .grp', { hasText: 'Same Song' })).toHaveAttribute('data-kind', 'same', { timeout: 30_000 });

  // The tags pop-up with many tags stays inside the window, and scrolls inside (it ran off the bottom).
  await page.setViewportSize({ width: 1280, height: 680 });
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  await page.locator('.tr').first().locator('.c-tags').click();
  for (let i = 0; i < 30; i++) { await page.keyboard.type('Tag ' + i); await page.keyboard.press('Enter'); }
  const box = (await page.locator('#tag-editor').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(680);
  await expect(page.locator('#tag-input')).toBeInViewport();
});

test('the user\'s list, 2026-09-28, batch C: genres picked like tags; browsing by artist, album, genre, label and year', async ({ page }) => {
  test.setTimeout(150_000);
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#add-folder');
  await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
  const row = (t: string) => page.locator('.tr', { hasText: t });

  // A genre from the list (a common one): a slow second click on the selected song's genre; then a new
  // one on two songs at once, from the song menu.
  await row('Fixture MP3').locator('.c-title').click();
  await page.waitForTimeout(700);
  await row('Fixture MP3').locator('.c-genre').click();
  await expect(page.locator('#genre-editor')).toBeVisible();
  await page.locator('#genre-editor [data-genre="Techno"]').click();
  await expect(row('Fixture MP3').locator('.c-genre')).toHaveText('Techno');
  await row('Fixture FLAC').locator('.c-title').click();
  await row('aiff-44k-24').locator('.c-title').click({ modifiers: ['Control'] });
  await row('aiff-44k-24').locator('.c-title').click({ button: 'right' });
  await page.locator('.cmenu [data-m="genre"]').click();
  await page.keyboard.type('Neurofunk');
  await expect(page.locator('#genre-new')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(row('Fixture FLAC').locator('.c-genre')).toHaveText('Neurofunk');
  await expect(row('aiff-44k-24').locator('.c-genre')).toHaveText('Neurofunk');
  // It's in the list now, with its songs, before the common ones.
  await row('Fixture MP3').locator('.c-title').click({ button: 'right' });
  await page.locator('.cmenu [data-m="genre"]').click();
  await expect(page.locator('#genre-editor [data-genre="Neurofunk"] small')).toHaveText('2');
  await expect(page.locator('#genre-editor .opt.on')).toHaveText(/Techno/);
  await page.keyboard.press('Escape');

  // Artists for the browse.
  for (const [name, artist] of [['Fixture MP3', 'Kloudmen'], ['Fixture FLAC', 'kloudmen'], ['aiff-44k-24', 'Other']] as const) {
    await row(name).locator('.c-title').click({ button: 'right' });
    await page.locator('.cmenu [data-m="info"]').click();
    await page.fill('#edit-info [data-f="artist"]', artist);
    await page.click('#info-save');
  }
  await expect(page.locator('.lside [data-browse="artist"]')).toBeVisible();
  await page.locator('.lside [data-browse="artist"]').click();
  await expect(page.locator('#browse')).toBeVisible();
  const kl = page.locator('#browse .it[data-key="kloudmen"]');
  await expect(kl).toContainText('2 songs');   // one artist, however it's spelled
  await expect(page.locator('#browse .it[data-key=""]')).toContainText('No artist');
  await page.fill('#browse-find', 'oth');
  await expect(page.locator('#browse .it')).toHaveCount(1);
  await page.fill('#browse-find', '');
  await kl.click();
  await expect(page.locator('.headbar h2')).toContainText('Kloudmen');
  await expect(page.locator('.tr')).toHaveCount(2);
  await page.click('#browse-back');
  await expect(page.locator('#browse')).toBeVisible();
  // Genres too, with a song's menu on the list's right-click.
  await page.locator('.lside [data-browse="genre"]').click();
  await expect(page.locator('#browse .it[data-key="neurofunk"]')).toContainText('2 songs');
  await page.locator('#browse .it[data-key="neurofunk"]').click({ button: 'right' });
  await page.locator('.cmenu [data-m="stats"]').click();
  await expect(page.locator('#stats-dialog #stat-songs b')).toHaveText('2');
  await page.keyboard.press('Escape');
  // The track page's genre.
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  await row('Fixture MP3').locator('.c-title').dblclick();
  await expect(page.locator('#track-genre')).toHaveText('Techno');
});
