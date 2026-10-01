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
import { SharedCloudServer } from '../tests/sharedCloud';

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

test('with GLUE Home, a dropped folder is found by it at once; one inside a music folder is refused; a dropped song is placed by it; Stop hands the library to the browser and Start takes it back (2026-10-01)', async ({ page }) => {
  test.setTimeout(180_000);
  const tmp = mkdtempSync(join(tmpdir(), 'glue-home-e2e-'));
  const home = new FakeHome({ glue: join(tmp, 'MCO'), incoming: join(tmp, 'Incoming'), folders: {} });
  try {
    // A library made in the browser, then the same folders on "this computer's disk", where GLUE Home knows them.
    await page.goto('./#/analyze');
    const files = MUSIC.map(n => ({ n, b: readFileSync(fixture(n)).toString('base64') }));
    const dropped = readFileSync(fixture('mp3-128k.mp3')).toString('base64');
    await page.evaluate(async ([files, dropped]) => {
      const root = await navigator.storage.getDirectory();
      const sets = await (await root.getDirectoryHandle('Music', { create: true })).getDirectoryHandle('Sets', { create: true });
      const put = async (d: FileSystemDirectoryHandle, n: string, b: string) => { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(Uint8Array.from(atob(b), c => c.charCodeAt(0))); await w.close(); };
      for (const f of files as { n: string; b: string }[]) await put(sets, f.n, f.b);
      await put(await (await root.getDirectoryHandle('Crate', { create: true })).getDirectoryHandle('Dropped', { create: true }), 'New one.mp3', dropped as string);
    }, [files, dropped] as const);
    await page.goto('./');
    await page.click('#choose-home');
    await page.fill('#profile-name', 'DJ Test');
    await page.getByRole('button', { name: 'Create profile' }).click();
    await page.click('#onb-skip');
    await page.click('#add-folder');
    await expect(page.locator('.notice')).toContainText('4 new tracks', { timeout: 30_000 });
    await expect(page.locator('.an')).toContainText('All analysed', { timeout: 90_000 });
    await expect(page.locator('#saving')).toBeHidden({ timeout: 20_000 });
    for (const [top, to] of [['MCO', home.dirs.glue], ['Music', join(tmp, 'Music')], ['Crate', join(tmp, 'Crate')]] as const) {
      for (const f of await readOpfs(page, top)) { mkdirSync(dirname(join(to, f.path)), { recursive: true }); writeFileSync(join(to, f.path), Buffer.from(f.b64, 'base64')); }
    }
    const profiles = join(home.dirs.glue, 'profiles'), pid = readdirSync(profiles)[0], cid = readdirSync(join(profiles, pid, 'collections'))[0];
    const metaFile = join(profiles, pid, 'collections', cid, 'collection.json');
    home.dirs.folders[(JSON.parse(readFileSync(metaFile, 'utf8')) as { roots: { id: string }[] }).roots[0].id] = join(tmp, 'Music');
    mkdirSync(home.dirs.incoming, { recursive: true });
    // GLUE Home's engine answers where a dropped folder is (and remembers it); anything else: an older GLUE Home.
    const asked: { id: string; name: string; sample: string }[] = [], askedFiles: string[] = [];
    const places: Record<string, string> = { Dropped: join(tmp, 'Crate', 'Dropped'), Sets: join(tmp, 'Music', 'Sets') };
    home.rpc = async body => {
      const b = JSON.parse(body) as { op: string; id: string; name: string; sample: string; roots?: string[] };
      // A dropped song (ADR 0125): Fresh.mp3 is in the music folder "Music", Loose.mp3 elsewhere.
      if (b.op === 'whereFile') {
        askedFiles.push(b.name);
        const music = Object.entries(home.dirs.folders).find(([, at]) => at === join(tmp, 'Music'))![0];
        return JSON.stringify(b.name === 'Fresh.mp3' ? { path: join(tmp, 'Music', 'Sets', 'Fresh.mp3'), folder: { id: music, relPath: 'Sets/Fresh.mp3' } } : { path: join(tmp, 'Elsewhere', 'Loose.mp3') });
      }
      if (b.op !== 'where') return '{}';
      asked.push(b); home.dirs.folders[b.id] = places[b.name];
      return JSON.stringify({ path: places[b.name] ?? null });
    };
    await home.start();
    await page.evaluate(p => localStorage.setItem('mco.localHome', JSON.stringify(p)), home.pref);
    await page.reload();
    await expect(page.locator('.tr')).toHaveCount(4, { timeout: 20_000 });
    await expect.poll(() => home.calls.includes('/fs/roots')).toBe(true);
    const tracksOnDisk = () => { const d = join(dirname(metaFile), 'tracks'); return readdirSync(d).flatMap(f => Object.values((JSON.parse(readFileSync(join(d, f), 'utf8')) as { items: Record<string, { fileName: string; rootId: string | null; relPath: string | null; fileKey?: string | null; filePath?: string }> }).items)); };

    const drop = (top: string, name: string) => page.evaluate(async ([top, name]) => {
      let d = await navigator.storage.getDirectory();
      for (const p of [top, name]) d = await d.getDirectoryHandle(p);
      (DataTransferItem.prototype as unknown as { getAsFileSystemHandle: () => Promise<FileSystemHandle> }).getAsFileSystemHandle = async () => d;
      const dt = new DataTransfer(); dt.items.add(new File(['x'], name));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, [top, name]);

    // A folder dropped onto the library: GLUE Home is told its name and a song in it, and it's GLUE Home's folder.
    await drop('Crate', 'Dropped');
    await expect(page.locator('.notice')).toContainText('1 new track', { timeout: 30_000 });
    expect(asked.map(a => [a.name, a.sample])).toEqual([['Dropped', 'New one.mp3']]);
    await expect.poll(() => (JSON.parse(readFileSync(metaFile, 'utf8')) as { roots: { name: string; handleKey: string; absPath: string | null }[] }).roots.find(r => r.name === 'Dropped'), { timeout: 20_000 })
      .toEqual(expect.objectContaining({ handleKey: 'home:' + asked[0].id, absPath: join(tmp, 'Crate', 'Dropped') }));
    // One inside a music folder: its songs are there already.
    await drop('Music', 'Sets');
    await expect(page.locator('.notice')).toContainText('“Sets” is inside “Music”', { timeout: 20_000 });
    await expect(page.locator('.tr')).toHaveCount(5);

    // A song dropped on its own (the browser never says where it is, ADR 0125): GLUE Home finds it. In a music folder,
    // it's that folder's song; elsewhere, GLUE Home keeps its path (and analyses it).
    const dropFile = (top: string, dir: string | null, name: string) => page.evaluate(async ([top, dir, name]) => {
      let d = await (await navigator.storage.getDirectory()).getDirectoryHandle(top);
      if (dir) d = await d.getDirectoryHandle(dir);
      const h = await d.getFileHandle(name);
      (DataTransferItem.prototype as unknown as { getAsFileSystemHandle: () => Promise<FileSystemHandle> }).getAsFileSystemHandle = async () => h;
      const dt = new DataTransfer(); dt.items.add(await h.getFile());
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, [top, dir, name] as const);
    // New files, after the folder was scanned: one in the music folder "Music", one elsewhere (in the browser and on disk).
    const other = readFileSync(fixture('mp3-cover.mp3'));
    await page.evaluate(async b => {
      const root = await navigator.storage.getDirectory();
      for (const [d, n] of [[await (await root.getDirectoryHandle('Music')).getDirectoryHandle('Sets'), 'Fresh.mp3'], [await root.getDirectoryHandle('Elsewhere', { create: true }), 'Loose.mp3']] as const) {
        const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(Uint8Array.from(atob(b), c => c.charCodeAt(0))); await w.close();
      }
    }, other.toString('base64'));
    writeFileSync(join(tmp, 'Music', 'Sets', 'Fresh.mp3'), other);
    mkdirSync(join(tmp, 'Elsewhere'), { recursive: true }); writeFileSync(join(tmp, 'Elsewhere', 'Loose.mp3'), other);
    await dropFile('Music', 'Sets', 'Fresh.mp3');
    await expect(page.locator('.notice')).toContainText('Added 1 song', { timeout: 20_000 });
    await dropFile('Elsewhere', null, 'Loose.mp3');
    await expect.poll(() => askedFiles, { timeout: 20_000 }).toEqual(['Fresh.mp3', 'Loose.mp3']);
    await expect.poll(() => tracksOnDisk().filter(t => t.fileName === 'Fresh.mp3' || t.fileName === 'Loose.mp3').map(t => ({ name: t.fileName, root: !!t.rootId, relPath: t.relPath, handle: !!t.fileKey, filePath: t.filePath ?? null })).sort((a, b) => a.name.localeCompare(b.name)), { timeout: 20_000 })
      .toEqual([
        { name: 'Fresh.mp3', root: true, relPath: 'Sets/Fresh.mp3', handle: false, filePath: null },
        { name: 'Loose.mp3', root: false, relPath: null, handle: true, filePath: join(tmp, 'Elsewhere', 'Loose.mp3') },
      ]);

    // Stop pressed in GLUE Home: the library carries on in the browser (a song plays from the browser's folder).
    home.stopped = true;
    await page.locator('.tr', { hasText: 'aiff-44k-24' }).dblclick();
    await expect(page.locator('#play-btn')).toBeEnabled({ timeout: 30_000 });
    await expect(page.locator('.detail .error')).toHaveCount(0);
    // Start: back to GLUE Home by itself.
    home.calls = [];
    home.stopped = false;
    await expect.poll(() => home.calls.includes('/fs/roots'), { timeout: 30_000 }).toBe(true);
  } finally {
    await home.stop();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('another browser on the computer (Edge next to Chrome) signs in and opens GLUE Home’s library: no folder to choose, no permission to give (ADR 0115)', async ({ page }) => {
  test.setTimeout(120_000);
  const tmp = mkdtempSync(join(tmpdir(), 'glue-home-edge-'));
  const fake = new FakeHome({ glue: join(tmp, 'MCO'), incoming: join(tmp, 'Incoming'), folders: { r1: join(tmp, 'Music') } });
  try {
    mkdirSync(join(tmp, 'Music'), { recursive: true }); mkdirSync(fake.dirs.incoming, { recursive: true });
    copyFileSync(fixture('mp3-128k.mp3'), join(tmp, 'Music', 'a.mp3'));
    copyFileSync(fixture('flac-96k-24.flac'), join(tmp, 'Music', 'b.flac'));
    const col = 'profiles/p1/collections/c1';
    const song = (id: string, file: string, size: number) => ({ id, status: 'linked', rootId: 'r1', relPath: file, importPath: null, fileName: file, size, mtime: 1000, title: '', artist: '', album: '', genre: '', label: '', comment: '', year: '', duration: null, format: null, addedAt: '2026-09-01T00:00:00Z', sources: [] });
    const files: Record<string, string> = {
      'mco.json': JSON.stringify({ schemaVersion: 1, profiles: [{ id: 'p1', name: '404', color: '#7cc7ff' }], lastProfile: 'p1' }),
      'profiles/p1/profile.json': JSON.stringify({ schemaVersion: 1, id: 'p1', name: '404', color: '#7cc7ff', createdAt: '2026-01-01', collections: [{ id: 'c1', name: 'Main' }], lastCollection: 'c1', cloudSync: false }),
      [col + '/collection.json']: JSON.stringify({ schemaVersion: 1, id: 'c1', name: 'Main', createdAt: '2026-01-01', roots: [{ id: 'r1', name: 'Music Collection', absPath: null, handleKey: 'r1', addedAt: '' }] }),
      [col + '/tracks/t1.json']: JSON.stringify({ schemaVersion: 1, items: { t1a: song('t1a', 'a.mp3', 65267), t1b: song('t1b', 'b.flac', 968141) } }),
    };
    for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(fake.dirs.glue, rel)), { recursive: true }); writeFileSync(join(fake.dirs.glue, rel), text); }
    await fake.start();
    // GLUE Home's usual address on this computer (127.0.0.1:47400), stood in by the fake.
    await page.context().route(/^http:\/\/127\.0\.0\.1:4740\d\//, async r => {
      const u = new URL(r.request().url());
      if (u.port !== '47400') return r.abort('connectionrefused');
      u.port = String(fake.port);
      return r.fulfill({ response: await r.fetch({ url: u.toString() }) });
    });
    // The account: this computer's browser device and its GLUE Home.
    const user = { id: 'u1', email: 'dj@example.com', name: 'DJ', picture: null };
    await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `
      window.google = { accounts: { id: { initialize(o) { window.__gcb = o.callback; }, disableAutoSelect() {},
        renderButton(el) { const b = document.createElement('button'); b.className = 'fake-google'; b.textContent = 'Sign in with Google'; b.onclick = () => window.__gcb({ credential: 'fake' }); el.appendChild(b); } } } };` }));
    await page.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => {
      const p = new URL(r.request().url()).pathname, json = (b: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
      if (p === '/v1/auth/google' || p === '/v1/auth/refresh') return json({ access: 'a', refresh: 'r', deviceId: 'b1', user });
      if (p === '/v1/me') return json({ user, thisDevice: 'b1', devices: [{ id: 'b1', kind: 'browser', name: 'Desktop', platform: '', createdAt: 1, lastSeen: 1, role: 'device' }, { id: fake.device, kind: 'home', name: 'Desktop', platform: '', createdAt: 1, lastSeen: 1, companionOf: 'b1' }], sessions: [] });
      if (p === '/v1/shared') return json({ collections: [], gone: [] });
      if (p === '/v1/profiles') return json({ profiles: [], gone: [] });
      return json({});
    });
    await page.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, () => {});

    // A browser that never met GLUE Home: the start page. Signed in, the library is GLUE Home's.
    await page.goto('./');
    await expect(page.locator('#choose-home')).toBeVisible();
    await page.locator('#cloud-panel .fake-google').click();
    await expect(page.locator('.tr')).toHaveCount(2, { timeout: 30_000 });
    expect(fake.calls).toContain('/connect');
    await expect(page.locator('.lside [data-root] .reconnect')).toHaveCount(0);   // no "Find folder", no "Allow"
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('mco.localHome') ?? 'null'))).toEqual(fake.pref);
    // Opened again: at once, before signing in is even checked.
    await page.reload();
    await expect(page.locator('.tr')).toHaveCount(2, { timeout: 30_000 });
  } finally { await fake.stop(); rmSync(tmp, { recursive: true, force: true }); }
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
    // A music folder GLUE Home can't reach: why is said, not "needs GLUE Home 0.12" (a Mac on 0.38, 2026-10-01).
    home.tagsFail = { code: 404, error: '/Volumes/Crates/Sets isn’t there (a drive not plugged in, or the folder was moved or renamed)' };
    await page.click('#edit-info-btn');
    await page.fill('#edit-info [data-f="album"]', 'Later Hours');
    await page.keyboard.press('Enter');
    await expect(page.locator('#info-unwritten')).toBeVisible();
    await page.goBack();
    await expect(page.locator('.notice')).toContainText('/Volumes/Crates/Sets isn’t there', { timeout: 20_000 });
    await expect(page.locator('.notice')).not.toContainText('0.12');
    await page.locator('.notice button').click();
    home.tagsFail = null;
    await mp3.dblclick();
    await page.click('#edit-info-btn');
    await page.fill('#edit-info [data-f="album"]', 'Late Hours');
    await page.keyboard.press('Enter');
    await expect.poll(() => home.tagWrites.at(-1)).toEqual({ path: 'Sets/mp3-128k.mp3', tags: { album: 'Late Hours' } });

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
  const { createHash } = await import('node:crypto');
  const sha = (t: string) => createHash('sha256').update(t).digest('hex');
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
    const server = new SharedCloudServer();
    await server.seed('c1', 'Main', { 'collection.json': { text: metaText, rev: 1 }, 'tracks/t1.json': { text: theirs, rev: 2 } }, 'lap', 2);
    const home = await page.context().newPage();
    await home.route('https://glue-api.joaopmanso.workers.dev/v1/**', async r => {
      const req = r.request(), u = new URL(req.url()), p = u.pathname;
      const json = (b: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
      if (p === '/v1/me') return json({ user: { id: 'u1' }, thisDevice: 'hdesk', devices: [{ id: 'hdesk', kind: 'home', name: 'Desktop' }], sessions: [] });
      if (p === '/v1/sync/ops') return json({ ops: [] });
      // Which computer GLUE Home is on (ADR 0108): here its own id doubles as the computer's.
      if (p === '/v1/computer') return json({ computer: 'hdesk' });
      if (p === '/v1/turn') return json({ iceServers: [], ttl: 0 });
      const a = await server.answer(req.method(), u, req.postData(), 'hdesk');
      if (a) return r.fulfill({ status: a.status, contentType: a.type, body: a.body });
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
    const upNow = async () => JSON.parse(await server.current('c1', 'tracks/t1.json') ?? '{}').items?.t1;
    await expect.poll(async () => (await upNow())?.copies?.hdesk?.mtime, { timeout: 60_000 }).toBeGreaterThan(1);
    const up = await upNow();
    expect(up.title).toBe('From the laptop');
    expect(up.copies.hdesk.unwritten).toBeUndefined();
    expect(up.copies.hdesk.mtime).toBeGreaterThan(1);   // the file's new date, after its tags were written
    await home.close();
  } finally { await fake.stop(); rmSync(tmp, { recursive: true, force: true }); }
});

