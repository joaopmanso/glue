/* Energy and sound likeness across a collection (ADR 0197), from each song's sound profile (src/core/audio/sound.ts).
   - Energy 1–10 is relative to the collection: how loud, how busy (onsets), how bright and how fast a song is next to
     the others, so a collection of only drum & bass still spreads from 1 to 10. Mixed In Key's "Energy N" in a
     comment or grouping, when there, is taken as it is.
   - Likeness: the cosine of two songs' timbres, each dimension z-scored over the collection, from 0 (opposite) to 1.
   Pure: works on plain records; src/lib/auto.svelte.ts supplies them. */
import type { SoundProfile } from '../types';
import { TIMBRE_LEN } from '../audio/sound';

/** Mixed In Key's energy (1–10) in a comment or grouping ("8A - Energy 6", "Energy: 7"). */
export function mikEnergy(...texts: (string | null | undefined)[]): number | null {
  for (const t of texts) {
    const m = t ? /\benergy\s*[:\-]?\s*(10|[1-9])\b/i.exec(t) : null;
    if (m) return Number(m[1]);
  }
  return null;
}

export interface SoundIn { id: string; sound?: SoundProfile | null; bpm: number | null; mik?: number | null }
export interface SoundSpace {
  /** 1–10 (continuous; rounded to show). */
  energy: Map<string, number>;
  /** The timbre, z-scored over the collection. */
  timbre: Map<string, Float64Array>;
}

/** Where `v` sits among sorted `xs`: 0 (lowest) … 1 (highest), ties in the middle. */
function rankIn(xs: number[], v: number): number {
  if (xs.length < 2) return 0.5;
  let lo = 0, hi = xs.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < v) lo = m + 1; else hi = m; }
  let eq = lo;
  while (eq < xs.length && xs[eq] === v) eq++;
  return (lo + (eq - lo) / 2) / xs.length;
}
/** Half-time tempos counted at full speed (a 87 BPM drum & bass song is a 174). */
const fold = (b: number) => b < 90 ? b * 2 : b;

export function soundSpace(items: SoundIn[]): SoundSpace {
  const have = items.filter(i => i.sound && i.sound.timbre.length === TIMBRE_LEN);
  const sorted = (f: (i: SoundIn) => number | null) => have.map(f).filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  const L = sorted(i => i.sound!.lufs), O = sorted(i => i.sound!.onsets), H = sorted(i => i.sound!.timbre[TIMBRE_LEN - 1]), B = sorted(i => i.bpm ? fold(i.bpm) : null);
  const rawOf = (i: SoundIn) => 0.45 * rankIn(L, i.sound!.lufs) + 0.3 * rankIn(O, i.sound!.onsets) + 0.15 * rankIn(H, i.sound!.timbre[TIMBRE_LEN - 1]) + 0.1 * (i.bpm ? rankIn(B, fold(i.bpm)) : 0.5);
  const raws = have.map(rawOf), R = [...raws].sort((a, b) => a - b);
  const energy = new Map<string, number>();
  have.forEach((i, k) => energy.set(i.id, 1 + 9 * rankIn(R, raws[k])));
  for (const i of items) if (i.mik != null) energy.set(i.id, i.mik);

  const mean = new Float64Array(TIMBRE_LEN), sd = new Float64Array(TIMBRE_LEN);
  for (const i of have) for (let d = 0; d < TIMBRE_LEN; d++) mean[d] += i.sound!.timbre[d] / have.length;
  for (const i of have) for (let d = 0; d < TIMBRE_LEN; d++) sd[d] += (i.sound!.timbre[d] - mean[d]) ** 2 / have.length;
  for (let d = 0; d < TIMBRE_LEN; d++) sd[d] = Math.sqrt(sd[d]) || 1;
  const timbre = new Map<string, Float64Array>();
  for (const i of have) timbre.set(i.id, Float64Array.from(i.sound!.timbre, (x, d) => (x - mean[d]) / sd[d]));
  return { energy, timbre };
}

/** How alike two z-scored timbres are: 0 … 1 (the cosine, halfway between −1 and 1). */
export function likeness(a: Float64Array | null | undefined, b: Float64Array | null | undefined): number | null {
  if (!a || !b) return null;
  let ab = 0, aa = 0, bb = 0;
  for (let d = 0; d < a.length; d++) { ab += a[d] * b[d]; aa += a[d] * a[d]; bb += b[d] * b[d]; }
  return aa && bb ? (ab / Math.sqrt(aa * bb) + 1) / 2 : 0.5;
}
/** The mean of some timbres (the seeds' sound), or null when none has one. */
export function centroid(vs: (Float64Array | null | undefined)[]): Float64Array | null {
  const have = vs.filter((v): v is Float64Array => !!v);
  if (!have.length) return null;
  const c = new Float64Array(have[0].length);
  for (const v of have) for (let d = 0; d < c.length; d++) c[d] += v[d] / have.length;
  return c;
}
