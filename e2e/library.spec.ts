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
      return root.getDirectoryHandle(o.id === 'mco-home' ? 'MCO' : 'Music', { create: true });
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
  await expect(page.locator('.who')).toContainText('DJ Test');

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
    await page.mouse.move(a.x + 40, a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + 40, b.y + b.height * frac, { steps: 6 });
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
  await page.mouse.move(r.x + 200, r.y + r.height / 2); await page.mouse.down();
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
  expect((await heads()).slice(0, 2)).toEqual(['artist', 'title']);

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
  expect((await heads()).slice(0, 2)).toEqual(['artist', 'title']);
  await expect(page.locator('.tr', { hasText: 'Fixture FLAC' }).locator('.note')).toHaveClass(/has/);
  await page.locator('.tr', { hasText: 'Fixture FLAC' }).dblclick();
  await expect(page.locator('#track-notes')).toHaveValue('Mix out at the breakdown');
});
