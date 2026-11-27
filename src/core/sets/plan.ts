/* Planning a set (ADR 0200): each hand-over on the beat, on a phrase, in the set's style. Pure.
   - Phrases are 16 bars from a song's first downbeat.
   - Drops (ADR 0205): where a song's bassline comes in, read from its waveform's lows (a kick alone falls away between
     the beats, a bassline holds), else where its loudness comes up. The incoming song comes in so that its first drop
     lands where the bass changes hands (a bass swap's middle; a cut goes straight to it); when its intro is shorter,
     from its first downbeat, the bass changing hands on its drop. So the outgoing song never plays on without its bass
     while the incoming one is still in its intro.
   - The outgoing song's mix-out is the last phrase that leaves room for the hand-over before its outro (where its
     loudness falls for good, from the sound profile) or its end.
   - One at a time: an 8-bar blend. Continuous: a 32-bar bass swap (16 when the songs are short). Double drops: the
     incoming song's first drop lands on one of the outgoing song's drops, both at full from there (when the tempos
     are within 6 % and the keys fit), else a bass swap. Tempos more than 8 % apart: a cut on the phrase.
   - Every song is trimmed towards the set's middle loudness (±6 dB).
   - A length asked for (ADR 0202): every song plays the same share of what it would (at least 40 %), the largest that
     fits; when even that is too long, songs come off the end.
   - 3 decks (ADR 0202): two songs that sound alike (and whose tempos and keys fit) are layered: the next comes in early
     and plays along for 48 bars, and the one after it comes in before the first goes, three at once for 16 bars. */
import type { Key } from '../types';
import { keyFit } from '../library/autoplaylist';
import type { FxStyle, SetItem, SetPlan, SetStyle } from './types';
import { moveSong } from './edit';
import { tempoOf } from './tempo';

export interface PlanSong {
  id: string; bpm: number; beat0: number; bar: number; duration: number;
  /** Loudness every `step` s (sound profile), for outros and drops. */
  curve?: number[] | null; step?: number; lufs?: number | null; key?: Key | null; guessed?: boolean;
  /** Its waveform's lows (0–255, the Prepare waveform's curve) at `rate` points a second, for its drops. */
  low?: { data: ArrayLike<number>; rate: number } | null;
}
export interface PlanOptions {
  style: SetStyle; decks: 2 | 3; tempo: SetPlan['tempo']; keyLock: boolean;
  /** The set's length asked for (s); null or absent: as long as the songs make it. */
  length?: number | null;
  /** How alike two songs sound, 0 … 1 (null: not known): for layering on 3 decks. */
  like?: (a: string, b: string) => number | null;
}
/** Songs at least this alike are layered on 3 decks. */
export const LAYER_LIKE = 0.72;
/** The shortest share of a song a length may ask for. */
const MIN_SHARE = 0.4;

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
/** Each bar's bassline, from the first downbeat, 0 … 1 of the song's: the bar's 30th percentile of the lows' level. A
    kick alone falls away between the beats; a bassline holds the lows up. null: no waveform. */
export function bassBars(s: PlanSong): number[] | null {
  const w = s.low;
  if (!w?.data.length) return null;
  const f0 = firstDown(s), bar = barOf(s), n = Math.floor((s.duration - f0) / bar), out: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, Math.floor((f0 + k * bar) * w.rate)), b = Math.min(w.data.length, Math.floor((f0 + (k + 1) * bar) * w.rate));
    const v: number[] = [];
    // Back from the waveform's curve (255 · x^0.75) to a level.
    for (let i = a; i < b; i++) v.push(Math.pow(w.data[i] / 255, 4 / 3));
    v.sort((x, y) => x - y);
    out.push(v.length ? v[Math.floor(v.length * 0.3)] : 0);
  }
  const top = [...out].sort((x, y) => x - y)[Math.floor(out.length * 0.85)] ?? 0;
  return top > 0 ? out.map(x => x / top) : null;
}
/** A bar with its bassline: at least this share of the song's. */
const BASS_ON = 0.45;
/** Bars (from the first downbeat) where the bassline comes in and holds (3 of the next 4 bars), after at least 4 bars
    mostly without it (or the song's start: bar 0). */
