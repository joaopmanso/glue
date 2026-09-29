/* Home mode (ADR 0051) against a stand-in GLUE Home (e2e/fakeHome.ts): the library opens on GLUE
   Home's disk, songs waiting in its incoming folder are TO BE SORTED, and when GLUE Home stops the
   library carries on with the browser's own folders, then goes back to GLUE Home when it's running
   again. */
import { test as base, expect, type Page } from '@playwright/test';
import { launch } from './launch';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeHome } from './fakeHome';
import { TAURI_MOCK } from './tauri-mock';

const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-e2e-'));
    const ctx = await launch(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 1920, height: 960 } });
    try { await use(ctx.pages()[0] ?? await ctx.newPage()); }
    finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
  },
});

const fixture = (name: string) => fileURLToPath(new URL('../tests/fixtures/' + name, import.meta.url));
const MUSIC = ['flac-96k-24.flac', 'mp3-128k.mp3', 'aiff-44k-24.aiff', 'aac-128k.m4a'];

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // The browser's folder pickers, as folders in the origin-private file system (as in library.spec).
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: (o: { id?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async (o) =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(o.id === 'mco-home' ? 'MCO' : 'Music', { create: true });
  });
});
test.afterEach(() => expect(errors).toEqual([]));

/** Every file under an origin-private folder, base64. */
const readOpfs = (page: Page, top: string) => page.evaluate(async top => {
  const out: { path: string; b64: string }[] = [];
  const walk = async (d: FileSystemDirectoryHandle, prefix: string) => {
    for await (const [name, h] of (d as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      const p = prefix ? prefix + '/' + name : name;
      if (h.kind === 'directory') await walk(h as FileSystemDirectoryHandle, p);
      else {
        // A file the app replaces meanwhile (a save) can be gone for a moment: skip it.
        let b: Uint8Array;
        try { b = new Uint8Array(await (await (h as FileSystemFileHandle).getFile()).arrayBuffer()); } catch { continue; }
        let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
        out.push({ path: p, b64: btoa(s) });
      }
    }
  };
  await walk(await (await navigator.storage.getDirectory()).getDirectoryHandle(top), '');
  return out;
}, top);

test('Home mode: GLUE Home is the disk; the library carries on when it stops and goes back when it runs', async ({ page }) => {
  test.setTimeout(180_000);
  const tmp = mkdtempSync(join(tmpdir(), 'glue-home-e2e-'));
  const home = new FakeHome({ glue: join(tmp, 'MCO'), incoming: join(tmp, 'Incoming'), folders: {} });
  try {
    // A library made the usual way, in the browser.
    await page.goto('./#/analyze');
    const files = MUSIC.map(n => ({ n, b: readFileSync(fixture(n)).toString('base64') }));
    await page.evaluate(async files => {
      const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Music', { create: true })).getDirectoryHandle('Sets', { create: true });
      for (const f of files) { const w = await (await dir.getFileHandle(f.n, { create: true })).createWritable(); await w.write(Uint8Array.from(atob(f.b), c => c.charCodeAt(0))); await w.close(); }
    }, files);
    await page.goto('./');
    await page.click('#choose-home');
    await page.fill('#profile-name', 'DJ Test');
    await page.getByRole('button', { name: 'Create profile' }).click();
    await page.click('#onb-skip');
    await page.click('#add-folder');
    await expect(page.locator('.notice')).toContainText('4 new tracks', { timeout: 30_000 });
    await expect(page.locator('.an')).toContainText('All analysed', { timeout: 90_000 });   // no more writes while copying
    await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });

    // The same folders on "this computer's disk", where GLUE Home knows them; a song was sent here.
    for (const [top, to] of [['MCO', home.dirs.glue], ['Music', join(tmp, 'Music')]] as const) {
      for (const f of await readOpfs(page, top)) { mkdirSync(dirname(join(to, f.path)), { recursive: true }); writeFileSync(join(to, f.path), Buffer.from(f.b64, 'base64')); }
    }
    const profiles = join(home.dirs.glue, 'profiles'), pid = readdirSync(profiles)[0], cid = readdirSync(join(profiles, pid, 'collections'))[0];
    const meta = JSON.parse(readFileSync(join(profiles, pid, 'collections', cid, 'collection.json'), 'utf8')) as { roots: { id: string }[] };
    home.dirs.folders[meta.roots[0].id] = join(tmp, 'Music');
    mkdirSync(home.dirs.incoming, { recursive: true });
    copyFileSync(fixture('mp3-128k.mp3'), join(home.dirs.incoming, 'Sent song.mp3'));
    await home.start();

    // This browser learnt the local link (as when signed in once): Home mode.
    await page.evaluate(p => localStorage.setItem('mco.localHome', JSON.stringify(p)), home.pref);
    await page.reload();
    await page.locator('.lside .name', { hasText: 'TO BE SORTED' }).click({ timeout: 20_000 });
    await expect(page.locator('.tr', { hasText: 'Fixture MP3' })).toBeVisible({ timeout: 20_000 });
    expect(home.calls).toContain('/fs/roots');
    await expect(page.locator('.lside')).not.toContainText('📁 TO BE SORTED');   // not a music folder

    // The drag dock (ADR 0054), a queue: the selected songs (music folder + path), then a whole music
    // folder; a song already in it isn't added twice.
    await page.locator('.lside .name', { hasText: 'All tracks' }).click();
    await page.locator('.tr', { hasText: 'aiff-44k-24' }).locator('.c-title').click();
    await page.click('#dock-add');
    await expect.poll(() => home.dockShown).toBe(true);
    await expect.poll(() => home.dock.map(i => i.path)).toEqual(['Sets/aiff-44k-24.aiff']);
    await page.locator('.tr', { hasText: 'Fixture MP3' }).first().locator('.c-title').click({ modifiers: ['Control'] });
    await page.click('#dock-add');
    await expect.poll(() => home.dock.length).toBe(2);
    await page.locator('.lside .item', { hasText: '📁 Music' }).hover();
    await page.locator('[data-dock-root]').first().click();
    const inMusic = ['Sets/aac-128k.m4a', 'Sets/aiff-44k-24.aiff', 'Sets/flac-96k-24.flac', 'Sets/mp3-128k.mp3'];
    await expect.poll(() => inMusic.every(p => home.dock.some(d => d.path === p))).toBe(true);
    expect(new Set(home.dock.map(d => d.root + d.path)).size).toBe(home.dock.length);   // nothing twice
    await expect(page.locator('.notice')).toContainText('in it)');
    // A playlist dragged by its row carries its songs for the dock window (ADR 0056).
    const dt = await page.evaluateHandle(() => new DataTransfer());
    const row = page.locator('.lside .item', { hasText: 'TO BE SORTED' });
    await row.dispatchEvent('dragstart', { dataTransfer: dt });
    const carried = await dt.evaluate(d => d.getData('text/plain'));
    expect(carried.startsWith('GLUE-DOCK ')).toBe(true);
    expect(JSON.parse(carried.slice(10)).items).toEqual([{ root: 'incoming', path: 'Sent song.mp3' }]);
    await row.dispatchEvent('dragend');
    // Songs go in by dragging too (ADR 0061): onto the "Drag dock" button, or out of the window onto
    // the dock window itself (GLUE Home says whether the point is on it).
    home.dock = [];
    const song = page.locator('.tr', { hasText: 'aiff-44k-24' }).locator('.c-title');
    const dragTo = async (to: { x: number; y: number }) => {
      const a = (await song.boundingBox())!;
      await page.mouse.move(a.x + 20, a.y + a.height / 2); await page.mouse.down();
      await page.mouse.move(a.x + 60, a.y + a.height / 2 + 10, { steps: 4 });
      await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
    };
    await song.click();   // only this one selected (a selected row drags the whole selection)
    const btn = (await page.locator('#drag-dock').boundingBox())!;
    await dragTo({ x: btn.x + btn.width / 2, y: btn.y + btn.height / 2 });
    await expect.poll(() => home.dock.map(i => i.path)).toEqual(['Sets/aiff-44k-24.aiff']);
    home.dock = [];
    // Let go outside the window: over the dock window, then somewhere else.
    const at = await page.evaluate(() => ({ sx: screenX, sy: screenY + (outerHeight - innerHeight) }));
    home.dockRect = { x: at.sx - 400, y: at.sy, w: 380, h: 800 };
    await dragTo({ x: -60, y: 200 });
    await expect.poll(() => home.dock.map(i => i.path)).toEqual(['Sets/aiff-44k-24.aiff']);
    expect(home.dockDrops.at(-1)!.on).toBe(true);
    home.dock = []; home.dockRect = { x: at.sx - 4000, y: at.sy, w: 10, h: 10 };
    await dragTo({ x: -60, y: 200 });
    await expect.poll(() => home.dockDrops.length).toBe(2);
    expect(home.dockDrops.at(-1)!.on).toBe(false);
    expect(home.dock).toEqual([]);

    // GLUE Home stops. A track still opens and plays, from the browser's own folder.
    await home.stop();
    await page.locator('.lside .name', { hasText: 'All tracks' }).click();
    await page.locator('.tr', { hasText: 'aiff-44k-24' }).dblclick();
    await expect(page.locator('#play-btn')).toBeEnabled({ timeout: 30_000 });
    await expect(page.locator('.detail .error')).toHaveCount(0);
    await expect(page.locator('#home-lost')).toHaveCount(0);
    // Changes are saved meanwhile (to the browser's folder).
    await page.locator('#track-notes').fill('works without GLUE Home');
    await page.locator('#track-notes').blur();

    // GLUE Home is back: the library goes back to it by itself, and the waiting song plays from it.
    home.calls = [];
    await home.start();
    await expect.poll(() => home.calls.includes('/fs/roots'), { timeout: 30_000 }).toBe(true);
    await page.goto('./#/');
    await page.locator('.lside .name', { hasText: 'TO BE SORTED' }).click();
    // The list is drawn again when the incoming folder is scanned after the switch: open the page once it holds.
    await expect(async () => {
      await page.locator('.tr', { hasText: 'Fixture MP3' }).locator('.c-title').dblclick({ timeout: 2_000 });
      await expect(page.locator('.detail')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.locator('#play-btn')).toBeEnabled({ timeout: 30_000 });
    await expect(page.locator('.detail .error')).toHaveCount(0);
    expect(home.calls.some(c => c === '/fs/file')).toBe(true);
  } finally {
    await home.stop();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('with GLUE Home a DJ library imported through its dialog is followed live (ADR 0065)', async ({ page }) => {
  test.setTimeout(150_000);
  const tmp = mkdtempSync(join(tmpdir(), 'glue-home-e2e-'));
  const home = new FakeHome({ glue: join(tmp, 'MCO'), incoming: join(tmp, 'Incoming'), folders: {} });
  const xml = (fri: string, extra = '') => `<?xml version="1.0" encoding="UTF-8"?><DJ_PLAYLISTS Version="1.0.0"><PRODUCT Name="rekordbox" Version="7.0.0"/>
<COLLECTION Entries="2"><TRACK TrackID="1" Name="One" Artist="A" Location="file://localhost/D:/Music/one.mp3"/><TRACK TrackID="2" Name="Two" Artist="B" Location="file://localhost/D:/Music/two.mp3"/></COLLECTION>
<PLAYLISTS><NODE Type="0" Name="ROOT" Count="1"><NODE Name="${fri}" Type="1" KeyType="0" Entries="2"><TRACK Key="2"/><TRACK Key="1"/></NODE>${extra}</NODE></PLAYLISTS></DJ_PLAYLISTS>`;
  try {
    await page.goto('./#/analyze');
    await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); for (const n of ['MCO', 'Music']) await r.removeEntry(n, { recursive: true }).catch(() => {}); });
    await page.goto('./');
    await page.click('#choose-home');
    await page.fill('#profile-name', 'DJ Test');
    await page.getByRole('button', { name: 'Create profile' }).click();
    await page.click('#onb-skip');
    await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
    for (const f of await readOpfs(page, 'MCO')) { mkdirSync(dirname(join(home.dirs.glue, f.path)), { recursive: true }); writeFileSync(join(home.dirs.glue, f.path), Buffer.from(f.b64, 'base64')); }
    mkdirSync(home.dirs.incoming, { recursive: true });
    await home.start();
    await page.evaluate(p => localStorage.setItem('mco.localHome', JSON.stringify(p)), home.pref);
    await page.reload();
    await expect(page.locator('#import-lib')).toBeVisible({ timeout: 20_000 });

    // Imported with GLUE Home's own file dialog: it knows the file from now on.
    const djDir = join(tmp, 'DJ'), file = join(djDir, 'rekordbox.xml');
    mkdirSync(djDir, { recursive: true });
    writeFileSync(file, xml('Friday'));
    home.pickFile = file;
    await page.click('#import-lib');
    await expect(page.locator('.notice')).toContainText('2 tracks', { timeout: 20_000 });
    await expect(page.locator('[data-dj-live]')).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-dj-open]').click();
    const dj = (name: string) => page.locator('#dj-libs .item.dj', { hasText: name });
    await dj('Friday').hover(); await dj('Friday').locator('.tools .more').click();
    await page.locator('[data-dj-import]').click();
    await expect(page.locator('.lside .tree .name', { hasText: /^Friday/ })).toHaveCount(1);

    // Changed in rekordbox: GLUE follows by itself, no click.
    await page.waitForTimeout(1500);
    writeFileSync(file, xml('Friday late', '<NODE Name="Saturday" Type="1" KeyType="0" Entries="1"><TRACK Key="1"/></NODE>'));
    await expect(page.locator('.lside .tree .name', { hasText: /^Friday late/ })).toHaveCount(1, { timeout: 25_000 });
    await expect(dj('Saturday')).toHaveCount(1);
    await expect(page.locator('.notice')).toContainText('rekordbox changed its playlists');
    // Looks are by date: the file itself was sent twice (the import and the change), however many looks.
    expect(home.reads.filter(p => p === 'rekordbox.xml')).toHaveLength(2);
  } finally { await home.stop(); rmSync(tmp, { recursive: true, force: true }); }
});

