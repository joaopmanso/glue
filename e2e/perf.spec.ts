/* The performance budgets (ADR 0058), on the production build with ?perf. Opt-in: timings depend on
   the machine, so this doesn't run in CI.
     PERF=1 npx playwright test e2e/perf.spec.ts
   PERF_SIZES=10000,50000 sets the synthetic collections' sizes; PERF_BUDGET=1 also fails the test
   when a number is over its budget (the phases that meet them turn it on). Results go to
   test-results/perf.json and are printed. */
import { test as base, expect, chromium, type Locator, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { synthetic } from '../tests/synthetic';
import { seedFolder } from './seed';
import { EDGE_ARGS } from './launch';

// A real (temporary) browser profile, as in library.spec.ts.
const test = base.extend<{ page: Page }>({
  page: async ({ baseURL }, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'mco-perf-'));
    const ctx = await chromium.launchPersistentContext(dir, { channel: process.env.PW_CHANNEL || 'msedge', baseURL, viewport: { width: 1920, height: 960 }, args: EDGE_ARGS });
    try { await use(ctx.pages()[0] ?? await ctx.newPage()); }
    finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
  },
});
test.skip(!process.env.PERF, 'PERF=1 runs the performance budgets (ADR 0058)');
test.describe.configure({ mode: 'serial' });

const SIZES = (process.env.PERF_SIZES || '10000,50000').split(',').map(Number).filter(Boolean);
const ENFORCE = process.env.PERF_BUDGET === '1';
/** ADR 0058. Times in ms. */
const BUDGET = { open: 2000, switch: 100, sort: 100, searchP95: 50, scrollOver50: 0, stormOver50: 0, playDrawP95: 2 };

type Summary = { frames: number; gapP95: number; gapMax: number; over50: number; drawP50: number; drawP95: number; drawMax: number; longFrames: number; longMax: number; slowInputs: number; inputMax: number };
type Stat = { n: number; total: number; max: number; last: number };
const results: Record<string, Record<string, unknown>> = {};
const over: string[] = [];
function check(group: string, name: string, value: number, max: number) {
  (results[group] ??= {})[name] = Math.round(value * 10) / 10;
  if (value > max) over.push(`${group} ${name}: ${Math.round(value)} > ${max}`);
  if (ENFORCE) expect.soft(value, `${group} ${name}`).toBeLessThanOrEqual(max);
}
const note = (group: string, name: string, value: unknown) => { (results[group] ??= {})[name] = value; };
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))] : 0; };

test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/perf.json', JSON.stringify({ at: new Date().toISOString(), budget: BUDGET, results, over }, null, 1));
  console.log('\nPerformance (ADR 0058)\n' + JSON.stringify(results, null, 1) + (over.length ? '\nOver budget:\n  ' + over.join('\n  ') : '\nAll within budget.'));
});

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: (o: { id?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async (o) => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(o.id === 'mco-home' ? 'MCO' : 'Music', { create: true });
    };
  });
});
test.afterEach(() => expect(errors).toEqual([]));

/** Does something in the page, then waits for the next painted frame: the time an interaction takes to show. */
const timed = (loc: Locator, what: 'click' | 'dblclick' = 'click') => loc.evaluate(async (el, what) => {
  const t0 = performance.now();
  if (what === 'click') (el as HTMLElement).click(); else el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await (window as unknown as { __gluePerf: { afterPaint(): Promise<number> } }).__gluePerf.afterPaint();
  return performance.now() - t0;
}, what);
const perf = <T>(page: Page, fn: string, ...args: unknown[]) => page.evaluate(([fn, args]) => (window as unknown as { __gluePerf: Record<string, (...a: unknown[]) => unknown> }).__gluePerf[fn as string](...(args as unknown[])), [fn, args] as const) as Promise<T>;

