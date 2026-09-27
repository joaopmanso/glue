/* Bring imported libraries and scanned folders into a collection without duplicating tracks (ADR 0020).
   A track is the same track when its imported path matches one already known, or when the path
   matcher links it to a file in a music folder. */
import type { ImportedLibrary, ImportedTrack } from '../core/interop/types';
import { baseName, blankTrack, normPath } from '../core/interop/types';
import { resolveEngine } from '../core/interop/engine';
import { matchTracks, type FileEntry } from '../core/library/match';
import { fillInfo } from '../core/library/tags';
import type { CollectionStore } from './collection';
import { type List, type Source, type SourceList, type SourceTrack, type Track, SCHEMA, newId } from './types';
import { syncLinkedLists, type LinkReport } from './linked';

const now = () => new Date().toISOString();
/** Pseudo root id for songs added on their own (never a real root). */
export const LOOSE = '__files';
const pathKey = (p: string) => normPath(p).toLowerCase();

export function blankLibTrack(fileName: string): Track {
  return {
    id: newId(), status: 'unlinked', rootId: null, relPath: null, importPath: null, fileName, size: null, mtime: null,
    title: '', artist: '', album: '', genre: '', label: '', comment: '', year: '', duration: null, format: null, addedAt: now(), sources: [],
  };
}

/** Where each music folder is (its path, or at least its name): matching counts it (match.ts). */
const placeOf = (store: CollectionStore) => new Map(store.meta.roots.map(r => [r.id, r.absPath ?? r.name]));

function linkedFiles(store: CollectionStore) {
  const files: FileEntry[] = [], byFile = new Map<FileEntry, Track>(), under = placeOf(store);
  for (const t of store.tracks.values()) if (!t.remote && ((t.rootId && t.relPath) || t.fileKey)) {
    // Songs added on their own match by file name (and size) only.
    const f = { rootId: t.rootId ?? LOOSE, relPath: t.relPath ?? t.fileName, size: t.size ?? 0, mtime: t.mtime ?? 0, under: t.rootId ? under.get(t.rootId) : undefined };
    files.push(f); byFile.set(f, t);
  }
  return { files, byFile };
}

/** Fold tracks into others (the same song): their playlist places, other imports' links, and what the
    user set on them (rating, notes, tags, Prepare) where the other has none; then they go. */
export function absorbTracks(store: CollectionStore, into: Map<string, Track>) {
  if (!into.size) return;
  for (const l of [...store.lists.values()]) {
    if (!l.items.some(id => into.has(id))) continue;
    const items: string[] = [], seen = new Set<string>();
    for (const id of l.items) { const to = into.get(id)?.id ?? id; if (!seen.has(to)) { seen.add(to); items.push(to); } }
    store.putList({ ...l, items });
  }
  for (const src of [...store.sources.values()]) {
    if (!src.tracks.some(st => into.has(st.trackId))) continue;
    store.putSource({ ...src, tracks: src.tracks.map(st => into.has(st.trackId) ? { ...st, trackId: into.get(st.trackId)!.id } : st) });
  }
  for (const [fromId, to] of into) {
    const from = store.tracks.get(fromId), cur = store.tracks.get(to.id);
    if (!from || !cur) continue;
    const t: Track = { ...cur, sources: [...new Set([...cur.sources, ...from.sources])] };
    if (t.rating == null && from.rating != null) t.rating = from.rating;
    if (!t.notes && from.notes) t.notes = from.notes;
    if (!t.tags && from.tags) t.tags = from.tags;
    if (!t.prep && from.prep) t.prep = from.prep;
    if (!t.importPath && from.importPath) t.importPath = from.importPath;
    store.putTrack(t);
    store.removeTrack(fromId);
  }
}

function inferRoots(store: CollectionStore, rootPaths: Map<string, string>) {
  let changed = false;
  for (const r of store.meta.roots) { const p = rootPaths.get(r.id); if (p && !r.absPath) { r.absPath = p; changed = true; } }
  if (changed) store.saveMeta();
}

