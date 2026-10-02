/* Moving a computer's own collection into a shared one (ADR 0096): the collection it was merged with on
   other devices (ADR 0040) becomes the shared collection they all hold. Pure: both collections in, the
   shared one out, with this computer's parts added.
   - The same song (trackKey in ./match: artist and title with lengths within 3 s, else file name
     and size) gets this computer's copy; what's set here and empty there (a rating, notes…) comes along,
     and tags join. A song only here comes in with its own id.
   - Playlists and folders with the same place and name become one: the shared one's songs, then the
     songs only here. The others come in with their own ids.
   - Its analyses become this computer's; its music folders this computer's; its DJ libraries come in,
     pointed at the shared ids.
   Nothing of another computer's is changed. */
import type { AnalysisSummary, Collection, List, Source, Track } from '../../store/types';
import { trackKey } from './match';
import { fold } from '../library/names';
import { uniqTags } from '../library/tagging';
import { COPY_FIELDS, collectionShared, toShared, type Copy, type Here, type SharedCollection, type SharedTrack } from './project';

export interface OwnParts { meta: Collection; tracks: Track[]; analysis: Record<string, AnalysisSummary>; lists: List[]; sources: Source[] }
export interface SharedParts { meta: SharedCollection; tracks: SharedTrack[]; analysis: Record<string, Record<string, AnalysisSummary>>; lists: List[]; sources: Source[] }
export interface Adopted extends SharedParts { stats: { matched: number; added: number; listsJoined: number; listsAdded: number }; trackIds: Map<string, string> }

const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
const SKIP = new Set<string>([...COPY_FIELDS, 'id', 'onDevices', 'remote', 'copies']);

function listPath(all: List[], l: List): string {
  const names: string[] = [];
  for (let x: List | undefined = l, guard = 0; x && guard < 20; x = all.find(y => y.id === x!.parentId), guard++) names.unshift(fold(x.name));
  return l.kind + ':' + names.join('/');
}
function freeId(id: string, taken: { has(id: string): boolean }, salt: string) {
  if (!taken.has(id)) return id;
  for (let n = 1; ; n++) { const c = id.slice(0, 2) + salt.slice(0, 4) + id.slice(2) + (n > 1 ? n : ''); if (!taken.has(c)) return c; }
}

export function adopt(shared: SharedParts, own: OwnParts, me: string, member: { profile: string; name: string }): Adopted {
  const here: Here = { me, collection: shared.meta.id, members: { ...shared.meta.members, [me]: member } };
  const tracks = new Map(shared.tracks.map(t => [t.id, structuredClone(t)]));
  const analysis = structuredClone(shared.analysis);
  const ids = new Map<string, string>();   // own track id → shared id
  let matched = 0, added = 0;
  // The file size, for songs without artist and title, is in the copies.
  const keyOf = (t: SharedTrack) => trackKey({ artist: t.artist, title: t.title, fileName: t.fileName, size: Object.values(t.copies ?? {})[0]?.size ?? null });
  const byKey = new Map<string, SharedTrack[]>();
  for (const t of tracks.values()) { const k = keyOf(t); (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(t); }

  for (const t of own.tracks) {
    if (t.remote) continue;                                // another device's, shown here: not this computer's
    const k = trackKey(t);
    const hit = (byKey.get(k) ?? []).find(x => (!x.copies?.[me] || x.copies[me].relPath === t.relPath) && (x.duration == null || t.duration == null || Math.abs(x.duration - t.duration) <= 3));
    if (hit) {
      const copy: Copy = toShared(t, here).copies[me];
      hit.copies = { ...hit.copies, [me]: copy };
      const rec = hit as unknown as Record<string, unknown>;
      for (const [f, v] of Object.entries(t)) if (!SKIP.has(f) && empty(rec[f]) && !empty(v)) rec[f] = structuredClone(v);
      if (t.tags?.length) hit.tags = uniqTags([...(hit.tags ?? []), ...t.tags]);
      ids.set(t.id, hit.id); matched++;
    } else {
      const id = freeId(t.id, tracks, me);
      const st = toShared({ ...t, id }, here);
      tracks.set(id, st);
      (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(st);
      ids.set(t.id, id); added++;
    }
  }
  for (const [oid, a] of Object.entries(own.analysis)) { const id = ids.get(oid); if (id) analysis[id] = { ...(analysis[id] ?? {}), [me]: a }; }

  // DJ libraries: this computer's, pointed at the shared songs.
  const sources = [...shared.sources], srcIds = new Map<string, string>(), takenSrc = new Set(sources.map(s => s.id));
  for (const s of own.sources) {
    const id = freeId(s.id, takenSrc, me); takenSrc.add(id); srcIds.set(s.id, id);
    sources.push({ ...s, id, computer: s.computer ?? me, tracks: s.tracks.map(st => ({ ...st, trackId: ids.get(st.trackId) ?? st.trackId })) });
  }
  for (const t of tracks.values()) { const c = t.copies?.[me]; if (c?.sources?.length) c.sources = c.sources.map(x => srcIds.get(x) ?? x); }

  // Playlists and folders.
  const lists = new Map(shared.lists.map(l => [l.id, structuredClone(l)]));
  const byPath = new Map([...lists.values()].map(l => [listPath(shared.lists, l), l.id]));
  const listIds = new Map<string, string>();
  let listsJoined = 0, listsAdded = 0;
  // Parents first, so a playlist's folder is known when it comes.
  const depth = (l: List) => { let d = 0; for (let x: List | undefined = l; x?.parentId && d < 20; x = own.lists.find(y => y.id === x!.parentId)) d++; return d; };
  for (const l of [...own.lists].sort((a, b) => depth(a) - depth(b))) {
    const items = [...new Set(l.items.map(x => ids.get(x)).filter((x): x is string => !!x))];
    const at = byPath.get(listPath(own.lists, l));
    if (at) {
      const cur = lists.get(at)!;
      cur.items = [...cur.items, ...items.filter(x => !cur.items.includes(x))];
      cur.color ??= l.color; cur.notes ||= l.notes;
      if (l.tags?.length) cur.tags = uniqTags([...(cur.tags ?? []), ...l.tags]);
      listIds.set(l.id, at); listsJoined++;
    } else {
      const id = freeId(l.id, lists, me);
      const parentId = l.parentId ? listIds.get(l.parentId) ?? null : null;
      const origin = l.origin ? { ...l.origin, sourceId: srcIds.get(l.origin.sourceId) ?? l.origin.sourceId } : null;
      lists.set(id, { ...l, id, parentId, items, origin });
      listIds.set(l.id, id); listsAdded++;
    }
  }

  const meta = collectionShared({ ...own.meta, ...shared.meta, roots: own.meta.roots, tags: uniqTags([...(shared.meta.tags ?? []), ...(own.meta.tags ?? [])]) } as unknown as Collection, me, shared.meta, member, matched + added > 0);
  return { meta, tracks: [...tracks.values()], analysis, lists: [...lists.values()], sources, stats: { matched, added, listsJoined, listsAdded }, trackIds: ids };
}
