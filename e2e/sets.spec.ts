/* The set builder (ADR 0199, 0200): a playlist mixed as a set, planned on the beat, its styles and decks, exported as
   one WAV through the save dialog (an OPFS file stands in for it). */
import { test as base, expect, type Page } from '@playwright/test';
import { launch } from './launch';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-e2e-'));
    const ctx = await launch(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 1600, height: 960 } });
    try { await use(ctx.pages()[0] ?? await ctx.newPage()); }
    finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
  },
});

// The folder pickers can't be driven by a test: folders in the origin-private file system stand in.
let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: (o: { id?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async o =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(o.id === 'mco-home' ? 'MCO' : o.id === 'mco-libraries' ? 'NI' : 'Music', { create: true });
  });
});
test.afterEach(() => expect(errors).toEqual([]));

/** A 40 s song at `bpm`: a quiet 4 s intro, then kicks, hats and a chord (22.05 kHz mono, 16-bit WAV). */
function song(bpm: number, root: number): Buffer {
  const sr = 22050, n = sr * 40, d = Buffer.alloc(n * 2);
  let a = bpm * 7919;
  const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296 * 2 - 1; };
  for (let i = 0; i < n; i++) {
    const t = i / sr, beat = (t * bpm / 60) % 1, e = (t * bpm / 30) % 1;
    let v = t < 4 ? 0.02 * Math.sin(2 * Math.PI * root * t) : 0;
    if (t >= 4) v += 0.5 * Math.exp(-beat * 12) * Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-beat * 30)) * t) + 0.08 * Math.exp(-e * 40) * r() + 0.08 * (Math.sin(2 * Math.PI * root * t) + Math.sin(2 * Math.PI * root * 1.26 * t) + Math.sin(2 * Math.PI * root * 1.5 * t));
    d.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + d.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(d.length, 40);
  return Buffer.concat([h, d]);
}

async function seed(page: Page) {
  await page.goto('./#/analyze');
  const files = [['set-a.wav', song(124, 220)], ['set-b.wav', song(126, 196)], ['set-c.wav', song(125, 247)]].map(([n, b]) => ({ n, b: (b as Buffer).toString('base64') }));
  await page.evaluate(async files => {
    const root = await navigator.storage.getDirectory();
    for (const name of ['MCO', 'Music']) await root.removeEntry(name, { recursive: true }).catch(() => {});
    await new Promise(r => { const q = indexedDB.deleteDatabase('mco'); q.onsuccess = q.onerror = r; });
    const dir = await (await root.getDirectoryHandle('Music', { create: true })).getDirectoryHandle('Sets', { create: true });
    for (const f of files) { const w = await (await dir.getFileHandle(f.n as string, { create: true })).createWritable(); await w.write(Uint8Array.from(atob(f.b as string), c => c.charCodeAt(0))); await w.close(); }
  }, files);
}

