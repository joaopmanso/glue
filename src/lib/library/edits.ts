/* What the user changes: playlists and folders, tags, ratings, notes, Prepare, song info (written into the files through GLUE Home, ADR 0071); the indexes over them (ADR 0059).
   Part of `lib` (src/lib/library.svelte.ts): its methods, `this` being the library. */
import { djValues, listsByTrack, type DjValues } from '../../core/library/indexes';
import { writeUnwritten } from '../../store/writeInfo';
import { SCHEMA, newId, type List, type Prep, type Track } from '../../store/types';
import { INFO_FIELDS, type InfoField } from '../../core/library/tags';
import { addTags, cleanTag, removeTags, tagKey, tagsOf, uniqTags } from '../../core/library/tagging';
import { restampDetails } from '../../store/details';
import * as platform from '../../platform';
import type { Library } from '../library.svelte';

const NO_DJ = new Map<string, DjValues>();
const NO_LISTS = new Map<string, List[]>();
const now = () => new Date().toISOString();

export const edits = {

  childLists(this: Library, parentId: string | null): List[] {
    return [...(this.store?.lists.values() ?? [])].filter(l => l.parentId === parentId).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  },
  createList(this: Library, kind: 'folder' | 'playlist', name: string, parentId: string | null = null, items: string[] = []): List | null {
    const s = this.store;
    if (!s) return null;
    const l: List = { schemaVersion: SCHEMA, id: newId(), kind, name: name.trim() || (kind === 'folder' ? 'New folder' : 'New playlist'), parentId, position: this.childLists(parentId).length, notes: '', items, origin: null, createdAt: now() };
    s.putList(l);
    return l;
  },
  updateList(this: Library, id: string, patch: Partial<Pick<List, 'name' | 'notes' | 'items' | 'parentId' | 'position'>>) {
    const s = this.store, l = s?.lists.get(id);
    if (s && l) s.putList({ ...l, ...patch });
  },
  deleteList(this: Library, id: string) { this.store?.deleteList(id); },
  setListColor(this: Library, id: string, color: string | null) { const l = this.store?.lists.get(id); if (l) this.store!.putList({ ...l, color }); },
  /** Kept in a DJ app's "GLUE" folder, or not (ADR 0180): this list, and for a folder everything in it. */
  setListApp(this: Library, id: string, app: string, on: boolean) {
    const l = this.store?.lists.get(id);
    if (!l || l.origin || this.readOnly) return;
    const apps = (l.apps ?? []).filter(a => a !== app).concat(on ? [app] : []);
    const next: List = { ...l, apps };
    if (!apps.length) delete next.apps;
    this.store!.putList(next);
  },
  /** The list (or folder it's in) that keeps it in a DJ app's "GLUE" folder (ADR 0180); null: not kept. */
  keptBy(this: Library, id: string, app: string): List | null {
    for (let l = this.store?.lists.get(id), n = 0; l && !l.origin && n < 100; l = l.parentId ? this.store?.lists.get(l.parentId) : undefined, n++) if (l.apps?.includes(app)) return l;
    return null;
  },
  /** GLUE's playlists can be kept in Engine DJ (ADR 0180): its main library is kept in step. */
  engineKept(this: Library): boolean { return [...this.store?.sources.values() ?? []].some(s => s.app === 'engine' && s.main && s.sync); },
  /** Put a list at `index` among the children of `parentId` (moving it into / out of folders too). */
  placeList(this: Library, id: string, parentId: string | null, index: number) {
    const s = this.store, l = s?.lists.get(id);
    if (!s || !l) return;
    for (let p = parentId; p; p = s.lists.get(p)?.parentId ?? null) if (p === id) return;   // never into itself
    const sibs = this.childLists(parentId).filter(x => x.id !== id);
    sibs.splice(Math.max(0, Math.min(index, sibs.length)), 0, { ...l, parentId });
    sibs.forEach((x, i) => { if (x.id === id || x.position !== i) s.putList({ ...x, position: i }); });
    if (l.parentId !== parentId) for (const [i, x] of this.childLists(l.parentId).entries()) if (x.position !== i) s.putList({ ...x, position: i });
  },
  /** One step up or down among its siblings. */
  nudgeList(this: Library, id: string, dir: -1 | 1) {
    const l = this.store?.lists.get(id);
    if (!l) return;
    const i = this.childLists(l.parentId).findIndex(x => x.id === id);
    this.placeList(id, l.parentId, i + dir);
  },
  setTrackNotes(this: Library, id: string, notes: string) {
    const t = this.store?.tracks.get(id);
    if (t && (t.notes ?? '') !== notes) this.store!.putTrack({ ...t, notes: notes || undefined });
  },
  /** The Prepare tab's settings for a track (ADR 0052): \`undefined\` removes one. */
  setPrep(this: Library, id: string, patch: Partial<Prep>) {
    const s = this.store, t = s?.tracks.get(id);
    if (!s || !t || this.readOnly) return;
    const prep: Prep = { ...t.prep, ...patch };
    for (const k of Object.keys(prep) as (keyof Prep)[]) if (prep[k] === undefined) delete prep[k];
    s.putTrack({ ...t, prep: Object.keys(prep).length ? prep : undefined });
  },
  /** Add and remove tags on tracks (ADR 0032). Tags new to the collection join its tag list. */
  tagTracks(this: Library, ids: string[], add: string[], remove: string[] = []) {
    const s = this.store;
    if (!s) return;
    const plus = uniqTags(add), out: Track[] = [];
    for (const id of ids) {
      const t = s.tracks.get(id);
      if (!t) continue;
      const cur = tagsOf(t), next = removeTags(addTags(cur, plus), remove);
      if (t.tags == null || next.length !== cur.length || next.some((x, i) => x !== cur[i])) out.push({ ...t, tags: next });
    }
    if (out.length) s.putTracks(out);
    this.rememberTags(plus);
  },
  setListTags(this: Library, id: string, tags: string[]) {
    const l = this.store?.lists.get(id);
    if (!l) return;
    const next = uniqTags(tags);
    this.store!.putList({ ...l, tags: next.length ? next : undefined });
    this.rememberTags(next);
  },
  /** Keep tags in the collection's list, so a tag made in GLUE stays offered while nothing uses it. */
  rememberTags(this: Library, tags: string[]) {
    const s = this.store;
    if (!s || !tags.length) return;
    const all = s.meta.tags ?? [], next = uniqTags([...all, ...tags]);
    if (next.length !== all.length) { s.meta.tags = next; s.saveMeta(); }
  },
  /** Rename a tag everywhere (tracks, playlists, the tag list); renaming onto another tag merges them. */
  renameTag(this: Library, from: string, to: string) {
    const s = this.store, name = cleanTag(to);
    if (!s || !name || tagKey(from) === '') return;
    const k = tagKey(from), swap = (tags: string[]) => tags.some(t => t.toLowerCase() === k) ? uniqTags(tags.map(t => t.toLowerCase() === k ? name : t)) : null;
    const ts: Track[] = [];
    for (const t of s.tracks.values()) { const n = swap(tagsOf(t)); if (n) ts.push({ ...t, tags: n }); }
    if (ts.length) s.putTracks(ts);
    for (const l of s.lists.values()) { const n = l.tags && swap(l.tags); if (n) s.putList({ ...l, tags: n }); }
    s.meta.tags = uniqTags((s.meta.tags ?? []).map(t => t.toLowerCase() === k ? name : t).concat(name)); s.saveMeta();
  },
  /** Remove a tag from every track and playlist, and from the tag list. */
  deleteTag(this: Library, tag: string) {
    const s = this.store, k = tagKey(tag);
    if (!s || !k) return;
    const ts: Track[] = [];
    for (const t of s.tracks.values()) { const cur = tagsOf(t); if (cur.some(x => x.toLowerCase() === k)) ts.push({ ...t, tags: cur.filter(x => x.toLowerCase() !== k) }); }
    if (ts.length) s.putTracks(ts);
    for (const l of s.lists.values()) if (l.tags?.some(x => x.toLowerCase() === k)) s.putList({ ...l, tags: l.tags.filter(x => x.toLowerCase() !== k) });
    if (s.meta.tags?.some(x => x.toLowerCase() === k)) { s.meta.tags = s.meta.tags.filter(x => x.toLowerCase() !== k); s.saveMeta(); }
  },
  /** Make a playlist's stored order the order it's shown in (e.g. after sorting by BPM). */
  setListOrder(this: Library, id: string, items: string[]) {
    const l = this.store?.lists.get(id);
    if (l && items.length === l.items.length) this.updateList(id, { items });
  },
  /** The user's own rating, in half stars (0.5–5); null or 0 clears it. */
  rateTracks(this: Library, ids: string[], rating: number | null) {
    const s = this.store;
    if (!s) return;
    const r = rating == null || rating <= 0 ? null : Math.min(5, Math.round(rating * 2) / 2);
    s.putTracks(ids.map(id => s.tracks.get(id)).filter((t): t is Track => !!t).map(t => ({ ...t, rating: r })));
  },
  /** Can this song's info be edited here: this computer's own, or another computer's (the edit goes to
      it, ADR 0087). Not a song waiting in an incoming folder (it's no collection's yet). */
  canEditInfo(this: Library, t: Track) { return !this.readOnly && !(t.remote && (!t.remote.id || t.remote.incoming)); },
  /** Edit songs' info (ADR 0071): kept in GLUE at once, then written into the files of this computer's
      music folders by GLUE Home (now, or when it next runs). Another computer's songs: changed here and
      sent to that computer, which keeps it as its own edit (ADR 0087). Only the fields given change; a
      title can't be emptied. */
  editInfo(this: Library, ids: string[], patch: { [K in InfoField]?: string }) {
    const s = this.store;
    if (!s || this.readOnly) return;
    const out: Track[] = [];
    let own = false;
    for (const id of ids) {
      const t = s.tracks.get(id);
      if (!t || !this.canEditInfo(t)) continue;
      const next: Track = { ...t }, changed: InfoField[] = [];
      for (const k of INFO_FIELDS) {
        const v = patch[k]?.trim();
        if (v == null || (k === 'title' && !v) || (t[k] ?? '') === v) continue;
        next[k] = v; changed.push(k);
      }
      if (!changed.length) continue;
      out.push(next);
      // Another computer's song: that computer marks it as edited when the edit gets there.
      if (t.remote) continue;
      own = true;
      next.edited = [...new Set([...t.edited ?? [], ...changed])];
      if (t.rootId && t.relPath && !t.fileKey) next.unwritten = [...new Set([...t.unwritten ?? [], ...changed])];
    }
    if (out.length) { s.putTracks(out); if (own) void this.writeInfo(); }
  },
  /** Mark songs' verdicts as fine (false positives), or show GLUE's verdict again (`fine` false). The mark
      holds for the verdict each song has now; a different one later shows again. */
  markFine(this: Library, ids: string[], fine: boolean) {
    const s = this.store;
    if (!s || this.readOnly) return;
    const out: Track[] = [];
    for (const id of ids) {
      const t = s.tracks.get(id), a = s.analysis.get(id);
      if (!t || t.remote) continue;
      const next = fine && a && !a.error && a.grade !== 'ok' ? a.label : undefined;
      if (t.markedFine !== next) out.push({ ...t, markedFine: next });
    }
    if (out.length) s.putTracks(out);
  },
  /** Songs whose edited info isn't in their file yet. */
  unwrittenCount(this: Library) { let n = 0; for (const t of this.store?.tracks.values() ?? []) if (t.unwritten?.length) n++; return n; },
  /** Edited info into the files, through GLUE Home (Home mode only; the rest waits for it). */
  writeInfo(this: Library) { return (this.writing ??= this.writeInfoOnce().finally(() => { this.writing = null; })); },
  async writeInfoOnce(this: Library) {
    const s = this.store;
    // GLUE Home's engine writes them itself (ADR 0097, 0162).
    if (!s || this.readOnly || !platform.homeMode() || this.homeRuns()) return;
    const stop = () => this.store !== s || this.readOnly || !platform.homeMode() || this.homeRuns();
    let r: { failed: number; why: string; away: string[] };
    try {
      r = await writeUnwritten(s, (t, tags) => {
        const root = this.rootState(t.rootId)?.root;
        if (!root || !t.relPath) throw new Error('its music folder isn’t known here');
        return platform.writeTags(root, t.relPath, tags);
      }, {
        stop,
        restamp: async (t, was, now) => { const cache = await platform.cacheDir(); if (cache) await restampDetails(cache, s.meta.id, t.id, was, now); await this.restampHome?.(t.id, was, now); },
        fatal: e => (e as Error).name === 'HomeDown',
        reachable: t => { const r = this.rootState(t.rootId); return r ? platform.folderReachable(r.root, r.dir) : Promise.resolve(true); },
      });
    } catch { return; }
    const { failed, why, away } = r;
    // A folder that isn't reachable (a network folder): its songs' info waits for it, tried again every few minutes.
    for (const id of away) { const r = this.rootState(id); if (r) this.folderAway(r.root); }
    clearTimeout(this.infoAgain);
    if (away.length) this.infoAgain = setTimeout(() => void this.writeInfo(), 3 * 60e3);
    if (failed) this.notice = 'GLUE Home couldn’t write the info into ' + (failed === 1 ? 'one song’s file' : failed + ' songs’ files') + ': ' + why.replace(/\.?$/, '.') + ' GLUE keeps the edits, and tries again when GLUE Home next connects.';
  },
  addToList(this: Library, id: string, trackIds: string[], at?: number) {
    // Songs waiting in an incoming folder (TO BE SORTED) move into a music folder first.
    const waiting = trackIds.filter(t => this.store?.tracks.get(t)?.remote?.incoming);
    if (waiting.length) { this.notice = 'Songs in TO BE SORTED go into a playlist once they’re in a music folder: select them there › Move to…'; trackIds = trackIds.filter(t => !waiting.includes(t)); if (!trackIds.length) return 0; }
    const l = this.store?.lists.get(id);
    if (!l) return 0;   // folders are playlists too (ADR 0049)
    const add = trackIds.filter(t => !l.items.includes(t));
    const items = [...l.items];
    items.splice(at ?? items.length, 0, ...add);
    this.updateList(id, { items });
    return add.length;
  },
  removeFromList(this: Library, id: string, trackIds: string[]) {
    const l = this.store?.lists.get(id);
    if (l) this.updateList(id, { items: l.items.filter(t => !trackIds.includes(t)) });
  },
  moveInList(this: Library, id: string, trackIds: string[], to: number) {
    const l = this.store?.lists.get(id);
    if (!l) return;
    const moving = l.items.filter(t => trackIds.includes(t));
    const before = l.items.slice(0, to).filter(t => !trackIds.includes(t)).length;
    const rest = l.items.filter(t => !trackIds.includes(t));
    rest.splice(before, 0, ...moving);
    this.updateList(id, { items: rest });
  },
  /** Move a list into a folder (or to the top level), at the end. Refuses to nest a folder in itself. */
  moveList(this: Library, id: string, parentId: string | null) {
    const s = this.store;
    if (!s) return;
    for (let p = parentId; p; p = s.lists.get(p)?.parentId ?? null) if (p === id) return;
    this.updateList(id, { parentId, position: this.childLists(parentId).length });
  },
  /** What the imported DJ libraries say about each track (BPM, key, rating). */
  djIndex(this: Library): Map<string, DjValues> { return this.memo('dj', s => s.rev.sources, s => djValues(s.sources.values()), NO_DJ); },
  djOf(this: Library, trackId: string): DjValues | null { return this.djIndex().get(trackId) ?? null; },
  /** The playlists and folders a track is in, in the lists' order. */
  listsContaining(this: Library, trackId: string): List[] { return (this.memo('lists', s => s.rev.lists, s => listsByTrack(s.lists.values()), NO_LISTS).get(trackId) ?? []).slice(); },
  listPath(this: Library, l: List): string {
    const names = [l.name];
    for (let p = l.parentId; p; p = this.store?.lists.get(p)?.parentId ?? null) names.unshift(this.store?.lists.get(p)?.name ?? '');
    return names.join(' › ');
  },
};
