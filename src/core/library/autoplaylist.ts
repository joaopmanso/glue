/* Automatic playlists (ADR 0029): build an ordered set from the collection along a BPM ramp, with
   harmonic transitions, preferring highly rated tracks, with controlled randomness.
   Pure: works on plain candidate records; the UI supplies them from the collection. */
import { camelotNum, fifthsPos } from '../audio/keys';
import type { Key } from '../types';

export interface Candidate {
  id: string;
  bpm: number | null;
  key: Key | null;
  rating: number | null;   // 0–5 (the user's own, else the DJ app's), null = unrated
  genre: string;
  duration: number | null;
  tags?: string[];         // lower-case tag names
}
export type Harmonic = 'off' | 'prefer' | 'strict';
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
}
export interface Slot { id: string; bpmTarget: number | null; fixed: boolean; keyFit: number | null; bpmFit: number | null }
export interface AutoResult { slots: Slot[]; relaxed: string[]; pool: number }

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

export function generate(pool: Candidate[], seedId: string | null, include: string[], o: AutoOptions): AutoResult {
  const byId = new Map(pool.map(c => [c.id, c]));
  const n = Math.max(1, Math.min(o.count, pool.length));
  const random = rng(o.seed);
  const relaxed: string[] = [];
  const targets = Array.from({ length: n }, (_, i) =>
    o.startBpm == null ? null : o.endBpm == null || n === 1 ? o.startBpm : o.startBpm + (o.endBpm - o.startBpm) * i / (n - 1));

  // Fixed slots: the seed first, then each must-include track where its tempo fits the ramp best.
  const fixed = new Array<string | null>(n).fill(null);
  const firstId = seedId && byId.has(seedId) ? seedId : null;
  if (firstId) fixed[0] = firstId;
  for (const id of include) {
    if (!byId.has(id) || fixed.includes(id)) continue;
    const c = byId.get(id)!;
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue;
      const f = bpmFit(c.bpm, targets[i], o.bpmTolerance, o.halfDouble);
      const s = f == null ? -Math.abs(i - n / 2) * 1e-3 : f;
      if (s > bestScore) { bestScore = s; best = i; }
    }
    if (best >= 0) fixed[best] = id;
  }

  const used = new Set(fixed.filter((x): x is string => !!x));
  const passes = (c: Candidate, tol: number, strictKeys: boolean, prev: Candidate | null, target: number | null, next: Candidate | null) => {
    if (used.has(c.id)) return false;
    if (o.minRating && (c.rating ?? 0) < o.minRating) return false;
    if (o.sameGenre && c.genre.trim().toLowerCase() !== o.sameGenre.trim().toLowerCase()) return false;
    const bf = bpmFit(c.bpm, target, tol, o.halfDouble);
    if (bf != null && bf < 0) return false;
    if (strictKeys) {
      const kf = prev ? keyFit(prev.key, c.key) : null, kn = next ? keyFit(c.key, next.key) : null;
      if ((prev && (kf == null || kf < 0.5)) || (next && (kn == null || kn < 0.5))) return false;
    }
    return true;
  };
  const score = (c: Candidate, prev: Candidate | null, next: Candidate | null, target: number | null, tol: number) => {
    const bf = bpmFit(c.bpm, target, tol, o.halfDouble) ?? 0.5;
    let s = 2 * bf;
    if (o.harmonic !== 'off') {
      const k1 = prev ? keyFit(prev.key, c.key) : null, k2 = next ? keyFit(c.key, next.key) : null;
      s += 2.5 * ((k1 ?? 0.3) + (next ? (k2 ?? 0.3) : 0)) / (next ? 2 : 1);
    }
    // Ratings weigh most: among tracks that fit, the highest rated comes first (unrated counts as 2 stars).
    if (o.useRatings) s += 4 * ((c.rating ?? 2) / 5);
    // Tags: sharing the wanted tags counts nearly as much as a good key match.
    s += 3 * tagFit(c.tags, o.tags);
    return s;
  };

  const slots: (string | null)[] = [...fixed];
  for (let i = 0; i < n; i++) {
    if (slots[i]) continue;
    const prev = i > 0 && slots[i - 1] ? byId.get(slots[i - 1]!)! : null;
    const next = i + 1 < n && fixed[i + 1] ? byId.get(fixed[i + 1]!)! : null;
    // Widen the rules step by step when nothing fits, and say so.
    const tries: [number, boolean, string | null][] = [
      [o.bpmTolerance, o.harmonic === 'strict', null],
      [o.bpmTolerance * 2, o.harmonic === 'strict', 'wider tempo range'],
      [o.bpmTolerance * 2, false, o.harmonic === 'strict' ? 'some key changes outside the harmonic rules' : null],
      [Infinity, false, 'tempo not matched'],
    ];
    let chosen: string | null = null;
    for (const [tol, strict, note] of tries) {
      const ok = pool.filter(c => passes(c, tol, strict, prev, targets[i], next));
      if (!ok.length) continue;
      const scored = ok.map(c => ({ c, s: score(c, prev, next, targets[i], Number.isFinite(tol) ? tol : 1) })).sort((a, b) => b.s - a.s);
      // Randomness: pick among the best few, weighted towards the top.
      const k = Math.max(1, Math.round(1 + o.randomness * Math.min(12, scored.length - 1)));
      const top = scored.slice(0, k), temp = 0.15 + o.randomness * 1.5;
      const w = top.map(x => Math.exp((x.s - top[0].s) / temp));
      let r = random() * w.reduce((a, b) => a + b, 0), pick = 0;
      while (pick < top.length - 1 && (r -= w[pick]) > 0) pick++;
      chosen = top[pick].c.id;
      if (note && !relaxed.includes(note)) relaxed.push(note);
      break;
    }
    if (!chosen) break;
    slots[i] = chosen; used.add(chosen);
  }

  const ids = slots.filter((x): x is string => !!x);
  if (ids.length < o.count && pool.length < o.count) relaxed.push('the collection has only ' + pool.length + ' matching tracks');
  const out: Slot[] = ids.map((id, i) => {
    const c = byId.get(id)!, p = i ? byId.get(ids[i - 1])! : null;
    return { id, bpmTarget: targets[i] ?? null, fixed: fixed.includes(id), keyFit: p ? keyFit(p.key, c.key) : null, bpmFit: bpmFit(c.bpm, targets[i] ?? null, o.bpmTolerance, o.halfDouble) };
  });
  return { slots: out, relaxed, pool: pool.length };
}

