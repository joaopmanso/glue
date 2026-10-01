/* "No file linked" (ADR 0124): songs an imported DJ library lists whose files are gone (duplicates removed since…),
   matched to the songs the library has, and linked to them one at a time or in bulk. */
import { lib } from './library.svelte';
import { dupes } from './dupes.svelte';
import { relinkMatches, type RelinkMatch, type Songish } from '../core/library/relink';
import { linkRecords } from '../store/merge';
import type { Track } from '../store/types';

const songish = (t: Track): Songish => ({ id: t.id, title: t.title, artist: t.artist, album: t.album, duration: t.duration, fileName: t.fileName, size: t.size });

export interface Orphan { t: Track; matches: RelinkMatch[] }

class Relink {
  /** The plain list of these songs instead (the usual table). */
  asList = $state(false);
  /** This computer's songs with no file, each with its likely matches (best first; none: no match found). */
  orphans(): Orphan[] {
    const s = lib.store;
    if (!s) return [];
    const all = [...s.tracks.values()];
    const orphans = all.filter(t => lib.analysisState(t) === 'nofile' && !t.remote);
    if (!orphans.length) return [];
    // Songs with their file here, as the library shows them (a duplicate's best copy only).
    const hidden = dupes.hidden;
    const pool = all.filter(t => t.status === 'linked' && !t.remote && !hidden.has(t.id));
    const found = relinkMatches(orphans.map(songish), pool.map(songish), { not: new Set(s.meta.relinkNo ?? []) });
    return orphans.map(t => ({ t, matches: found.get(t.id) ?? [] }))
      .sort((a, b) => (b.matches[0]?.sure ?? -1) - (a.matches[0]?.sure ?? -1) || (a.t.artist + a.t.title).localeCompare(b.t.artist + b.t.title));
  }
  /** Each no-file song becomes the song it's linked to: its playlist places, rating, notes and cues go there, and the
      DJ library's record is taken for that song from now on. */
  link(pairs: [string, string][]): number {
    const s = lib.store;
    if (!s || lib.readOnly || !pairs.length) return 0;
    const n = linkRecords(s, new Map(pairs));
    lib.version++;
    return n;
  }
  /** Not this song: that match isn't offered again. */
  notThis(orphan: string, match: string) {
    const s = lib.store;
    if (!s || lib.readOnly) return;
    s.meta.relinkNo = [...new Set([...(s.meta.relinkNo ?? []), orphan + '>' + match])];
    s.saveMeta();
    lib.version++;
  }
}

export const relink = new Relink();