test('with no GLUE tab open, GLUE Home analyses this computer’s songs into the library, and says what it’s doing; a folder only a drive search finds is searched for once; one not connected waits; a song added on its own where GLUE Home found it (ADR 0103, 0122, 0125)', async ({ page }) => {
  test.setTimeout(180_000);
  const tmp = mkdtempSync(join(tmpdir(), 'glue-home-analyse-'));
  const fake = new FakeHome({ glue: join(tmp, 'MCO'), incoming: join(tmp, 'Incoming'), folders: { r1: join(tmp, 'Music') } });
  try {
    // This computer's GLUE folder: a collection with two songs never analysed (the browser was closed).
    mkdirSync(join(tmp, 'Music'), { recursive: true }); mkdirSync(fake.dirs.incoming, { recursive: true });
    copyFileSync(fixture('mp3-128k.mp3'), join(tmp, 'Music', 'a.mp3'));
    copyFileSync(fixture('flac-96k-24.flac'), join(tmp, 'Music', 'b.flac'));
    const col = 'profiles/p1/collections/c1';
    const song = (id: string, file: string, size: number, rootId = 'r1') => ({ id, status: 'linked', rootId, relPath: file, importPath: null, fileName: file, size, mtime: 1000, title: '', artist: '', album: '', genre: '', label: '', comment: '', year: '', duration: null, format: null, addedAt: '2026-09-01T00:00:00Z', sources: [] });
    const files: Record<string, string> = {
      'mco.json': JSON.stringify({ schemaVersion: 1, profiles: [{ id: 'p1', name: 'DJ', color: '#7cc7ff' }], lastProfile: 'p1' }),
      'profiles/p1/profile.json': JSON.stringify({ schemaVersion: 1, id: 'p1', name: 'DJ', color: '#7cc7ff', createdAt: '2026-01-01', collections: [{ id: 'c1', name: 'Main' }], lastCollection: 'c1', cloudSync: false }),
      [col + '/collection.json']: JSON.stringify({ schemaVersion: 1, id: 'c1', name: 'Main', createdAt: '2026-01-01', roots: [{ id: 'r1', name: 'Music', absPath: null, handleKey: 'r1', addedAt: '' }, { id: 'r2', name: 'Promos', absPath: null, handleKey: 'root:x', addedAt: '' }, { id: 'r3', name: 'Share', absPath: null, handleKey: 'home:r3', addedAt: '' }] }),
      [col + '/tracks/t1.json']: JSON.stringify({ schemaVersion: 1, items: { t1a: song('t1a', 'a.mp3', 65267), t1b: song('t1b', 'b.flac', 968141), t1c: song('t1c', 'c.mp3', 65267, 'r2'), t1d: song('t1d', 'd.mp3', 65267, 'r2'), t1e: song('t1e', 'e.mp3', 65267, 'r3'), t1f: { ...song('t1f', 'f.mp3', 65267), rootId: null, relPath: null, fileKey: 'file:x', filePath: 'D:\\Loose\\f.mp3' } } }),
    };
    for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(fake.dirs.glue, rel)), { recursive: true }); writeFileSync(join(fake.dirs.glue, rel), text); }
    await fake.start();

    const home = await page.context().newPage();
    await home.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ access: 'h' }) }));
    await home.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, () => {});
    await home.addInitScript(TAURI_MOCK);
    // The songs' files, as GLUE Home's Rust side reads them (stood in): in this computer's Music folder.
    // "Promos" (a folder added in the browser, which never says where it is): only a search of the drives finds it.
    const mp3 = [...readFileSync(fixture('mp3-128k.mp3'))];
    const disk = { 'C:\\Users\\dj\\Music\\a.mp3': mp3, 'C:\\Users\\dj\\Music\\b.flac': [...readFileSync(fixture('flac-96k-24.flac'))], 'E:\\DJ\\Promos\\c.mp3': mp3, 'E:\\DJ\\Promos\\d.mp3': mp3, 'D:\\Loose\\f.mp3': mp3 };
    await home.addInitScript(({ glue, disk, port, token, dir }) => {
      const w = window as unknown as Record<string, unknown>; w.__glue = glue; w.__disk = disk; w.__find = { Promos: 'E:\\DJ\\Promos' }; w.__localPort = port; w.__lease = false;
      localStorage.setItem('home-config', JSON.stringify({ deviceId: 'hdesk', token: 't', name: 'Desktop', user: { email: 'dj@example.com', name: 'DJ' }, incoming: null, running: true, askedAutostart: true, glue: dir, localToken: token, folders: { r3: 'Z:\\Share' } }));
    }, { glue: files, disk, port: fake.port, token: fake.token, dir: fake.dirs.glue });
    await home.goto('http://localhost:5176/service.html');

    home.on('console', m => { if (/GLUE Home/.test(m.text())) console.log('HOME:', m.text().slice(0, 300)); });
    // Analysed by GLUE Home, into the collection's files (no GLUE tab holds the lease).
    const analysis = () => { try { return JSON.parse(readFileSync(join(fake.dirs.glue, col, 'analysis', 't1.json'), 'utf8')).items as Record<string, { v: number; fileSize: number; fileMtime: number }>; } catch { return {}; } };
    await expect.poll(() => Object.keys(analysis()).sort(), { timeout: 120_000 }).toEqual(['t1a', 't1b', 't1c', 't1d', 't1f']);
    expect(analysis().t1a).toMatchObject({ v: 3, fileSize: 65267, fileMtime: 1000 });
    const tracks = JSON.parse(readFileSync(join(fake.dirs.glue, col, 'tracks', 't1.json'), 'utf8')).items;
    expect(tracks.t1b.format).toMatchObject({ lossless: true, sampleRate: 96000 });
    expect(tracks.t1a.duration).toBeGreaterThan(3);
    expect(tracks.t1a.title).toBe('Fixture MP3');   // from its tags (the song had none)
    // "Share" is a network folder that isn't connected (Z:\Share isn't there): its song waits, it isn't a failure,
    // and no drive is searched for it (a Mac on Wi-Fi, 2026-10-01).
    expect(analysis().t1e).toBeUndefined();
    // One search for the folder, not one per song (each searched every drive, 2026-10-01), and it's remembered.
    expect(await home.evaluate(() => (window as unknown as { __calls: string[] }).__calls.filter(c => c === 'find_folder').length)).toBe(1);
    expect(await home.evaluate(() => JSON.parse(localStorage.getItem('home-config')!).folders)).toMatchObject({ r2: 'E:\\DJ\\Promos' });
    // What it did, for its settings window: the analysis state and the events.
    const status = () => home.evaluate(() => (window as unknown as { __status?: { analysing?: { done: number; left: number; waiting: number }; events?: { text: string }[] } }).__status);
    await expect.poll(async () => (await status())?.analysing?.done, { timeout: 20_000 }).toBe(5);
    expect((await status())?.analysing).toMatchObject({ left: 0, waiting: 0, failed: 0, away: 1 });
    const texts = ((await status())?.events ?? []).map(e => e.text);
    expect(texts).toContain('Analysing 6 songs');
    expect(texts.some(t => t.startsWith('Put 5 analyses into the library'))).toBe(true);
    // "Analysis done" once: a later run with nothing to do says nothing (it said the day's total every minute,
    // 2026-09-30). A run asked for with no songs stands in for the minute's.
    const done = async () => ((await status())?.events ?? []).filter(e => e.text.startsWith('Analysis done')).length;
    await expect.poll(done, { timeout: 20_000 }).toBe(1);
    await home.evaluate(() => (window as unknown as { __tauriEvent: (e: string, p: unknown) => void }).__tauriEvent('rpc', { id: 1, body: JSON.stringify({ op: 'analyse', p: 'p1', c: 'c1', ids: [] }), read: false }));
    await expect.poll(async () => ((await status())?.events ?? []).some(e => e.text.includes('as asked')), { timeout: 20_000 }).toBe(true);
    await home.waitForTimeout(3000);
    expect(await done()).toBe(1);
    await home.close();
  } finally { await fake.stop(); rmSync(tmp, { recursive: true, force: true }); }
});

