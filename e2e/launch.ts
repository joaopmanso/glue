/* The test browsers: a persistent Edge profile (the app keeps folder handles in it), with no GPU process,
   whose pages see two cores, so each one analyses with one worker. Several tests then run side by side without thrashing
   (a 9 s test took 118 s with six tests of four workers each on a 12-core laptop, 2026-09-29). */
import { chromium, type BrowserContext } from '@playwright/test';

type Opts = NonNullable<Parameters<typeof chromium.launchPersistentContext>[1]>;
export async function launch(dir: string, opts: Opts, guide = false): Promise<BrowserContext> {
  // No GPU process: headless Edge renders in software there, a core per browser (about a fifth of a
  // test's time with four at once, measured 2026-09-29).
  // Dark, as the laptop is (the themes follow the system): the same on CI's light-mode runner.
  const ctx = await chromium.launchPersistentContext(dir, { colorScheme: 'dark', ...opts, args: [...(opts.args ?? []), '--disable-gpu', '--disable-gpu-compositing'] });
  await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 2, configurable: true }); });
  // Gluey's first tour (ADR 0126) waits for a test that asks for it (`guide: true`): every other test would meet it.
  if (!guide) await ctx.addInitScript(() => { (window as unknown as { __glueNoGuide: boolean }).__glueNoGuide = true; });
  return ctx;
}