function bassIns(on: boolean[]): number[] {
  const out: number[] = [], has = (k: number) => k >= 0 && k < on.length && on[k];
  for (let k = 0; k + 3 < on.length; k++) {
    if (!on[k] || [k, k + 1, k + 2, k + 3].filter(has).length < 3) continue;
    const before = [k - 4, k - 3, k - 2, k - 1].filter(has).length;
    if (k === 0 || (before <= 1 && !has(k - 1))) out.push(k);
  }
  return out;
}
/** Where the song's bass comes in for good, in bars from its first downbeat (0: from the start; null: not known):
    from its lows, else the first bar its loudness holds within 3 dB of its loud level for 8 s. */
export function introOf(s: PlanSong): number | null {
  const bb = bassBars(s);
  if (bb) return bassIns(bb.map(x => x >= BASS_ON))[0] ?? null;
  const c = s.curve, st = s.step ?? 2;
  if (!c?.length) return null;
  const loud = loudLevel(c), hold = Math.max(1, Math.round(8 / st));
  for (let i = 0; i + hold <= c.length; i++) {
    let all = true;
    for (let j = i; j < i + hold; j++) if (c[j] < loud - 3) { all = false; break; }
    if (all) return Math.max(0, Math.round((i * st - firstDown(s)) / barOf(s)));
  }
  return null;
}
/** Drops (s, on bar lines): where the bassline comes back after a breakdown (from the lows); else loudness rising
    6 dB within ~6 s to near the song's loud level. */
export function dropsOf(s: PlanSong): number[] {
  const bb = bassBars(s);
  if (bb) return bassIns(bb.map(x => x >= BASS_ON)).filter(k => k > 0).map(k => barAt(s, k));
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

/** The plan for these songs, each playing `share` (0 … 1) of what it would between its shortest and its usual. */
function planOnce(songs: PlanSong[], o: PlanOptions, share: number, at: string): SetPlan {
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
        if (kB <= 64 && fits.length) {
          // The latest that fits, or for a shorter share, the one nearest it.
          const want = minOut + (fits[fits.length - 1] - kB - minOut) * share;
          const n = share >= 1 ? fits[fits.length - 1] : fits.reduce((a, b) => Math.abs(b - kB - want) < Math.abs(a - kB - want) ? b : a);
          x = n - kB; bars = kB + 16; fx = 'double'; drop = kB * 4;
        }
      }
    }
    // Where B comes in: so its first drop lands where the bass changes hands (see the top).
    let inB = 0, swap: number | undefined;
    if (x < 0) {
      // The last phrase leaving room for the hand-over before the outro (or the end); shorter blends for short songs.
      for (const len of bars ? [bars, 16, 8, 4] : [0]) {
        const room = Math.min(barBefore(A, outroOf(A)) + len / 2, lastBar) - len;
        let n = Math.floor((room - inBar) / PHRASE) * PHRASE + inBar;
        if (n < minOut) n = Math.floor(room / 4) * 4;
        if (n >= minOut || len <= 4) {
          x = Math.max(inBar + 4, n);
          // A shorter share: an earlier phrase, no sooner than the song's shortest.
          if (share < 1 && x > minOut) x = Math.max(minOut, inBar + Math.floor((x - inBar) * share / PHRASE) * PHRASE, Math.min(x, inBar + 4));
          bars = len; break;
        }
      }
      const k = introOf(B);
      if (k != null && k > 0 && k <= 64) {
        // How far into the hand-over the bass changes hands: a bass swap's middle, a blend's end, straight in on a cut.
        const pre = fx === 'bassSwap' ? Math.round(bars / 2) : fx === 'blend' ? bars : 0;
        inB = Math.max(0, k - pre);
        if (fx === 'bassSwap') swap = (k - inB) * 4;
      }
    }
    item.beats = (x - inBar) * 4 + bars * 4;
    item.fx = { style: fx, ...(drop != null ? { drop } : {}), ...(swap != null ? { swap } : {}) };
    items.push(item);
    start += (x - inBar) * 4;
    inAt = barAt(B, inB); inBars = bars;
  }
  const plan: SetPlan = { v: 1, decks: o.decks, style: o.style, tempo: o.tempo, items, at, ...(o.length ? { length: o.length } : {}) };
  return o.decks === 3 ? layered(plan, songs, o) : plan;
}

