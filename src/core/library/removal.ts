/* What removing songs takes with it (ADR 0111), for the question before it: how many songs, and of them
   how many carry a rating, notes, cues or places in playlists; and which stay because another computer
   has them too (only this computer's copy goes, ADR 0100). Pure. */
import type { List, Track } from '../../store/types';

export interface RemovalImpact { songs: number; rated: number; noted: number; prepared: number; inPlaylists: number; playlists: number; elsewhere: number }

export function removalImpact(ts: Track[], lists: Iterable<List>): RemovalImpact {
  const ids = new Set(ts.map(t => t.id));
  const out: RemovalImpact = { songs: 0, rated: 0, noted: 0, prepared: 0, inPlaylists: 0, playlists: 0, elsewhere: 0 };
  for (const t of ts) {
    if ((t.onDevices?.length ?? 0) > 1) { out.elsewhere++; continue; }   // another computer has it: it stays
    out.songs++;
    if (t.rating) out.rated++;
    if (t.notes) out.noted++;
    if (t.prep && ((t.prep.cues?.length ?? 0) > 0 || t.prep.beat0 != null || t.prep.bpm != null)) out.prepared++;
  }
  const inAny = new Set<string>();
  for (const l of lists) {
    if (l.kind !== 'playlist' || l.origin) continue;
    const hit = l.items.filter(id => ids.has(id));
    if (hit.length) { out.playlists++; for (const id of hit) inAny.add(id); }
  }
  out.inPlaylists = inAny.size;
  return out;
}

/** The question's words: "412 songs, 30 rated, 12 in 5 playlists". */
export function describeRemoval(r: RemovalImpact): string {
  const n = (k: number, one: string, many = one + 's') => k.toLocaleString() + ' ' + (k === 1 ? one : many);
  const parts = [n(r.songs, 'song')];
  if (r.rated) parts.push(r.rated.toLocaleString() + ' rated');
  if (r.noted) parts.push(n(r.noted, 'with notes', 'with notes'));
  if (r.prepared) parts.push(r.prepared.toLocaleString() + ' prepared (cues, grid)');
  if (r.inPlaylists) parts.push(r.inPlaylists.toLocaleString() + ' in ' + n(r.playlists, 'playlist'));
  return parts.join(', ');
}

/** This computer's songs left without a file for good: no music folder, no imported library, not added on
    their own, not another computer's (the songs of a folder removed before 0.35, ADR 0111). */
export function orphans(ts: Iterable<Track>): Track[] {
  const out: Track[] = [];
  for (const t of ts) if (!t.remote && t.status !== 'linked' && !t.rootId && !t.importPath && !t.fileKey && !(t.sources?.length)) out.push(t);
  return out;
}
