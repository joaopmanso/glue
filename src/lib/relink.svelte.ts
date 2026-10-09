/* "No file linked" (ADR 0124): songs an imported DJ library lists whose files are gone (duplicates removed since…),
   matched to the songs the library has, and linked to them one at a time or in bulk. The matching runs a few songs at a
   time, and again only when what it compares changed (2026-10-07: it ran whole on every change to the library, and
   froze the page while GLUE Home kept putting analyses in). */
import { lib } from './library.svelte';
import { dupes } from './dupes.svelte';
import { relinkIndex, type RelinkMatch, type Songish } from '../core/library/relink';
import { linkRecords } from '../store/merge';
import type { Track } from '../store/types';

export const songish = (t: Track): Songish => ({ id: t.id, title: t.title, artist: t.artist, album: t.album, duration: t.duration, fileName: t.fileName, size: t.size });
/** What the matching depends on: the songs with no file, the songs to match them to, the pairs refused. */
const said = (t: Track) => t.id + '\u0001' + t.title + '\u0001' + t.artist + '\u0001' + t.album + '\u0001' + (t.duration ?? '') + '\u0001' + t.fileName + '\u0001' + (t.size ?? '');
/** Songs matched between breaths. */
const STEP = 100;

export interface Orphan { t: Track; matches: RelinkMatch[] }

class Relink {
  /** The plain list of these songs instead (the usual table). */
  asList = $state(false);
  /** The song with no file whose match is being chosen by hand (the user, 2026-10-09: "if no match can be made I
      should be able to match it manually"). */
  choosing = $state<string | null>(null);
  choose(id: string | null) { this.choosing = id; if (id) this.asList = false; }
  /** This computer's songs with no file, each with its likely matches (best first; none: no match found). */
  list = $state.raw<Orphan[]>([]);
  /** Matching now: how far (songs looked at, of how many). */
  busy = $state.raw<{ done: number; of: number } | null>(null);
  private key = '';
  private run = 0;

  /** Matched again if what it compares changed (any change to the library may call it). */
  async refresh() {
    const s = lib.store;
    if (!s) { this.key = ''; this.list = []; this.busy = null; return; }
    const all = [...s.tracks.values()];
    const orphans = all.filter(t => lib.analysisState(t) === 'nofile' && !t.remote);
    // Songs with their file here, as the library shows them (a duplicate's best copy only).
    const hidden = dupes.hidden;
    const pool = orphans.length ? all.filter(t => t.status === 'linked' && !t.remote && !hidden.has(t.id)) : [];
    const not = s.meta.relinkNo ?? [];
    const key = s.meta.id + '\u0002' + orphans.map(said).join('\u0002') + '\u0003' + pool.map(said).join('\u0002') + '\u0003' + not.join(',');
    if (key === this.key) return;
    this.key = key;
    const run = ++this.run;
    if (!orphans.length) { this.list = []; this.busy = null; return; }
    this.busy = { done: 0, of: orphans.length };
    const breathe = () => new Promise(r => setTimeout(r, 0));
    await breathe();
    if (run !== this.run) return;
    const match = relinkIndex(pool.map(songish)), notSet = new Set(not), found = new Map<string, RelinkMatch[]>();
    for (let i = 0; i < orphans.length; i += STEP) {
      await breathe();
      if (run !== this.run) return;   // something changed meanwhile: a newer run has it
      for (const [id, ms] of match(orphans.slice(i, i + STEP).map(songish), { not: notSet })) found.set(id, ms);
      this.busy = { done: Math.min(orphans.length, i + STEP), of: orphans.length };
    }
    this.list = orphans.map(t => ({ t, matches: found.get(t.id) ?? [] }))
      .sort((a, b) => (b.matches[0]?.sure ?? -1) - (a.matches[0]?.sure ?? -1) || (a.t.artist + a.t.title).localeCompare(b.t.artist + b.t.title));
    this.busy = null;
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
