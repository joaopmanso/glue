import { test as base, expect, chromium, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function seed(page: Page) {
  await page.goto('./#/analyze');
  const files = MUSIC.map(n => ({ n, b: readFileSync(fixture(n)).toString('base64') }));
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

  // Imported playlist, in its original order, inside the rekordbox folder.
  await page.locator('.lside .tree .name', { hasText: 'rekordbox' }).click();   // opens the folder
  await page.locator('.lside .name', { hasText: 'Friday' }).click();
  await expect(page.locator('.tr .c-title')).toHaveText(['Lossy one', 'Hi-res claim', 'Not on this computer']);

  // A new playlist, filled by dragging a row onto it.
  await page.click('#new-playlist');
  await page.keyboard.type('Warm-up'); await page.keyboard.press('Enter');
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  await page.locator('.tr', { hasText: 'aiff-44k-24' }).dragTo(page.locator('.lside .item', { hasText: 'Warm-up' }));
  await expect(page.locator('.notice')).toContainText('Added 1 track to Warm-up');

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

  await page.locator('.lside .tree .name', { hasText: 'Engine DJ' }).click();
  await page.locator('.lside .name', { hasText: 'Peak time' }).click();
  await expect(page.locator('.tr')).toHaveCount(2);
  await expect(page.locator('.tr .c-title').first()).toHaveAttribute('title', 'mp3-128k.mp3');   // Engine's linked-list order
  await expect(page.locator('.tr [data-c="key"]').first()).not.toHaveText('');
  await page.locator('.lside .tree .name', { hasText: 'Serato' }).click();
  await page.locator('.lside .tree .name', { hasText: 'Warm' }).click();
  await page.locator('.lside .name', { hasText: 'Opening' }).click();
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
  // Menu: move B back to the top level, then up, and colour it.
  await item('B').hover(); await item('B').locator('.more').click();
  await page.locator('.menu select').selectOption('');
  expect(await names()).toEqual(['C', 'A', 'Gigs', 'B']);   // top level, at the end
  await item('B').hover(); await item('B').locator('.more').click();
  await page.getByRole('menuitem', { name: 'Move up' }).click();
  expect(await names()).toEqual(['C', 'A', 'B', 'Gigs']);
  await page.locator('.menu .sw').nth(3).click();
  await expect(item('B').locator('.icon')).toHaveClass(/colored/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu')).toHaveCount(0);

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

  // Dropping on a folder makes a playlist inside it.
  await page.locator('.lside .name', { hasText: 'All tracks' }).click();
  await dragRow('Fixture MP3', await centre(item('Gigs')), async () => { await expect(item('Gigs').locator('.plus')).toBeVisible(); });
  await page.keyboard.type('Friday'); await page.keyboard.press('Enter');
  await expect(item('Friday')).toContainText('1');
  expect(await page.locator('.lside .tree .name').allTextContents().then(a => a.map(x => x.trim()))).toEqual(['Gigs', 'Friday', 'Warm']);

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
  await row.dblclick();
  await expect(page.locator('#v-pill')).not.toHaveText('', { timeout: 30_000 });
  await expect(page.locator('#play-btn')).toHaveAttribute('aria-label', 'Pause');
  await page.locator('.crumbs a').click();
  await expect(page.locator('#lib-play')).toHaveAttribute('aria-label', 'Pause');
  await row.dblclick();   // second visit: stored analysis, still playing
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
  await dupItem.click();
  const grp = page.locator('#dupes .grp');
  await expect(grp).toHaveCount(1);
  await expect(grp).toContainText('Same recording');
  await expect(grp.locator('li')).toHaveCount(2);
  await expect(grp.locator('li.best')).toContainText('HHH 04 RADIX');

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
  await expect(html).toHaveAttribute('data-theme', 'classic');
  for (const id of ['classic', 'studio', 'riso', 'moss']) for (const mode of ['dark', 'light']) {
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
  await expect(page.locator('.brand h1 a')).toHaveAccessibleName('GLUE, Global Library Utility Exporter');

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
    await page.click('#new-auto');
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