test('a playlist mixed as a set: planned on the beat, styles and decks, exported as one WAV', async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page);
  await page.goto('./');
  await page.click('#choose-home');
  await page.fill('#profile-name', 'DJ Test');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-folder');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 90_000 });

  // The three songs into a playlist, in order.
  const row = (t: string) => page.locator('.tr', { hasText: t });
  await row('set-a').locator('.c-title').click();
  await row('set-b').locator('.c-title').click({ modifiers: ['Control'] });
  await row('set-c').locator('.c-title').click({ modifiers: ['Control'] });
  await row('set-c').locator('.c-title').click({ button: 'right' });
  page.once('dialog', d => void d.accept('Friday set'));
  await page.locator('.cmenu [data-m="add"]').hover();
  await page.locator('.cmenu [data-m="new-playlist"]').click();
  await expect(page.locator('.lside .tree .item', { hasText: 'Friday set' })).toContainText('3');

  // Mix it as a set: three songs on two decks, each hand-over listed, a tracklist from 0:00.
  await page.locator('.lside .tree .item', { hasText: 'Friday set' }).locator('.name').click({ button: 'right' });
  await page.click('.cmenu [data-m="set"]');
  await expect(page).toHaveURL(/#\/set\//);
  await expect(page.locator('#set-view')).toBeVisible();
  await expect(page.locator('#set-lanes .blk')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.locator('#set-meta')).toContainText('3 songs');
  await expect(page.locator('#set-lanes .hchip')).toHaveCount(2);
  await expect(page.locator('#set-order .song')).toHaveCount(3);
  await expect(page.locator('#set-tracklist')).toHaveText(/^0:00 set-[abc]\n\d:\d\d set-[abc]\n\d:\d\d set-[abc]$/);   // the playlist's order, from 0:00
  await expect(page.locator('#set-style-blend')).toHaveAttribute('aria-checked', 'true');
  const tops = await page.locator('#set-lanes .blk').evaluateAll(bs => bs.map(b => (b as HTMLElement).style.top));
  expect(tops[0]).not.toBe(tops[1]);                                               // deck 1, deck 2, deck 1
  expect(tops[0]).toBe(tops[2]);

  // Another style and 3 decks: planned again, kept on the playlist.
  await page.click('#set-style-single');
  await expect(page.locator('#set-style-single')).toHaveAttribute('aria-checked', 'true');
  await page.click('#set-decks-3');
  const tops3 = await page.locator('#set-lanes .blk').evaluateAll(bs => bs.map(b => (b as HTMLElement).style.top));
  expect(new Set(tops3).size).toBe(3);
  // A hand-over's chip opens its box where it is; its style chosen there.
  await page.locator('#set-lanes .hchip').first().click();
  await expect(page.locator('#set-pop-fx')).toBeVisible();
  await page.click('#set-hfx-echo');
  await expect(page.locator('#set-lanes .hchip').first()).toContainText('Echo');
  await expect(page.locator('#set-ho-0')).toContainText('Echo out');
  await page.keyboard.press('Escape');
  await expect(page.locator('#set-pop-fx')).toHaveCount(0);

  // The wheel zooms; dragging a song that isn't selected scrolls the timeline (and moves nothing).
  const lanes = page.locator('#set-lanes'), lb = (await lanes.boundingBox())!;
  const width = () => lanes.evaluate(e => e.scrollWidth), scrolled = () => lanes.evaluate(e => e.scrollLeft);
  const w0 = await width();
  await page.mouse.move(lb.x + 100, lb.y + 80);
  await page.mouse.wheel(0, -600);
  await expect.poll(width).toBeGreaterThan(w0 * 1.5);
  const blk = page.locator('#set-lanes .blk').nth(1), left = async () => parseFloat(await blk.evaluate(b => (b as HTMLElement).style.left));
  const before = await left(), s0 = await scrolled();
  await page.mouse.move(lb.x + lb.width - 40, lb.y + 60);
  await page.mouse.down();
  await page.mouse.move(lb.x + lb.width - 240, lb.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect.poll(scrolled).toBeGreaterThan(s0 + 100);
  expect(await left()).toBe(before);
  await page.getByRole('button', { name: 'Fit' }).click();

  // A click selects the second song and opens its box: its level; then dragged earlier (whole bars), undo, redo.
  await blk.click();
  await expect(page.locator('#set-pop-song')).toBeVisible();
  const level = await page.locator('#set-song-level').textContent();
  await page.click('#set-song-louder');
  await expect(page.locator('#set-song-level')).not.toHaveText(level!);
  const at0 = await left(), bb = (await blk.boundingBox())!;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + 30);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2 - 60, bb.y + 30, { steps: 6 });
  await page.mouse.move(bb.x + bb.width / 2 - 120, bb.y + 30, { steps: 6 });
  await page.mouse.up();
  await expect.poll(left).toBeLessThan(at0 - 20);
  await expect(page.locator('#set-meta')).toContainText('shaped by hand');
  await page.click('#set-undo');
  await expect.poll(left).toBeCloseTo(at0, 1);
  await page.click('#set-redo');
  await expect.poll(left).toBeLessThan(at0 - 20);
  await page.locator('#set-ho-0 button').click();
  await expect(page.locator('#set-pop-fx')).toBeVisible();
  await page.click('#set-longer');
  await expect(page.locator('#set-bars')).toHaveText(/\d+ bars/);
  // Whose bass: both at once, then the style's again; a bass swap's marker dragged a bar or more later.
  await page.click('#set-bass-both');
  await expect(page.locator('#set-bass-both')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#set-swap')).toHaveCount(0);
  await page.click('#set-bass-auto');
  await page.click('#set-hfx-bassSwap');
  const swap = page.locator('#set-swap');
  await expect(swap).toBeVisible();
  const sx = () => swap.evaluate(e => parseFloat((e as HTMLElement).style.left)), x0 = await sx(), sb = (await swap.boundingBox())!;
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2 + 80, sb.y + sb.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(sx).toBeGreaterThan(x0 + 10);

  // The preview: it plays (the playhead moves), pauses, and plays a hand-over.
  await expect(page.locator('#set-time')).toContainText('0:00');
  await page.click('#set-play');
  await expect(page.locator('#set-time')).not.toContainText(/^0:00 /, { timeout: 20_000 });
  await page.click('#set-play');
  await page.click('#set-hear');
  await expect(page.locator('#set-play')).toHaveAttribute('aria-label', 'Pause');
  const at = await page.locator('#set-time').textContent();
  await expect(page.locator('#set-time')).not.toHaveText(at!, { timeout: 20_000 });
  await page.click('#set-play');

  await page.keyboard.press('Escape');
  // The running order dragged: the third song first, the set planned again in that order.
  const first = (await page.locator('#set-tracklist').textContent())!.split('\n')[2].replace(/^\S+ /, '');
  await page.locator('#set-order .song').nth(2).dragTo(page.locator('#set-order .song').nth(0));
  await expect(page.locator('#set-tracklist')).toHaveText(new RegExp('^0:00 ' + first));
  // A length asked for is shown (these songs make less than any).
  await page.selectOption('#set-length', '1800');
  await expect(page.locator('#set-meta')).toContainText('asked for 30:00');
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/set.png' });

  // Export the mix as WAV into the "chosen" file.
  await page.evaluate(() => {
    (window as unknown as { showSaveFilePicker: (o: { suggestedName: string }) => Promise<FileSystemFileHandle> }).showSaveFilePicker = async o =>
      (await navigator.storage.getDirectory()).getFileHandle('mix-' + o.suggestedName, { create: true });
  });
  await page.click('#set-export-wav');
  await expect(page.locator('#set-done')).toContainText('Friday set.wav', { timeout: 120_000 });
  const info = await page.evaluate(async () => {
    const f = await (await (await navigator.storage.getDirectory()).getFileHandle('mix-Friday set.wav')).getFile();
    const b = new Uint8Array(await f.arrayBuffer()), dv = new DataView(b.buffer);
    let loud = 0;
    for (let i = 44 + Math.floor((b.length - 44) / 2 / 6) * 6, n = 0; n < 20000; i += 6, n++) { const v = (b[i] | b[i + 1] << 8 | b[i + 2] << 16) << 8 >> 8; loud = Math.max(loud, Math.abs(v)); }
    return { riff: String.fromCharCode(...b.slice(0, 4)), wave: String.fromCharCode(...b.slice(8, 12)), ch: dv.getUint16(22, true), sr: dv.getUint32(24, true), bits: dv.getUint16(34, true), data: dv.getUint32(40, true), size: b.length, loud };
  });
  expect(info).toMatchObject({ riff: 'RIFF', wave: 'WAVE', ch: 2, sr: 44100, bits: 24 });
  expect(info.data).toBe(info.size - 44);
  expect(info.size / (44100 * 6)).toBeGreaterThan(60);                             // three 40 s songs, overlapping: over a minute
  expect(info.loud).toBeGreaterThan(100_000);                                       // music in the middle, not silence

  // And as MP3 320 (LAME in the worker): MPEG frames, about 40 kB a second.
  await page.click('#set-export-mp3');
  await expect(page.locator('#set-done')).toContainText('Friday set.mp3', { timeout: 120_000 });
  const mp3 = await page.evaluate(async () => {
    const f = await (await (await navigator.storage.getDirectory()).getFileHandle('mix-Friday set.mp3')).getFile(), b = new Uint8Array(await f.arrayBuffer());
    let i = 0;
    if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) i = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]);   // past an ID3 tag
    return { size: b.length, sync: b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0 };
  });
  expect(mp3.sync).toBe(true);
  expect(mp3.size / (info.size / (44100 * 6))).toBeGreaterThan(30_000);

  // Back in the library, the playlist shows it has a set; its mark opens it.
  await page.locator('#set-view .back').click();
  const mark = page.locator('.lside .tree .item', { hasText: 'Friday set' }).locator('.setmark');
  await expect(mark).toHaveCount(1);
  await mark.click();
  await expect(page).toHaveURL(/#\/set\//);
  await expect(page.locator('#set-lanes .blk')).toHaveCount(3);
});