for (const n of SIZES) {
  test(`a library of ${n} tracks: open, switch, sort, search, scroll, background changes`, async ({ page }) => {
    test.setTimeout(900_000);
    const g = `library ${n}`;
    // The synthetic GLUE folder, served to the page and written into its private storage.
    const syn = synthetic(n, 1);
    const bundle = JSON.stringify([...syn.files]);
    note(g, 'jsonMB', Math.round(bundle.length / 1e5) / 10);
    await seedFolder(page, bundle);

    // Open: from choosing the folder to the first rows on screen.
    await page.goto('./?perf#/');
    const t0 = Date.now();
    await page.click('#choose-home');
    await expect(page.locator('.tr').first()).toBeVisible({ timeout: 120_000 });
    check(g, 'open', Date.now() - t0, BUDGET.open);
    const stats = await perf<Record<string, Stat>>(page, 'stats');
    note(g, 'storeLoad', Math.round(stats['store.load']?.last ?? 0));
    note(g, 'heapMB', await page.evaluate(() => Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e6)));
    await page.waitForTimeout(1500);   // let start-up work (library detection, verdict re-check) settle

    // Switching what's shown in the sidebar.
    const side = (text: string) => page.locator('.lside .name', { hasText: text }).first();
    const sw: Record<string, number> = {};
    for (const name of ['Lower quality', 'Not analysed yet', 'No file linked', 'Recently added', 'All tracks']) sw[name] = await timed(side(name));
    sw['folder Gigs'] = await timed(page.locator('.lside .tree .name', { hasText: /^Gigs$/ }).first());
    const lists = page.locator('.lside .tree .item[data-drop="list"]');
    for (let i = 0; i < await lists.count(); i++) {
      const it = lists.nth(i), cnt = +(await it.locator('.n').textContent() || 0);
      if (cnt >= 150 && (await it.getAttribute('class'))?.includes('item')) { sw['playlist ' + cnt] = await timed(it.locator('.name')); break; }
    }
    const tag = page.locator('.lside .taglist .name').first();
    if (await tag.count()) sw['tag'] = await timed(tag);
    await timed(side('All tracks'));
    note(g, 'switchEach', Object.fromEntries(Object.entries(sw).map(([k, v]) => [k, Math.round(v)])));
    check(g, 'switchMax', Math.max(...Object.values(sw)), BUDGET.switch);

    // Sorting All tracks by each column.
    const heads = page.locator('.thead .th');
    const sorts: Record<string, number> = {};
    for (let i = 0; i < await heads.count(); i++) {
      const h = heads.nth(i), key = await h.getAttribute('data-col') ?? String(i);
      if (await h.getAttribute('aria-sort') === null) continue;
      const b = h.locator('.sortb');
      if (!((await b.getAttribute('title')) ?? '').startsWith('Sort by')) continue;
      sorts[key] = await timed(b);
    }
    note(g, 'sortEach', Object.fromEntries(Object.entries(sorts).map(([k, v]) => [k, Math.round(v)])));
    check(g, 'sortMax', Math.max(...Object.values(sorts)), BUDGET.sort);

    // Searching: one keystroke at a time.
    const search = page.getByRole('searchbox', { name: 'Search tracks' });
    const keys: number[] = [];
    for (const q of ['deep', 'night drive', 'ka lo']) {
      for (let i = 1; i <= q.length; i++) keys.push(await search.evaluate(async (el, v) => {
        const input = el as HTMLInputElement, t0 = performance.now();
        input.value = v; input.dispatchEvent(new Event('input', { bubbles: true }));
        await (window as unknown as { __gluePerf: { afterPaint(): Promise<number> } }).__gluePerf.afterPaint();
        return performance.now() - t0;
      }, q.slice(0, i)));
      await search.fill('');
    }
    check(g, 'searchP95', pct(keys, 95), BUDGET.searchP95);
    note(g, 'searchMax', Math.round(Math.max(...keys)));

    // Scrolling the table for about 2.5 s.
    await perf(page, 'reset');
    await page.locator('.tr').first().waitFor();
    await page.evaluate(async () => {
      const body = document.querySelector('.body') as HTMLElement;
      for (let i = 0; i < 150; i++) { body.scrollTop += 420; await new Promise(r => requestAnimationFrame(r)); }
    });
    const scroll = await perf<Summary>(page, 'summary');
    check(g, 'scrollOver50', scroll.over50, BUDGET.scrollOver50);
    note(g, 'scrollGapP95', Math.round(scroll.gapP95));

    // Background changes, as analysis makes them: 12 a second for 5 s.
    await perf(page, 'reset');
    await perf(page, 'storm', 60, 12);
    const storm = await perf<Summary>(page, 'summary'), st = await perf<Record<string, Stat>>(page, 'stats');
    check(g, 'stormOver50', storm.over50, BUDGET.stormOver50);
    note(g, 'stormGapMax', Math.round(storm.gapMax));
    note(g, 'stormRows', { n: st.rows?.n ?? 0, avg: Math.round((st.rows?.total ?? 0) / Math.max(1, st.rows?.n ?? 1)), max: Math.round(st.rows?.max ?? 0) });
    note(g, 'storeFlush', { n: st['store.flush']?.n ?? 0, max: Math.round(st['store.flush']?.max ?? 0) });
    await page.screenshot({ path: `test-results/perf-library-${n}.png` });
  });
}

