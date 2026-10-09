/* A DJ library's playlists in GLUE (ADR 0063): the library's tree is kept with its source and browsed in
   the sidebar; playlists come into GLUE when the user imports them, as copies linked to the library
   (List.origin), under the library's own folder. When the library changes, the copies follow it: in
   place (their ids never change), and only the ones the library changed, so what the user did to the
   others stays. A folder imported whole also takes the library's new playlists; a folder made only to
   hold something imported below it (chain) doesn't. */
import type { CollectionStore } from './collection';
import { SCHEMA, newId, type List, type Source, type SourceList } from './types';

const now = () => new Date().toISOString();
const topName = (src: Source) => src.name.replace(/\s*\(.*\)$/, '') || src.name;

/** `held`: copies kept because their list was missing for the first time (removed if a later read still lacks
    it); `incomplete`: the read had less than half the lists of the one before, so nothing was removed. */
export interface LinkReport { updated: number; added: number; removed: number; held?: number; incomplete?: boolean }
/** A list missing from the library goes from GLUE only if still missing this much later (ADR 0090). */
export const GONE_AFTER = 60_000;

/** GLUE's copies of a library's lists, by the library's ids ('' is the library's own folder). */
function copies(store: CollectionStore, sourceId: string): Map<string, List> {
  const m = new Map<string, List>();
  for (const l of store.lists.values()) if (l.origin?.sourceId === sourceId) m.set(l.origin.externalId, l);
  return m;
}

/** A list's songs as GLUE tracks. */
function itemsOf(src: Source, l: SourceList): string[] {
  const trackOf = new Map(src.tracks.map(st => [st.externalId, st.trackId]));
  return l.items.map(x => trackOf.get(x)).filter((x): x is string => !!x);
}

/** The path of names from the library's folder down ("2022/140/Heavy"). */
function treePath(byExt: Map<string, SourceList>, l: SourceList): string {
  const names = [l.name];
  for (let p = l.parent; p; p = byExt.get(p)?.parent ?? null) names.unshift(byExt.get(p)?.name ?? '');
  return names.join('/');
}
function gluePath(store: CollectionStore, l: List, topId: string | undefined): string {
  const names = [l.name];
  for (let p = l.parentId; p && p !== topId; p = store.lists.get(p)?.parentId ?? null) names.unshift(store.lists.get(p)?.name ?? '');
  return names.join('/');
}

