/* Imported cue points by track, indexed once per import (a source object only changes when it's
   re-imported), so dozens of rows can look theirs up on every library change without a search. */
import { lib } from './library.svelte';
import type { Source } from '../store/types';
import type { CuePoint } from '../core/interop/types';

const bySource = new WeakMap<Source, Map<string, CuePoint[]>>();
function index(s: Source) {
  let m = bySource.get(s);
  if (!m) { m = new Map(); for (const st of s.tracks) if (st.cueList?.length) m.set(st.trackId, st.cueList); bySource.set(s, m); }
  return m;
}
/** A track's cues: the user's (Prepare), else those of its DJ-app import. */
export function cuesFor(trackId: string): CuePoint[] {
  const mine = lib.store?.tracks.get(trackId)?.prep?.cues;
  if (mine) return mine;
  for (const s of lib.store?.sources.values() ?? []) { const c = index(s).get(trackId); if (c) return c; }
  return [];
}
