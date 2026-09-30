/* A shared collection's numbers as one computer sends them to GLUE Cloud (ADR 0112): the collection's songs,
   and the songs this computer has a file of (or had, if it has gone missing). Pure. */
import type { Track } from '../../store/types';

export interface Counts { tracks: number; songs: number }
export function countsOf(ts: Iterable<Pick<Track, 'remote' | 'status'>>): Counts {
  let tracks = 0, songs = 0;
  for (const t of ts) { tracks++; if (!t.remote && t.status !== 'unlinked') songs++; }
  return { tracks, songs };
}
/** Sent when they changed since the last time (per collection), and once a day anyway ("last seen"). */
export function sendCounts(last: Map<string, { key: string; at: number }>, cid: string, c: Counts, now = Date.now()): boolean {
  const key = c.tracks + '/' + c.songs, was = last.get(cid);
  if (was && was.key === key && now - was.at < 864e5) return false;
  last.set(cid, { key, at: now });
  return true;
}
