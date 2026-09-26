/* Indexes over parts of a collection (ADR 0059), each built in one pass and rebuilt only when its
   part changes (CollectionStore.rev): asking "what do the DJ apps say about this track?" or "which
   playlists is it in?" was a scan of every import or every playlist, per track. */
import type { List, Source } from '../../store/types';

export interface DjValues { bpm: number | null; key: string | null; rating: number | null }

/** What the imported DJ libraries say about each track: per field, the first import (in order) that
    has a value (0 and '' count as none). */
export function djValues(sources: Iterable<Source>): Map<string, DjValues> {
  const m = new Map<string, DjValues>();
  for (const src of sources) for (const st of src.tracks) {
    const cur = m.get(st.trackId);
    if (!cur) m.set(st.trackId, { bpm: st.bpm || null, key: st.key || null, rating: st.rating || null });
    else { cur.bpm ??= st.bpm || null; cur.key ??= st.key || null; cur.rating ??= st.rating || null; }
  }
  return m;
}

/** The lists (playlists and folders) each track is in, in the lists' order, each once. */
export function listsByTrack(lists: Iterable<List>): Map<string, List[]> {
  const m = new Map<string, List[]>();
  for (const l of lists) {
    const seen = new Set<string>();
    for (const id of l.items) {
      if (seen.has(id)) continue;
      seen.add(id);
      const a = m.get(id);
      if (a) a.push(l); else m.set(id, [l]);
    }
  }
  return m;
}
