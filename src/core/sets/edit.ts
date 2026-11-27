/* Shaping a set by hand (ADR 0201): a song moved along the mix, its in-point trimmed, its end moved; always by whole
   bars, and only into a set that still holds together (`valid`). Each edit asked for more than fits is clamped to
   the nearest bar that does. Pure. */
import type { LowSpan, SetItem, SetPlan } from './types';

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

/** Songs `which` (more than one chosen) moved together by `beats`, the others where they are. */
export function moveSongs(items: SetItem[], which: number[], beats: number, len: Lengths) {
  const on = new Set(which.filter(i => i > 0 && i < items.length));
  if (!on.size) return { items, d: 0 };
  return clamped(items, beats, d => items.map((it, j) => on.has(j) ? { ...it, start: it.start + d } : it), len);
}

/** Song i's in-point moved by `beats`: it comes in that much later, from that much later in its file (its end stays).
    What's counted from its start stays where it plays: its bass cut or opened by hand, and where the bass changes
    hands and the drops land in its incoming hand-over. */
export function trimIn(items: SetItem[], i: number, beats: number, len: Lengths) {
  return clamped(items, beats, d => items.map((it, j) => {
    if (j === i) return withLows({ ...it, start: it.start + d, in: it.in + d * 60 / it.bpm, beats: it.beats - d }, shift(it.lows, -d, it.beats - d));
    if (j === i - 1 && it.fx && (it.fx.swap != null || it.fx.drop != null)) {
      const fx = { ...it.fx };
      if (fx.swap != null) fx.swap = Math.max(0, fx.swap - d);
      if (fx.drop != null) fx.drop = Math.max(0, fx.drop - d);
      return { ...it, fx };
    }
    return it;
  }), len);
}

/** Song i's end moved by `beats`: it plays longer or shorter (its hand-over into the next one with it). */
export function moveEnd(items: SetItem[], i: number, beats: number, len: Lengths) {
  return clamped(items, beats, d => items.map((it, j) => j === i ? withLows({ ...it, beats: it.beats + d }, shift(it.lows, 0, it.beats + d)) : it), len);
}

/** Spans moved by `d` beats and kept inside [0, span). */
function shift(lows: LowSpan[] | undefined, d: number, span: number): LowSpan[] | undefined {
  return lows?.map(r => ({ ...r, from: Math.max(0, r.from + d), to: Math.min(span, r.to + d) })).filter(r => r.to > r.from);
}
function withLows(it: SetItem, lows: LowSpan[] | undefined): SetItem {
  const { lows: _, ...rest } = it;
  void _;
  return lows?.length ? { ...rest, lows } : rest;
}

/** Song i's bass cut (`on` false) or opened over beats [from, to) of its span, in whole bars, over any span there. */
export function setLows(items: SetItem[], i: number, from: number, to: number, on: boolean): SetItem[] {
  const it = items[i];
  if (!it) return items;
  const a = Math.max(0, Math.round(Math.min(from, to) / 4) * 4), b = Math.min(it.beats, Math.round(Math.max(from, to) / 4) * 4);
  if (b <= a) return items;
  const rest = (it.lows ?? []).flatMap(r => [{ ...r, to: Math.min(r.to, a) }, { ...r, from: Math.max(r.from, b) }]).filter(r => r.to > r.from);
  const all = [...rest, { from: a, to: b, on }].sort((x, y) => x.from - y.from);
  // Neighbours that touch and agree, as one.
  const out: LowSpan[] = [];
  for (const r of all) { const l = out[out.length - 1]; if (l && l.to === r.from && l.on === r.on) l.to = r.to; else out.push({ ...r }); }
  return items.map((x, j) => j === i ? withLows(x, out) : x);
}

/** Song i's spans by hand let go (one, or all). */
export function clearLows(items: SetItem[], i: number, k?: number): SetItem[] {
  return items.map((x, j) => j === i ? withLows(x, k == null ? undefined : x.lows?.filter((_, n) => n !== k)) : x);
}

/** The plan with these items, marked edited. */
export const edited = (plan: SetPlan, items: SetItem[]): SetPlan => ({ ...plan, items, edited: true });

/** Songs a … b of the set as a set of their own (for exporting a part of it): the first comes in alone, from its
    in-point, at beat 0, and the last plays to its end; everything between is as it is. */
export function part(plan: SetPlan, a: number, b: number): SetPlan {
  const lo = Math.max(0, Math.min(a, b)), hi = Math.min(plan.items.length - 1, Math.max(a, b));
  if (lo === 0 && hi === plan.items.length - 1) return plan;
  const s0 = plan.items[lo]?.start ?? 0;
  const items = plan.items.slice(lo, hi + 1).map(it => ({ ...it, start: it.start - s0 }));
  const { length: _, ...rest } = plan;
  void _;
  return { ...rest, items };
}