/** 3 decks: each pair that sounds alike layered (see the top). Moves are whole bars, kept to a set that holds together. */
function layered(plan: SetPlan, songs: PlanSong[], o: PlanOptions): SetPlan {
  const by = new Map(songs.map(s => [s.id, s])), len = (id: string) => by.get(id)?.duration;
  let items = plan.items;
  for (let k = 0; k + 1 < items.length; k++) {
    const a = items[k], b = items[k + 1], A = by.get(a.id), B = by.get(b.id);
    const like = o.like?.(a.id, b.id) ?? null;
    if (!A || !B || like == null || like < LAYER_LIKE || a.fx?.style === 'cut' || a.fx?.style === 'double') continue;
    if (Math.abs(A.bpm - B.bpm) / A.bpm > 0.04 || (keyFit(A.key ?? null, B.key ?? null) ?? 1) < 0.5) continue;
    // Along for 48 bars: the next one in earlier.
    const over = a.start + a.beats - b.start;
    if (over < 192) items = moveSong(items, k + 1, over - 192, len).items;
    // The one after it in before this one goes: three at once for 16 bars.
    const c = items[k + 2], end = items[k].start + items[k].beats;
    if (c && c.start > end - 64) items = moveSong(items, k + 2, end - 64 - c.start, len).items;
    // The bass changes hands 16 bars before the end, or later, on the incoming song's drop when that's later: never the
    // outgoing song without its bass under the incoming one's intro.
    const nb = items[k + 1], over2 = items[k].start + items[k].beats - nb.start, kB = introOf(B);
    const dropAt = kB != null ? (kB - Math.round((nb.in - firstDown(B)) / barOf(B))) * 4 : null;
    const swap = dropAt != null && dropAt > over2 - 64 && dropAt <= over2 - 4 ? dropAt : undefined;
    items = items.map((it, j) => j === k ? { ...it, fx: { style: 'layer' as FxStyle, ...(swap != null ? { swap } : {}) } } : it);
  }
  return { ...plan, items };
}

const lengthOf = (p: SetPlan) => { const l = p.items[p.items.length - 1]; return l ? tempoOf(p).time(l.start + l.beats) : 0; };

/** Plan a set: as long as the songs make it, or as near a length asked for as fits (see the top). */
export function planSet(songs: PlanSong[], o: PlanOptions, at = new Date().toISOString()): SetPlan {
  const full = planOnce(songs, o, 1, at);
  if (!o.length || lengthOf(full) <= o.length) return full;
  for (let n = songs.length; n >= 1; n--) {
    const some = songs.slice(0, n);
    if (lengthOf(planOnce(some, o, MIN_SHARE, at)) > o.length && n > 1) continue;
    // The largest share that fits.
    let lo = MIN_SHARE, hi = 1, best = planOnce(some, o, MIN_SHARE, at);
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2, p = planOnce(some, o, mid, at);
      if (lengthOf(p) <= o.length) { lo = mid; best = p; } else hi = mid;
    }
    const top = planOnce(some, o, 1, at);
    return lengthOf(top) <= o.length ? top : best;
  }
  return full;
}
