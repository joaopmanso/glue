/* The BPM a track is at (the user's correction, else the analysis, else the DJ app's), and as the
   open profile shows it (its range, the track's flip). ADR 0052. */
import { lib } from './library.svelte';
import { bpmInUse, shownBpm } from '../core/library/bpm';
import type { AnalysisSummary, Track } from '../store/types';

export { fmtBpm } from '../core/library/bpm';
export const bpmOf = (t: Track | null | undefined, a: AnalysisSummary | null | undefined, dj?: number | null) => bpmInUse(t, a, dj);
export const bpmShown = (t: Track | null | undefined, a: AnalysisSummary | null | undefined, dj?: number | null) =>
  shownBpm(bpmInUse(t, a, dj), lib.profile?.bpmRange, t?.prep?.flip);
