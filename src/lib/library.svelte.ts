/* The library: MCO folder → profile → collection, kept in memory and written back to JSON files.
   Components read `lib.version` to re-derive views after any change. */
import { HomeStore } from '../store/home';
import { CollectionStore } from '../store/collection';
import { LOOSE, applyImport, applyScan, blankLibTrack, type ImportReport } from '../store/merge';
import { fileAt, removePath, writeBlob } from '../store/fsx';
import { matchTracks } from '../core/library/match';
import { ANALYSIS_VERSION, SCHEMA, newId, type List, type Profile, type Root, type Track } from '../store/types';
import type { ImportedLibrary } from '../core/interop/types';
import { scanFolder, type FoundLibrary } from '../core/library/scan';
import { findLibraries, type Detected } from '../core/library/detect';
import { makeThumb } from '../core/library/thumb';
import { AUDIO_EXT, formatOf, nameFields, tagFields } from '../core/library/tags';
import { failed } from '../core/library/summary';
import { encodeDetails, loadDetails, removeDetails, writeDetails, type DetailsHeader } from '../store/details';
import { removeFingerprint, writeFingerprint } from '../store/fingerprints';
import { buildBackup, readBackup, writeBackup, type BackupManifest } from '../store/backup';
import type { ZipEntry } from '../core/zip';
import { downloadBlob } from './download';
import { themes } from './themes.svelte';
import type { AnalysisResult, FileInfo } from '../core/types';
import { blankInfo, parseContainer } from '../core/formats/parse';
import * as platform from '../platform';
import { AnalysisPool } from './pool';
import { player } from './player.svelte';

type Phase = 'boot' | 'welcome' | 'reconnect' | 'profiles' | 'collections' | 'library' | 'error';
export interface RootState { root: Root; dir: FileSystemDirectoryHandle | null; granted: boolean }
export interface Job { text: string; done: number; total: number | null }
/** A song being added: its file, where it lives (a music folder, or on its own), how to remember it. */
type SongInput = { file: File; rootId: string | null; relPath: string | null; handle: FileSystemFileHandle | null; key: (() => Promise<string>) | null };

const now = () => new Date().toISOString();

