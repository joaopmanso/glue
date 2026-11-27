/* Planning a set (ADR 0200): each hand-over on the beat, on a phrase, in the set's style. Pure.
   - Phrases are 16 bars from a song's first downbeat; a song comes in on its first downbeat.
   - The outgoing song's mix-out is the last phrase that leaves room for the hand-over before its outro (where its
     loudness falls for good, from the sound profile) or its end.
   - One at a time: an 8-bar blend. Continuous: a 32-bar bass swap (16 when the songs are short). Double drops: the
     incoming song's first drop lands on one of the outgoing song's drops, both at full from there (when the tempos
     are within 6 % and the keys fit), else a bass swap. Tempos more than 8 % apart: a cut on the phrase.
   - Every song is trimmed towards the set's middle loudness (±6 dB). */
import type { Key } from '../types';
import { keyFit } from '../library/autoplaylist';
import type { FxStyle, SetItem, SetPlan, SetStyle } from './types';

export interface PlanSong {
  id: string; bpm: number; beat0: number; bar: number; duration: number;
  /** Loudness every `step` s (sound profile), for outros and drops. */
  curve?: number[] | null; step?: number; lufs?: number | null; key?: Key | null; guessed?: boolean;
}
export interface PlanOptions { style: SetStyle; decks: 2 | 3; tempo: SetPlan['tempo']; keyLock: boolean }

const PHRASE = 16;
const barOf = (s: PlanSong) => 240 / s.bpm;
/** The song's first bar line (s). */
export const firstDown = (s: PlanSong) => s.beat0 + s.bar * 60 / s.bpm;
/** Bar line n (s). */
const barAt = (s: PlanSong, n: number) => firstDown(s) + n * barOf(s);
/** The bar line at or before t. */
const barBefore = (s: PlanSong, t: number) => Math.floor((t - firstDown(s)) / barOf(s) + 1e-9);

function loudLevel(c: number[]) { const s = [...c].sort((a, b) => a - b); return s[Math.floor(s.length * 0.9)] ?? -20; }
/** Where the outro starts: after the last moment within 6 dB of the song's loud level. */
export function outroOf(s: PlanSong): number {
  const c = s.curve, st = s.step ?? 2;
  if (!c?.length) return s.duration;
  const loud = loudLevel(c);
  for (let i = c.length - 1; i >= 0; i--) if (c[i] >= loud - 6) return Math.min(s.duration, (i + 1) * st);
  return s.duration;
}
/** Drops: loudness rising 6 dB within ~6 s to near the song's loud level, on the nearest bar line (s). */
export function dropsOf(s: PlanSong): number[] {
  const c = s.curve, st = s.step ?? 2, out: number[] = [];
  if (!c?.length) return out;
  const loud = loudLevel(c), back = Math.max(1, Math.round(6 / st));
  for (let i = back; i < c.length; i++) {
    let lo = Infinity;
    for (let j = i - back; j < i; j++) lo = Math.min(lo, c[j]);
    if (c[i] - lo >= 6 && c[i] >= loud - 4) {
      const t = barAt(s, Math.round(((i * st) - firstDown(s)) / barOf(s)));
      if (!out.length || t - out[out.length - 1] > 30) out.push(t);
    }
  }
  return out;
}

const STYLE: Record<SetStyle, { fx: FxStyle; bars: number }> = { single: { fx: 'blend', bars: 8 }, blend: { fx: 'bassSwap', bars: 32 }, double: { fx: 'bassSwap', bars: 32 } };

export function planSet(songs: PlanSong[], o: PlanOptions, at = new Date().toISOString()): SetPlan {
  const items: SetItem[] = [];
  const louds = songs.map(s => s.lufs).filter((x): x is number => x != null).sort((a, b) => a - b);
  const target = louds.length ? louds[Math.floor(louds.length / 2)] : null;
  let start = 0, inAt = songs.length ? firstDown(songs[0]) : 0, inBars = 0;   // the current song's in-point, and its incoming hand-over (bars)
  for (let k = 0; k < songs.length; k++) {
    const A = songs[k], B = songs[k + 1];
    const item: SetItem = { id: A.id, deck: k % o.decks, bpm: A.bpm, beat0: A.beat0, in: inAt, start, beats: 0, keyLock: o.keyLock, ...(A.guessed ? { guessed: true } : {}),
      ...(target != null && A.lufs != null ? { trim: Math.round(Math.max(-6, Math.min(6, target - A.lufs)) * 10) / 10 } : {}) };
    const inBar = barBefore(A, inAt) ;
    if (!B) {
      item.beats = Math.max(4, Math.floor((A.duration - inAt) * A.bpm / 60));
      items.push(item);
      break;
    }
    // At least the incoming hand-over and 16 bars of its own before it hands over.
    const minOut = inBar + inBars + 16;
    const lastBar = Math.floor((A.duration - firstDown(A)) / barOf(A));
    const far = Math.abs(B.bpm - A.bpm) / A.bpm > 0.08;
    let fx: FxStyle = far ? 'cut' : STYLE[o.style].fx, bars = far ? 0 : STYLE[o.style].bars, x = -1, drop: number | undefined;
    const bIn = firstDown(B);
    // Double drops: B's first drop on one of A's (the latest that fits).
    if (o.style === 'double' && !far && Math.abs(B.bpm - A.bpm) / A.bpm <= 0.06 && (keyFit(A.key ?? null, B.key ?? null) ?? 1) >= 0.5) {
      const dB = dropsOf(B).find(t => t > bIn + barOf(B) * 4);
      if (dB != null) {
        const kB = Math.round((dB - bIn) / barOf(B));
        const fits = dropsOf(A).map(t => barBefore(A, t)).filter(n => n - kB >= minOut && n + 16 <= lastBar);
        if (kB <= 64 && fits.length) { const n = fits[fits.length - 1]; x = n - kB; bars = kB + 16; fx = 'double'; drop = kB * 4; }
      }
    }
    if (x < 0) {
      // The last phrase leaving room for the hand-over before the outro (or the end); shorter blends for short songs.
      for (const len of bars ? [bars, 16, 8, 4] : [0]) {
        const room = Math.min(barBefore(A, outroOf(A)) + len / 2, lastBar) - len;
        let n = Math.floor((room - inBar) / PHRASE) * PHRASE + inBar;
        if (n < minOut) n = Math.floor(room / 4) * 4;
        if (n >= minOut || len <= 4) { x = Math.max(inBar + 4, n); bars = len; break; }
      }
    }
    item.beats = (x - inBar) * 4 + bars * 4;
    item.fx = { style: fx, ...(drop != null ? { drop } : {}) };
    items.push(item);
    start += (x - inBar) * 4;
    inAt = bIn; inBars = bars;
  }
  return { v: 1, decks: o.decks, style: o.style, tempo: o.tempo, items, at };
}