/** lists: the playlists and folders the library has; linkedLists: what changed in GLUE's copies of them. */
/** dropped: tracks that were only this library's records and it no longer has. */
export interface ImportReport { sourceId: string; tracks: number; matched: number; linked: number; lists: number; linkedLists: LinkReport; dropped: number; entries?: ImportedLibrary['stats'] }

/** The tracks an earlier Engine DJ import holds of libraries this one doesn't have (another drive's),
    so a new import of the set keeps them and resolves playlist entries across all of them. */
function carriedEngine(store: CollectionStore, existing: Source | undefined, lib: ImportedLibrary): ImportedTrack[] {
  const have = new Set(lib.engine?.uuids ?? []);
  const out: ImportedTrack[] = [];
  for (const st of existing?.tracks ?? []) {
    const i = st.externalId.indexOf('/'), uuid = i > 0 ? st.externalId.slice(0, i) : '';
    if (!uuid || have.has(uuid)) continue;
    const t = store.tracks.get(st.trackId), it = blankTrack(st.externalId, st.path);
    if (t) { it.title = t.title; it.artist = t.artist; it.album = t.album; it.genre = t.genre; it.label = t.label; it.comment = t.comment; it.year = t.year; it.duration = t.duration; it.size = t.size; }
    it.bpm = st.bpm; it.key = st.key; it.rating = st.rating; it.playCount = st.playCount; it.dateAdded = st.dateAdded; it.cues = st.cues; it.cueList = st.cueList ?? [];
    out.push(it);
  }
  return out;
}

