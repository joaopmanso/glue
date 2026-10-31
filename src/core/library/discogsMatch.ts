/* The user's Discogs collection and wantlist (ADR 0187) as GLUE Home keeps them (`profiles/<p>/discogs.json`), and which
   of the library's songs each record is (ADR 0188). Pure.
   - Track by track, from its tracklist: a song with the track's title and version ("Original Mix" isn't "Remix") by the
     track's own artist (a compilation's) or the record's, its length within 8 s when both are known.
   - Before its tracklist is read: its title as the songs' album, by one of its artists (a compilation: on its label), or
     a single's title as a song's.
   - The user's own say comes first: songs they chose for a record (`Track.discogs`) are its, songs they took off it
     (`Track.discogsNo`) never are, and a song chosen for one record isn't matched to another.
   Names compare as the cover look-up does (`coverSearch.ts`; Discogs' "Name (2)" is the name). */
import { norm, sameArtist } from './coverSearch';
import { versionOf } from './names';

export interface DiscogsTrack { p: string; title: string; artists: string[]; d: number | null }
export interface DiscogsRecord {
  id: number; instance?: number; title: string; artists: string[]; labels: { name: string; catno: string }[];
  year: number | null; formats: string[]; genres: string[]; styles: string[]; added: string; rating: number;
  /** Its cover on Discogs, and the cover's hash in GLUE Home's cache once fetched ('' not yet, or none). */
  cover: string; art: string;
  /** Its tracklist, once GLUE Home read it ([] none on Discogs; absent: not read yet). */
  tracks?: DiscogsTrack[];
}
export interface DiscogsFile { schemaVersion: number; user: string; readAt: number; records: DiscogsRecord[]; wants: DiscogsRecord[] }

export interface Songish { id: string; title: string; artist: string; album: string; label: string; duration: number | null; discogs?: number; discogsNo?: number[] }
/** A record's songs here: all of them (chosen and found), how many of its tracks were found (of how many), and which
    the user chose. */
export interface RecordMatch { songs: string[]; found: number; tracks: number; chosen: string[]; byTrack: (string | null)[] }

const VARIOUS = /^various(\s+artists)?$/i;
/** Normalized names the same, give or take extra words on one side (`same` without normalizing again). */
const close = (x: string, y: string) => !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))));
const LENGTH = 8;

/** The songs indexed once; then each record's match. */
export function discogsMatcher(songs: Songish[]): (r: DiscogsRecord) => RecordMatch {
  const albums = new Map<string, Songish[]>(), titles = new Map<string, Songish[]>(), chosen = new Map<number, Songish[]>();
  for (const s of songs) {
    const a = norm(s.album), t = norm(s.title);
    if (a) (albums.get(a) ?? albums.set(a, []).get(a)!).push(s);
    if (t) (titles.get(t) ?? titles.set(t, []).get(t)!).push(s);
    if (s.discogs) (chosen.get(s.discogs) ?? chosen.set(s.discogs, []).get(s.discogs)!).push(s);
  }
  const albumKeys = [...albums.keys()];
  return r => {
    const mine = chosen.get(r.id) ?? [];
    const free = (s: Songish) => !s.discogs && !s.discogsNo?.includes(r.id);
    const various = r.artists.length === 0 || r.artists.some(a => VARIOUS.test(a.trim()));
    const by = (who: string[], s: Songish) => who.some(a => sameArtist(s.artist, a) || sameArtist(a, s.artist));
    const onLabel = (s: Songish) => !!s.label && r.labels.some(l => close(norm(l.name), norm(s.label)));
    const out = new Set<string>(mine.map(s => s.id));
    let found = 0;
    const byTrack: (string | null)[] = [];
    if (r.tracks?.length) {
      for (const tr of r.tracks) {
        const who = tr.artists.length ? tr.artists : various ? [] : r.artists, version = versionOf(tr.title);
        const ok = (s: Songish) => versionOf(s.title) === version && (who.length ? by(who, s) : onLabel(s))
          && (tr.d == null || s.duration == null || Math.abs(tr.d - s.duration) <= LENGTH);
        const own = mine.find(s => norm(s.title) === norm(tr.title));
        const hit = own ?? (titles.get(norm(tr.title)) ?? []).filter(s => free(s) && ok(s))
          .sort((a, b) => Math.abs((a.duration ?? 0) - (tr.d ?? 0)) - Math.abs((b.duration ?? 0) - (tr.d ?? 0)))[0];
        if (hit) { found++; out.add(hit.id); }
        byTrack.push(hit?.id ?? null);
      }
      return { songs: [...out], found, tracks: r.tracks.length, chosen: mine.map(s => s.id), byTrack };
    }
    // No tracklist (yet): by its title.
    const t = norm(r.title);
    const ok = (s: Songish, exact: boolean) => free(s) && (various ? onLabel(s) || (exact && t.length >= 8) : by(r.artists, s));
    if (t) {
      for (const k of albumKeys) { if (close(k, t)) for (const s of albums.get(k)!) if (ok(s, k === t)) out.add(s.id); }
      if (out.size === mine.length && !various) for (const s of titles.get(t) ?? []) if (free(s) && by(r.artists, s)) out.add(s.id);
    }
    return { songs: [...out], found: 0, tracks: 0, chosen: mine.map(s => s.id), byTrack: [] };
  };
}