/** Another track for one slot (a re-roll), keeping its neighbours. */
export function replaceSlot(pool: Candidate[], current: string[], index: number, o: AutoOptions, targetBpm: number | null): string | null {
  const byId = new Map(pool.map(c => [c.id, c])), used = new Set(current);
  const prev = index > 0 ? byId.get(current[index - 1]) ?? null : null, next = byId.get(current[index + 1]) ?? null;
  const random = rng(o.seed + index * 7919 + current.length);
  const ok = pool.filter(c => !used.has(c.id) && (!o.minRating || (c.rating ?? 0) >= o.minRating) && (bpmFit(c.bpm, targetBpm, o.bpmTolerance * 1.5, o.halfDouble) ?? 1) >= 0
    && (!o.sameGenre || c.genre.toLowerCase() === o.sameGenre.toLowerCase()));
  if (!ok.length) return null;
  const s = (c: Candidate) => (bpmFit(c.bpm, targetBpm, o.bpmTolerance * 1.5, o.halfDouble) ?? 0.5) * 2
    + (o.harmonic !== 'off' ? 2.5 * (((prev ? keyFit(prev.key, c.key) : 0.5) ?? 0.3) + ((next ? keyFit(c.key, next.key) : 0.5) ?? 0.3)) / 2 : 0)
    + (o.useRatings ? 4 * ((c.rating ?? 2) / 5) : 0) + 3 * tagFit(c.tags, o.tags);
  const top = ok.map(c => ({ c, v: s(c) + random() * (0.6 + o.randomness) })).sort((a, b) => b.v - a.v);
  return top[0].c.id;
}
