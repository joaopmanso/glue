/* Timings for the performance budgets (ADR 0058). Off unless src/lib/perf turns it on (?perf, or
   the pref mco.perf = 1); while off, time() just calls through. No DOM: the store uses it too. */

export interface Stat { n: number; total: number; max: number; last: number }

const stats = new Map<string, Stat>();
let enabled = false;
/** Work done since the last animation frame by spans named "draw:…" (summed per frame by src/lib/perf). */
let frameWork = 0;

export const perfOn = () => enabled;
export function enablePerf(on: boolean) { enabled = on; }

export function record(name: string, ms: number) {
  if (!enabled) return;
  const s = stats.get(name);
  if (s) { s.n++; s.total += ms; s.max = Math.max(s.max, ms); s.last = ms; }
  else stats.set(name, { n: 1, total: ms, max: ms, last: ms });
  if (name.startsWith('draw:')) frameWork += ms;
}

/** Times a synchronous piece of work. */
export function time<T>(name: string, fn: () => T): T {
  if (!enabled) return fn();
  const t0 = performance.now();
  try { return fn(); } finally { record(name, performance.now() - t0); }
}

/** Times an asynchronous piece of work, from start to settled (wall clock, not main-thread time). */
export async function timeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!enabled) return fn();
  const t0 = performance.now();
  try { return await fn(); } finally { record(name, performance.now() - t0); }
}

export function perfStats(): Record<string, Stat> { return Object.fromEntries([...stats].map(([k, v]) => [k, { ...v }])); }
export function resetPerf() { stats.clear(); frameWork = 0; }
/** The draw work of the frame that just ended, and start counting the next one. */
export function takeFrameWork() { const w = frameWork; frameWork = 0; return w; }