test('playback: drawing per frame on the track page and the Prepare tab', async ({ page }) => {
  test.setTimeout(300_000);
  const g = 'playback';
  // The fixture is 4 s long: every player loops (the player's <audio> elements aren't in the page).
  await page.addInitScript(() => { const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) { this.loop = true; return play.call(this); }; });
  const flac = readFileSync(fileURLToPath(new URL('../tests/fixtures/flac-96k-24.flac', import.meta.url))).toString('base64');
  await page.goto('./?perf#/analyze');
  await page.evaluate(async b => {
    const root = await navigator.storage.getDirectory();
    for (const name of ['MCO', 'Music', 'cache']) await root.removeEntry(name, { recursive: true }).catch(() => {});
    await new Promise(r => { const q = indexedDB.deleteDatabase('mco'); q.onsuccess = q.onerror = r; });
    const dir = await (await root.getDirectoryHandle('Music', { create: true })).getDirectoryHandle('Sets', { create: true });
    const w = await (await dir.getFileHandle('flac-96k-24.flac', { create: true })).createWritable();
    await w.write(Uint8Array.from(atob(b), c => c.charCodeAt(0))); await w.close();
    localStorage.setItem('mco.live', '1'); localStorage.setItem('mco.liveMode', 'scroll'); localStorage.setItem('mco.prep3d', '0');
  }, flac);
  await page.goto('./?perf#/');
  await page.reload();   // a new hash alone doesn't reload: the prefs above must be read at start
  await page.click('#choose-home');
  await page.fill('#profile-name', 'Perf');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await page.click('#add-folder');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 90_000 });
  await page.locator('.tr').first().locator('.c-title').dblclick();
  await expect(page.locator('#v-pill')).not.toHaveText('', { timeout: 30_000 });
  await page.click('#play-btn');
  await expect(page.locator('#play-btn')).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 });

  const measure = async (name: string) => {
    await page.waitForTimeout(800);
    await perf(page, 'reset');
    await page.waitForTimeout(6000);
    const s = await perf<Summary>(page, 'summary'), st = await perf<Record<string, Stat>>(page, 'stats');
    check(g, name + ' drawP95', s.drawP95, BUDGET.playDrawP95);
    note(g, name + ' detail', { frames: s.frames, gapP95: Math.round(s.gapP95), over50: s.over50,
      spans: Object.fromEntries(Object.entries(st).filter(([k]) => k.startsWith('draw:')).map(([k, v]) => [k, { n: v.n, avg: Math.round(v.total / v.n * 100) / 100, max: Math.round(v.max * 10) / 10 }])) });
  };
  await measure('track page, scrolling live view');
  await page.click('#live-3d');
  await measure('track page, 3D live view');
  await page.click('#tab-prepare');
  await expect(page.locator('#prep-play')).toHaveAttribute('aria-label', 'Pause');
  await measure('Prepare deck');
  await page.locator('label.kl', { hasText: '3D' }).locator('input').check();
  await measure('Prepare deck + 3D');
});

/* PERF_FOLDER=<a GLUE folder>: a copy of a real library (its JSON files only: no audio, no cloud
   copies), opened here and clicked through step by step, to find what makes it slow. The folder
   itself is only read. */
