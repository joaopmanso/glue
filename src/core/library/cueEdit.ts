/* Cue points and loops of the Prepare tab (ADR 0052), in the shape imports use (Rekordbox
   POSITION_MARK, Traktor CUE_V2): hot cues A–H are num 0–7, memory cues num null; a loop has an end.
   Pure; times in seconds. */
import type { CuePoint } from '../interop/types';
import type { Grid } from './grid';

/** Rekordbox's default hot cue colours, A–H. */
export const HOT_COLORS = ['#28e214', '#fb1ab0', '#1566f6', '#ffe800', '#fb6b15', '#a51afa', '#0cc9f5', '#e91a2d'];
export const LETTERS = 'ABCDEFGH';
const MEMORY = '#e91a2d';

const byTime = (a: CuePoint, b: CuePoint) => a.t - b.t || (a.num ?? -1) - (b.num ?? -1);

/** The nearest beat of the grid (quantize), or t itself without a grid. */
export function snap(t: number, g: Grid | null): number {
  if (!g || !(g.bpm > 0)) return t;
  const p = 60 / g.bpm, n = Math.round((t - g.beat0) / p);
  return Math.max(0, g.beat0 + n * p);
}

/** Hot cue `num` (0–7) at `t`, replacing whatever that pad had. */
export function setHotCue(cues: CuePoint[], num: number, t: number, loopEnd: number | null = null): CuePoint[] {
  const rest = cues.filter(c => c.num !== num);
  const c: CuePoint = { t, kind: loopEnd != null ? 'loop' : 'cue', num, name: '', color: HOT_COLORS[num] ?? null, end: loopEnd };
  return [...rest, c].sort(byTime);
}

/** A memory cue (or a saved loop) at `t`; not a second one at the same place. */
export function addMemory(cues: CuePoint[], t: number, loopEnd: number | null = null): CuePoint[] {
  if (cues.some(c => c.num == null && Math.abs(c.t - t) < 0.01 && (c.end ?? null) === loopEnd)) return cues;
  const c: CuePoint = { t, kind: loopEnd != null ? 'loop' : 'cue', num: null, name: '', color: MEMORY, end: loopEnd };
  return [...cues, c].sort(byTime);
}

export const removeCue = (cues: CuePoint[], c: CuePoint) => cues.filter(x => x !== c && !(x.t === c.t && x.num === c.num && x.end === c.end));
export const renameCue = (cues: CuePoint[], c: CuePoint, name: string) => cues.map(x => x === c ? { ...x, name } : x);
export const hotCue = (cues: CuePoint[], num: number) => cues.find(c => c.num === num) ?? null;

/** A loop of `beats` beats starting at the beat at (or just before) `t`; without a grid, from t. */
export function autoLoop(t: number, beats: number, g: Grid | null): { a: number; b: number } {
  if (!g || !(g.bpm > 0)) return { a: t, b: t + beats * 0.5 };
  const p = 60 / g.bpm, n = Math.floor((t - g.beat0) / p + 1e-6), a = Math.max(0, g.beat0 + n * p);
  return { a, b: a + beats * p };
}

/** The cues worth taking from an import: cues and loops (not Rekordbox's load / fade markers). */
export const importable = (cues: CuePoint[]) => cues.filter(c => c.kind === 'cue' || c.kind === 'loop').map(c => ({ ...c, color: c.color ?? (c.num != null ? HOT_COLORS[c.num] ?? null : MEMORY) })).sort(byTime);
