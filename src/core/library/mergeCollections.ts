/* Merged collections (ADR 0040): collections from several devices shown as one. The same song on two
   devices becomes one row ("on Laptop, Desktop"), playlists with the same place and name become one,
   tags join. Nothing is written back by merging; edits made in the merged view are translated back
   into each device's own ids (translate). Pure. */
import type { AnalysisSummary, Collection, List, Source, Track } from '../../store/types';
import type { EditOp } from './cloudEdits';
import { tagsOf, uniqTags } from './tagging';

export interface MemberData {
  device: { id: string; name: string }; profile: string; collection: string;
  meta: Collection; tracks: Track[]; analysis: Map<string, AnalysisSummary>; lists: List[]; sources: Source[];
}
/** Where a merged row came from: member index and that device's own id. */
export interface Origin { m: number; id: string }
export interface Merged {
  meta: Collection; tracks: Track[]; analysis: Map<string, AnalysisSummary>; lists: List[]; sources: Source[];
  trackOrigins: Map<string, Origin[]>; listOrigins: Map<string, Origin[]>;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function fnv(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Same recording on two devices: same artist and title and length within 3 s, else same file name and size. */
function trackKey(t: Track): string {
  return t.artist && t.title ? 'a|' + norm(t.artist) + '|' + norm(t.title) : 'f|' + norm(t.fileName) + '|' + (t.size ?? '');
}

export function mergeCollections(members: MemberData[], group: { id: string; name: string }): Merged {
  const trackOrigins = new Map<string, Origin[]>(), listOrigins = new Map<string, Origin[]>();
  const byKey = new Map<string, { id: string; dur: number | null; devices: Set<number> }[]>();
  const merged = new Map<string, Track[]>();   // merged id → member tracks (in member order)
  const idOf = members.map(() => new Map<string, string>());   // member track id → merged id

  members.forEach((m, mi) => {
    for (const t of m.tracks) {
      const key = trackKey(t), cands = byKey.get(key) ?? [];
      // One row per song: a candidate of the same length that doesn't already have this device's copy.
      let c = cands.find(x => !x.devices.has(mi) && (x.dur == null || t.duration == null || Math.abs(x.dur - t.duration) <= 3));
      if (!c) {
        let id = 'm' + fnv(key), n = 1;
        while (merged.has(id)) id = 'm' + fnv(key + '#' + n++);
        c = { id, dur: t.duration, devices: new Set() };
        cands.push(c); byKey.set(key, cands); merged.set(id, []);
      }
      c.devices.add(mi); c.dur ??= t.duration;
      merged.get(c.id)!.push(t);
      (trackOrigins.get(c.id) ?? trackOrigins.set(c.id, []).get(c.id)!).push({ m: mi, id: t.id });
      idOf[mi].set(t.id, c.id);
    }
  });

  const tracks: Track[] = [], analysis = new Map<string, AnalysisSummary>();
  for (const [id, ts] of merged) {
    const first = ts[0], origins = trackOrigins.get(id)!;
    const tags = uniqTags(ts.flatMap(t => tagsOf(t)));
    tracks.push({
      ...first, id,
      rating: ts.find(t => t.rating != null)?.rating ?? null,
      notes: ts.find(t => t.notes)?.notes,
      ...(tags.length || ts.some(t => t.tags) ? { tags } : {}),
      status: ts.some(t => t.status === 'linked') ? 'linked' : first.status,
      onDevices: [...new Set(origins.map(o => members[o.m].device.name))],
      sources: [],
    });
    for (const o of origins) { const a = members[o.m].analysis.get(o.id); if (a && !analysis.has(id)) analysis.set(id, a); }
  }

  // Playlists and folders: the same place and name (and kind) on several devices become one.
  const listPath = (m: MemberData, l: List): string => {
    const names: string[] = [];
    for (let x: List | undefined = l, guard = 0; x && guard < 20; x = m.lists.find(y => y.id === x!.parentId), guard++) names.unshift(norm(x.name));
    return l.kind + ':' + names.join('/');
  };
  const lists = new Map<string, List>(), listIdOf = members.map(() => new Map<string, string>());
  members.forEach((m, mi) => {
    for (const l of m.lists) {
      const id = 'l' + fnv(listPath(m, l));
      listIdOf[mi].set(l.id, id);
      (listOrigins.get(id) ?? listOrigins.set(id, []).get(id)!).push({ m: mi, id: l.id });
      const items = l.items.map(x => idOf[mi].get(x)).filter((x): x is string => !!x);
      const cur = lists.get(id);
      if (!cur) lists.set(id, { ...l, id, items: [...new Set(items)], origin: null });
      else lists.set(id, { ...cur, items: [...new Set([...cur.items, ...items])], color: cur.color ?? l.color, notes: cur.notes || l.notes, tags: uniqTags([...(cur.tags ?? []), ...(l.tags ?? [])]) });
    }
  });
  members.forEach((m, mi) => { for (const l of m.lists) { const id = listIdOf[mi].get(l.id)!, cur = lists.get(id)!; if (l.parentId && cur.parentId === l.parentId) lists.set(id, { ...cur, parentId: listIdOf[mi].get(l.parentId) ?? null }); } });
  for (const [id, l] of lists) if (l.parentId && !lists.has(l.parentId)) lists.set(id, { ...l, parentId: null });

  // Imports keep their DJ-app facts (BPM, key, ratings shown as a fallback), pointed at merged ids.
  const sources: Source[] = [];
  members.forEach((m, mi) => {
    for (const s of m.sources) sources.push({ ...s, id: m.device.id.slice(0, 6) + '-' + s.id, tracks: s.tracks.map(st => ({ ...st, trackId: idOf[mi].get(st.trackId) ?? st.trackId })) });
  });
  for (const t of tracks) t.sources = sources.filter(s => s.tracks.some(st => st.trackId === t.id)).map(s => s.id);

  const meta: Collection = { ...members[0].meta, id: 'merged-' + group.id, name: group.name, roots: [], tags: uniqTags(members.flatMap(m => m.meta.tags ?? [])) };
  return { meta, tracks, analysis, lists: [...lists.values()], sources, trackOrigins, listOrigins };
}

/** Edits made in the merged view, as each member's own operations (member index → ops). */
export function translate(ops: EditOp[], mg: Pick<Merged, 'trackOrigins' | 'listOrigins'>, memberCount: number): Map<number, EditOp[]> {
  const out = new Map<number, EditOp[]>();
  const add = (m: number, op: EditOp) => (out.get(m) ?? out.set(m, []).get(m)!).push(op);
  const trackIn = (m: number, id: string) => mg.trackOrigins.get(id)?.find(o => o.m === m)?.id;
  for (const op of ops) {
    if (op.t === 'track') for (const o of mg.trackOrigins.get(op.id) ?? []) add(o.m, { ...op, id: o.id });
    else if (op.t === 'list-del') for (const o of mg.listOrigins.get(op.id) ?? []) add(o.m, { t: 'list-del', id: o.id });
    else {
      // An existing playlist changes where it lives; a new one (made in the merged view) goes to every device.
      const known = mg.listOrigins.get(op.list.id);
      const targets = known ? known : Array.from({ length: memberCount }, (_, m) => ({ m, id: op.list.id }));
      for (const o of targets) {
        const parent = op.list.parentId ? (mg.listOrigins.get(op.list.parentId)?.find(x => x.m === o.m)?.id ?? op.list.parentId) : null;
        add(o.m, { t: 'list', list: { ...op.list, id: o.id, parentId: parent, items: op.list.items.map(id => trackIn(o.m, id)).filter((x): x is string => !!x) } });
      }
    }
  }
  return out;
}