test('a real GLUE folder, step by step', async ({ page }) => {
  const folder = process.env.PERF_FOLDER;
  test.skip(!folder, 'PERF_FOLDER=<path to a GLUE folder>');
  test.setTimeout(900_000);
  const { readdirSync, statSync } = await import('node:fs');
  const files: [string, string][] = [];
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name), r = rel ? rel + '/' + name : name;
      if (statSync(p).isDirectory()) { if (rel || name === 'profiles') walk(p, r); }
      else if (name.endsWith('.json') && (rel || name === 'mco.json')) files.push([r, readFileSync(p, 'utf8')]);
    }
  };
  walk(folder!, '');
  const bundle = JSON.stringify(files);
  const g = 'real folder';
  note(g, 'files', files.length);
  note(g, 'jsonMB', Math.round(bundle.length / 1e5) / 10);
  await seedFolder(page, bundle);
  await page.goto('./?perf#/');
  const t0 = Date.now();
  await page.click('#choose-home');
  await expect(page.locator('.tr').first()).toBeVisible({ timeout: 120_000 });
  note(g, 'open', Date.now() - t0);
  await page.waitForTimeout(3000);   // start-up work settles

  // Each step: its time to the next paint, and any long frame it caused (with its script).
  type Long = { at: number; ms: number; scripts: string[] };
  const steps: { step: string; ms: number; long?: string }[] = [];
  const longSince = async (before: number) => (await perf<Long[]>(page, 'long')).slice(before).map(l => Math.round(l.ms) + 'ms ' + (l.scripts[0] ?? '')).join(' | ');
  const step = async (name: string, loc: Locator, what: 'click' | 'dblclick' = 'click') => {
    if (!await loc.count()) { steps.push({ step: name + ' (not found)', ms: 0 }); return; }
    const before = (await perf<Long[]>(page, 'long')).length;
    const ms = await timed(loc.first(), what);
    await page.waitForTimeout(400);
    const long = await longSince(before);
    steps.push({ step: name, ms: Math.round(ms), ...(long ? { long } : {}) });
    if (name === 'view Duplicates') {
      note(g, 'duplicateGroups', await page.locator('.grp').count());
      for (let i = 0; i < 4; i++) { await page.locator('#dupes').evaluate(el => { el.scrollTop = el.scrollHeight; }); await page.waitForTimeout(300); }
      note(g, 'duplicateGroupsAfterScroll', await page.locator('.grp').count());
    }
  };
  const side = (text: string) => page.locator('.lside .item', { hasText: text }).first();
  for (const name of ['All tracks', 'Recently added', 'Lower quality', 'Not analysed yet', 'No file linked', 'Duplicates', 'All tracks']) await step('view ' + name, side(name));
  // Every folder and playlist in the tree, opening folders as they come (up to 60).
  const seen = new Set<string>();
  for (let round = 0; round < 60; round++) {
    const items = page.locator('.lside .tree .item[data-drop="list"]');
    let next: Locator | null = null, label = '';
    for (let i = 0; i < await items.count(); i++) {
      const it = items.nth(i), id = await it.getAttribute('data-id') ?? '';
      if (!seen.has(id)) { seen.add(id); next = it; label = ((await it.locator('.name').textContent()) ?? '').trim() + ' (' + ((await it.locator('.n').textContent().catch(() => '')) ?? '').trim() + ')'; break; }
    }
    if (!next) break;
    await step('list ' + label, next.locator('.name'));
  }
  const tags = page.locator('.lside .taglist .item');
  for (let i = 0; i < Math.min(5, await tags.count()); i++) await step('tag ' + ((await tags.nth(i).textContent()) ?? '').trim().slice(0, 30), tags.nth(i));
  await step('view All tracks', side('All tracks'));
  const heads = page.locator('.thead .th .sortb');
  for (let i = 0; i < await heads.count(); i++) {
    const b = heads.nth(i), title = (await b.getAttribute('title')) ?? '';
    if (title.startsWith('Sort by')) await step('sort ' + title.slice(8).split(' ·')[0], b);
  }
  const search = page.getByRole('searchbox', { name: 'Search tracks' });
  for (const q of ['a', 'am', 'ama', 'house']) {
    const before = (await perf<Long[]>(page, 'long')).length;
    const ms = await search.evaluate(async (el, v) => { const input = el as HTMLInputElement, t0 = performance.now(); input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); await (window as unknown as { __gluePerf: { afterPaint(): Promise<number> } }).__gluePerf.afterPaint(); return performance.now() - t0; }, q);
    const long = await longSince(before);
    steps.push({ step: 'search "' + q + '"', ms: Math.round(ms), ...(long ? { long } : {}) });
  }
  await search.fill('');
  await step('open a track page', page.locator('.tr .c-title').first(), 'dblclick');
  await step('Prepare tab', page.locator('#tab-prepare'));
  await step('back to the library', page.locator('.crumbs a').first());
  await step('open Auto playlist', page.locator('.lside button', { hasText: 'Auto' }).first());
  await step('make the auto playlist', page.locator('form.opts button[type="submit"]').first());
  note(g, 'slowest', [...steps].sort((a, b) => b.ms - a.ms).slice(0, 12));
  note(g, 'steps', steps);
  const st = await perf<Record<string, Stat>>(page, 'stats');
  note(g, 'stats', Object.fromEntries(Object.entries(st).filter(([k]) => !k.startsWith('input:')).map(([k, v]) => [k, { n: v.n, avg: Math.round(v.total / v.n), max: Math.round(v.max) }])));
});