export function applyImport(store: CollectionStore, lib: ImportedLibrary, fileName: string): ImportReport {
  const existing = [...store.sources.values()].find(s => s.app === lib.app && s.fileName === fileName);
  // Engine DJ: one source for the whole set of libraries (they share one playlist tree).
  if (lib.engine) lib = resolveEngine(lib, carriedEngine(store, existing, lib));
  const sourceId = existing?.id ?? newId();
  const byImportPath = new Map<string, Track>();
  for (const t of store.tracks.values()) if (t.importPath && !t.remote) byImportPath.set(pathKey(t.importPath), t);

  const ext2track = new Map<string, Track>(), fresh: Track[] = [];
  // A record GLUE knows as a track without a file (an earlier import that didn't find it) is matched
  // again: once its file is found, that track folds into the one with the file.
  const stray = new Map<string, Track>(), strayInto = new Map<string, Track>();
  const unmatched = lib.tracks.filter(it => {
    const t = byImportPath.get(pathKey(it.path));
    if (!t) return true;
    ext2track.set(it.externalId, t);
    if (t.status === 'linked' || t.fileKey) return false;
    stray.set(it.externalId, t);
    return true;
  });
  const matched = lib.tracks.length - unmatched.length + stray.size;
  const { files, byFile } = linkedFiles(store);
  const { links, rootPaths } = matchTracks(unmatched.map(it => ({ id: it.externalId, importPath: it.path, fileName: baseName(it.path), size: it.size ?? stray.get(it.externalId)?.size ?? null })), files);
  for (const it of unmatched) {
    const f = links.get(it.externalId), known = stray.get(it.externalId);
    if (known) {
      const to = f ? byFile.get(f) : undefined;
      if (to && to.id !== known.id) { ext2track.set(it.externalId, to); strayInto.set(known.id, to); }
      continue;
    }
    let t = f ? byFile.get(f)! : undefined;
    if (!t) { t = blankLibTrack(baseName(it.path)); t.size = it.size; fresh.push(t); }
    ext2track.set(it.externalId, t);
  }
  inferRoots(store, rootPaths);

  // The same song elsewhere: a record whose own file isn't in a music folder (a copy in a folder GLUE
  // doesn't read, e.g. Engine's "preparation" next to "Music Collection"), with the same file name and
  // size as a track that has its file, is that track. Its playlists then play the copy GLUE has.
  // (Traktor gives sizes in kB: 1 kB of slack.) A track made unlinked by an earlier import joins it.
  const withFile = new Map<string, Track[]>();
  for (const t of store.tracks.values()) if (!t.remote && t.status === 'linked' && t.size && ((t.rootId && t.relPath) || t.fileKey)) {
    const k = t.fileName.toLowerCase();
    (withFile.get(k) ?? withFile.set(k, []).get(k)!).push(t);
  }
  const absorbed = new Map<string, Track>(strayInto);   // unlinked track → the track with the file
  const freshIds = new Set(fresh.map(t => t.id));
  for (const it of lib.tracks) {
    const t = ext2track.get(it.externalId)!;
    if (t.status === 'linked' && ((t.rootId && t.relPath) || t.fileKey)) continue;
    const size = it.size ?? t.size;
    if (!size) continue;
    const same = (withFile.get(baseName(it.path).toLowerCase()) ?? []).filter(x => x.id !== t.id && Math.abs((x.size ?? 0) - size) <= 1024);
    if (same.length !== 1) continue;
    ext2track.set(it.externalId, same[0]);
    if (!freshIds.has(t.id)) absorbed.set(t.id, same[0]);
  }
  const used = new Set(ext2track.values());
  for (let i = fresh.length - 1; i >= 0; i--) if (!used.has(fresh[i])) fresh.splice(i, 1);
  if (absorbed.size) {
    absorbTracks(store, absorbed);
    // Carry on from what was just saved (and never from a track that's gone).
    for (const [k, t] of ext2track) { const id = (absorbed.get(t.id) ?? t).id; ext2track.set(k, store.tracks.get(id) ?? absorbed.get(t.id) ?? t); }
  }

  const touched = new Map<string, Track>();
  const sourceTracks: SourceTrack[] = [];
  for (const it of lib.tracks) {
    const t = { ...ext2track.get(it.externalId)! };
    if (!t.importPath) t.importPath = it.path;
    fillInfo(t, it);
    if (t.duration == null && it.duration) t.duration = it.duration;
    if (!t.sources.includes(sourceId)) t.sources = [...t.sources, sourceId];
    touched.set(t.id, t);
    ext2track.set(it.externalId, t);
    // The DJ app's rating becomes the track's own when it hasn't been rated in GLUE.
    if (t.rating == null && it.rating) t.rating = Math.min(5, Math.max(0, it.rating));
    sourceTracks.push({ externalId: it.externalId, trackId: t.id, bpm: it.bpm, key: it.key, rating: it.rating, playCount: it.playCount, cues: it.cues, dateAdded: it.dateAdded, path: it.path, ...(it.cueList.length ? { cueList: it.cueList } : {}) });
  }
  store.putTracks([...touched.values()]);
  // What the library no longer has: the track stops naming it; one without a file and without any other
  // import was only its record, and goes (it would stay in "No file linked" for good).
  const stale: Track[] = [];
  let dropped = 0;
  for (const t of [...store.tracks.values()]) {
    if (touched.has(t.id) || t.remote || store.ephemeral.has(t.id) || !t.sources.includes(sourceId)) continue;
    const sources = t.sources.filter(x => x !== sourceId);
    if (!sources.length && t.status === 'unlinked' && !t.fileKey) { store.removeTrack(t.id); dropped++; }
    else stale.push({ ...t, sources });
  }
  if (stale.length) store.putTracks(stale);

  // The library's playlists are kept as its tree, browsed in the sidebar and brought in on demand; the
  // copies already in GLUE follow it (ADR 0063).
  const tree: SourceList[] = lib.lists.map(l => ({ externalId: l.externalId, kind: l.kind, name: l.name, parent: l.parent, items: l.items }));
  const src: Source = { schemaVersion: SCHEMA, id: sourceId, app: lib.app, name: lib.name, fileName, importedAt: now(), tracks: sourceTracks, lists: lib.lists.length, tree, ...(existing?.origin ? { origin: existing.origin } : {}) };
  store.putSource(src);
  const linkedLists = syncLinkedLists(store, src, existing?.tree);
  return { sourceId, tracks: lib.tracks.length, matched, linked: links.size, lists: lib.lists.length, linkedLists, dropped, entries: lib.stats };
}