/** Bring GLUE's copies in step with the library's tree (`src.tree`), after it changed from `prev`. */
export function syncLinkedLists(store: CollectionStore, src: Source, prev?: SourceList[], pending: Record<string, number> = {}, at = Date.now()): LinkReport {
  const tree = src.tree ?? [];
  const byExt = new Map(tree.map(l => [l.externalId, l])), was = new Map((prev ?? []).map(l => [l.externalId, l]));
  const r: LinkReport = { updated: 0, added: 0, removed: 0 };
  let have = copies(store, src.id);
  const top = have.get('');

  // Copies made when ids came from reading order (before ADR 0063) are found again by their path.
  const byPath = new Map<string, string[]>();
  for (const l of tree) { const k = treePath(byExt, l); (byPath.get(k) ?? byPath.set(k, []).get(k)!).push(l.externalId); }
  for (const [ext, l] of have) {
    if (!ext || byExt.has(ext)) continue;
    const cands = (byPath.get(gluePath(store, l, top?.id)) ?? []).filter(x => !have.has(x));
    if (cands.length) { store.putList({ ...l, origin: { ...l.origin!, externalId: cands[0] } }); have.delete(ext); have.set(cands[0], store.lists.get(l.id)!); }
  }

  // Renamed where the id comes from the name (rekordbox XML, Traktor folders, Serato crates): a list gone
  // since the last read, and a new one in the same place with the same songs (or at the same spot among
  // its siblings), are the same list. Parents first, so a renamed folder takes its lists along.
  if (prev) {
    const renamed = new Map<string, string>(), taken = new Set<string>();
    const spot = (list: SourceList[], l: SourceList) => list.filter(x => x.parent === l.parent).indexOf(l);
    const songs = (l: SourceList) => l.items.join('\n');
    // Only ids made from names (pathId, Serato's crate files): where ids are the app's own (Engine DJ,
    // Traktor's UUIDs), a list gone and another new are just that.
    const fromName = (l: SourceList) => { const b = (l.parent ?? '') + '/' + l.name; return l.externalId === b || l.externalId.startsWith(b + '#') || /^[cf]:/.test(l.externalId); };
    for (const old of prev) {
      const copy = have.get(old.externalId);
      if (byExt.has(old.externalId) || !fromName(old)) continue;
      const parent = old.parent ? renamed.get(old.parent) ?? old.parent : null;
      const cands = tree.filter(s => !was.has(s.externalId) && !taken.has(s.externalId) && s.kind === old.kind && s.parent === parent);
      const same = cands.filter(s => songs(s) === songs(old)), there = cands.filter(s => spot(tree, s) === spot(prev, old));
      const pick = same.length === 1 ? same[0] : there.length === 1 ? there[0] : undefined;
      if (!pick) continue;
      taken.add(pick.externalId);
      renamed.set(old.externalId, pick.externalId);
      was.set(pick.externalId, old);   // compared with what it was: a rename is a change
      if (copy) { const u = { ...copy, origin: { ...copy.origin!, externalId: pick.externalId } }; store.putList(u); have.delete(old.externalId); have.set(pick.externalId, u); }
    }
  }

  // Gone from the library: the copy goes (the user's own lists inside it move up first), but only when a
  // read a minute later still lacks it, and never after a read that lost most of the library (a save in
  // progress, a drive not plugged in, a bad read: ADR 0090). One GLUE can't find in the library as it
  // was last read (a first read, or a copy renamed in GLUE) isn't deleted: it becomes the user's own list.
  const incomplete = !!prev && prev.length >= 4 && tree.length < prev.length / 2;
  const nextPending: Record<string, number> = {};
  for (const [ext, l] of have) {
    if (!ext || byExt.has(ext) || !store.lists.has(l.id)) continue;
    // Kept in step both ways (ADR 0171): GLUE Home asks the user whether it goes from GLUE too.
    if (src.sync) continue;
    if (!was.has(ext) && pending[ext] === undefined) { store.putList({ ...l, origin: null }); r.removed++; continue; }
    if (incomplete) { r.incomplete = true; if (pending[ext] !== undefined) nextPending[ext] = pending[ext]; continue; }
    if (pending[ext] === undefined || at - pending[ext] < GONE_AFTER) { nextPending[ext] = pending[ext] ?? at; r.held = (r.held ?? 0) + 1; continue; }
    for (const c of [...store.lists.values()]) if (c.parentId === l.id && c.origin?.sourceId !== src.id) store.putList({ ...c, parentId: l.parentId });
    store.deleteList(l.id);
    r.removed++;
  }
  have = copies(store, src.id);

  // Changed in the library: name, kind and songs follow; so does the place, while GLUE's copy is still
  // among the library's copies (a copy the user moved elsewhere stays there).
  for (const [ext, l] of have) {
    const s = byExt.get(ext), p = was.get(ext);
    if (!ext || !s) continue;
    const items = itemsOf(src, s);
    const moved = !p || p.parent !== s.parent;
    let parentId = l.parentId;
    const inLibrary = !parentId || parentId === top?.id || store.lists.get(parentId)?.origin?.sourceId === src.id;
    if (moved && inLibrary) parentId = (s.parent ? have.get(s.parent)?.id : top?.id) ?? parentId;
    const changed = !p || p.name !== s.name || p.kind !== s.kind || p.items.join('\n') !== s.items.join('\n');
    if (!changed && parentId === l.parentId) continue;
    store.putList({ ...l, name: s.name, kind: s.kind, items: changed ? items : l.items, parentId });
    r.updated++;
  }

  // New in the library, inside a folder GLUE has whole: it comes in too (parents before children).
  for (const s of tree) {
    if (have.has(s.externalId)) continue;
    const parent = s.parent ? have.get(s.parent) : top;
    if (!parent || parent.origin?.chain) continue;
    const l = makeCopy(store, src, s, parent.id, false);
    have.set(s.externalId, l);
    r.added++;
  }
  // A library kept in step both ways: GLUE Home keeps the order both ways (ADR 0172), not the library's over GLUE's.
  if (!src.sync) order(store, src, have);
  // What's waiting to go, kept with the library for its next read.
  const cur = store.sources.get(src.id);
  if (cur && JSON.stringify(cur.pendingGone ?? {}) !== JSON.stringify(nextPending)) {
    const { pendingGone: _p, ...rest } = cur;
    store.putSource(Object.keys(nextPending).length ? { ...rest, pendingGone: nextPending } : rest);
  }
  return r;
}

