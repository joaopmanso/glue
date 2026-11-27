/* Automatic playlists (ADR 0029, 0198): an ordered set from the collection that follows a flow, an energy curve (from
   the sound profile, ADR 0197) and a BPM ramp, mixing harmonically, sounding like the songs it starts from, preferring
   highly rated tracks, with controlled randomness.
   - The songs chosen to start from aren't put first: each goes where the flow fits it (or opens, peaks, closes).
   - A beam search (the best few partial sets kept at each step) instead of filling left to right, so a good song now
     doesn't spoil the next steps.
   Pure: works on plain candidate records; the UI supplies them from the collection. */
import { camelotNum, fifthsPos } from '../audio/keys';
import type { Key } from '../types';
import { centroid, likeness } from './energy';

export interface Candidate {
  id: string;
  bpm: number | null;
  key: Key | null;
  rating: number | null;   // 0–5 (the user's own, else the DJ app's), null = unrated
  genre: string;
  duration: number | null;
  tags?: string[];         // lower-case tag names
  artist?: string;
  energy?: number | null;  // 1–10, relative to the collection (energy.ts)
  timbre?: Float64Array | null;   // z-scored over the collection (energy.ts)
}
export type Harmonic = 'off' | 'prefer' | 'strict';
/** Where a song to start from goes: where it fits the flow best, first, at the peak, last. */
export type SeedRole = 'any' | 'open' | 'peak' | 'close';
export interface AutoOptions {
  count: number;
  startBpm: number | null;       // null: no tempo target
  endBpm: number | null;
  bpmTolerance: number;          // fraction, e.g. 0.04 = ±4 %
  halfDouble: boolean;           // 70 BPM counts as 140
  harmonic: Harmonic;            // strict: only compatible keys; prefer: compatible keys score higher
  useRatings: boolean;           // prefer higher rated tracks
  minRating: number;             // 0 = any
  sameGenre: string | null;      // only this genre (case-insensitive)
  randomness: number;            // 0 = always the best fit … 1 = adventurous
  tags?: string[];               // lower-case: tracks with these tags score higher
  seed: number;                  // RNG seed: the same seed and options give the same playlist
  /** The energy curve (1–10), its points evenly spread over the set; null or empty: no energy target. */
  flow?: number[] | null;
  /** The tempo follows the flow's shape between the start and end BPM (else a straight ramp). */
  bpmFollowsFlow?: boolean;
  /** 0 = varied … 1 = sounding like the songs it starts from and like each other. */
  likeness?: number;
  roles?: Record<string, SeedRole>;
  /** No two songs by the same artist within this many places (0 = allowed). */
  artistGap?: number;
}
export interface Slot {
  id: string; bpmTarget: number | null; energyTarget?: number | null; fixed: boolean;
  keyFit: number | null; bpmFit: number | null; energy?: number | null;
  /** How alike it sounds to the song before (0 … 1). */
  like?: number | null;
}
export interface AutoResult { slots: Slot[]; relaxed: string[]; pool: number }

/** The flows offered (ADR 0198): their points, 1–10. */
export const FLOWS: { id: string; label: string; points: number[] }[] = [
  { id: 'steady', label: 'Steady', points: [6, 6, 6, 6, 6] },
  { id: 'warmup', label: 'Warm-up', points: [2, 3, 4, 5, 6] },
  { id: 'build', label: 'Build to a peak', points: [4, 5, 6, 8, 9] },
  { id: 'peak', label: 'Peak and down', points: [4, 6, 9, 7, 5] },
  { id: 'waves', label: 'Peaks and breathers', points: [5, 8, 5, 8, 5, 9, 6] },
  { id: 'cooldown', label: 'Cool-down', points: [8, 7, 5, 4, 3] },
];
/** The flow at x (0 … 1): smooth between its points. */
export function flowAt(points: number[], x: number): number {
  if (!points.length) return NaN;
  if (points.length === 1) return points[0];
  const p = Math.max(0, Math.min(1, x)) * (points.length - 1), i = Math.min(points.length - 2, Math.floor(p)), t = p - i, s = t * t * (3 - 2 * t);
  return points[i] + (points[i + 1] - points[i]) * s;
}
/** Energy fit 1 (on target) … 0 (3 steps away); negative beyond. */
export function energyFit(e: number | null | undefined, target: number | null | undefined): number | null {
  if (target == null || e == null) return null;
  return 1 - Math.abs(e - target) / 3;
}