test('with GLUE Home, duplicates are cleaned up: the others moved aside or recycled; playlists and ratings go to the copy that stays (ADR 0070)', async ({ page }) => {
  test.setTimeout(300_000);
  const { execFileSync } = await import('node:child_process');
  const ff = process.env.FFMPEG || 'ffmpeg';
  try { execFileSync(ff, ['-version'], { stdio: 'ignore' }); } catch { test.skip(true, 'needs ffmpeg to make MP3 rips'); }
  // Two recordings (40 s each), each as a WAV and as a 48 kHz MP3 rip with 1.3 s of extra lead-in.
  const wav = (seed: number) => {
    let s = seed; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const sr = 44100, x = new Float32Array(sr * 40);
    for (let t0 = 0; t0 < 40; t0 += 0.25) {
      const f = 110 * Math.pow(2, Math.floor(r() * 36) / 12), amp = 0.1 + r() * 0.2, a = Math.floor(t0 * sr);
      for (let i = a; i < Math.min(x.length, a + sr * 0.6); i++) { const t = (i - a) / sr; x[i] += amp * Math.exp(-t * 6) * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t)); }
    }
    const b = Buffer.alloc(44 + x.length * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
    for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
    return b;
  };
  const tmp = mkdtempSync(join(tmpdir(), 'glue-dupes-e2e-')), src = join(tmp, 'src');
  mkdirSync(src);
  writeFileSync(join(src, 'HHH 04 RADIX.wav'), wav(11)); writeFileSync(join(src, 'Other take.wav'), wav(99));
  for (const [from, to] of [['HHH 04 RADIX.wav', 'HHH-Bebida.mp3'], ['Other take.wav', 'Other-rip.mp3']]) execFileSync(ff, ['-loglevel', 'error', '-y', '-i', join(src, from), '-af', 'adelay=1300', '-ar', '48000', '-b:a', '128k', join(src, to)]);
  const home = new FakeHome({ glue: join(tmp, 'MCO'), incoming: join(tmp, 'Incoming'), folders: {} });
  home.duplicates = join(tmp, 'Dups');
  try {
    // The library, made in the browser.
    await page.goto('./#/analyze');
    const files = readdirSync(src).map(n => ({ n, b: readFileSync(join(src, n)).toString('base64') }));
    await page.evaluate(async files => {
      const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Music', { create: true })).getDirectoryHandle('Sets', { create: true });
      for (const f of files) { const w = await (await dir.getFileHandle(f.n, { create: true })).createWritable(); await w.write(Uint8Array.from(atob(f.b), c => c.charCodeAt(0))); await w.close(); }
    }, files);
    await page.goto('./');
    await page.click('#choose-home');
    await page.fill('#profile-name', 'DJ Test');
    await page.getByRole('button', { name: 'Create profile' }).click();
    await page.click('#onb-skip');
    await page.click('#add-folder');
    await expect(page.locator('.tr')).toHaveCount(4, { timeout: 30_000 });
    await expect(page.locator('.an')).toContainText('All analysed', { timeout: 120_000 });
    // The first rip is in a playlist, and rated (from Duplicates: in the collection's lists a song is one
    // row, its best copy, the WAV).
    await expect(page.locator('.lside .name', { hasText: 'Duplicates' })).toContainText('2', { timeout: 60_000 });
    await page.locator('.lside .name', { hasText: 'Duplicates' }).click();
    const rip = page.locator('#dupes .grp li', { hasText: 'HHH-Bebida' }).locator('.who a');
    await rip.click({ button: 'right' });
    page.once('dialog', d => void d.accept('Gig'));
    await page.locator('.cmenu [data-m="add"]').hover(); await page.locator('.cmenu [data-m="new-playlist"]').click();
    await rip.click({ button: 'right' });
    await page.locator('.cmenu .cstars button').nth(3).click({ position: { x: 12, y: 7 } });
    await expect(page.locator('.lside .name', { hasText: 'Duplicates' })).toContainText('2', { timeout: 60_000 });
    await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });

    // The same folders on "this computer's disk", where GLUE Home knows them; then Home mode.
    for (const [top, to] of [['MCO', home.dirs.glue], ['Music', join(tmp, 'Music')]] as const) {
      for (const f of await readOpfs(page, top)) { mkdirSync(dirname(join(to, f.path)), { recursive: true }); writeFileSync(join(to, f.path), Buffer.from(f.b64, 'base64')); }
    }
    const profiles = join(home.dirs.glue, 'profiles'), pid = readdirSync(profiles)[0], cid = readdirSync(join(profiles, pid, 'collections'))[0];
    const meta = JSON.parse(readFileSync(join(profiles, pid, 'collections', cid, 'collection.json'), 'utf8')) as { roots: { id: string }[] };
    home.dirs.folders[meta.roots[0].id] = join(tmp, 'Music');
    mkdirSync(home.dirs.incoming, { recursive: true });
    await home.start();
    await page.evaluate(p => localStorage.setItem('mco.localHome', JSON.stringify(p)), home.pref);
    await page.reload();
    await page.locator('.lside .name', { hasText: 'All tracks' }).click({ timeout: 30_000 });
    await expect(page.locator('.tr', { hasText: 'HHH 04 RADIX' })).toHaveCount(1, { timeout: 30_000 });

    // One group: "Move the others". The WAV stays; the MP3 goes into the duplicates folder.
    await page.locator('.lside .name', { hasText: 'Duplicates' }).click();
    const radix = page.locator('#dupes .grp', { hasText: 'HHH 04 RADIX' });
    await radix.locator('[data-clean="move"]').click({ timeout: 30_000 });
    await expect(page.locator('#clean-dialog')).toContainText('Sets/HHH-Bebida.mp3');
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/dupes-clean.png' });
    await page.click('#clean-go');
    await expect(page.locator('.notice')).toContainText('Moved 1 file');
    expect(existsSync(join(tmp, 'Dups', 'Music', 'Sets', 'HHH-Bebida.mp3'))).toBe(true);
    expect(existsSync(join(tmp, 'Music', 'Sets', 'HHH-Bebida.mp3'))).toBe(false);
    // The playlist has the WAV now, and the WAV took the rating.
    await page.locator('.lside .tree .name', { hasText: 'Gig' }).click();
    await expect(page.locator('.tr .c-title')).toHaveText(['HHH 04 RADIX']);
    await expect(page.locator('.tr .stars').first()).toHaveAttribute('aria-valuenow', '4');

    // The other group: ticked, then "Delete the others…" from the bar (the Recycle Bin).
    await page.locator('.lside .name', { hasText: 'Duplicates' }).click();
    await expect(page.locator('#dupes .grp[data-kind="same"]')).toHaveCount(1);
    await page.locator('#dupes .grp', { hasText: 'Other take' }).locator('.gpick').check();
    await page.click('#bulk-trash');
    await expect(page.locator('#clean-dialog')).toContainText('Recycle Bin');
    await page.click('#clean-go');
    await expect(page.locator('.notice')).toContainText('to the Recycle Bin');
    expect(home.trashed).toEqual(['Sets/Other-rip.mp3']);
    await page.locator('.lside .name', { hasText: 'All tracks' }).click();
    await expect(page.locator('.tr')).toHaveCount(2);
  } finally { await home.stop(); rmSync(tmp, { recursive: true, force: true }); }
});

