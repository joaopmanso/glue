/* Imported cue points by track, indexed once per import (a source object only changes when it's
   re-imported), so dozens of rows can look theirs up on every library change without a search. */
import { lib } from './library.svelte';
import type { Source, SourceTrack } from '../store/types';
import type { CuePoint, Grid } from '../core/interop/types';

const bySource = new WeakMap<Source, Map<string, CuePoint[]>>();
function index(s: Source) {
  let m = bySource.get(s);
  if (!m) { m = new Map(); for (const st of s.tracks) if (st.cueList?.length) m.set(st.trackId, st.cueList); bySource.set(s, m); }
  return m;
}
/** A track's cues: the user's (Prepare), else the main DJ library's (ADR 0169), else those of a DJ-app import. */
export function cuesFor(trackId: string): CuePoint[] {
  const mine = lib.store?.tracks.get(trackId)?.prep?.cues;
  if (mine) return mine;
  const main = mainOf(trackId);
  if (main?.cues.length) return main.cues;
  for (const s of lib.store?.sources.values() ?? []) { const c = index(s).get(trackId); if (c) return c; }
  return [];
}
/** The main DJ library (ADR 0169): this computer's library marked main. */
export function mainSource(): Source | null {
  const s = lib.store;
  for (const src of s?.sources.values() ?? []) if (src.main && s!.ownSource(src)) return src;
  return null;
}
/** What the main DJ library has for a song: its cues and grid, and which app it is. */
export function mainOf(trackId: string): { app: string; cues: CuePoint[]; grid: Grid | null } | null {
  const src = mainSource(), st = src && records(src).get(trackId);
  return src && st ? { app: src.app, cues: st.cueList ?? [], grid: st.grid ?? null } : null;
}

/** What each DJ library has for a song (ADR 0168): its cues and loops, and its beat grid, by library. Only this
    computer's libraries (another computer's are that computer's to sync). */
export function fromApps(trackId: string): { sourceId: string; app: string; main: boolean; cues: CuePoint[]; grid: Grid | null }[] {
  const s = lib.store, out: { sourceId: string; app: string; main: boolean; cues: CuePoint[]; grid: Grid | null }[] = [];
  for (const src of s?.sources.values() ?? []) {
    if (!s!.ownSource(src)) continue;
    const st = records(src).get(trackId);
    if (st && (st.cueList?.length || st.grid)) out.push({ sourceId: src.id, app: src.app, main: !!src.main, cues: st.cueList ?? [], grid: st.grid ?? null });
  }
  // The main DJ library first.
  return out.sort((a, b) => Number(b.main) - Number(a.main));
}
const byRecord = new WeakMap<Source, Map<string, SourceTrack>>();
function records(s: Source) {
  let m = byRecord.get(s);
  if (!m) { m = new Map(); for (const st of s.tracks) if (st.cueList?.length || st.grid) m.set(st.trackId, st); byRecord.set(s, m); }
  return m;
}
