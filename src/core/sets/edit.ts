/* Shaping a set by hand (ADR 0201): a song moved along the mix, its in-point trimmed, its end moved; always by whole
   bars, and only into a set that still holds together (`valid`). Each edit asked for more than fits is clamped to
   the nearest bar that does. Pure. */
import type { SetItem, SetPlan } from './types';

/** Songs' lengths (s), for the checks. */
export type Lengths = (id: string) => number | undefined;

const end = (it: SetItem) => it.start + it.beats;

/** Whether a set's songs hold together:
    - each plays at least a bar, from a downbeat inside its file, and stops before the file does;
    - each comes in at least a bar after the one before it, while that one still plays (no silence between);
    - each outlasts the one before it;
    - songs on one deck don't overlap. */
export function valid(items: SetItem[], len: Lengths): boolean {
  for (let i = 0; i < items.length; i++) {
    const it = items[i], d = len(it.id);
    if (it.beats < 4 || it.in < -1e-6) return false;
    if (d != null && it.in + it.beats * 60 / it.bpm > d + 0.05) return false;
    const p = items[i - 1];
    if (p && (it.start < p.start + 4 || it.start > end(p) || end(it) <= end(p))) return false;
    for (let j = 0; j < i; j++) if (items[j].deck === it.deck && end(items[j]) > it.start) return false;
  }
  return true;
}

/** The nearest whole-bar change to `want` beats (towards 0) that `f` turns into a set that holds together. */
function clamped(items: SetItem[], want: number, f: (d: number) => SetItem[], len: Lengths): { items: SetItem[]; d: number } {
  const step = want > 0 ? -4 : 4;
  for (let d = Math.round(want / 4) * 4; d !== 0; d += step) { const n = f(d); if (valid(n, len)) return { items: n, d }; }
  return { items, d: 0 };
}

/** Song i and every song after it moved by `beats` (a whole number of bars): it comes in earlier or later in the one
    before it, which plays on as it did (its hand-over longer or shorter). */
export function moveSong(items: SetItem[], i: number, beats: number, len: Lengths) {
  if (i <= 0 || i >= items.length) return { items, d: 0 };
  return clamped(items, beats, d => items.map((it, j) => j >= i ? { ...it, start: it.start + d } : it), len);
}

/** Song i's in-point moved by `beats`: it comes in that much later, from that much later in its file (its end stays). */
export function trimIn(items: SetItem[], i: number, beats: number, len: Lengths) {
  return clamped(items, beats, d => items.map((it, j) => j === i ? { ...it, start: it.start + d, in: it.in + d * 60 / it.bpm, beats: it.beats - d } : it), len);
}

/** Song i's end moved by `beats`: it plays longer or shorter (its hand-over into the next one with it). */
export function moveEnd(items: SetItem[], i: number, beats: number, len: Lengths) {
  return clamped(items, beats, d => items.map((it, j) => j === i ? { ...it, beats: it.beats + d } : it), len);
}

/** The plan with these items, marked edited. */
export const edited = (plan: SetPlan, items: SetItem[]): SetPlan => ({ ...plan, items, edited: true });