test('song info is edited in GLUE, kept while GLUE Home is away, and written into the files by it without analysing again (ADR 0071)', async ({ page }) => {
  test.setTimeout(240_000);
  const tmp = mkdtempSync(join(tmpdir(), 'glue-tags-e2e-'));
  const home = new FakeHome({ glue: join(tmp, 'MCO'), incoming: join(tmp, 'Incoming'), folders: {} });
  try {
    // The library, made in the browser: two songs.
    await page.goto('./#/analyze');
    const files = ['mp3-128k.mp3', 'flac-cover.flac'].map(n => ({ n, b: readFileSync(fixture(n)).toString('base64') }));
    await page.evaluate(async files => {
      const r = await navigator.storage.getDirectory();
      for (const n of ['MCO', 'Music']) await r.removeEntry(n, { recursive: true }).catch(() => {});
      const dir = await (await r.getDirectoryHandle('Music', { create: true })).getDirectoryHandle('Sets', { create: true });
      for (const f of files) { const w = await (await dir.getFileHandle(f.n, { create: true })).createWritable(); await w.write(Uint8Array.from(atob(f.b), c => c.charCodeAt(0))); await w.close(); }
    }, files);
    await page.goto('./');
    await page.click('#choose-home');
    await page.fill('#profile-name', 'DJ Test');
    await page.getByRole('button', { name: 'Create profile' }).click();
    await page.click('#onb-skip');
    await page.click('#add-folder');
    await expect(page.locator('.tr')).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator('.an')).toContainText('All analysed', { timeout: 120_000 });

    // Without GLUE Home: F2 edits the title in place; it's kept in GLUE, marked "not in the file yet".
    const mp3 = page.locator('.tr', { has: page.locator('.c-title[title="mp3-128k.mp3"]') });
    await mp3.locator('.c-title').click();
    await page.keyboard.press('F2');
    await expect(page.locator('.inl[data-inline="title"]')).toBeFocused();
    await page.keyboard.type('Night Drive');
    // Tab keeps it and goes on to the artist.
    await page.keyboard.press('Tab');
    await expect(page.locator('.inl[data-inline="artist"]')).toBeFocused();
    await page.keyboard.type('Test Artist');
    await page.keyboard.press('Enter');
    await expect(mp3.locator('.c-title')).toHaveText('Night Drive');
    await expect(mp3.locator('.c-artist')).toHaveText('Test Artist');
    await expect(mp3.locator('.unw')).toBeVisible();
    // Esc drops an edit.
    await page.keyboard.press('F2');
    await page.keyboard.type('Nope');
    await page.keyboard.press('Escape');
    await expect(mp3.locator('.c-title')).toHaveText('Night Drive');
    // A slow second click on the selected song edits the cell under it.
    await mp3.locator('.c-artist').click();
    await expect(page.locator('.inl[data-inline="artist"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.inl')).toHaveCount(0);
    await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });

    // GLUE Home runs: the edit goes into the file, and the song isn't analysed again.
    for (const [top, to] of [['MCO', home.dirs.glue], ['Music', join(tmp, 'Music')]] as const) {
      for (const f of await readOpfs(page, top)) { mkdirSync(dirname(join(to, f.path)), { recursive: true }); writeFileSync(join(to, f.path), Buffer.from(f.b64, 'base64')); }
    }
    const profiles = join(home.dirs.glue, 'profiles'), pid = readdirSync(profiles)[0], cid = readdirSync(join(profiles, pid, 'collections'))[0];
    const meta = JSON.parse(readFileSync(join(profiles, pid, 'collections', cid, 'collection.json'), 'utf8')) as { roots: { id: string }[] };
    home.dirs.folders[meta.roots[0].id] = join(tmp, 'Music');
    mkdirSync(home.dirs.incoming, { recursive: true });
    await home.start();
    await page.evaluate(p => localStorage.setItem('mco.localHome', JSON.stringify(p)), home.pref);
    await page.reload();
    await expect(page.locator('.tr')).toHaveCount(2, { timeout: 30_000 });
    await expect.poll(() => home.tagWrites).toEqual([{ path: 'Sets/mp3-128k.mp3', tags: { title: 'Night Drive', artist: 'Test Artist' } }]);
    await expect(page.locator('.tr .unw')).toHaveCount(0);
    await page.waitForTimeout(2500);
    await expect(page.locator('.an')).toContainText('All analysed');
    expect(home.reads.filter(p => p.startsWith('Sets/'))).toEqual([]);

    // Both songs at once, from the menu: fields that differ show "(mixed)"; only what changed is written.
    await page.locator('.tr').first().locator('.c-title').click();
    await page.keyboard.press('Control+a');
    await page.locator('.tr').first().locator('.c-title').click({ button: 'right' });
    await page.locator('.cmenu [data-m="info"]').click();
    await expect(page.locator('#edit-info h2')).toHaveText('Edit the info of 2 songs');
    await expect(page.locator('#edit-info [data-f="title"]')).toHaveAttribute('placeholder', '(mixed)');
    await expect(page.locator('#edit-info [data-f="title"]')).toHaveValue('');
    await page.fill('#edit-info [data-f="genre"]', 'Deep House');
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/edit-info.png' });
    await page.click('#info-save');
    await expect(page.locator('#edit-info')).toHaveCount(0);
    await expect.poll(() => home.tagWrites.length).toBe(3);
    expect(home.tagWrites.slice(1).map(w => w.tags)).toEqual([{ genre: 'Deep House' }, { genre: 'Deep House' }]);
    expect(home.tagWrites.slice(1).map(w => w.path).sort()).toEqual(['Sets/flac-cover.flac', 'Sets/mp3-128k.mp3']);

    // The track page's Edit info.
    await mp3.dblclick();
    await page.click('#edit-info-btn');
    await expect(page.locator('#edit-info [data-f="title"]')).toHaveValue('Night Drive');
    await expect(page.locator('#edit-info [data-f="genre"]')).toHaveValue('Deep House');
    await page.fill('#edit-info [data-f="album"]', 'Late Hours');
    await page.keyboard.press('Enter');
    await expect(page.locator('.th .who')).toContainText('Late Hours');
    await expect.poll(() => home.tagWrites.at(-1)).toEqual({ path: 'Sets/mp3-128k.mp3', tags: { album: 'Late Hours' } });
    await expect(page.locator('#info-unwritten')).toHaveCount(0);

    // A cover this browser lost is read again through GLUE Home: only parts of the file (ADR 0072).
    await page.goBack();
    await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
    await page.evaluate(async () => { const c = await (await navigator.storage.getDirectory()).getDirectoryHandle('cache'); await c.removeEntry('art', { recursive: true }); });
    home.reads = [];
    await page.reload();
    await expect(page.locator('.tr .cell[data-c="cover"] img')).toHaveCount(1, { timeout: 20_000 });
    expect(home.reads.filter(p => p === 'Sets/flac-cover.flac')).toEqual([]);
    expect(home.reads.filter(p => p === 'Sets/flac-cover.flac (part)').length).toBeGreaterThan(0);

    // Played in Home mode, a song streams from the local link by byte range; it isn't read whole first (ADR 0076).
    home.reads = [];
    const mp3row = page.locator('.tr', { has: page.locator('.c-title[title="mp3-128k.mp3"]') });
    await mp3row.hover(); await mp3row.locator('.pbtn').click();
    await expect(page.locator('#lib-play')).toHaveAttribute('aria-label', 'Pause', { timeout: 20_000 });
    await page.click('#lib-play');
    expect(home.reads.filter(p => p === 'Sets/mp3-128k.mp3')).toEqual([]);
    expect(home.reads.filter(p => p === 'Sets/mp3-128k.mp3 (part)').length).toBeGreaterThan(0);
  } finally { await home.stop(); rmSync(tmp, { recursive: true, force: true }); }
});

