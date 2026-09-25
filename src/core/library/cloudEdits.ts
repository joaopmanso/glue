/* Edits made in a cloud view reach the device that owns the data (ADR 0040): the view compares the
   collection before and after, sends the difference as small operations, and the owning device
   applies them to its own files the next time it opens. Last change wins. Pure: no DOM, no network. */
import type { List, Track } from '../../store/types';

/** What can change from another device: a track's own fields, and playlists / folders. */
export type EditOp =
  | { t: 'track'; id: string; rating?: number | null; notes?: string | null; tags?: string[] | null }
  | { t: 'list'; list: List }
  | { t: 'list-del'; id: string };

const TRACK_FIELDS = ['rating', 'notes', 'tags'] as const;
type TrackFields = Pick<Track, typeof TRACK_FIELDS[number]>;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A copy of what edits can touch, to compare against later. */
export interface Baseline { tracks: Map<string, TrackFields>; lists: Map<string, string> }
export function baseline(tracks: Iterable<Track>, lists: Iterable<List>): Baseline {
  const b: Baseline = { tracks: new Map(), lists: new Map() };
  for (const t of tracks) b.tracks.set(t.id, { rating: t.rating ?? null, notes: t.notes ?? '', tags: t.tags });
  for (const l of lists) b.lists.set(l.id, JSON.stringify(l));
  return b;
}

/** The operations that turn `before` into what `tracks` / `lists` hold now. */
export function diff(before: Baseline, tracks: Iterable<Track>, lists: Iterable<List>): EditOp[] {
  const ops: EditOp[] = [];
  for (const t of tracks) {
    const b = before.tracks.get(t.id);
    if (!b) continue;   // tracks are added on their own device, not from a cloud view
    const op: EditOp & { t: 'track' } = { t: 'track', id: t.id };
    let changed = false;
    if (!same(b.rating, t.rating ?? null)) { op.rating = t.rating ?? null; changed = true; }
    if (!same(b.notes || '', t.notes || '')) { op.notes = t.notes || null; changed = true; }
    if (!same(b.tags, t.tags)) { op.tags = t.tags ?? null; changed = true; }
    if (changed) ops.push(op);
  }
  const now = new Set<string>();
  for (const l of lists) {
    now.add(l.id);
    if (before.lists.get(l.id) !== JSON.stringify(l)) ops.push({ t: 'list', list: l });
  }
  for (const id of before.lists.keys()) if (!now.has(id)) ops.push({ t: 'list-del', id });
  return ops;
}

/** The parts of a collection store `apply` needs (CollectionStore has them). */
export interface EditTarget {
  tracks: Map<string, Track>; lists: Map<string, List>;
  putTracks(ts: Track[]): void; putList(l: List): void; deleteList(id: string): void;
}
/** Apply operations in order; returns how many changed something. Unknown tracks are skipped. */
export function apply(s: EditTarget, ops: EditOp[]): number {
  let n = 0;
  const tracks: Track[] = [];
  for (const op of ops) {
    if (op.t === 'track') {
      const cur = tracks.find(x => x.id === op.id) ?? s.tracks.get(op.id);
      if (!cur) continue;
      const next: Track = { ...cur };
      if ('rating' in op) next.rating = op.rating ?? null;
      if ('notes' in op) next.notes = op.notes || undefined;
      if ('tags' in op) { if (op.tags) next.tags = op.tags; else delete next.tags; }
      const i = tracks.findIndex(x => x.id === op.id);
      if (i >= 0) tracks[i] = next; else tracks.push(next);
      n++;
    } else if (op.t === 'list') {
      // Items this device doesn't have are dropped; a parent that doesn't exist puts it at the top.
      const l = op.list;
      const parentId = l.parentId && (s.lists.has(l.parentId) || ops.some(o => o.t === 'list' && o.list.id === l.parentId)) ? l.parentId : null;
      s.putList({ ...l, parentId, items: l.items.filter(id => s.tracks.has(id)) });
      n++;
    } else if (op.t === 'list-del') {
      if (s.lists.has(op.id)) { s.deleteList(op.id); n++; }
    }
  }
  if (tracks.length) s.putTracks(tracks);
  return n;
}
