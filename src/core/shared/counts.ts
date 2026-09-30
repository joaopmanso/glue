/* A shared collection's numbers as one computer sends them to GLUE Cloud (ADR 0112): the collection's songs,
   and the songs this computer has a file of (or had, if it has gone missing). Pure. */
import type { Track } from '../../store/types';

export interface Counts { tracks: number; songs: number }
export function countsOf(ts: Iterable<Pick<Track, 'remote' | 'status'>>): Counts {
  let tracks = 0, songs = 0;
  for (const t of ts) { tracks++; if (!t.remote && t.status !== 'unlinked') songs++; }
  return { tracks, songs };
}
/** A computer of the collection: it has songs here, or music folders. A phone or a browser that only looks has
    neither, and sends no numbers (it showed as "a computer no longer in your account · 0 songs", 2026-09-30). */
export const holdsMusic = (c: Counts, roots: number) => c.songs > 0 || roots > 0;
/** Sent when they changed since the last time (per collection), and once a day anyway ("last seen"). */
export function sendCounts(last: Map<string, { key: string; at: number }>, cid: string, c: Counts, now = Date.now()): boolean {
  const key = c.tracks + '/' + c.songs, was = last.get(cid);
  if (was && was.key === key && now - was.at < 864e5) return false;
  last.set(cid, { key, at: now });
  return true;
}
