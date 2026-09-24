/* Bring imported libraries and scanned folders into a collection without duplicating tracks (ADR 0020).
   A track is the same track when its imported path matches one already known, or when the path
   matcher links it to a file in a music folder. */
import type { ImportedLibrary } from '../core/interop/types';
import { baseName, normPath } from '../core/interop/types';
import { matchTracks, type FileEntry } from '../core/library/match';
import type { CollectionStore } from './collection';
import { type List, type Source, type SourceTrack, type Track, SCHEMA, newId } from './types';

const now = () => new Date().toISOString();
const pathKey = (p: string) => normPath(p).toLowerCase();

export function blankLibTrack(fileName: string): Track {
  return {
    id: newId(), status: 'unlinked', rootId: null, relPath: null, importPath: null, fileName, size: null, mtime: null,
    title: '', artist: '', album: '', genre: '', label: '', comment: '', year: '', duration: null, format: null, addedAt: now(), sources: [],
  };
}

function linkedFiles(store: CollectionStore) {
  const files: FileEntry[] = [], byFile = new Map<FileEntry, Track>();
  for (const t of store.tracks.values()) if (t.rootId && t.relPath) {
    const f = { rootId: t.rootId, relPath: t.relPath, size: t.size ?? 0, mtime: t.mtime ?? 0 };
    files.push(f); byFile.set(f, t);
  }
  return { files, byFile };
}

function inferRoots(store: CollectionStore, rootPaths: Map<string, string>) {
  let changed = false;
  for (const r of store.meta.roots) { const p = rootPaths.get(r.id); if (p && !r.absPath) { r.absPath = p; changed = true; } }
  if (changed) store.saveMeta();
}

export interface ImportReport { sourceId: string; tracks: number; matched: number; linked: number; lists: number }

export function applyImport(store: CollectionStore, lib: ImportedLibrary, fileName: string): ImportReport {
  const existing = [...store.sources.values()].find(s => s.app === lib.app && s.fileName === fileName);
  const sourceId = existing?.id ?? newId();
  const byImportPath = new Map<string, Track>();
  for (const t of store.tracks.values()) if (t.importPath) byImportPath.set(pathKey(t.importPath), t);

  const ext2track = new Map<string, Track>(), fresh: Track[] = [];
  const unmatched = lib.tracks.filter(it => {
    const t = byImportPath.get(pathKey(it.path));
    if (t) { ext2track.set(it.externalId, t); return false; }
    return true;
  });
  const matched = lib.tracks.length - unmatched.length;
  const { files, byFile } = linkedFiles(store);
  const { links, rootPaths } = matchTracks(unmatched.map(it => ({ id: it.externalId, importPath: it.path, fileName: baseName(it.path), size: it.size })), files);
  for (const it of unmatched) {
    const f = links.get(it.externalId);
    let t = f ? byFile.get(f)! : undefined;
    if (!t) { t = blankLibTrack(baseName(it.path)); t.size = it.size; fresh.push(t); }
    ext2track.set(it.externalId, t);
  }
  inferRoots(store, rootPaths);

  const touched = new Map<string, Track>();
  const sourceTracks: SourceTrack[] = [];
  for (const it of lib.tracks) {
    const t = { ...ext2track.get(it.externalId)! };
    if (!t.importPath) t.importPath = it.path;
    for (const k of ['title', 'artist', 'album', 'genre', 'label', 'comment', 'year'] as const) if (!t[k] && it[k]) t[k] = it[k];
    if (t.duration == null && it.duration) t.duration = it.duration;
    if (!t.sources.includes(sourceId)) t.sources = [...t.sources, sourceId];
    touched.set(t.id, t);
    ext2track.set(it.externalId, t);
    sourceTracks.push({ externalId: it.externalId, trackId: t.id, bpm: it.bpm, key: it.key, rating: it.rating, playCount: it.playCount, cues: it.cues, dateAdded: it.dateAdded, path: it.path });
  }
  store.putTracks([...touched.values()]);

  // Imported playlists are refreshed on re-import: the old copies of this source's lists go.
  for (const l of [...store.lists.values()]) if (l.origin?.sourceId === sourceId && store.lists.has(l.id)) store.deleteList(l.id);
  const top: List = {
    schemaVersion: SCHEMA, id: newId(), kind: 'folder', name: lib.name.replace(/\s*\(.*\)$/, '') || lib.name, parentId: null,
    position: [...store.lists.values()].filter(l => !l.parentId).length, notes: 'Imported from ' + fileName, items: [],
    origin: { sourceId, externalId: '' }, createdAt: now(),
  };
  store.putList(top);
  const ext2list = new Map<string, string>(), counts = new Map<string, number>();
  for (const il of lib.lists) {
    const parentId = (il.parent && ext2list.get(il.parent)) || top.id;
    const position = counts.get(parentId) ?? 0; counts.set(parentId, position + 1);
    const id = newId(); ext2list.set(il.externalId, id);
    const items = il.items.map(x => ext2track.get(x)?.id).filter((x): x is string => !!x);
    store.putList({ schemaVersion: SCHEMA, id, kind: il.kind, name: il.name, parentId, position, notes: '', items, origin: { sourceId, externalId: il.externalId }, createdAt: now() });
  }
  const src: Source = { schemaVersion: SCHEMA, id: sourceId, app: lib.app, name: lib.name, fileName, importedAt: now(), tracks: sourceTracks, lists: lib.lists.length };
  store.putSource(src);
  return { sourceId, tracks: lib.tracks.length, matched, linked: links.size, lists: lib.lists.length };
}

export interface ScanEntry { relPath: string; size: number; mtime: number; fileName: string }

/** A folder was scanned: link unlinked tracks to its files, add the rest as new tracks, flag vanished ones. */
export function applyScan(store: CollectionStore, rootId: string, entries: ScanEntry[]): { added: Track[]; linked: number; missing: number } {
  const known = new Map<string, Track>();
  for (const t of store.tracks.values()) if (t.rootId === rootId && t.relPath) known.set(t.relPath, t);
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

  const unlinked = [...store.tracks.values()].filter(t => t.status === 'unlinked');
  const files = newFiles.map(e => ({ rootId, relPath: e.relPath, size: e.size, mtime: e.mtime }));
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