class Library {
  phase = $state<Phase>('boot');
  error = $state('');
  homeKind = $state<'folder' | 'private'>('folder');
  homeName = $state('');
  home = $state.raw<HomeStore | null>(null);
  profile = $state.raw<Profile | null>(null);
  store = $state.raw<CollectionStore | null>(null);
  roots = $state.raw<RootState[]>([]);
  found = $state.raw<(FoundLibrary & { rootId: string })[]>([]);
  /** DJ libraries found in allowed folders, with where they are and whether they're imported (ADR 0030). */
  detected = $state.raw<(Detected & { place: string; placeName: string; status: 'new' | 'imported' | 'changed'; sourceId: string | null })[]>([]);
  detecting = $state(false);
  places = $state.raw<{ key: string; name: string; granted: boolean }[]>([]);
  version = $state(0);
  job = $state<Job | null>(null);
  private noticeText = $state('');
  private noticeTimer = 0;
  /** A short message; clears itself after a while. */
  get notice() { return this.noticeText; }
  set notice(v: string) {
    this.noticeText = v;
    clearTimeout(this.noticeTimer);
    if (v && typeof window !== 'undefined') this.noticeTimer = window.setTimeout(() => { this.noticeText = ''; }, Math.min(15000, 5000 + v.length * 40));
  }
  readOnly = $state(false);
  saving = $state(false);
  unsaved = $state(false);           // changes not on disk yet
  private saveError = '';
  analysis = $state({ running: 0, done: 0, failed: 0, paused: false });
  private homeDir: FileSystemDirectoryHandle | null = null;
  private flushTimer = 0;
  private pool: AnalysisPool | null = null;
  private queue: string[] = [];
  private active = new Set<string>();
  /** Songs added on their own: their handles, and which ones we may read without asking. */
  private looseHandles = new Map<string, FileSystemFileHandle>();
  looseGranted = $state.raw<Set<string>>(new Set());
  /** Hooks for derived views (duplicates): a collection opened / closed, the background analysis went quiet. */
  onOpened: (() => void) | null = null;
  onSettled: (() => void) | null = null;
  /** A track's mini spectrogram is ready (the thumbnail cache stores it). */
  onThumb: ((id: string, data: Uint8Array) => void) | null = null;
  /** First run: after the profile, a step that explains how to add music. */
  onboarding = $state<null | 'music'>(null);
  /** A backup chosen on the start screen, restored once the MCO folder is chosen. */
  pendingRestore = $state.raw<{ manifest: BackupManifest; entries: ZipEntry[] } | null>(null);

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void this.flush(); });
      window.addEventListener('pagehide', () => void this.flush());
    }
  }

  // ─── MCO folder ────────────────────────────────────────────────────────────
  async boot() {
    try {
      const h = await platform.restoreHome();
      if (!h) { this.phase = 'welcome'; return; }
      this.homeKind = h.kind; this.homeName = h.dir.name;
      if (!h.granted) { this.homeDir = h.dir; this.phase = 'reconnect'; return; }
      await this.openHome(h.dir, h.kind);
    } catch (e) { this.fail(e); }
  }
  async chooseHome() {
    try { await this.openHome(await platform.pickHome(), 'folder'); }
    catch (e) { if ((e as DOMException).name !== 'AbortError') this.fail(e); }
  }
  /** Step 1 of the first run: pick a folder and say what's in it, without using it yet. */
  async pickHomeFolder(): Promise<{ dir: FileSystemDirectoryHandle; look: platform.FolderLook } | null> {
    try { const dir = await platform.pickHome(); return { dir, look: await platform.lookInto(dir) }; }
    catch (e) { if ((e as DOMException).name !== 'AbortError') this.fail(e); return null; }
  }
  async useHome(dir: FileSystemDirectoryHandle) {
    try { await platform.rememberHome(dir); await this.openHome(dir, 'folder'); } catch (e) { this.fail(e); }
  }
  async usePrivateHome() { try { await this.openHome(await platform.privateHome(), 'private'); } catch (e) { this.fail(e); } }
  async reconnect() {
    if (!this.homeDir) return this.chooseHome();
    if (await platform.permission(this.homeDir, 'readwrite', true)) await this.openHome(this.homeDir, 'folder');
  }
  async changeHome() {
    await this.closeCollection();
    this.home = null; this.profile = null;
    await platform.forgetHome();
    this.phase = 'welcome';
  }
  private async openHome(dir: FileSystemDirectoryHandle, kind: 'folder' | 'private') {
    this.homeDir = dir; this.homeKind = kind; this.homeName = kind === 'private' ? 'browser storage' : dir.name;
    await this.takeLock();
    this.home = await HomeStore.open(dir);
    // The MCO folder's look wins over this browser's (another computer opens with the same theme).
    const look = this.home.index.appearance;
    if (look && (look.theme !== themes.theme || look.mode !== themes.mode)) themes.set(look.theme, look.mode);
    themes.onChange = (theme, mode) => { if (!this.readOnly) void this.home?.setAppearance({ theme, mode }); };
    if (this.pendingRestore) { const b = this.pendingRestore; this.pendingRestore = null; await this.applyBackup(b, true); return; }
    const last = this.home.index.lastProfile;
    if (last && this.home.index.profiles.some(p => p.id === last)) await this.openProfile(last);
    else this.phase = 'profiles';
  }
  /** Only one tab writes to the MCO folder; others open read-only. */
  private async takeLock() {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (!locks) return;
    await new Promise<void>(resolve => {
      void locks.request('mco-writer', { ifAvailable: true }, lock => {
        this.readOnly = !lock;
        resolve();
        return lock ? new Promise<void>(() => {}) : undefined;   // hold it for the life of the tab
      });
    });
  }

  // ─── Profiles and collections ──────────────────────────────────────────────
  async createProfile(name: string) {
    if (!this.home) return;
    const p = await this.home.createProfile(name);
    this.profile = p;
    this.phase = 'collections';
    await this.createCollection('My collection');
    this.onboarding = 'music';
  }

  // ─── Backups ───────────────────────────────────────────────────────────────
  async downloadBackup(pid: string) {
    const home = this.home, dir = this.homeDir;
    if (!home || !dir) return;
    if (this.profile?.id === pid) await this.flush();
    const p = this.profile?.id === pid ? this.profile : await home.loadProfile(pid);
    const blob = await buildBackup(dir, p);
    const day = new Date().toISOString().slice(0, 10), safe = p.name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'profile';
    downloadBlob(blob, `MCO backup - ${safe} - ${day}.zip`);
    return blob.size;
  }
  /** Read a backup zip (checks it's an MCO backup a this version can open). */
  async readBackupFile(file: File) { return readBackup(new Uint8Array(await file.arrayBuffer())); }
  profileExists(pid: string) { return !!this.home?.index.profiles.some(p => p.id === pid); }
  /** Put a backup's profile into the MCO folder and open it. `replace`: an existing copy is removed first. */
  async applyBackup(b: { manifest: BackupManifest; entries: ZipEntry[] }, replace: boolean) {
    const home = this.home, dir = this.homeDir;
    if (!home || !dir) { this.pendingRestore = b; return; }
    const pid = b.manifest.profile.id;
    if (this.profileExists(pid)) {
      if (!replace) return;
      if (this.profile?.id === pid) { await this.closeCollection(); this.profile = null; }
      await removePath(dir, `profiles/${pid}`);
    }
    await writeBackup(dir, b);
    await home.adoptProfile(b.manifest.profile);
    this.home = null; this.home = home;
    await this.openProfile(pid);
    const folders = this.roots.length;
    this.notice = 'Restored ' + b.manifest.profile.name + '.' + (folders ? ' Link its music folder' + (folders === 1 ? '' : 's') + ' again with “Find folder” in the sidebar.' : '');
  }
  /** Delete every file MCO made (in its folder and in the browser) and start again. */
  async deleteAllData() {
    const home = this.home, kind = this.homeKind;
    await this.closeCollection();
    this.profile = null;
    if (home) await home.wipe();
    await platform.wipeBrowserData(kind === 'private');
    this.home = null; this.homeDir = null; this.onboarding = null;
    this.phase = 'welcome';
  }
  async openProfile(pid: string) {
    if (!this.home) return;
    await this.closeCollection();
    const p = await this.home.loadProfile(pid);
    await this.home.setLastProfile(pid);
    this.profile = p;
    if (p.lastCollection && p.collections.some(c => c.id === p.lastCollection)) await this.openCollection(p.lastCollection);
    else if (p.collections[0]) await this.openCollection(p.collections[0].id);
    else this.phase = 'collections';
  }
  async renameProfile(pid: string, name: string) {
    const home = this.home;
    if (!home || !name.trim()) return;
    const p = { ...(this.profile?.id === pid ? this.profile : await home.loadProfile(pid)), name: name.trim() };
    await home.saveProfile(p);
    if (this.profile?.id === pid) this.profile = p;
    this.home = null; this.home = home;   // the profile list lives in home.index
  }
  async deleteProfile(pid: string) {
    if (!this.home) return;
    if (this.profile?.id === pid) { await this.closeCollection(); this.profile = null; }
    await this.home.deleteProfile(pid);
    this.phase = 'profiles';
  }
  switchProfile() { void this.closeCollection().then(() => { this.profile = null; this.phase = 'profiles'; }); }

  async createCollection(name: string) {
    if (!this.home || !this.profile) return;
    const c = await this.home.createCollection(this.profile, name);
    this.profile = { ...this.profile };
    await this.openCollection(c.id);
  }
  async openCollection(cid: string) {
    if (!this.home || !this.profile || !this.homeDir) return;
    await this.closeCollection();
    const s = await CollectionStore.load(this.homeDir, this.profile.id, cid);
    s.onChange = () => { this.version++; };
    s.onDirty = () => this.scheduleFlush();
    this.store = s;
    if (this.profile.lastCollection !== cid) { this.profile = { ...this.profile, lastCollection: cid }; await this.home.saveProfile(this.profile); }
    this.found = [];
    this.analysis = { ...this.analysis, paused: s.meta.autoAnalyse === false };
    if (s.damaged.length) this.notice = 'Some files in your MCO folder couldn’t be read and were set aside (' + s.damaged.join(', ') + ', saved as .damaged). Anything they held may need re-importing or re-scanning.';
    await this.loadRoots();
    await this.loadLoose();
    this.phase = 'library';
    this.version++;
    this.enqueueAll();
    this.onOpened?.();
    void this.detectLibraries();
  }
  async renameCollection(name: string) {
    const s = this.store;
    if (!s || !this.home || !this.profile || !name.trim()) return;
    s.meta.name = name.trim(); s.saveMeta();
    const ref = this.profile.collections.find(c => c.id === s.meta.id);
    if (ref) { ref.name = s.meta.name; this.profile = { ...this.profile }; await this.home.saveProfile(this.profile); }
  }
  async deleteCollection(cid: string) {
    if (!this.home || !this.profile) return;
    if (this.store?.meta.id === cid) { await this.closeCollection(); }
    await this.home.deleteCollection(this.profile, cid);
    this.profile = { ...this.profile };
    if (this.profile.collections[0]) await this.openCollection(this.profile.collections[0].id);
    else this.phase = 'collections';
  }
  private async closeCollection() {
    this.stopAnalysis();
    await this.flush();
    this.store = null; this.roots = [];
    this.looseHandles.clear(); this.looseGranted = new Set();
  }

  // ─── Saving ────────────────────────────────────────────────────────────────
  private scheduleFlush() {
    if (this.readOnly) return;
    this.unsaved = true;
    clearTimeout(this.flushTimer);
    this.flushTimer = window.setTimeout(() => void this.flush(), 800);
  }
  async flush() {
    const s = this.store;
    if (!s || this.readOnly || !s.hasPending) { this.unsaved = false; return; }
    clearTimeout(this.flushTimer);
    this.saving = true;
    try { await s.flush(); this.saveError = ''; }
    catch (e) {
      console.error(e);
      // Say it once (the save is retried quietly), and again only if the problem changes.
      const msg = 'Couldn’t save some changes to your MCO folder: ' + ((e as Error).message || e) + ' MCO keeps retrying.';
      if (msg !== this.saveError) { this.saveError = msg; this.notice = msg; }
    }
    finally { this.saving = false; this.unsaved = s.hasPending; if (s.hasPending) this.scheduleFlush(); }
  }

  // ─── Music folders ─────────────────────────────────────────────────────────
  private async loadRoots() {
    const out: RootState[] = [];
    for (const r of this.store?.meta.roots ?? []) {
      const dir = await platform.folderHandle(r.handleKey);
      out.push({ root: r, dir, granted: dir ? await platform.permission(dir, 'read', false) : false });
    }
    this.roots = out;
  }
  rootState(id: string | null) { return this.roots.find(r => r.root.id === id) ?? null; }

  async addFolder(dropped?: FileSystemDirectoryHandle) {
    const s = this.store;
    if (!s) return;
    let picked;
    try { picked = dropped ? await platform.rememberFolder(dropped) : await platform.pickMusicFolder(); }
    catch (e) { if ((e as DOMException).name !== 'AbortError') this.notice = (e as Error).message; return; }
    if (dropped && !(await platform.permission(dropped, 'read', true))) { await platform.forgetFolder(picked.key); return; }
    const same = await Promise.all(this.roots.map(async r => r.dir ? r.dir.isSameEntry(picked.dir) : false));
    if (same.some(Boolean)) { this.notice = '“' + picked.dir.name + '” is already one of this collection’s music folders.'; await platform.forgetFolder(picked.key); return; }
    const root: Root = { id: newId(), name: picked.dir.name, absPath: null, handleKey: picked.key, addedAt: now() };
    s.meta.roots.push(root); s.saveMeta();
    this.roots = [...this.roots, { root, dir: picked.dir, granted: true }];
    await this.scanRoot(root.id);
  }
  /** A folder whose handle is gone (restored backup, cleared browser data): choose it again. */
  async relinkFolder(id: string) {
    const s = this.store, r = s?.meta.roots.find(x => x.id === id);
    if (!s || !r) return;
    let picked;
    try { picked = await platform.pickMusicFolder(); } catch (e) { if ((e as DOMException).name !== 'AbortError') this.notice = (e as Error).message; return; }
    await platform.forgetFolder(r.handleKey);
    r.handleKey = picked.key; s.saveMeta();
    this.roots = this.roots.map(x => x.root.id === id ? { root: r, dir: picked.dir, granted: true } : x);
    await this.scanRoot(id);
  }
  async reconnectFolder(id: string) {
    const r = this.rootState(id);
    if (!r?.dir) return;
    if (await platform.permission(r.dir, 'read', true)) { this.roots = this.roots.map(x => x.root.id === id ? { ...x, granted: true } : x); this.enqueueAll(); }
  }
  async removeFolder(id: string) {
    const s = this.store, r = this.rootState(id);
    if (!s || !r) return;
    s.meta.roots = s.meta.roots.filter(x => x.id !== id); s.saveMeta();
    s.putTracks([...s.tracks.values()].filter(t => t.rootId === id).map(t => ({ ...t, status: 'unlinked' as const, rootId: null, relPath: null })));
    await platform.forgetFolder(r.root.handleKey);
    this.roots = this.roots.filter(x => x.root.id !== id);
    this.found = this.found.filter(f => f.rootId !== id);
  }
  async setRootPath(id: string, absPath: string) {
    const s = this.store, r = s?.meta.roots.find(x => x.id === id);
    if (!s || !r) return;
    r.absPath = absPath.trim() || null; s.saveMeta();
    this.roots = this.roots.map(x => x.root.id === id ? { ...x, root: r } : x);
  }

  async scanRoot(id: string) {
    const s = this.store, r = this.rootState(id);
    if (!s || !r?.dir || this.job) return;
    this.job = { text: 'Scanning ' + r.root.name + '…', done: 0, total: null };
    try {
      const { files, libraries } = await scanFolder(r.dir, n => { this.job = { text: 'Scanning ' + r.root.name + '…', done: n, total: null }; });
      this.found = [...this.found.filter(f => f.rootId !== id), ...libraries.map(l => ({ ...l, rootId: id }))];
      this.job = { text: 'Reading file details…', done: 0, total: files.length };
      const entries = [], handles = new Map<string, FileSystemFileHandle>();
      for (let i = 0; i < files.length; i++) {
        const f = await files[i].handle.getFile();
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
      const { added, linked, missing } = applyScan(s, id, entries);
      // Quick tags from the start of each new file; the background analysis fills in the rest.
      this.job = { text: 'Reading tags…', done: 0, total: added.length };
      const batch: Track[] = [];
      for (let i = 0; i < added.length; i++) {
        const t = added[i], h = handles.get(t.relPath!);
        if (h) batch.push(await quickTags(t, await h.getFile()));
        if (batch.length >= 200 || i === added.length - 1) { s.putTracks(batch.splice(0)); this.job = { text: 'Reading tags…', done: i + 1, total: added.length }; }
      }
      const bits = [added.length + ' new track' + (added.length === 1 ? '' : 's')];
      if (linked) bits.push(linked + ' imported track' + (linked === 1 ? '' : 's') + ' linked');
      if (missing) bits.push(missing + ' missing');
      if (libraries.length) bits.push(libraries.length + ' DJ librar' + (libraries.length === 1 ? 'y' : 'ies') + ' found');
      this.notice = r.root.name + ': ' + bits.join(', ') + '.';
      void this.detectLibraries();
    } catch (e) { console.error(e); this.notice = 'Couldn’t scan ' + r.root.name + ': ' + ((e as Error).message || e); }
    finally { this.job = null; }
    this.enqueueAll();
  }

  // ─── Finding DJ libraries ──────────────────────────────────────────────────
  /** Look for DJ libraries in every folder MCO may read: music folders, the MCO folder, remembered places. */
  async detectLibraries() {
    const s = this.store;
    if (!s) return;
    // A request while a search runs (a new place, an import) runs another search right after it.
    if (this.detecting) { this.detectAgain = true; return; }
    this.detecting = true;
    try {
      const where: { place: string; name: string; dir: FileSystemDirectoryHandle }[] = [];
      for (const r of this.roots) if (r.dir && r.granted) where.push({ place: r.root.id, name: r.root.name, dir: r.dir });
      if (this.homeDir && this.homeKind === 'folder') where.push({ place: 'home', name: this.homeName, dir: this.homeDir });
      const places = await platform.libraryPlaces(), states: { key: string; name: string; granted: boolean }[] = [];
      for (const p of places) {
        const granted = await platform.permission(p.dir, 'read', false);
        states.push({ key: p.key, name: p.dir.name, granted });
        if (granted) where.push({ place: p.key, name: p.dir.name, dir: p.dir });
      }
      this.places = states;
      const found: typeof this.detected = [];
      for (const w of where) {
        for (const d of await findLibraries(w.dir, w.place === 'home' ? 2 : 3)) {
          if (found.some(x => x.place === w.place && x.relPath === d.relPath)) continue;
          const src = [...s.sources.values()].find(x => x.origin?.place === w.place && x.origin.relPath === d.relPath)
            ?? [...s.sources.values()].find(x => !x.origin && x.app === d.kind && x.fileName === (d.relPath.split('/').pop() ?? ''));
          const status = !src ? 'new' : src.origin && d.modified > src.origin.modified + 1000 ? 'changed' : 'imported';
          found.push({ ...d, place: w.place, placeName: w.name, status, sourceId: src?.id ?? null });
        }
      }
      if (this.store === s) this.detected = found;
    } catch (e) { console.warn('Library detection failed', e); }
    finally { this.detecting = false; }
    if (this.detectAgain) { this.detectAgain = false; await this.detectLibraries(); }
  }
  private detectAgain = false;
  /** Allow another folder to look in (remembered), then look again. */
  async addLibraryPlace(startIn: 'music' | 'documents' = 'documents') {
    try { await platform.addLibraryPlace(startIn); } catch (e) { if ((e as DOMException).name !== 'AbortError') this.notice = (e as Error).message; return; }
    await this.detectLibraries();
  }
  async allowLibraryPlace(key: string) {
    const p = (await platform.libraryPlaces()).find(x => x.key === key);
    if (p && await platform.permission(p.dir, 'read', true)) await this.detectLibraries();
  }
  async forgetLibraryPlace(key: string) { await platform.forgetLibraryPlace(key); await this.detectLibraries(); }
  /** Remember where an import came from (so the panel can offer Update). */
  markOrigin(sourceId: string, origin: { place: string; relPath: string; modified: number }) {
    const src = this.store?.sources.get(sourceId);
    if (src) this.store!.putSource({ ...src, origin });
  }

  // ─── Imports ───────────────────────────────────────────────────────────────
  importLibrary(lib: ImportedLibrary, fileName: string): ImportReport | null {
    const s = this.store;
    if (!s) return null;
    const r = applyImport(s, lib, fileName);
    this.enqueueAll();
    return r;
  }
  deleteSource(id: string) {
    const s = this.store, src = s?.sources.get(id);
    if (!s || !src) return;
    for (const l of [...s.lists.values()]) if (l.origin?.sourceId === id && !l.parentId) s.deleteList(l.id);
    for (const l of [...s.lists.values()]) if (l.origin?.sourceId === id) s.deleteList(l.id);
    const drop: string[] = [], keep: Track[] = [];
    for (const st of src.tracks) {
      const t = s.tracks.get(st.trackId);
      if (!t) continue;
      const sources = t.sources.filter(x => x !== id);
      if (!sources.length && t.status === 'unlinked') drop.push(t.id); else keep.push({ ...t, sources });
    }
    s.putTracks(keep);
    for (const t of drop) s.removeTrack(t);
    s.deleteSource(id);
  }

  // ─── Playlists ─────────────────────────────────────────────────────────────
  childLists(parentId: string | null): List[] {
    return [...(this.store?.lists.values() ?? [])].filter(l => l.parentId === parentId).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  }
  createList(kind: 'folder' | 'playlist', name: string, parentId: string | null = null, items: string[] = []): List | null {
    const s = this.store;
    if (!s) return null;
    const l: List = { schemaVersion: SCHEMA, id: newId(), kind, name: name.trim() || (kind === 'folder' ? 'New folder' : 'New playlist'), parentId, position: this.childLists(parentId).length, notes: '', items, origin: null, createdAt: now() };
    s.putList(l);
    return l;
  }
  updateList(id: string, patch: Partial<Pick<List, 'name' | 'notes' | 'items' | 'parentId' | 'position'>>) {
    const s = this.store, l = s?.lists.get(id);
    if (s && l) s.putList({ ...l, ...patch });
  }
  deleteList(id: string) { this.store?.deleteList(id); }
  setListColor(id: string, color: string | null) { const l = this.store?.lists.get(id); if (l) this.store!.putList({ ...l, color }); }
  /** Put a list at `index` among the children of `parentId` (moving it into / out of folders too). */
  placeList(id: string, parentId: string | null, index: number) {
    const s = this.store, l = s?.lists.get(id);
    if (!s || !l) return;
    for (let p = parentId; p; p = s.lists.get(p)?.parentId ?? null) if (p === id) return;   // never into itself
    const sibs = this.childLists(parentId).filter(x => x.id !== id);
    sibs.splice(Math.max(0, Math.min(index, sibs.length)), 0, { ...l, parentId });
    sibs.forEach((x, i) => { if (x.id === id || x.position !== i) s.putList({ ...x, position: i }); });
    if (l.parentId !== parentId) for (const [i, x] of this.childLists(l.parentId).entries()) if (x.position !== i) s.putList({ ...x, position: i });
  }
  /** One step up or down among its siblings. */
  nudgeList(id: string, dir: -1 | 1) {
    const l = this.store?.lists.get(id);
    if (!l) return;
    const i = this.childLists(l.parentId).findIndex(x => x.id === id);
    this.placeList(id, l.parentId, i + dir);
  }
  setTrackNotes(id: string, notes: string) {
    const t = this.store?.tracks.get(id);
    if (t && (t.notes ?? '') !== notes) this.store!.putTrack({ ...t, notes: notes || undefined });
  }
  /** Make a playlist's stored order the order it's shown in (e.g. after sorting by BPM). */
  setListOrder(id: string, items: string[]) {
    const l = this.store?.lists.get(id);
    if (l && items.length === l.items.length) this.updateList(id, { items });
  }
  /** The user's own rating, in half stars (0.5–5); null or 0 clears it. */
  rateTracks(ids: string[], rating: number | null) {
    const s = this.store;
    if (!s) return;
    const r = rating == null || rating <= 0 ? null : Math.min(5, Math.round(rating * 2) / 2);
    s.putTracks(ids.map(id => s.tracks.get(id)).filter((t): t is Track => !!t).map(t => ({ ...t, rating: r })));
  }
  addToList(id: string, trackIds: string[], at?: number) {
    const l = this.store?.lists.get(id);
    if (!l || l.kind !== 'playlist') return 0;
    const add = trackIds.filter(t => !l.items.includes(t));
    const items = [...l.items];
    items.splice(at ?? items.length, 0, ...add);
    this.updateList(id, { items });
    return add.length;
  }
  removeFromList(id: string, trackIds: string[]) {
    const l = this.store?.lists.get(id);
    if (l) this.updateList(id, { items: l.items.filter(t => !trackIds.includes(t)) });
  }
  moveInList(id: string, trackIds: string[], to: number) {
    const l = this.store?.lists.get(id);
    if (!l) return;
    const moving = l.items.filter(t => trackIds.includes(t));
    const before = l.items.slice(0, to).filter(t => !trackIds.includes(t)).length;
    const rest = l.items.filter(t => !trackIds.includes(t));
    rest.splice(before, 0, ...moving);
    this.updateList(id, { items: rest });
  }
  /** Move a list into a folder (or to the top level), at the end. Refuses to nest a folder in itself. */
  moveList(id: string, parentId: string | null) {
    const s = this.store;
    if (!s) return;
    for (let p = parentId; p; p = s.lists.get(p)?.parentId ?? null) if (p === id) return;
    this.updateList(id, { parentId, position: this.childLists(parentId).length });
  }
  listsContaining(trackId: string): List[] { return [...(this.store?.lists.values() ?? [])].filter(l => l.items.includes(trackId)); }
  listPath(l: List): string {
    const names = [l.name];
    for (let p = l.parentId; p; p = this.store?.lists.get(p)?.parentId ?? null) names.unshift(this.store?.lists.get(p)?.name ?? '');
    return names.join(' › ');
  }

  // ─── Files and background analysis ─────────────────────────────────────────
  async fileFor(t: Track): Promise<File> {
    if (t.fileKey) return this.looseFile(t, true);
    const r = this.rootState(t.rootId);
    if (!r?.dir || !t.relPath) throw new Error('This track isn’t linked to a file yet. Add the music folder it lives in.');
    if (!r.granted) {
      if (!(await platform.permission(r.dir, 'read', true))) throw new Error('MCO needs access to “' + r.root.name + '” again.');
      this.roots = this.roots.map(x => x.root.id === r.root.id ? { ...x, granted: true } : x);
    }
    return fileAt(r.dir, t.relPath);
  }
  /** Can this track's file be read right now without asking the user? */
  canRead(t: Track) {
    if (t.status !== 'linked') return false;
    if (t.fileKey) return t.fileKey.startsWith('copy:') || this.looseGranted.has(t.id);
    return !!this.rootState(t.rootId)?.granted;
  }
  private async loadLoose() {
    const granted = new Set<string>();
    for (const t of this.store?.tracks.values() ?? []) {
      if (!t.fileKey?.startsWith('file:')) continue;
      const h = await platform.fileHandle(t.fileKey);
      if (!h) continue;
      this.looseHandles.set(t.id, h);
      if (await platform.permission(h, 'read', false)) granted.add(t.id);
    }
    this.looseGranted = granted;
  }
  private async looseFile(t: Track, ask: boolean): Promise<File> {
    const key = t.fileKey!;
    if (key.startsWith('copy:')) return fileAt(this.homeDir!, key.slice(5));
    const h = this.looseHandles.get(t.id) ?? await platform.fileHandle(key);
    if (!h) throw Object.assign(new Error('MCO lost track of this file. Add it again.'), { name: 'NotFoundError' });
    this.looseHandles.set(t.id, h);
    if (!this.looseGranted.has(t.id)) {
      if (!(await platform.permission(h, 'read', ask))) throw new Error('MCO needs your permission to read “' + t.fileName + '” again.');
      this.looseGranted = new Set([...this.looseGranted, t.id]);
    }
    return h.getFile();
  }

  // ─── Songs added on their own ──────────────────────────────────────────────
  /** Add songs by handle (picked or dropped; Chromium). A song inside a music folder uses that folder. */
  async addFiles(handles: FileSystemFileHandle[]) {
    const s = this.store;
    if (!s || this.job) return;
    handles = handles.filter(h => AUDIO_EXT.test(h.name));
    if (!handles.length) { this.notice = 'Those aren’t audio files MCO can read.'; return; }
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
        let known = false;
        for (const t of s.tracks.values()) {
          const lh = this.looseHandles.get(t.id);
          if (rootId ? t.rootId === rootId && t.relPath === relPath : lh && await lh.isSameEntry(h)) { known = true; break; }
        }
        if (known) { already++; continue; }
        fresh.push({ file: await h.getFile(), rootId, relPath, handle: rootId ? null : h, key: rootId ? null : () => platform.rememberFile(h) });
      }
      const r = await this.createSongTracks(fresh);
      this.report(r.added, r.linked, already);
    } catch (e) { console.error(e); this.notice = 'Couldn’t add those songs: ' + ((e as Error).message || e); }
    finally { this.job = null; }
    this.enqueueAll();
  }
  /** Browsers without file handles: keep a copy of each song in the MCO folder. */
  async addFileCopies(files: File[]) {
    const s = this.store, home = this.homeDir;
    if (!s || !home || this.job) return;
    files = files.filter(f => AUDIO_EXT.test(f.name));
    if (!files.length) { this.notice = 'Those aren’t audio files MCO can read.'; return; }
    this.job = { text: 'Copying songs into MCO…', done: 0, total: files.length };
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
  }
  private async createSongTracks(items: SongInput[]) {
    const s = this.store!;
    // A song matching an imported track that has no file yet is linked to it rather than added again.
    const unlinked = [...s.tracks.values()].filter(t => t.status === 'unlinked');
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
      const t: Track = { ...base, status: 'linked', rootId: it.rootId, relPath: it.relPath, fileKey, fileName: it.file.name, size: it.file.size, mtime: it.file.lastModified };
      if (it.handle) { this.looseHandles.set(t.id, it.handle); granted.add(t.id); }
      out.push(await quickTags(t, it.file));
      this.job = { text: this.job?.text ?? 'Adding songs…', done: i + 1, total: items.length };
    }
    this.looseGranted = granted;
    s.putTracks(out);
    return { added: out.length - linked, linked };
  }
  private report(added: number, linked: number, already: number) {
    const bits: string[] = [];
    if (added) bits.push('Added ' + added + ' song' + (added === 1 ? '' : 's'));
    if (linked) bits.push(linked + ' linked to imported track' + (linked === 1 ? '' : 's'));
    if (already) bits.push(already + ' already in the collection');
    this.notice = (bits.join(', ') || 'Nothing added') + '.';
  }
  /** The full analysis stored for a track's page, if it's still valid for the file. */
  async trackDetails(t: Track) {
    const s = this.store, dir = await platform.cacheDir();
    return s && dir ? loadDetails(dir, s.meta.id, t.id, { size: t.size, mtime: t.mtime }) : null;
  }
  async saveTrackDetails(t: Track, info: FileInfo, res: AnalysisResult) {
    if (t.size == null || t.mtime == null) return;
    try { await this.putDetails(t.id, await encodeDetails(info, res, { size: t.size, mtime: t.mtime })); this.onThumb?.(t.id, makeThumb(res)); }
    catch (e) { console.warn('Couldn’t store the track analysis', e); }
  }
  private async putDetails(id: string, d: { header: DetailsHeader; bin: Uint8Array }) {
    const s = this.store, dir = await platform.cacheDir();
    if (s && dir) await writeDetails(dir, s.meta.id, id, d);
  }
  /** Take tracks out of the collection. Files on disk are never touched (copies MCO made are). */
  async removeTracks(ids: string[]) {
    const s = this.store;
    if (!s) return;
    for (const id of ids) {
      const t = s.tracks.get(id);
      if (!t) continue;
      if (t.fileKey?.startsWith('file:')) await platform.forgetFolder(t.fileKey);
      else if (t.fileKey?.startsWith('copy:') && this.homeDir) await removePath(this.homeDir, t.fileKey.slice(5));
      this.looseHandles.delete(id);
      s.removeTrack(id);
      const cache = await platform.cacheDir();
      if (cache) { await removeDetails(cache, s.meta.id, id).catch(() => {}); await removeFingerprint(cache, s.meta.id, id).catch(() => {}); }
    }
  }

  needsAnalysis(t: Track) {
    if (t.status !== 'linked') return false;
    const a = this.store?.analysis.get(t.id);
    return !a || a.v < ANALYSIS_VERSION || a.fileSize !== t.size || a.fileMtime !== t.mtime;
  }
  pendingCount() { let n = 0; for (const t of this.store?.tracks.values() ?? []) if (this.needsAnalysis(t)) n++; return n; }
  enqueueAll() {
    const s = this.store;
    if (!s) return;
    this.queue = [...s.tracks.values()].filter(t => this.canRead(t) && this.needsAnalysis(t) && !this.active.has(t.id))
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt)).map(t => t.id);
    this.pump();
  }
  /** Analyse this one next (the user is looking at it). */
  prioritize(id: string) { this.queue = [id, ...this.queue.filter(x => x !== id)]; }
  /** Background analysis on or off, kept per collection (a big import needn't all be analysed). */
  pauseAnalysis(p: boolean) {
    const s = this.store;
    if (s) { s.meta.autoAnalyse = !p; s.saveMeta(); }
    this.analysis = { ...this.analysis, paused: p };
    if (!p) this.enqueueAll();
  }
  /** Analyse these tracks now, even with background analysis off. */
  analyseNow(ids: string[]) {
    const s = this.store;
    if (!s) return 0;
    const want = ids.filter(id => { const t = s.tracks.get(id); return !!t && this.canRead(t) && this.needsAnalysis(t) && !this.active.has(id); });
    this.manual = [...want, ...this.manual.filter(x => !want.includes(x))];
    this.pump();
    return want.length;
  }
  private manual: string[] = [];
  private stopAnalysis() { this.queue = []; this.manual = []; this.pool?.stop(); this.pool = null; this.active.clear(); this.analysis = { running: 0, done: 0, failed: 0, paused: this.analysis.paused }; }

  private pump() {
    if (this.readOnly) return;
    // With background analysis off, only tracks asked for explicitly are analysed.
    if (this.analysis.paused && !this.manual.length) return;
    this.pool ??= new AnalysisPool();
    // One at a time while music is playing, so playback and the live view stay smooth.
    const limit = player.paused ? this.pool.size : 1;
    while (this.active.size < limit && (this.manual.length || (!this.analysis.paused && this.queue.length))) {
      const id = this.manual.length ? this.manual.shift()! : this.queue.shift()!;
      const t = this.store?.tracks.get(id);
      if (!t || !this.needsAnalysis(t)) continue;
      this.active.add(id);
      this.analysis = { ...this.analysis, running: this.active.size };
      void this.analyseOne(t).finally(() => {
        this.active.delete(id);
        this.analysis = { ...this.analysis, running: this.active.size };
        this.pump();
        if (!this.active.size && !this.manual.length && (this.analysis.paused || !this.queue.length)) this.onSettled?.();
      });
    }
  }
  private async analyseOne(t: Track) {
    const s = this.store, pool = this.pool;
    if (!s || !pool) return;
    let file: File;
    try { file = t.fileKey ? await this.looseFile(t, false) : await fileAt(this.rootState(t.rootId)!.dir!, t.relPath!); }
    catch (e) { if ((e as DOMException).name === 'NotFoundError') s.putTrack({ ...t, status: 'missing' }); return; }
    try {
      const r = await pool.analyze(file, file.lastModified);
      if (this.store !== s) return;
      // The stored analysis and fingerprint go first: once a track shows as analysed, its page opens instantly.
      if (r.details) await this.putDetails(t.id, r.details).catch(e => console.warn('Couldn’t store the track analysis', e));
      if (r.fp) { const d = await platform.cacheDir(); if (d) await writeFingerprint(d, s.meta.id, t.id, r.fp).catch(e => console.warn('Couldn’t store the fingerprint', e)); }
      if (this.store !== s) return;
      if (r.thumb) this.onThumb?.(t.id, r.thumb);
      s.putAnalysis(t.id, r.summary);
      const cur = s.tracks.get(t.id) ?? t;
      const f = tagFields(r.info.tags);
      const upd: Track = { ...cur, size: file.size, mtime: file.lastModified, format: formatOf(r.info), duration: r.duration || cur.duration };
      for (const k of ['title', 'artist', 'album', 'genre', 'label', 'comment', 'year'] as const) if (!upd[k] && f[k]) upd[k] = f[k];
      s.putTrack(upd);
      this.analysis = { ...this.analysis, done: this.analysis.done + 1 };
    } catch (e) {
      if (this.store !== s) return;
      s.putAnalysis(t.id, failed(String((e as Error)?.message || 'The browser couldn’t decode it.').replace(/^(EncodingError: )?(Unable to decode.*|decode failed)$/i, 'The browser couldn’t decode it.'), { size: file.size, mtime: file.lastModified }));
      this.analysis = { ...this.analysis, done: this.analysis.done + 1, failed: this.analysis.failed + 1 };
    }
  }

  private fail(e: unknown) { console.error(e); this.error = String((e as Error)?.message || e); this.phase = 'error'; }
}

async function quickTags(t: Track, file: File): Promise<Track> {
  const out = { ...t };
  try {
    const head = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
    let info = blankInfo();
    try { info = parseContainer(head); } catch { /* partial file: tags may still be there */ }
    const f = tagFields(info.tags);
    for (const k of ['title', 'artist', 'album', 'genre', 'label', 'comment', 'year'] as const) if (!out[k] && f[k]) out[k] = f[k];
    if (info.container !== 'Unknown') out.format = formatOf(info);
    if (info.duration && !out.duration) out.duration = info.duration;
  } catch { /* unreadable: fall back to the name */ }
  if (!out.title) { const n = nameFields(out.fileName); out.title = n.title; if (!out.artist) out.artist = n.artist; }
  return out;
}

export const lib = new Library();