test('a shared collection with no GLUE tab open: GLUE Home takes in another device’s change, writes the song info into its file, and sends back what that changed (ADR 0097)', async ({ page }) => {
  test.setTimeout(180_000);
  const { gzipSync, gunzipSync } = await import('node:zlib');
  const { createHash } = await import('node:crypto');
  const sha = (t: string) => createHash('sha256').update(t).digest('hex');
  const pack = (t: string) => gzipSync(Buffer.from(t)).toString('base64');
  const tmp = mkdtempSync(join(tmpdir(), 'glue-shared-home-'));
  const fake = new FakeHome({ glue: join(tmp, 'MCO'), incoming: join(tmp, 'Incoming'), folders: { r1: join(tmp, 'Music') } });
  try {
    // The desktop's GLUE folder: a shared collection (the desktop's GLUE Home is member "hdesk") with one
    // song, in step with GLUE Cloud as of revision 1.
    mkdirSync(join(tmp, 'Music', 'Sets'), { recursive: true }); mkdirSync(fake.dirs.incoming, { recursive: true });
    copyFileSync(fixture('mp3-128k.mp3'), join(tmp, 'Music', 'Sets', 'mp3-128k.mp3'));
    const col = 'profiles/p1/collections/c1';
    const files: Record<string, string> = {
      'mco.json': JSON.stringify({ schemaVersion: 1, profiles: [{ id: 'p1', name: 'DJ', color: '#7cc7ff' }], lastProfile: 'p1' }),
      'profiles/p1/profile.json': JSON.stringify({ schemaVersion: 1, id: 'p1', name: 'DJ', color: '#7cc7ff', createdAt: '2026-01-01', collections: [{ id: 'c1', name: 'Main' }], lastCollection: 'c1' }),
    };
    const members = { hdesk: { profile: 'p1', name: 'Desktop' }, lap: { profile: 'p9', name: 'Laptop' } };
    const metaText = JSON.stringify({ schemaVersion: 1, id: 'c1', name: 'Main', createdAt: '2026-01-01', shared: true, rootsBy: { hdesk: [{ id: 'r1', name: 'Music', absPath: null, handleKey: 'r1', addedAt: '' }] }, members });
    const song = (title: string, unwritten?: string[]) => ({ id: 't1', fileName: 'mp3-128k.mp3', title, artist: 'A', album: '', genre: '', label: '', comment: '', year: '', duration: 4, format: null, addedAt: '2026-01-01',
      copies: { hdesk: { status: 'linked', rootId: 'r1', relPath: 'Sets/mp3-128k.mp3', importPath: null, size: 65267, mtime: 1, sources: [], ...(unwritten ? { unwritten } : {}) } } });
    const shardText = (t: object) => JSON.stringify({ schemaVersion: 1, items: { t1: t } });
    const mine = shardText(song('Old title'));
    files[col + '/collection.json'] = metaText;
    files[col + '/tracks/t1.json'] = mine;
    files['cloud/shared/c1.json'] = JSON.stringify({ cursor: 1, files: { 'collection.json': { rev: 1, hash: sha(metaText), text: metaText }, 'tracks/t1.json': { rev: 1, hash: sha(mine), text: mine } } });
    for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(fake.dirs.glue, rel)), { recursive: true }); writeFileSync(join(fake.dirs.glue, rel), text); }
    await fake.start();

    // GLUE Cloud: the laptop renamed the song (revision 2), which tells this computer to write it.
    const theirs = shardText(song('From the laptop', ['title']));
    const cloud = new Map<string, { rev: number; hash: string; data: string }>([['collection.json', { rev: 1, hash: sha(metaText), data: pack(metaText) }], ['tracks/t1.json', { rev: 2, hash: sha(theirs), data: pack(theirs) }]]);
    let seq = 2;
    const home = await page.context().newPage();
    await home.route('https://glue-api.joaopmanso.workers.dev/v1/**', async r => {
      const req = r.request(), u = new URL(req.url()), p = u.pathname;
      const json = (b: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
      if (p === '/v1/me') return json({ user: { id: 'u1' }, thisDevice: 'hdesk', devices: [{ id: 'hdesk', kind: 'home', name: 'Desktop' }], sessions: [] });
      if (p === '/v1/sync/ops') return json({ ops: [] });
      if (p === '/v1/turn') return json({ iceServers: [], ttl: 0 });
      if (p === '/v1/shared/c1/changes') { const since = Number(u.searchParams.get('since')); return json({ seq, more: false, files: [...cloud].filter(([, f]) => f.rev > since).map(([path, f]) => ({ path, rev: f.rev, hash: f.hash, deleted: false, by: 'lap', at: Date.now() })) }); }
      if (p === '/v1/shared/c1/bundle') return r.fulfill({ contentType: 'text/plain', body: (req.postDataJSON().paths as string[]).filter(x => cloud.has(x)).map(x => [x, cloud.get(x)!.rev, cloud.get(x)!.hash, cloud.get(x)!.data].join('\t')).join('\n') });
      if (p === '/v1/shared/c1/push') {
        const rev = ++seq, stored: string[] = [], stale: string[] = [];
        for (const line of (req.postData() ?? '').split('\n').filter(Boolean)) {
          const [path, base, hash, , data] = line.split('\t');
          if ((cloud.get(path)?.rev ?? 0) !== Number(base)) { stale.push(path); continue; }
          cloud.set(path, { rev, hash, data }); stored.push(path);
        }
        return json({ rev: stored.length ? rev : null, stored, stale });
      }
      return json({ access: 'h' });
    });
    // GLUE Cloud's room says the collection changed.
    await home.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, ws => { setTimeout(() => ws.send(JSON.stringify({ type: 'shared', collection: 'c1', seq: 2, from: 'lap' })), 2000); });
    await home.addInitScript(TAURI_MOCK);
    await home.addInitScript(({ glue, port, token, dir }) => {
      const w = window as unknown as Record<string, unknown>; w.__glue = glue; w.__localPort = port; w.__lease = false;
      localStorage.setItem('home-config', JSON.stringify({ deviceId: 'hdesk', token: 't', name: 'Desktop', user: { email: 'dj@example.com', name: 'DJ' }, incoming: null, running: true, askedAutostart: true, glue: dir, localToken: token }));
    }, { glue: files, port: fake.port, token: fake.token, dir: fake.dirs.glue });
    await home.goto('http://localhost:5176/service.html');

    // Taken in, written into the file, and sent back with nothing left to write.
    const local = () => JSON.parse(readFileSync(join(fake.dirs.glue, col, 'tracks', 't1.json'), 'utf8')).items.t1;
    await expect.poll(() => local().title, { timeout: 60_000 }).toBe('From the laptop');
    await expect.poll(() => fake.tagWrites, { timeout: 60_000 }).toEqual([{ path: 'Sets/mp3-128k.mp3', tags: { title: 'From the laptop' } }]);
    await expect.poll(() => cloud.get('tracks/t1.json')!.rev, { timeout: 60_000 }).toBeGreaterThan(2);
    const up = JSON.parse(gunzipSync(Buffer.from(cloud.get('tracks/t1.json')!.data, 'base64')).toString()).items.t1;
    expect(up.title).toBe('From the laptop');
    expect(up.copies.hdesk.unwritten).toBeUndefined();
    expect(up.copies.hdesk.mtime).toBeGreaterThan(1);   // the file's new date, after its tags were written
    await home.close();
  } finally { await fake.stop(); rmSync(tmp, { recursive: true, force: true }); }
});
