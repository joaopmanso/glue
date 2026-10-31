/* The user's Discogs collection and wantlist (ADR 0187) as GLUE Home keeps them (`profiles/<p>/discogs.json`), and which
   of the library's songs each record is: its title as their album, by one of its artists (a compilation, "Various":
   on its label too), or for a single, its title as the song's. Pure: names compared as the cover look-up does
   (`coverSearch.ts` `same`, `sameArtist`; Discogs' "Name (2)" is the name). */
import { norm, sameArtist } from './coverSearch';

export interface DiscogsRecord {
  id: number; instance?: number; title: string; artists: string[]; labels: { name: string; catno: string }[];
  year: number | null; formats: string[]; genres: string[]; styles: string[]; added: string; rating: number;
  /** Its cover on Discogs, and the cover's hash in GLUE Home's cache once fetched ('' not yet, or none). */
  cover: string; art: string;
}
export interface DiscogsFile { schemaVersion: number; user: string; readAt: number; records: DiscogsRecord[]; wants: DiscogsRecord[] }

export interface Songish { id: string; title: string; artist: string; album: string; label: string }

const VARIOUS = /^various(\s+artists)?$/i;
/** Normalized names the same, give or take extra words on one side (`same` without normalizing again). */
const close = (x: string, y: string) => !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))));

/** The songs indexed once; then each record's songs (ids). */
export function discogsMatcher(songs: Songish[]): (r: DiscogsRecord) => string[] {
  const albums = new Map<string, Songish[]>(), titles = new Map<string, Songish[]>();
  for (const s of songs) {
    const a = norm(s.album), t = norm(s.title);
    if (a) (albums.get(a) ?? albums.set(a, []).get(a)!).push(s);
    if (t) (titles.get(t) ?? titles.set(t, []).get(t)!).push(s);
  }
  const albumKeys = [...albums.keys()];
  return r => {
    const t = norm(r.title);
    if (!t) return [];
    const various = r.artists.length === 0 || r.artists.some(a => VARIOUS.test(a.trim()));
    const byArtist = (s: Songish) => r.artists.some(a => sameArtist(s.artist, a) || sameArtist(a, s.artist));
    const onLabel = (s: Songish) => !!s.label && r.labels.some(l => close(norm(l.name), norm(s.label)));
    // A compilation: on its label, or its title long and exactly the album's (a common one, "Greatest Hits", isn't enough).
    const ok = (s: Songish, exact: boolean) => various ? onLabel(s) || (exact && t.length >= 8) : byArtist(s);
    const out = new Set<string>();
    for (const k of albumKeys) {
      if (!close(k, t)) continue;
      for (const s of albums.get(k)!) if (ok(s, k === t)) out.add(s.id);
    }
    // A single (or an EP named after a track): its title as the song's.
    if (!out.size && !various) for (const s of titles.get(t) ?? []) if (byArtist(s)) out.add(s.id);
    return [...out];
  };
}