test('GLUE Home is the library’s engine: the tab shows, GLUE Home analyses and writes; a rating and a playlist are its; removing goes on with the tab closed; stop and resume (ADR 0104)', async ({ page }) => {
  test.setTimeout(360_000);
  const tmp = mkdtempSync(join(tmpdir(), 'glue-home-engine-'));
  // The tab can't read the songs itself (no music folder for it): only GLUE Home can.
  const fake = new FakeHome({ glue: join(tmp, 'MCO'), incoming: join(tmp, 'Incoming'), folders: {} });
  try {
    mkdirSync(fake.dirs.incoming, { recursive: true });
    const col = 'profiles/p1/collections/c1';
    const song = (id: string, file: string, size: number) => ({ id, status: 'linked', rootId: 'r1', relPath: file, importPath: null, fileName: file, size, mtime: 1000, title: '', artist: '', album: '', genre: '', label: '', comment: '', year: '', duration: null, format: null, addedAt: '2026-09-01T00:00:00Z', sources: [] });
    const files: Record<string, string> = {
      'mco.json': JSON.stringify({ schemaVersion: 1, profiles: [{ id: 'p1', name: 'DJ', color: '#7cc7ff' }], lastProfile: 'p1' }),
      'profiles/p1/profile.json': JSON.stringify({ schemaVersion: 1, id: 'p1', name: 'DJ', color: '#7cc7ff', createdAt: '2026-01-01', collections: [{ id: 'c1', name: 'Main' }], lastCollection: 'c1', cloudSync: false }),
      [col + '/collection.json']: JSON.stringify({ schemaVersion: 1, id: 'c1', name: 'Main', createdAt: '2026-01-01', roots: [{ id: 'r1', name: 'Music', absPath: null, handleKey: 'r1', addedAt: '' }] }),
      [col + '/tracks/t1.json']: JSON.stringify({ schemaVersion: 1, items: { t1a: song('t1a', 'a.mp3', 65267), t1b: song('t1b', 'b.flac', 968141) } }),
    };
    for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(fake.dirs.glue, rel)), { recursive: true }); writeFileSync(join(fake.dirs.glue, rel), text); }
    await fake.start();

    // This computer's GLUE Home: its real service page (Rust stood in); the local link's /rpc and /cache go to it.
    const home = await page.context().newPage();
    await home.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ access: 'h' }) }));
    await home.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, () => {});
    await home.addInitScript(TAURI_MOCK);
    const disk = { 'C:\\Users\\dj\\Music\\a.mp3': [...readFileSync(fixture('mp3-128k.mp3'))], 'C:\\Users\\dj\\Music\\b.flac': [...readFileSync(fixture('flac-96k-24.flac'))] };
    await home.addInitScript(({ glue, disk, port, token, dir }) => {
      const w = window as unknown as Record<string, unknown>; w.__glue = glue; w.__disk = disk; w.__localPort = port; w.__lease = false;
      localStorage.setItem('home-config', JSON.stringify({ deviceId: 'hdesk', token: 't', name: 'Desktop', user: { email: 'dj@example.com', name: 'DJ' }, incoming: null, running: true, askedAutostart: true, glue: dir, localToken: token }));
    }, { glue: files, disk, port: fake.port, token: fake.token, dir: fake.dirs.glue });
    await home.goto('http://localhost:5176/service.html');
    fake.rpc = (body, read) => home.evaluate(({ body, read }) => new Promise<string>(res => {
      const w = window as unknown as { __rpcN?: number; __rpcWait?: Record<number, (b: string) => void>; __rpcReply?: (i: number, b: string) => void; __tauriEvent: (e: string, p: unknown) => void };
      const id = w.__rpcN = (w.__rpcN ?? 0) + 1;
      (w.__rpcWait ??= {})[id] = res;
      w.__rpcReply ??= (i, b) => { w.__rpcWait?.[i]?.(b); delete w.__rpcWait?.[i]; };
      w.__tauriEvent('rpc', { id, body, read });
    }), { body, read });
    fake.cache = key => home.evaluate(k => (window as unknown as { __cache: Record<string, number[]> }).__cache[k] ?? null, key);
    // Its lease: whatever the tab says, through the local link (the stand-in keeps it).
    await home.exposeFunction('leaseAt', () => fake.leasedAt);
    await home.evaluate(() => setInterval(async () => { (window as unknown as { __lease: boolean }).__lease = Date.now() - await (window as unknown as { leaseAt: () => Promise<number> }).leaseAt() < 15_000; }, 500));

    // The tab: Home mode (it knows the local link); no account at all.
    await page.goto('./#/analyze');
    await page.evaluate(p => localStorage.setItem('mco.localHome', JSON.stringify(p)), fake.pref);
    await page.goto('./');
    await expect(page.locator('.tr')).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator('#analysis-by')).toBeVisible({ timeout: 30_000 });

    // GLUE Home analyses (the tab can't), writes it, and the tab shows it: analysed, with their details.
    await expect(page.locator('.an')).toContainText('All analysed', { timeout: 120_000 });
    await expect(page.locator('.tr', { hasText: 'Fixture MP3' })).toHaveCount(1);   // its title, from its tags
    await expect.poll(() => page.evaluate(async () => {
      try { const c = await (await navigator.storage.getDirectory()).getDirectoryHandle('cache'); await (await (await (await c.getDirectoryHandle('details')).getDirectoryHandle('c1')).getDirectoryHandle('t1')).getFileHandle('t1a.json'); return true; } catch { return false; }
    }), { timeout: 30_000 }).toBe(true);

    // A rating and a playlist, made in the tab: saved by GLUE Home.
    const row = page.locator('.tr', { hasText: 'Fixture MP3' });
    await row.hover();
    await row.locator('.c-rate button').nth(2).click({ position: { x: 10, y: 6 } });
    await page.click('#new-playlist'); await page.keyboard.type('Friday'); await page.keyboard.press('Enter');
    const tracksOnDisk = () => JSON.parse(readFileSync(join(fake.dirs.glue, col, 'tracks', 't1.json'), 'utf8')).items as Record<string, { rating?: number }>;
    await expect.poll(() => tracksOnDisk().t1a?.rating, { timeout: 20_000 }).toBe(3);
    const lists = join(fake.dirs.glue, col, 'lists');
    await expect.poll(() => existsSync(lists) ? readdirSync(lists).length : 0, { timeout: 20_000 }).toBe(1);

    // A song dropped on its own that GLUE Home can't find (ADR 0125): only this browser can read it, so the tab analyses
    // it, GLUE Home being the engine (it waited for ever, 2026-10-01).
    await page.evaluate(async b => {
      const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Elsewhere', { create: true });
      const h = await d.getFileHandle('Loose.mp3', { create: true }), w = await h.createWritable(); await w.write(Uint8Array.from(atob(b), c => c.charCodeAt(0))); await w.close();
      (DataTransferItem.prototype as unknown as { getAsFileSystemHandle: () => Promise<FileSystemHandle> }).getAsFileSystemHandle = async () => h;
      const dt = new DataTransfer(); dt.items.add(await h.getFile());
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, readFileSync(fixture('mp3-cover.mp3')).toString('base64'));
    const shards = (dir: string) => existsSync(join(fake.dirs.glue, col, dir)) ? readdirSync(join(fake.dirs.glue, col, dir)).flatMap(f => Object.entries(JSON.parse(readFileSync(join(fake.dirs.glue, col, dir, f), 'utf8')).items as Record<string, { fileName?: string; v?: number }>)) : [];
    await expect.poll(() => shards('tracks').find(([, t]) => t.fileName === 'Loose.mp3')?.[0] ?? null, { timeout: 20_000 }).not.toBeNull();
    const loose = shards('tracks').find(([, t]) => t.fileName === 'Loose.mp3')![0];
    await expect.poll(() => shards('analysis').some(([id, a]) => id === loose && !!a.v), { timeout: 60_000 }).toBe(true);
    await expect(page.locator('.an')).toContainText('All analysed', { timeout: 30_000 });

    // Stop in the tab pauses GLUE Home; turning background analysis on again resumes it.
    const paused = () => home.evaluate(() => (window as unknown as { __status?: { analysing?: { paused: boolean } } }).__status?.analysing?.paused);
    await page.locator('.an .switch').click();
    await expect.poll(paused, { timeout: 20_000 }).toBe(true);
    await page.locator('.an .switch').click();
    await expect.poll(paused, { timeout: 20_000 }).toBe(false);

    // Remove both songs, and close the tab straight away: GLUE Home finishes it.
    await page.locator('.lside .name', { hasText: 'All tracks' }).click();   // the new playlist was open
    await page.locator('.tr').first().locator('.c-title').click();
    await page.keyboard.press('Control+a');
    page.once('dialog', d => void d.accept());
    await page.click('#remove-tracks');
    await page.waitForTimeout(600);
    await page.goto('about:blank');
    await expect.poll(() => Object.keys(tracksOnDisk()).length, { timeout: 30_000 }).toBe(0);
    await home.close();
  } finally { await fake.stop(); rmSync(tmp, { recursive: true, force: true }); }
});

