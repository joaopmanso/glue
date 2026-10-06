/* Music folders: adding, finding again, scanning; GLUE Home's incoming folder (TO BE SORTED); folders away.
   Part of `lib` (src/lib/library.svelte.ts): its methods, `this` being the library. */
import { applyScan, copiesToJoin, joinCopies } from '../../store/merge';
import { writeBlob } from '../../store/fsx';
import { INCOMING_ROOT, newId, type Root, type Track } from '../../store/types';
import { scanFolder } from '../../core/library/scan';
import { fileHead, fileMeta } from '../../core/library/files';
import { fillInfo, formatOf, nameFields, tagFields } from '../../core/library/tags';
import { buildBackup } from '../../store/backup';
import { blankInfo, parseContainer } from '../../core/formats/parse';
import * as platform from '../../platform';
import type { Library, RootState } from '../library.svelte';

const now = () => new Date().toISOString();

export const folders = {

  async loadRoots(this: Library) {
    const out: RootState[] = [];
    let moved = false;
    for (const r of this.store?.meta.roots ?? []) {
      const dir = await platform.musicFolder(r);
      // Where it is, from GLUE Home (it knows): an older guess from imported paths is put right.
      const at = await platform.musicFolderPath(r);
      if (at && r.absPath !== at && !this.readOnly) { r.absPath = at; moved = true; }
      out.push({ root: r, dir, granted: dir ? await platform.permission(dir, 'read', false) : false });
    }
    if (moved) this.store?.saveMeta();
    this.roots = out;
  },
  rootState(this: Library, id: string | null) { return this.roots.find(r => r.root.id === id) ?? null; },

  /** In Home mode, GLUE Home's incoming folder is a hidden music folder of the open collection (ADR
      0051): songs sent to this computer are its own tracks, analysed and synced like any other, and
      one row with other devices' copies of them. They're TO BE SORTED (lib/incoming). */
  async adoptIncoming(this: Library) {
    const s = this.store, inc = await platform.incomingFolder();
    if (!s || !inc || this.readOnly) return;
    let r = s.meta.roots.find(x => x.id === INCOMING_ROOT);
    if (!r) { r = { id: INCOMING_ROOT, name: 'TO BE SORTED', absPath: inc.path, handleKey: 'home:' + INCOMING_ROOT, addedAt: now(), hidden: true }; s.meta.roots.push(r); s.saveMeta(); }
    else if (r.absPath !== inc.path) { r.absPath = inc.path; s.saveMeta(); }
    this.roots = [...this.roots.filter(x => x.root.id !== INCOMING_ROOT), { root: r, dir: inc.dir, granted: true }];
    await this.scanRoot(INCOMING_ROOT, { quiet: true });
    this.onIncoming?.();
  },
  /** GLUE Home moved a song out of the incoming folder into a music folder (top level, under
      `fileName`): the same track, now there. */
  movedFromIncoming(this: Library, id: string, rootId: string, fileName: string) {
    const s = this.store, t = s?.tracks.get(id);
    if (!s || !t || t.rootId !== INCOMING_ROOT) return;
    s.putTrack({ ...t, rootId, relPath: fileName, fileName });
  },
  /** The incoming folder changed (a song arrived, or left it): scan it again. False when it couldn't now (no folder,
      or another scan running): try again later. */
  async rescanIncoming(this: Library) {
    if (!this.rootState(INCOMING_ROOT)?.dir || this.job) return false;
    await this.scanRoot(INCOMING_ROOT, { quiet: true });
    this.onIncoming?.();
    return true;
  },

  async addFolder(this: Library, dropped?: FileSystemDirectoryHandle) {
    const s = this.store;
    if (!s) return;
    let picked: { dir: FileSystemDirectoryHandle; key: string; path?: string };
    const id = newId();
    // In Home mode GLUE Home finds the folder, or its window asks: said here meanwhile, not seconds of nothing (ADR 0134).
    const name = dropped?.name ?? 'a music folder';
    let shown = false;
    const step = (s: 'looking' | 'asking') => { shown = true; this.job = { text: s === 'looking' ? 'Looking for “' + name + '” on this computer (GLUE Home)…' : 'Choose ' + (dropped ? '“' + name + '”' : 'a music folder') + ' in GLUE Home’s window (it may be behind this one)…', done: 0, total: null }; };
    try { picked = dropped ? await platform.droppedFolder(dropped, id, (n, sample) => this.homeFind?.(id, n, sample) ?? Promise.resolve(null), step) : await platform.pickMusicFolder(id, step); }
    catch (e) { if ((e as DOMException).name !== 'AbortError') this.notice = (e as Error).message; return; }
    finally { if (shown) this.job = null; }
    if (dropped && picked.dir === dropped && !(await platform.permission(dropped, 'read', true))) { await platform.forgetFolder(picked.key); return; }
    const same = await Promise.all(this.roots.map(async r => r.dir ? r.dir.isSameEntry(picked.dir) : false));
    if (same.some(Boolean)) { this.notice = '“' + picked.dir.name + '” is already one of this collection’s music folders.'; await platform.forgetFolder(picked.key); return; }
    // A folder inside a music folder: its songs are that folder's already (the user's "2025" in "Music Collection").
    const outer = (await Promise.all(this.roots.map(async r => r.dir && !r.root.hidden && await platform.folderInside(r.dir, picked.dir) ? r : null))).find(Boolean);
    if (outer) { this.notice = '“' + picked.dir.name + '” is inside “' + outer.root.name + '”, already one of this collection’s music folders: its songs are there.'; await platform.forgetFolder(picked.key); return; }
    const root: Root = { id, name: picked.dir.name, absPath: picked.path ?? null, handleKey: picked.key, addedAt: now() };
    s.meta.roots.push(root); s.saveMeta();
    this.roots = [...this.roots, { root, dir: picked.dir, granted: true }];
    await this.scanRoot(root.id);
  },
  /** A folder whose handle is gone (restored backup, cleared browser data): choose it again. */
  async relinkFolder(this: Library, id: string) {
    const s = this.store, r = s?.meta.roots.find(x => x.id === id);
    if (!s || !r) return;
    let picked;
    try { picked = await platform.pickMusicFolder(id); } catch (e) { if ((e as DOMException).name !== 'AbortError') this.notice = (e as Error).message; return; }
    await platform.forgetFolder(r.handleKey);
    r.handleKey = picked.key; if (picked.path) r.absPath = picked.path; s.saveMeta();
    this.roots = this.roots.map(x => x.root.id === id ? { root: r, dir: picked.dir, granted: true } : x);
    await this.scanRoot(id);
  },
  async reconnectFolder(this: Library, id: string) {
    const r = this.rootState(id);
    if (!r?.dir) return;
    if (await platform.permission(r.dir, 'read', true)) { this.roots = this.roots.map(x => x.root.id === id ? { ...x, granted: true } : x); this.enqueueAll(); }
  },
  /** Songs this computer has that are the same file as another computer's song: one song, on both (ADR 0130).
      Many at once (the first open after this came, 2026-10-01) are backed up first. */
  async joinCopies(this: Library) {
    const s = this.store;
    if (!s?.shared || this.readOnly) return;
    const pairs = copiesToJoin(s);
    if (!pairs.length) return;
    if (pairs.length > 10) await this.backupBefore('join-copies');
    if (this.store !== s) return;
    const n = joinCopies(s, pairs);
    if (n) console.info('Joined ' + n + ' song' + (n === 1 ? '' : 's') + ' with the same song on another computer');
  },
  /** A backup of the open profile before something removes a lot (`backups/pre-<why>-<date>-<profile>.zip`, no songs). */
  async backupBefore(this: Library, why: string) {
    const d = this.homeDir, p = this.profile;
    if (!d || !p) return;
    await writeBlob(d, 'backups/pre-' + why + '-' + new Date().toISOString().slice(0, 10) + '-' + p.id + '.zip', await buildBackup(d, p, { songs: false }));
  },
  /** This computer's songs in a music folder (what removing it takes, ADR 0111). */
  folderSongs(this: Library, id: string) { return [...this.store?.tracks.values() ?? []].filter(t => t.rootId === id && !t.remote); },
  /** Removing a music folder removes its songs from the collection (ADR 0111; files untouched): they no longer
      stay as songs with no file for good (484 of them from two removed folders, 2026-09-30). A song another
      computer also has stays, as that computer's. */
  async removeFolder(this: Library, id: string) {
    const s = this.store, r = this.rootState(id);
    if (!s || !r) return;
    await this.removeTracks(this.folderSongs(id).map(t => t.id));
    s.meta.roots = s.meta.roots.filter(x => x.id !== id); s.saveMeta();
    await platform.forgetFolder(r.root.handleKey);
    this.roots = this.roots.filter(x => x.root.id !== id);
    this.found = this.found.filter(f => f.rootId !== id);
  },
  async setRootPath(this: Library, id: string, absPath: string) {
    const s = this.store, r = s?.meta.roots.find(x => x.id === id);
    if (!s || !r) return;
    r.absPath = absPath.trim() || null; s.saveMeta();
    this.roots = this.roots.map(x => x.root.id === id ? { ...x, root: r } : x);
  },

  /** `quiet`: no message when it's done (the incoming folder, scanned whenever it changes). */
  async scanRoot(this: Library, id: string, opts: { quiet?: boolean } = {}) {
    const s = this.store, r = this.rootState(id);
    if (!s || !r?.dir || this.job) return;
    this.job = { text: 'Scanning ' + r.root.name + '…', done: 0, total: null };
    try {
      const { files, libraries, unreadable } = await scanFolder(r.dir, n => { this.job = { text: 'Scanning ' + r.root.name + '…', done: n, total: null }; });
      // Nothing found where songs were: a network folder not connected (an empty folder is left where it was
      // mounted), not every song gone. Kept as they are.
      const had = files.length || id === INCOMING_ROOT ? 0 : [...s.tracks.values()].filter(t => t.rootId === id && !t.remote && t.status === 'linked').length;
      if (had) { this.notice = '“' + r.root.name + '” looks empty, or isn’t reachable right now (a network folder not connected?): its ' + had + ' song' + (had === 1 ? ' is' : 's are') + ' kept as they are. Scan it again when it’s back.'; return; }
      this.found = [...this.found.filter(f => f.rootId !== id), ...libraries.map(l => ({ ...l, rootId: id }))];
      this.job = { text: 'Reading file details…', done: 0, total: files.length };
      const entries = [], handles = new Map<string, FileSystemFileHandle>();
      let skipped = 0;
      const unsureFiles: string[] = [];
      for (let i = 0; i < files.length; i++) {
        // A song whose details can't be read is skipped and counted, not the whole scan failed (ADR 0134).
        const f = await fileMeta(files[i].handle).catch(() => null);
        if (!f) { skipped++; unsureFiles.push(files[i].relPath); continue; }
        entries.push({ relPath: files[i].relPath, size: f.size, mtime: f.lastModified, fileName: f.name });
        handles.set(files[i].relPath, files[i].handle);
        if (i % 100 === 0) this.job = { text: 'Reading file details…', done: i, total: files.length };
      }
      // Songs added on their own that live in this folder become ordinary folder tracks.
      for (const t of [...s.tracks.values()]) {
        const h = this.looseHandles.get(t.id);
        const inside = h ? await r.dir.resolve(h) : null;
        if (!inside) continue;
        s.putTrack({ ...t, rootId: id, relPath: inside.join('/'), fileKey: null });
        await platform.forgetFolder(t.fileKey!);
        this.looseHandles.delete(t.id);
      }
      const { added, linked, missing } = applyScan(s, id, entries, { files: unsureFiles, folders: unreadable });
      // Quick tags, so rows show artist and title before the analysis fills in the rest. GLUE Home 0.56 and later reads
      // them itself, each song's first step in its analysis queue, inside its "songs at a time" (ADR 0157): nothing more
      // to do here (the rows show file names until then). Older: it reads only the tags, 200 songs a request (ADR 0135);
      // without GLUE Home, the start of each file here. The count moves as they come.
      const home = !!this.analysisElsewhere?.active() && platform.homeReadsTags();
      if (!home) this.job = { text: 'Reading tags…', done: 0, total: added.length };
      for (let i = 0; !home && i < added.length; i += 200) {
        const part = added.slice(i, i + 200), out: Track[] = [];
        const got = await platform.readTags(r.root, part.map(x => x.relPath!));
        if (got) part.forEach((x, k) => out.push(withTags(x, got[k] ?? null)));
        else for (const x of part) {
          const h = handles.get(x.relPath!);
          out.push(h ? await quickTags(x, await fileHead(h, TAG_BYTES)) : x);
          this.job = { text: 'Reading tags…', done: i + out.length, total: added.length };
        }
        s.putTracks(out);
        this.job = { text: 'Reading tags…', done: i + part.length, total: added.length };
      }
      const bits = [added.length + ' new track' + (added.length === 1 ? '' : 's')];
      if (linked) bits.push(linked + ' imported track' + (linked === 1 ? '' : 's') + ' linked');
      if (missing) bits.push(missing + ' missing');
      if (libraries.length) bits.push(libraries.length + ' DJ librar' + (libraries.length === 1 ? 'y' : 'ies') + ' found');
      if (unreadable.length || skipped) bits.push([unreadable.length ? unreadable.length + ' folder' + (unreadable.length === 1 ? '' : 's') : '', skipped ? skipped + ' song' + (skipped === 1 ? '' : 's') : ''].filter(Boolean).join(' and ') + ' couldn’t be read' + (unreadable.length ? ' (' + unreadable.slice(0, 3).map(x => '“' + x + '”').join(', ') + (unreadable.length > 3 ? '…' : '') + ')' : '') + ', skipped');
      // A song that left the incoming folder was moved away or deleted there: it's no longer waiting.
      if (id === INCOMING_ROOT) for (const t of [...s.tracks.values()]) if (t.rootId === INCOMING_ROOT && t.status === 'missing' && !t.remote) s.removeTrack(t.id);
      if (!opts.quiet) this.notice = r.root.name + ': ' + bits.join(', ') + '.';
      void this.detectLibraries();
    } catch (e) { console.error(e); if (!opts.quiet) this.notice = 'Couldn’t scan ' + r.root.name + ': ' + ((e as Error).message || e); }
    finally { this.job = null; }
    this.enqueueAll();
  },
  /** A music folder that can't be reached now: said once a visit; its songs wait, and nothing of theirs changes. */
  folderAway(this: Library, root: Root) {
    if (this.awayTold.has(root.id)) return;
    this.awayTold.add(root.id);
    this.notice = '“' + root.name + '” isn’t reachable right now (a network folder not connected, or a drive not plugged in): its songs wait, and nothing of theirs is changed.';
  },
};

/** Enough of a file's start for its tags (most files; the background analysis reads the rest). */
export const TAG_BYTES = 512 * 1024;
/** A song with the info GLUE Home read from its tags (ADR 0135), its name for what's missing. */
function withTags(t: Track, f: Record<string, string> | null): Track {
  const out = { ...t };
  if (f) fillInfo(out, f);
  if (!out.title) { const n = nameFields(out.fileName); out.title = n.title; if (!out.artist) out.artist = n.artist; }
  return out;
}
export async function quickTags(t: Track, head: Uint8Array): Promise<Track> {
  const out = { ...t };
  try {
    let info = blankInfo();
    try { info = parseContainer(head); } catch { /* partial file: tags may still be there */ }
    const f = tagFields(info.tags);
    fillInfo(out, f);
    if (info.container !== 'Unknown') out.format = formatOf(info);
    if (info.duration && !out.duration) out.duration = info.duration;
  } catch { /* unreadable: fall back to the name */ }
  if (!out.title) { const n = nameFields(out.fileName); out.title = n.title; if (!out.artist) out.artist = n.artist; }
  return out;
}
