/* The BPM a track is at (the user's correction, else the main DJ library's grid, else the analysis, else the DJ
   app's), and as the open profile shows it (its range, the track's flip). ADR 0052, 0169. */
import { lib } from './library.svelte';
import { mainOf } from './cues';
import { bpmInUse, shownBpm } from '../core/library/bpm';
import type { AnalysisSummary, Track } from '../store/types';

export { fmtBpm } from '../core/library/bpm';
const main = (t: Track | null | undefined) => t ? mainOf(t.id)?.grid?.bpm ?? null : null;
export const bpmOf = (t: Track | null | undefined, a: AnalysisSummary | null | undefined, dj?: number | null) => bpmInUse(t, a, dj, main(t));
export const bpmShown = (t: Track | null | undefined, a: AnalysisSummary | null | undefined, dj?: number | null) =>
  shownBpm(bpmInUse(t, a, dj, main(t)), lib.bpmRange, t?.prep?.flip);