/** How well a track's tags match the wanted ones: 1 when it has two of them (or all, if fewer), 0 none. */
export function tagFit(have: string[] | undefined, want: string[] | undefined): number {
  if (!want?.length || !have?.length) return 0;
  let n = 0;
  for (const t of want) if (have.includes(t)) n++;
  return Math.min(1, n / Math.min(2, want.length));
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Camelot position (1–12, A = minor / B = major). */
export const camelot = (k: Key) => ({ n: camelotNum(fifthsPos(k)), minor: k.mode === 'minor' });
/** How well b follows a: 1 same key · 0.9 one step round the wheel · 0.85 relative major/minor · 0.5 energy boost (+2) · 0 clash. */
export function keyFit(a: Key | null, b: Key | null): number | null {
  if (!a || !b) return null;
  const x = camelot(a), y = camelot(b), d = ((y.n - x.n) % 12 + 12) % 12, step = Math.min(d, 12 - d);
  if (x.minor === y.minor) return step === 0 ? 1 : step === 1 ? 0.9 : d === 2 ? 0.5 : 0;
  return step === 0 ? 0.85 : 0;
}
/** Tempo fit 1 (on target) … 0 (at the tolerance edge); negative beyond it. Half / double time optional. */
export function bpmFit(bpm: number | null, target: number | null, tol: number, halfDouble: boolean): number | null {
  if (target == null) return null;
  if (bpm == null) return -1;
  const tries = halfDouble ? [bpm, bpm * 2, bpm / 2] : [bpm];
  const off = Math.min(...tries.map(b => Math.abs(b - target) / target));
  return 1 - off / tol;
}

/** The weights of the score (ADR 0198). */
const W = { bpm: 2, energy: 4, key: 2.5, rating: 3, tags: 3, toSeeds: 3, toPrev: 1.5, artist: 4, jump: 1 };
/** Partial sets kept at each step, and songs looked at per step. */
const BEAM = 8, SHORT = 48;

/** The targets of each slot: energy from the flow, BPM along the ramp (or the flow's shape). */
export function targetsOf(n: number, o: AutoOptions): { energy: (number | null)[]; bpm: (number | null)[] } {
  const flow = o.flow?.length ? o.flow : null, x = (i: number) => n === 1 ? 0 : i / (n - 1);
  const energy = Array.from({ length: n }, (_, i) => flow ? flowAt(flow, x(i)) : null);
  const lo = flow ? Math.min(...flow) : 0, hi = flow ? Math.max(...flow) : 0;
  const shape = (i: number) => flow && o.bpmFollowsFlow && hi > lo ? (flowAt(flow, x(i)) - lo) / (hi - lo) : x(i);
  const bpm = Array.from({ length: n }, (_, i) => o.startBpm == null ? null : o.endBpm == null || n === 1 ? o.startBpm : o.startBpm + (o.endBpm - o.startBpm) * shape(i));
  return { energy, bpm };
}

interface Beam { ids: string[]; score: number }

export function generate(pool: Candidate[], seedId: string | null, include: string[], o: AutoOptions): AutoResult {
  const byId = new Map(pool.map(c => [c.id, c]));
  const n = Math.max(1, Math.min(o.count, pool.length));
  const random = rng(o.seed);
  const relaxed: string[] = [];
  const T = targetsOf(n, o), likeW = o.likeness ?? 0.5, gap = o.artistGap ?? 0;

  // The songs to start from: each where its role puts it, or where the flow and the tempo fit it best.
  const fixed = new Array<string | null>(n).fill(null);
  const seeds = [seedId, ...include].filter((id, i, a): id is string => !!id && byId.has(id) && a.indexOf(id) === i);
  const free = () => fixed.map((x, i) => x ? -1 : i).filter(i => i >= 0);
  for (const id of seeds) {
    const c = byId.get(id)!, role = o.roles?.[id] ?? 'any', f = free();
    if (!f.length) break;
    let at = f[0];
    if (role === 'open') at = f[0];
    else if (role === 'close') at = f[f.length - 1];
    else if (role === 'peak') {
      // The flow's highest point; with no flow, about 70 % of the way through.
      const v = (i: number) => T.energy[i] ?? -Math.abs(i - Math.round((n - 1) * 0.7));
      at = f.reduce((best, i) => v(i) > v(best) ? i : best, f[0]);
    }
    else {
      const hasTargets = T.energy[0] != null || T.bpm[0] != null;
      if (!hasTargets) at = id === seedId ? f[0] : f.reduce((b, i) => Math.abs(i - n / 2) < Math.abs(b - n / 2) ? i : b, f[0]);
      else {
        let best = -Infinity;
        for (const i of f) {
          const s = (energyFit(c.energy, T.energy[i]) ?? 0) * 1.5 + (bpmFit(c.bpm, T.bpm[i], o.bpmTolerance, o.halfDouble) ?? 0) - Math.abs(i - n / 2) * 1e-3;
          if (s > best) { best = s; at = i; }
        }
      }
    }
    fixed[at] = id;
  }
  const fixedSet = new Set(fixed.filter((x): x is string => !!x));
  const sound = centroid(seeds.map(id => byId.get(id)?.timbre));

  const passes = (c: Candidate, tol: number, target: number | null) => {
    if (fixedSet.has(c.id)) return false;
    if (o.minRating && (c.rating ?? 0) < o.minRating) return false;
    if (o.sameGenre && c.genre.trim().toLowerCase() !== o.sameGenre.trim().toLowerCase()) return false;
    const bf = bpmFit(c.bpm, target, tol, o.halfDouble);
    return !(bf != null && bf < 0);
  };
  /** What a song is worth in slot i, whatever comes before it. */
  const base = (c: Candidate, i: number, tol: number) => {
    let s = W.bpm * (bpmFit(c.bpm, T.bpm[i], tol, o.halfDouble) ?? 0.5);
    if (T.energy[i] != null) s += W.energy * (energyFit(c.energy, T.energy[i]) ?? 0.4);
    if (o.useRatings) s += W.rating * ((c.rating ?? 2) / 5);
    s += W.tags * tagFit(c.tags, o.tags);
    if (sound) s += W.toSeeds * likeW * (likeness(c.timbre, sound) ?? 0.5);
    return s;
  };
  /** What it's worth after the songs so far (and before the next fixed one): keys, sound, artist, the energy step. */
  const link = (ids: string[], c: Candidate, i: number) => {
    const prev = ids.length ? byId.get(ids[ids.length - 1])! : null, next = fixed[i + 1] ? byId.get(fixed[i + 1]!)! : null;
    let s = 0;
    if (o.harmonic !== 'off') {
      const k1 = prev ? keyFit(prev.key, c.key) : null, k2 = next ? keyFit(c.key, next.key) : null;
      s += W.key * ((k1 ?? 0.3) + (next ? (k2 ?? 0.3) : 0)) / (next ? 2 : 1);
    }
    if (prev) s += W.toPrev * (0.3 + likeW) * (likeness(prev.timbre, c.timbre) ?? 0.5);
    if (gap && c.artist) {
      const a = c.artist.trim().toLowerCase();
      for (let j = Math.max(0, ids.length - gap); j < ids.length; j++) if (byId.get(ids[j])?.artist?.trim().toLowerCase() === a) { s -= W.artist; break; }
    }
    if (prev && prev.energy != null && c.energy != null) {
      const want = T.energy[i] != null && T.energy[i - 1] != null ? Math.abs(T.energy[i]! - T.energy[i - 1]!) : 0;
      const over = Math.abs(c.energy - prev.energy) - want - 1.5;
      if (over > 0) s -= W.jump * over;
    }
    return s;
  };
  const strictOk = (ids: string[], c: Candidate, i: number) => {
    const prev = ids.length ? byId.get(ids[ids.length - 1])! : null, next = fixed[i + 1] ? byId.get(fixed[i + 1]!)! : null;
    const kf = prev ? keyFit(prev.key, c.key) : null, kn = next ? keyFit(c.key, next.key) : null;
    return !((prev && (kf == null || kf < 0.5)) || (next && (kn == null || kn < 0.5)));
  };
  // Randomness: among each partial set's best few, weighted towards the top (Gumbel noise: a softmax draw).
  const temp = 0.15 + o.randomness * 1.5, gumbel = () => -Math.log(-Math.log(random() * 0.999999 + 1e-7));

  let beams: Beam[] = [{ ids: [], score: 0 }];
  for (let i = 0; i < n; i++) {
    if (fixed[i]) {
      const c = byId.get(fixed[i]!)!;
      beams = beams.map(b => ({ ids: [...b.ids, c.id], score: b.score + link(b.ids, c, i) }));
      continue;
    }
    // Widen the rules step by step when nothing fits, and say so.
    const tries: [number, boolean, string | null][] = [
      [o.bpmTolerance, o.harmonic === 'strict', null],
      [o.bpmTolerance * 2, o.harmonic === 'strict', 'wider tempo range'],
      [o.bpmTolerance * 2, false, o.harmonic === 'strict' ? 'some key changes outside the harmonic rules' : null],
      [Infinity, false, 'tempo not matched'],
    ];
    let next: Beam[] = [];
    for (const [tol, strict, note] of tries) {
      const t = Number.isFinite(tol) ? tol : 1;
      const short = pool.filter(c => passes(c, tol, T.bpm[i])).map(c => ({ c, s: base(c, i, t) })).sort((a, b) => b.s - a.s).slice(0, SHORT + i);
      for (const b of beams) {
        const opts = short.filter(x => !b.ids.includes(x.c.id) && (!strict || strictOk(b.ids, x.c, i))).map(x => ({ c: x.c, s: x.s + link(b.ids, x.c, i) })).sort((a, z) => z.s - a.s);
        const k = Math.max(1, Math.round(1 + o.randomness * Math.min(12, opts.length - 1)));
        for (const x of opts.slice(0, k)) next.push({ ids: [...b.ids, x.c.id], score: b.score + x.s + temp * gumbel() });
      }
      if (!next.length) continue;
      if (note && !relaxed.includes(note)) relaxed.push(note);
      break;
    }
    if (!next.length) break;
    // Keep the best few, each a different set.
    next.sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    beams = [];
    for (const b of next) { const key = b.ids.join(','); if (seen.has(key)) continue; seen.add(key); beams.push(b); if (beams.length >= BEAM) break; }
  }

  const ids = beams.reduce((a, b) => b.score > a.score ? b : a, beams[0]).ids;
  if (ids.length < o.count && pool.length < o.count) relaxed.push('the collection has only ' + pool.length + ' matching tracks');
  const out: Slot[] = ids.map((id, i) => {
    const c = byId.get(id)!, p = i ? byId.get(ids[i - 1])! : null;
    return {
      id, bpmTarget: T.bpm[i] ?? null, energyTarget: T.energy[i] ?? null, fixed: fixedSet.has(id),
      keyFit: p ? keyFit(p.key, c.key) : null, bpmFit: bpmFit(c.bpm, T.bpm[i] ?? null, o.bpmTolerance, o.halfDouble),
      energy: c.energy ?? null, like: p ? likeness(p.timbre, c.timbre) : null,
    };
  });
  return { slots: out, relaxed, pool: pool.length };
}

/** Another track for one slot (a re-roll), keeping its neighbours. */
export function replaceSlot(pool: Candidate[], current: string[], index: number, o: AutoOptions, targetBpm: number | null, targetEnergy: number | null = null): string | null {
  const byId = new Map(pool.map(c => [c.id, c])), used = new Set(current);
  const prev = index > 0 ? byId.get(current[index - 1]) ?? null : null, next = byId.get(current[index + 1]) ?? null;
  const random = rng(o.seed + index * 7919 + current.length), likeW = o.likeness ?? 0.5;
  const ok = pool.filter(c => !used.has(c.id) && (!o.minRating || (c.rating ?? 0) >= o.minRating) && (bpmFit(c.bpm, targetBpm, o.bpmTolerance * 1.5, o.halfDouble) ?? 1) >= 0
    && (!o.sameGenre || c.genre.toLowerCase() === o.sameGenre.toLowerCase()));
  if (!ok.length) return null;
  const s = (c: Candidate) => (bpmFit(c.bpm, targetBpm, o.bpmTolerance * 1.5, o.halfDouble) ?? 0.5) * W.bpm
    + (targetEnergy != null ? W.energy * (energyFit(c.energy, targetEnergy) ?? 0.4) : 0)
    + (o.harmonic !== 'off' ? W.key * (((prev ? keyFit(prev.key, c.key) : 0.5) ?? 0.3) + ((next ? keyFit(c.key, next.key) : 0.5) ?? 0.3)) / 2 : 0)
    + (o.useRatings ? W.rating * ((c.rating ?? 2) / 5) : 0) + W.tags * tagFit(c.tags, o.tags)
    + W.toPrev * (0.3 + likeW) * (((prev ? likeness(prev.timbre, c.timbre) : null) ?? 0.5) + ((next ? likeness(c.timbre, next.timbre) : null) ?? 0.5)) / 2;
  const top = ok.map(c => ({ c, v: s(c) + random() * (0.6 + o.randomness) })).sort((a, b) => b.v - a.v);
  return top[0].c.id;
}