function makeCopy(store: CollectionStore, src: Source, s: SourceList, parentId: string, chain: boolean): List {
  const l: List = {
    schemaVersion: SCHEMA, id: newId(), kind: s.kind, name: s.name, parentId, position: 1e6, notes: '',
    items: chain ? [] : itemsOf(src, s), origin: { sourceId: src.id, externalId: s.externalId, ...(chain ? { chain: true } : {}) }, createdAt: now(),
  };
  store.putList(l);
  return l;
}

/** Inside the library's copies, its lists keep the library's order; the user's own come after. */
function order(store: CollectionStore, src: Source, have: Map<string, List>) {
  const rank = new Map((src.tree ?? []).map((l, i) => [l.externalId, i]));
  const parents = new Set([...have.values()].map(l => l.id));
  for (const pid of parents) {
    const kids = [...store.lists.values()].filter(c => c.parentId === pid);
    const key = (c: List) => c.origin?.sourceId === src.id && rank.has(c.origin.externalId) ? rank.get(c.origin.externalId)! : 1e7 + c.position;
    kids.sort((a, b) => key(a) - key(b));
    kids.forEach((c, i) => { if (c.position !== i) store.putList({ ...c, position: i }); });
  }
}

/** Import lists of the library into GLUE (a folder with everything in it; '' = the whole library),
    under the library's own folder, their folders on the way made as holders. Returns how many came in. */
export function importLists(store: CollectionStore, src: Source, ids: string[]): number {
  const tree = src.tree ?? [], byExt = new Map(tree.map(l => [l.externalId, l]));
  const have = copies(store, src.id);
  let top = have.get('');
  if (!top) {
    top = {
      schemaVersion: SCHEMA, id: newId(), kind: 'folder', name: topName(src), parentId: null,
      position: [...store.lists.values()].filter(l => !l.parentId).length, notes: 'From ' + src.fileName, items: [],
      origin: { sourceId: src.id, externalId: '', chain: true }, createdAt: now(),
    };
    store.putList(top);
    have.set('', top);
  }
  let n = 0;
  // A holder imported itself becomes whole: its own songs, and from now on the library's new lists in it.
  const whole = (l: List): List => {
    if (!l.origin?.chain) return l;
    const { chain: _chain, ...origin } = l.origin, s = byExt.get(origin.externalId);
    const u: List = { ...l, origin, items: s ? itemsOf(src, s) : l.items };
    store.putList(u);
    have.set(origin.externalId, u);
    return u;
  };
  const ensure = (ext: string | null, chain: boolean): List => {
    if (!ext) return have.get('')!;
    const got = have.get(ext);
    if (got) return chain ? got : whole(got);
    const s = byExt.get(ext)!;
    const parent = ensure(s.parent, true);
    const l = makeCopy(store, src, s, parent.id, chain);
    have.set(ext, l);
    n++;
    return l;
  };
  for (const ext of ids) {
    if (ext === '') { whole(have.get('')!); for (const s of tree) if (!s.parent) ensure(s.externalId, false); }
    else if (byExt.has(ext)) ensure(ext, false);
    else continue;
    // A folder comes with everything in it.
    const inside = (id: string) => { for (const s of tree) if (s.parent === id) { ensure(s.externalId, false); inside(s.externalId); } };
    if (ext === '') for (const s of tree) { if (!s.parent) inside(s.externalId); } else inside(ext);
  }
  order(store, src, have);
  return n;
}
