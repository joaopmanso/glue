/* A merged collection inside this computer's own library (ADR 0042). This device's collection stays
   the one that is saved and analysed here; the other devices' songs and playlists are laid over it.
   Songs this device also has stay one row (with every device that has them); songs only elsewhere
   become rows of their own ('r' + merged id); playlists only elsewhere become lists of their own,
   and a playlist that exists here and there shows the songs from both. Edits made here are sent to
   the devices that own the data (toMergedOps + translate). Pure. */
import type { AnalysisSummary, List, Track } from '../../store/types';
import type { EditOp } from './cloudEdits';
import { mergeCollections, translate, type Merged, type MemberData } from './mergeCollections';

/** One device's copy of a song (for Duplicates: the same song on several devices). */
export interface Copy { device: string; track: Track; analysis: AnalysisSummary | null }

export interface Overlay {
  /** Songs only on other devices (ids 'r…', with `remote` and `onDevices`). */
  tracks: Track[];
  analysis: Map<string, AnalysisSummary>;
  /** Playlists and folders only on other devices (ids 'r…'). */
  lists: List[];
  /** This device's tracks → every device that has them (this one first). */
  onDevices: Map<string, string[]>;
  /** This device's playlists → songs the other devices have in them too (view ids, in order). */
  extraItems: Map<string, string[]>;
  /** Songs on more than one device: view id → each device's copy (this one first). */
  copies: Map<string, Copy[]>;
  /** View ids → merged ids, to send edits. */
  toMerged: { tracks: Map<string, string>; lists: Map<string, string> };
  merged: Merged;
}

export const REMOTE_PREFIX = 'r';

/** `local` is member 0; `others` are the other devices' copies of the merged collection. */
export function buildOverlay(local: MemberData, others: MemberData[], group: { id: string; name: string }): Overlay {
  const members = [local, ...others];
  const mg = mergeCollections(members, group);
  const toMerged = { tracks: new Map<string, string>(), lists: new Map<string, string>() };
  const viewTrack = new Map<string, string>(), viewList = new Map<string, string>();
  const tracks: Track[] = [], analysis = new Map<string, AnalysisSummary>(), onDevices = new Map<string, string[]>(), copies = new Map<string, Copy[]>();
  const byId = members.map(m => new Map(m.tracks.map(t => [t.id, t])));
  const copiesOf = (origins: { m: number; id: string }[]): Copy[] | null => {
    if (new Set(origins.map(o => members[o.m].device.id)).size < 2) return null;
    return [...origins].sort((a, b) => a.m - b.m).map(o => ({ device: members[o.m].device.name, track: byId[o.m].get(o.id)!, analysis: members[o.m].analysis.get(o.id) ?? null })).filter(c => c.track);
  };

  for (const t of mg.tracks) {
    const origins = mg.trackOrigins.get(t.id) ?? [];
    const mine = origins.find(o => o.m === 0);
    if (mine) {
      viewTrack.set(t.id, mine.id); toMerged.tracks.set(mine.id, t.id);
      const cs = copiesOf(origins);
      if (cs) copies.set(mine.id, cs);
      onDevices.set(mine.id, [local.device.name, ...(t.onDevices ?? []).filter(d => d !== local.device.name)]);
      continue;
    }
    const o = origins[0], m = members[o.m], owner = m.device, vid = REMOTE_PREFIX + t.id;
    viewTrack.set(t.id, vid); toMerged.tracks.set(vid, t.id);
    const cs = copiesOf(origins);
    if (cs) copies.set(vid, cs);
    tracks.push({ ...t, id: vid, sources: [], remote: { device: owner.id, name: owner.name, profile: m.profile, collection: m.collection, id: o.id } });
    const a = mg.analysis.get(t.id);
    if (a) analysis.set(vid, a);
  }

  for (const l of mg.lists) {
    const mine = mg.listOrigins.get(l.id)?.find(o => o.m === 0);
    const vid = mine ? mine.id : REMOTE_PREFIX + l.id;
    viewList.set(l.id, vid); toMerged.lists.set(vid, l.id);
  }
  const lists: List[] = [], extraItems = new Map<string, string[]>();
  const localLists = new Map(local.lists.map(l => [l.id, l]));
  for (const l of mg.lists) {
    const vid = viewList.get(l.id)!, items = l.items.map(id => viewTrack.get(id)).filter((x): x is string => !!x);
    const here = localLists.get(vid);
    if (here) {
      const have = new Set(here.items), extra = items.filter(id => !have.has(id));
      if (extra.length) extraItems.set(vid, extra);
    } else lists.push({ ...l, id: vid, parentId: l.parentId ? viewList.get(l.parentId) ?? null : null, items });
  }
  return { tracks, analysis, lists, onDevices, extraItems, copies, toMerged, merged: mg };
}

/** Edits made in the library (view ids) → operations for each other device (member index ≥ 1 → ops).
    Playlists made here stay here (the other devices see them through their own overlay). */
export function overlayOps(ops: EditOp[], o: Pick<Overlay, 'toMerged' | 'merged'>, memberCount: number): Map<number, EditOp[]> {
  const mt = (id: string) => o.toMerged.tracks.get(id), ml = (id: string) => o.toMerged.lists.get(id);
  const inMerged: EditOp[] = [];
  for (const op of ops) {
    if (op.t === 'track') { const id = mt(op.id); if (id) inMerged.push({ ...op, id }); }
    else if (op.t === 'list-del') { const id = ml(op.id); if (id) inMerged.push({ t: 'list-del', id }); }
    else {
      const id = ml(op.list.id);
      if (!id) continue;
      const parentId = op.list.parentId ? ml(op.list.parentId) ?? null : null;
      inMerged.push({ t: 'list', list: { ...op.list, id, parentId, items: op.list.items.map(mt).filter((x): x is string => !!x) } });
    }
  }
  const out = translate(inMerged, o.merged, memberCount);
  out.delete(0);   // this device's own files already have the change
  return out;
}