test('the screen takes GLUE Home’s analyses when it needs them: Overviews and a song page from its cache, never analysed in the tab; a stored time-out is tried again (ADR 0109, 0110)', async ({ page }) => {
  test.setTimeout(300_000);
  const tmp = mkdtempSync(join(tmpdir(), 'glue-home-cache-'));
  // The tab can't read the songs itself (no music folder for it): anything it shows is GLUE Home's.
  const fake = new FakeHome({ glue: join(tmp, 'MCO'), incoming: join(tmp, 'Incoming'), folders: {} });
  try {
    mkdirSync(fake.dirs.incoming, { recursive: true });
    const col = 'profiles/p1/collections/c1';
    const song = (id: string, file: string, size: number) => ({ id, status: 'linked', rootId: 'r1', relPath: file, importPath: null, fileName: file, size, mtime: 1000, title: '', artist: '', album: '', genre: '', label: '', comment: '', year: '', duration: null, format: null, addedAt: '2026-09-01T00:00:00Z', sources: [] });
    // b.flac "took too long" under an older GLUE Home (the timer bug of 0.3.1–0.32): stored, at today's version.
    const timedOut = { v: 3, at: '2026-09-29T00:00:00Z', grade: 'info', label: '', headline: '', fc: 0, wall: false, full: false, effBits: null, declaredBits: 0, origin: '', bpm: null, key: null, findings: [], fileSize: 968141, fileMtime: 1000, error: 'The analysis took too long' };
    const files: Record<string, string> = {
      'mco.json': JSON.stringify({ schemaVersion: 1, profiles: [{ id: 'p1', name: 'DJ', color: '#7cc7ff' }], lastProfile: 'p1' }),
      'profiles/p1/profile.json': JSON.stringify({ schemaVersion: 1, id: 'p1', name: 'DJ', color: '#7cc7ff', createdAt: '2026-01-01', collections: [{ id: 'c1', name: 'Main' }], lastCollection: 'c1', cloudSync: false }),
      [col + '/collection.json']: JSON.stringify({ schemaVersion: 1, id: 'c1', name: 'Main', createdAt: '2026-01-01', roots: [{ id: 'r1', name: 'Music', absPath: null, handleKey: 'r1', addedAt: '' }] }),
      [col + '/tracks/t1.json']: JSON.stringify({ schemaVersion: 1, items: { t1a: song('t1a', 'a.mp3', 65267), t1b: song('t1b', 'b.flac', 968141) } }),
      [col + '/analysis/t1.json']: JSON.stringify({ schemaVersion: 1, items: { t1b: timedOut } }),
    };
    for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(fake.dirs.glue, rel)), { recursive: true }); writeFileSync(join(fake.dirs.glue, rel), text); }
    await fake.start();

    const home = await page.context().newPage();
    await home.route('https://glue-api.joaopmanso.workers.dev/v1/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ access: 'h' }) }));
    await home.routeWebSocket(/glue-api\.joaopmanso\.workers\.dev\/v1\/signal/, () => {});
    await home.addInitScript(TAURI_MOCK);
    const disk = { 'C:\\Users\\dj\\Music\\a.mp3': [...readFileSync(fixture('mp3-128k.mp3'))], 'C:\\Users\\dj\\Music\\b.flac': [...readFileSync(fixture('flac-96k-24.flac'))] };
    await home.addInitScript(({ glue, disk, port, token, dir }) => {
      const w = window as unknown as Record<string, unknown>; w.__glue = glue; w.__disk = disk; w.__localPort = port; w.__lease = false;
      localStorage.setItem('home-config', JSON.stringify({ deviceId: 'hdesk', token: 't', name: 'Desktop', user: { email: 'dj@example.com', name: 'DJ' }, incoming: null, running: true, askedAutostart: true, glue: dir, localToken: token }));
    }, { glue: files, disk, port: fake.port, token: fake.token, dir: fake.dirs.glue });
    await home.goto('http://localhost:5176/service.html');
    fake.rpc = (body, read) => home.evaluate(({ body, read }) => new Promise<string>(res => {
      const w = window as unknown as { __rpcN?: number; __rpcWait?: Record<number, (b: string) => void>; __rpcReply?: (i: number, b: string) => void; __tauriEvent: (e: string, p: unknown) => void };
      const id = w.__rpcN = (w.__rpcN ?? 0) + 1;
      (w.__rpcWait ??= {})[id] = res;
      w.__rpcReply ??= (i, b) => { w.__rpcWait?.[i]?.(b); delete w.__rpcWait?.[i]; };
      w.__tauriEvent('rpc', { id, body, read });
    }), { body, read });
    const asked: string[] = [];
    fake.cache = key => { asked.push(key); return home.evaluate(k => (window as unknown as { __cache: Record<string, number[]> }).__cache[k] ?? null, key); };

    // With no GLUE tab open, GLUE Home analyses both: the time-out wasn't the file's fault, so it's tried again.
    const analysis = () => { try { return JSON.parse(readFileSync(join(fake.dirs.glue, col, 'analysis', 't1.json'), 'utf8')).items as Record<string, { error?: string; label: string }>; } catch { return {}; } };
    await expect.poll(() => { const a = analysis(); return !!a.t1a?.label && !!a.t1b?.label && !a.t1b.error; }, { timeout: 120_000 }).toBe(true);

    // The tab opens afterwards (Home mode): the Overviews come from GLUE Home's cache.
    await page.goto('./#/analyze');
    await page.evaluate(p => localStorage.setItem('mco.localHome', JSON.stringify(p)), fake.pref);
    await page.goto('./');
    await expect(page.locator('.tr')).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator('.lside [data-view="pending"]')).not.toContainText(/[1-9]/);
    await expect(page.locator('.tr .wave canvas')).toHaveCount(2, { timeout: 30_000 });
    expect(asked.some(k => k.includes('t/'))).toBe(true);

    // A song's page: its stored analysis, from GLUE Home's cache (the tab can't read the file to analyse it).
    await page.locator('.tr', { hasText: 'Fixture MP3' }).locator('.c-title').dblclick();
    await expect(page.locator('.src')).toHaveText('Stored analysis', { timeout: 30_000 });
    expect(asked.some(k => k.includes('d/'))).toBe(true);

    // All analysed; then a tab adds a song (a new music folder scanned): GLUE Home looks for it at once, not at its
    // next 5-minute look (the new folders' songs waited until a restart, 2026-09-30).
    await home.evaluate(b => { (window as unknown as { __disk: Record<string, number[]> }).__disk['C:\\Users\\dj\\Music\\c.mp3'] = b; }, [...readFileSync(fixture('mp3-128k.mp3'))]);
    // GLUE Home's own reads of its GLUE folder (Rust, stood in): the real folder now, as the edit writes it.
    await home.exposeFunction('__glueDisk', (rel: string) => { try { return readFileSync(join(fake.dirs.glue, rel), 'utf8'); } catch { return null; } });
    await fake.rpc(JSON.stringify({ op: 'edit', p: 'p1', c: 'c1', ops: [{ m: 'tracks', ts: [song('t1c', 'c.mp3', 65267)] }] }), false);
    await expect.poll(() => !!analysis().t1c?.label, { timeout: 30_000 }).toBe(true);
    await home.close();
  } finally { await fake.stop(); rmSync(tmp, { recursive: true, force: true }); }
});
