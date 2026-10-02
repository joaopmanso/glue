/* The native engine checked against this computer's analyses (ADR 0147): a random sample of the shared songs GLUE
   Home analysed, each analysed again in Rust (nothing saved, `verify_song`) and compared with what the service page
   made of it. Each song's outcome is added to GLUE Home's cache, `x/verify.jsonl`; the settings window shows the tally. */
import { invoke } from '@tauri-apps/api/core';
import type { HomeConfig } from './bridge';
import { bridge } from './bridge';
import { describe, shared, trackPath } from './library';

const HEX = '0123456789abcdef';

/** One song's outcome (home/src-tauri/src/analysis.rs `verify`). */
export interface Checked { kind: 'same' | 'close' | 'differs' | 'failed' | 'fixed' | 'skipped'; why?: string; diffs?: string[]; name?: string; ms?: number; readMs?: number; codec?: string }
export interface VerifyState {
  running: boolean; done: number; total: number;
  counts: Partial<Record<Checked['kind'] | 'missing', number>>;
  /** The native analyses' time (ms), and the songs it's over. */
  ms: number; timed: number;
  /** Why songs were skipped, and how many each. */
  skips: Record<string, number>;
  /** The latest that differ or failed, newest first. */
  odd: { name: string; kind: string; why: string }[];
}
export const state: VerifyState = { running: false, done: 0, total: 0, counts: {}, ms: 0, timed: 0, skips: {}, odd: [] };
let stopped = false;
export function stop() { stopped = true; }

/** Check `n` songs (one at a time, so this computer's other work goes on). */
export async function run(cfg: () => HomeConfig | null, n: number, report: () => void) {
  const c0 = cfg();
  if (!c0?.glue || state.running) return;
  Object.assign(state, { running: true, done: 0, total: 0, counts: {}, ms: 0, timed: 0, skips: {}, odd: [] });
  stopped = false;
  report();
  try {
    const all: { p: string; c: string; id: string }[] = [];
    const lib = await describe();
    for (const p of lib?.profiles ?? []) for (const col of p.collections) {
      if (!shared(c0, p.id, col.id)) continue;
      for (const a of HEX) for (const b of HEX) for (const f of await bridge.cacheList(`s/${p.id}/${col.id}/${a + b}`)) if (f.endsWith('.json')) all.push({ p: p.id, c: col.id, id: f.slice(0, -5) });
    }
    // A random sample (Fisher–Yates, the first n).
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    const todo = all.slice(0, n);
    state.total = todo.length; report();
    for (const j of todo) {
      if (stopped) break;
      const c = cfg();
      if (!c) break;
      let r: Checked;
      try {
        const f = await trackPath(j.p, j.c, j.id, c);
        r = await invoke<Checked>('verify_song', { path: f.path, p: j.p, c: j.c, id: j.id });
      } catch (e) { r = { kind: 'skipped', why: String((e as Error)?.message ?? e) }; state.counts.missing = (state.counts.missing ?? 0) + 1; }
      state.counts[r.kind] = (state.counts[r.kind] ?? 0) + 1;
      if (r.kind === 'skipped') { const why = /isn’t reachable|couldn’t find|isn’t in/.test(r.why ?? '') ? 'its file isn’t reachable' : r.why ?? '?'; state.skips[why] = (state.skips[why] ?? 0) + 1; }
      if (r.ms && r.kind !== 'skipped') { state.ms += r.ms; state.timed++; }
      if (r.kind === 'differs' || r.kind === 'failed') { state.odd.unshift({ name: r.name ?? j.id, kind: r.kind, why: r.diffs?.join('; ') || r.why || '' }); state.odd.length = Math.min(state.odd.length, 20); }
      state.done++;
      if (state.done % 5 === 0 || state.done === state.total) report();
    }
  } finally { state.running = false; report(); }
}
