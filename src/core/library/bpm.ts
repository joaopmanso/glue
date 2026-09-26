/* Which BPM a track is at, and how it's shown (ADR 0052). Pure.
   - In use: the user's correction (Prepare), else the analysis, else the DJ app's.
   - Shown: folded into the profile's range (half-time 60–120, full 120–240, or as detected), and
     flipped to the other octave for a track the user marked so. */
import type { AnalysisSummary, Profile, Track } from '../../store/types';

export type BpmRange = NonNullable<Profile['bpmRange']>;

export function bpmInUse(t: Track | null | undefined, a: AnalysisSummary | null | undefined, dj?: number | null): number | null {
  return t?.prep?.bpm ?? a?.bpm ?? dj ?? null;
}

/** Into [lo, 2·lo) by halving or doubling. */
function foldInto(b: number, lo: number) {
  let v = b;
  while (v >= lo * 2) v /= 2;
  while (v < lo) v *= 2;
  return v;
}

export function shownBpm(b: number | null | undefined, range: BpmRange | undefined, flip?: boolean): number | null {
  if (!b || !(b > 0)) return null;
  let v = range === 'half' ? foldInto(b, 60) : range === 'full' ? foldInto(b, 120) : b;
  if (flip) v = v >= 120 ? v / 2 : v * 2;
  return v;
}

/** "128", or "127.5" when it isn't a whole number. */
export const fmtBpm = (b: number) => Math.abs(b - Math.round(b)) < 0.05 ? String(Math.round(b)) : b.toFixed(1);
