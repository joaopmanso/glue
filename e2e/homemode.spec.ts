/* Home mode (ADR 0051) against a stand-in GLUE Home (e2e/fakeHome.ts): the library opens on GLUE
   Home's disk, songs waiting in its incoming folder are TO BE SORTED, and when GLUE Home stops the
   library carries on with the browser's own folders, then goes back to GLUE Home when it's running
   again. */
import { test as base, expect, chromium, type Page } from '@playwright/test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeHome } from './fakeHome';

const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-e2e-'));
    const ctx = await chromium.launchPersistentContext(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 1920, height: 960 } });
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
