/* A DJ app's own playlists edited in GLUE (ADR 0179): the entries behind the songs shown. */
import type { Source } from '../../store/types';

/** A song added in GLUE that the app doesn't have yet (`glue:<song>`): GLUE's song. */
export const glueSong = (x: string) => x.startsWith('glue:') ? x.slice(5) : undefined;

/** A DJ library's list's own entries that are these songs (what's removed or moved), in its order. */
export function djEntries(src: Source | undefined, id: string, songs: Iterable<string>): string[] {
  const want = new Set(songs), trackOf = new Map((src?.tracks ?? []).map(st => [st.externalId, st.trackId]));
  return (src?.tree?.find(l => l.externalId === id)?.items ?? []).filter(x => want.has(trackOf.get(x) ?? glueSong(x) ?? ''));
}

/** Each song's first entry in a DJ library's list (by GLUE's song). */
export function djEntryOf(src: Source | undefined, id: string): Map<string, string> {
  const m = new Map<string, string>(), trackOf = new Map((src?.tracks ?? []).map(st => [st.externalId, st.trackId]));
  for (const x of src?.tree?.find(l => l.externalId === id)?.items ?? []) { const t = trackOf.get(x) ?? glueSong(x); if (t && !m.has(t)) m.set(t, x); }
  return m;
}
