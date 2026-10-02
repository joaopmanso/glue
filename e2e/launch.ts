/* The test browsers: a persistent Edge profile (the app keeps folder handles in it), with no GPU process,
   whose pages see two cores, so each one analyses with one worker. Several tests then run side by side without thrashing
   (a 9 s test took 118 s with six tests of four workers each on a 12-core laptop, 2026-09-29). */
import { chromium, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/* Kept out of Windows: Edge hands its tabs to Alt+Tab (`msWindowTabManagerPublic`, Windows' WindowTabManager) and its
   pages to the activity history (`msWindowsUserActivities`), headless too. Test runs left "GLUE Home service", "GLUE
   Home" and "GLUE · …" entries in Alt+Tab that did nothing and stayed until Explorer restarted (Edge 153–154,
   2026-10-02). Edge keeps only the last --disable-features, so Playwright's own list is read and carried along. */
const OFF = ['msWindowTabManagerPublic', 'msWindowsUserActivities'];
function playwrightOff(): string[] {
  const src = readFileSync(createRequire(import.meta.url).resolve('playwright-core/lib/coreBundle'), 'utf8');
  const list = /disabledFeatures = \[([\s\S]*?)\]/.exec(src)?.[1];
  if (!list) throw new Error('e2e/launch.ts: Playwright’s disabled features weren’t found (did Playwright change?)');
  return [...list.matchAll(/"(\w+)"/g)].map(m => m[1]);
}
/** Edge's arguments for every test browser (the config's, `launch`'s, the perf test's). */
export const EDGE_ARGS = ['--disable-features=' + [...new Set([...playwrightOff(), ...OFF])].join(',')];

type Opts = NonNullable<Parameters<typeof chromium.launchPersistentContext>[1]>;
export async function launch(dir: string, opts: Opts, guide = false): Promise<BrowserContext> {
  // No GPU process: headless Edge renders in software there, a core per browser (about a fifth of a
  // test's time with four at once, measured 2026-09-29).
  // Dark, as the laptop is (the themes follow the system): the same on CI's light-mode runner.
  const ctx = await chromium.launchPersistentContext(dir, { colorScheme: 'dark', ...opts, args: [...(opts.args ?? []), ...EDGE_ARGS, '--disable-gpu', '--disable-gpu-compositing'] });
  await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 2, configurable: true }); });
  // Gluey's first tour (ADR 0126) waits for a test that asks for it (`guide: true`): every other test would meet it.
  if (!guide) await ctx.addInitScript(() => { (window as unknown as { __glueNoGuide: boolean }).__glueNoGuide = true; });
  return ctx;
}