/* Background analysis of real audio (ADR 0060): six 3-minute songs (MP3, FLAC, AAC) analysed while
   the page is watched. Decoding in the worker must leave the page's frames alone. Needs ffmpeg. */
test('background analysis of real songs: the page stays smooth', async ({ page }) => {
  test.setTimeout(600_000);
  const ff = process.env.FFMPEG || 'ffmpeg';
  try { execFileSync(ff, ['-version'], { stdio: 'ignore' }); } catch { test.skip(true, 'needs ffmpeg'); }
  const dir = mkdtempSync(join(tmpdir(), 'glue-perf-songs-'));
  const songs: { n: string; b: string }[] = [];
  for (const [i, [ext, args]] of ([['mp3', ['-b:a', '320k']], ['flac', []], ['m4a', ['-c:a', 'aac', '-b:a', '256k']], ['mp3', ['-b:a', '192k']], ['flac', []], ['m4a', ['-c:a', 'aac', '-b:a', '192k']]] as [string, string[]][]).entries()) {
    const p = join(dir, `song ${i + 1}.${ext}`);
    execFileSync(ff, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `anoisesrc=d=180:c=pink:a=0.2:seed=${i + 1}`, '-f', 'lavfi', '-i', `sine=f=${200 + i * 40}:d=180`, '-filter_complex', 'amix=inputs=2,aformat=channel_layouts=stereo', '-ar', '44100', ...args, p]);
    songs.push({ n: `song ${i + 1}.${ext}`, b: readFileSync(p).toString('base64') });
  }
  await page.goto('./?perf#/analyze');
  await page.evaluate(async songs => {
    const root = await navigator.storage.getDirectory();
    for (const name of ['MCO', 'Music', 'cache']) await root.removeEntry(name, { recursive: true }).catch(() => {});
    await new Promise(r => { const q = indexedDB.deleteDatabase('mco'); q.onsuccess = q.onerror = r; });
    const d = await (await root.getDirectoryHandle('Music', { create: true })).getDirectoryHandle('Sets', { create: true });
    for (const s of songs) { const w = await (await d.getFileHandle(s.n, { create: true })).createWritable(); await w.write(Uint8Array.from(atob(s.b), c => c.charCodeAt(0))); await w.close(); }
  }, songs);
  await page.goto('./?perf#/');
  await page.reload();
  await page.click('#choose-home');
  await page.fill('#profile-name', 'Perf');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.click('#onb-skip');
  await perf(page, 'reset');
  await page.click('#add-folder');
  await expect(page.locator('.an')).toContainText('All analysed', { timeout: 300_000 });
  const s = await perf<Summary>(page, 'summary'), st = await perf<Record<string, Stat>>(page, 'stats');
  const g = 'background analysis';
  check(g, 'over50', s.over50, 0);
  note(g, 'gapMax', Math.round(s.gapMax));
  note(g, 'longFrames', s.longFrames);
  note(g, 'spans', Object.fromEntries(Object.entries(st).filter(([k]) => k.startsWith('analysis.')).map(([k, v]) => [k, { n: v.n, avg: Math.round(v.total / v.n), max: Math.round(v.max) }])));
});
