/* Songs' files: playing and reading them (here, GLUE Home's link, another computer), songs added on their own, removing songs.
   Part of `lib` (src/lib/library.svelte.ts): its methods, `this` being the library. */
import { LOOSE, absorbTracks, blankLibTrack } from '../../store/merge';
import { fileAt, removePath, writeBlob } from '../../store/fsx';
import { matchTracks } from '../../core/library/match';
import { INCOMING_ROOT, newId, type Track } from '../../store/types';
import { AUDIO_EXT } from '../../core/library/tags';
import { removeDetails } from '../../store/details';
import { playable, playsNatively, typeOfName } from '../playable';
import { removeFingerprint } from '../../store/fingerprints';
import * as platform from '../../platform';
import type { Library } from '../library.svelte';
import { TAG_BYTES, quickTags } from './folders';

export const files = {
  /** Can this song play here now: its file here, or another computer's GLUE Home streams it. */
  playsHere(this: Library, t: Track) { return t.status === 'linked' && (t.remote ? this.canRead(t) : true); },
  /** What to play a song from (ADR 0076): an address that streams (this computer's GLUE Home's local link,
      or another computer's GLUE Home) when the browser plays the format by itself; otherwise the file. */
  async mediaFor(this: Library, t: Track): Promise<Blob | string> {
    // Another computer's song: streamed when it can be; a connection that fails says so (not a silent
    // whole download, ADR 0084).
    if (t.remote) { const u = await this.streamFor?.(t); if (u) return u; }
    else if (!t.fileKey && t.rootId && t.relPath && t.status === 'linked' && platform.homeMode() && playsNatively(typeOfName(t.fileName))) {
      const r = this.rootState(t.rootId), link = r ? await platform.fileLink(r.root, t.relPath, true) : null;
      if (link) return link;
    }
    return playable(await this.fileFor(t));
  },
  async fileFor(this: Library, t: Track): Promise<File> {
    try { return await this.fileFrom(t); }
    catch (e) {
      // GLUE Home stopped just now: carry on in the browser, and try once more from there.
      if ((e as Error).name !== 'HomeDown') throw e;
      await this.leaveHomeMode();
      if (this.onHome || this.homeLost) throw e;
      return this.fileFrom(t);
    }
  },
  async fileFrom(this: Library, t: Track): Promise<File> {
    if (t.rootId === INCOMING_ROOT && !t.remote && !this.rootState(INCOMING_ROOT)?.dir) throw new Error('This song is waiting in GLUE Home’s incoming folder: start GLUE Home to play it.');
    if (t.remote) { if (this.remoteFile && this.canStream?.(t)) return this.remoteFile(t); throw new Error(remoteFileMessage(t.remote.name)); }
    if (t.fileKey) return this.looseFile(t, true);
    const r = this.rootState(t.rootId);
    if (!r?.dir || !t.relPath) throw new Error('This track isn’t linked to a file yet. Add the music folder it lives in.');
    if (!r.granted) {
      if (!(await platform.permission(r.dir, 'read', true))) throw new Error('GLUE needs access to “' + r.root.name + '” again.');
      this.roots = this.roots.map(x => x.root.id === r.root.id ? { ...x, granted: true } : x);
    }
    return fileAt(r.dir, t.relPath);
  },
  /** Can this track's file be read right now without asking the user? */
  canRead(this: Library, t: Track) {
    if (t.status !== 'linked') return false;
    // Another computer's song (a merged collection, or the cloud library on a phone: ADR 0077) streams from it.
    if (t.remote) return !!this.canStream?.(t);
    if (t.fileKey) return t.fileKey.startsWith('copy:') || this.looseGranted.has(t.id);
    return !!this.rootState(t.rootId)?.granted;
  },
  async loadLoose(this: Library) {
    const granted = new Set<string>();
    for (const t of this.store?.tracks.values() ?? []) {
      if (!t.fileKey?.startsWith('file:')) continue;
      const h = await platform.fileHandle(t.fileKey);
      if (!h) continue;
      this.looseHandles.set(t.id, h);
      if (await platform.permission(h, 'read', false)) granted.add(t.id);
    }
    this.looseGranted = granted;
  },
  async looseFile(this: Library, t: Track, ask: boolean): Promise<File> {
    const key = t.fileKey!;
    if (key.startsWith('copy:')) return fileAt(this.homeDir!, key.slice(5));
    const h = this.looseHandles.get(t.id) ?? await platform.fileHandle(key);
    if (!h) throw Object.assign(new Error('GLUE lost track of this file. Add it again.'), { name: 'NotFoundError' });
    this.looseHandles.set(t.id, h);
    if (!this.looseGranted.has(t.id)) {
      if (!(await platform.permission(h, 'read', ask))) throw new Error('GLUE needs your permission to read “' + t.fileName + '” again.');
      this.looseGranted = new Set([...this.looseGranted, t.id]);
    }
    return h.getFile();
  },

  /** Add songs by handle (picked or dropped; Chromium). A song inside a music folder uses that folder. */
  async addFiles(this: Library, handles: FileSystemFileHandle[]) {
    const s = this.store;
    if (!s || this.job) return;
    handles = handles.filter(h => AUDIO_EXT.test(h.name));
    if (!handles.length) { this.notice = 'Those aren’t audio files GLUE can read.'; return; }
    this.job = { text: 'Adding songs…', done: 0, total: handles.length };
    let already = 0;
    const fresh: SongInput[] = [];
    try {
      for (const [i, h] of handles.entries()) {
        this.job = { text: 'Adding songs…', done: i, total: handles.length };
        let rootId: string | null = null, relPath: string | null = null;
        for (const r of this.roots) {
          const inside = r.dir && r.granted ? await r.dir.resolve(h) : null;
          if (inside) { rootId = r.root.id; relPath = inside.join('/'); break; }
        }
        // With GLUE Home (ADR 0125): the browser never says where a dropped song is, GLUE Home finds it. In one of the
        // collection's music folders, it's that folder's song; elsewhere, GLUE Home keeps its path.
        let filePath: string | null = null;
        if (!rootId && this.homeFindFile) {
          this.job = { text: 'Finding ' + h.name + ' on this computer…', done: i, total: handles.length };
          const f0 = await h.getFile();
          const w = await this.homeFindFile(h.name, f0.size, this.roots.map(r => r.root.id)).catch(() => null);
          if (w?.folder && this.rootState(w.folder.id)) { rootId = w.folder.id; relPath = w.folder.relPath; }
          else if (w?.path) filePath = w.path;
        }
        let known = false;
        for (const t of s.tracks.values()) {
          const lh = this.looseHandles.get(t.id);
          if (rootId ? t.rootId === rootId && t.relPath === relPath : lh && await lh.isSameEntry(h)) { known = true; break; }
        }
        if (known) { already++; continue; }
        fresh.push({ file: await h.getFile(), rootId, relPath, handle: rootId ? null : h, key: rootId ? null : () => platform.rememberFile(h), filePath });
      }
      const r = await this.createSongTracks(fresh);
      this.report(r.added, r.linked, already);
    } catch (e) { console.error(e); this.notice = 'Couldn’t add those songs: ' + ((e as Error).message || e); }
    finally { this.job = null; }
    this.enqueueAll();
  },
  /** Browsers without file handles: keep a copy of each song in the GLUE folder. */
  async addFileCopies(this: Library, files: File[]) {
    const s = this.store, home = this.homeDir;
    if (!s || !home || this.job) return;
    files = files.filter(f => AUDIO_EXT.test(f.name));
    if (!files.length) { this.notice = 'Those aren’t audio files GLUE can read.'; return; }
    this.job = { text: 'Copying songs into GLUE…', done: 0, total: files.length };
    const copies = [...s.tracks.values()].filter(t => t.fileKey?.startsWith('copy:'));
    const fresh = files.filter(f => !copies.some(t => t.fileName === f.name && t.size === f.size));
    try {
      const r = await this.createSongTracks(fresh.map(file => ({
        file, rootId: null, relPath: null, handle: null,
        key: async () => { const path = `files/${newId()}-${file.name}`; await writeBlob(home, path, file); return 'copy:' + path; },
      })));
      this.report(r.added, r.linked, files.length - fresh.length);
    } catch (e) { console.error(e); this.notice = 'Couldn’t copy those songs: ' + ((e as Error).message || e); }
    finally { this.job = null; }
    this.enqueueAll();
  },
  async createSongTracks(this: Library, items: SongInput[]) {
    const s = this.store!;
    // A song matching an imported track that has no file yet is linked to it rather than added again.
    const unlinked = [...s.tracks.values()].filter(t => t.status === 'unlinked' && !t.remote);
    const entries = items.map(it => ({ rootId: it.rootId ?? LOOSE, relPath: it.relPath ?? it.file.name, size: it.file.size, mtime: it.file.lastModified }));
    const { links } = matchTracks(unlinked.map(t => ({ id: t.id, importPath: t.importPath, fileName: t.fileName, size: t.size })), entries);
    const byEntry = new Map([...links].map(([tid, e]) => [e, tid]));
    let linked = 0;
    const out: Track[] = [], granted = new Set(this.looseGranted);
    for (const [i, it] of items.entries()) {
      const matchId = byEntry.get(entries[i]);
      if (matchId) linked++;
      const base = matchId ? s.tracks.get(matchId)! : blankLibTrack(it.file.name);
      const fileKey = it.key ? await it.key() : null;
      const t: Track = { ...base, status: 'linked', rootId: it.rootId, relPath: it.relPath, fileKey, fileName: it.file.name, size: it.file.size, mtime: it.file.lastModified, ...(it.filePath ? { filePath: it.filePath } : {}) };
      if (it.handle) { this.looseHandles.set(t.id, it.handle); granted.add(t.id); }
      out.push(await quickTags(t, new Uint8Array(await it.file.slice(0, TAG_BYTES).arrayBuffer())));
      this.job = { text: this.job?.text ?? 'Adding songs…', done: i + 1, total: items.length };
    }
    this.looseGranted = granted;
    s.putTracks(out);
    return { added: out.length - linked, linked };
  },
  report(this: Library, added: number, linked: number, already: number) {
    const bits: string[] = [];
    if (added) bits.push('Added ' + added + ' song' + (added === 1 ? '' : 's'));
    if (linked) bits.push(linked + ' linked to imported track' + (linked === 1 ? '' : 's'));
    if (already) bits.push(already + ' already in the collection');
    this.notice = (bits.join(', ') || 'Nothing added') + '.';
  },
  /** Copies whose files GLUE Home put aside or recycled (duplicates, ADR 0070) fold into the copy that
      stays: its playlists' places, the DJ libraries' records, rating, notes, tags and Prepare. */
  async foldCopies(this: Library, into: Map<string, Track>) {
    const s = this.store;
    if (!s || !into.size) return;
    absorbTracks(s, into);
    const cache = await platform.cacheDir();
    if (cache) for (const id of into.keys()) { await removeDetails(cache, s.meta.id, id).catch(() => {}); await removeFingerprint(cache, s.meta.id, id).catch(() => {}); }
  },
  /** Take tracks out of the collection. Files on disk are never touched (copies GLUE made are). */
  async removeTracks(this: Library, ids: string[]) {
    const s = this.store;
    if (!s) return;
    let others = 0;
    const gone: string[] = [];
    for (const id of ids) {
      const t = s.tracks.get(id);
      if (!t) continue;
      if (t.remote) { others++; continue; }
      if (t.fileKey?.startsWith('file:')) await platform.forgetFolder(t.fileKey);
      else if (t.fileKey?.startsWith('copy:') && this.homeDir) await removePath(this.homeDir, t.fileKey.slice(5));
      this.looseHandles.delete(id);
      s.removeTrack(id);
      gone.push(id);
    }
    // This browser's cached analyses of them, afterwards and in the background: thousands of songs are
    // removed at once, not one cache file at a time (the user's 13,000, 2026-09-29).
    const cache = await platform.cacheDir(), cid = s.meta.id;
    if (cache && gone.length) void (async () => { for (const id of gone) { await removeDetails(cache, cid, id).catch(() => {}); await removeFingerprint(cache, cid, id).catch(() => {}); } })();
    if (others) this.notice = others + ' of these track' + (others === 1 ? ' is' : 's are') + ' only on another device: remove ' + (others === 1 ? 'it' : 'them') + ' there.';
  },
};

/** A song being added: its file, where it lives (a music folder, or on its own), how to remember it. */
type SongInput = { file: File; rootId: string | null; relPath: string | null; handle: FileSystemFileHandle | null; key: (() => Promise<string>) | null; filePath?: string | null };
/** Why another device's track can't be played or analysed here yet. */
export function remoteFileMessage(device: string) {
  return 'This track’s file is on ' + device + '. To play it here, run GLUE Home on ' + device + '.';
}