export interface ScanEntry { relPath: string; size: number; mtime: number; fileName: string }

/** A folder was scanned: link unlinked tracks to its files, add the rest as new tracks, flag vanished ones. */
export function applyScan(store: CollectionStore, rootId: string, entries: ScanEntry[]): { added: Track[]; linked: number; missing: number } {
  const known = new Map<string, Track>();
  for (const t of store.tracks.values()) if (t.rootId === rootId && t.relPath && !t.remote) known.set(t.relPath, t);
  const seen = new Set<string>(), updates: Track[] = [];
  const newFiles: ScanEntry[] = [];
  for (const e of entries) {
    seen.add(e.relPath);
    const t = known.get(e.relPath);
    if (!t) { newFiles.push(e); continue; }
    if (t.status !== 'linked' || t.size !== e.size || t.mtime !== e.mtime) updates.push({ ...t, status: 'linked', size: e.size, mtime: e.mtime });
  }
  let missing = 0;
  for (const [rel, t] of known) if (!seen.has(rel) && t.status !== 'missing') { updates.push({ ...t, status: 'missing' }); missing++; }

  // Another device's tracks (a merged collection, ADR 0042) belong to that device.
  const unlinked = [...store.tracks.values()].filter(t => t.status === 'unlinked' && !t.remote);
  const under = placeOf(store).get(rootId);
  const files = newFiles.map(e => ({ rootId, relPath: e.relPath, size: e.size, mtime: e.mtime, under }));
  const { links, rootPaths } = matchTracks(unlinked.map(t => ({ id: t.id, importPath: t.importPath, fileName: t.fileName, size: t.size })), files);
  const taken = new Set<string>();
  for (const t of unlinked) {
    const f = links.get(t.id);
    if (!f) continue;
    taken.add(f.relPath);
    updates.push({ ...t, status: 'linked', rootId, relPath: f.relPath, size: f.size, mtime: f.mtime });
  }
  inferRoots(store, rootPaths);
  const added: Track[] = [];
  for (const e of newFiles) if (!taken.has(e.relPath)) {
    const t = blankLibTrack(e.fileName);
    Object.assign(t, { status: 'linked', rootId, relPath: e.relPath, size: e.size, mtime: e.mtime });
    added.push(t);
  }
  store.putTracks([...updates, ...added]);
  return { added, linked: links.size, missing };
}

/** A collection put right when it opens (the user's report, 2026-09-26):
    - tracks naming imports that are gone lose that name; one left without a file and without any
      import was only that import's record, and goes (removing an import once missed tracks that
      weren't in its own list);
    - tracks without a file are matched again with the path matcher (the music folders' own places
      counting), and fold into the track that has the file.
    Returns what changed. */
export function tidyTracks(store: CollectionStore): { unlinked: number; dropped: number; relinked: number } {
  const r = { unlinked: 0, dropped: 0, relinked: 0 };
  const keep: Track[] = [], drop: string[] = [];
  for (const t of store.tracks.values()) {
    if (t.remote || store.ephemeral.has(t.id)) continue;
    const sources = t.sources.filter(x => store.sources.has(x));
    if (sources.length === t.sources.length) continue;
    r.unlinked += t.sources.length - sources.length;
    if (!sources.length && t.status === 'unlinked' && !t.fileKey) drop.push(t.id); else keep.push({ ...t, sources });
  }
  if (keep.length) store.putTracks(keep);
  for (const id of drop) { store.removeTrack(id); r.dropped++; }
  const strays = [...store.tracks.values()].filter(t => t.status === 'unlinked' && !t.remote && !t.fileKey && !store.ephemeral.has(t.id));
  if (strays.length) {
    const { files, byFile } = linkedFiles(store);
    const { links } = matchTracks(strays.map(t => ({ id: t.id, importPath: t.importPath, fileName: t.fileName, size: t.size })), files);
    const into = new Map<string, Track>();
    for (const [id, f] of links) { const to = byFile.get(f); if (to && to.id !== id) into.set(id, to); }
    absorbTracks(store, into);
    r.relinked = into.size;
  }
  return r;
}
