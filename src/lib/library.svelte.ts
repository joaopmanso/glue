/* The library: GLUE folder → profile → collection, kept in memory and written back to JSON files.
   Components read `lib.version` to re-derive views after any change. */
import { HomeStore } from '../store/home';
import { record, time, timeAsync } from '../core/perf';
import { djValues, listsByTrack, type DjValues } from '../core/library/indexes';
import { importLists as importListsInto } from '../store/linked';

const NO_DJ = new Map<string, DjValues>(), NO_LISTS = new Map<string, List[]>(), NO_LINKED = new Map<string, List>();
import { CollectionStore, type LoadOpts } from '../store/collection';
import { writeUnwritten } from '../store/writeInfo';
import { LOOSE, absorbTracks, applyImport, applyScan, blankLibTrack, tidyTracks, type ImportReport } from '../store/merge';
import { fileAt, removePath, writeBlob } from '../store/fsx';
import { matchTracks } from '../core/library/match';
import { ANALYSIS_VERSION, INCOMING_ROOT, SCHEMA, VERDICT_VERSION, newId, type AnalysisSummary, type List, type Prep, type Profile, type Root, type Track } from '../store/types';
import type { ImportedLibrary } from '../core/interop/types';
import { scanFolder, type FoundLibrary } from '../core/library/scan';
import { fileHead, fileMeta } from '../core/library/files';
import { findLibraries, libraryAt, type Detected } from '../core/library/detect';
import { makeThumb, makeWaveThumb } from '../core/library/thumb';
import { AUDIO_EXT, INFO_FIELDS, fillInfo, formatOf, nameFields, tagFields, type InfoField } from '../core/library/tags';
import { failed, summarize } from '../core/library/summary';
import { afterAnalysis, analysed, needsAnalysis } from '../core/library/analysed';
import { classify } from '../core/audio/verdict';
import { addTags, cleanTag, removeTags, tagKey, tagsOf, uniqTags } from '../core/library/tagging';
import { encodeDetails, loadDetails, removeDetails, restampDetails, writeDetails, type DetailsHeader } from '../store/details';
import type { Cover } from '../workers/cover';
import { playable, playsNatively, typeOfName } from './playable';
import { removeFingerprint, writeFingerprint } from '../store/fingerprints';
import { autoBackup, buildBackup, readBackup, writeBackup, type BackupManifest } from '../store/backup';
import type { ZipEntry } from '../core/zip';
import { downloadBlob } from './download';
import { themes } from './themes.svelte';
import type { AnalysisResult, FileInfo } from '../core/types';
import { blankInfo, parseContainer } from '../core/formats/parse';
import * as platform from '../platform';
import { AnalysisPool } from './pool';
import { player } from './player.svelte';
import { stems } from './stems.svelte';

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
  private unsavedSince = 0;
  private pool: AnalysisPool | null = null;
  private queue: string[] = [];
  private active = new Set<string>();
  /** Songs added on their own: their handles, and which ones we may read without asking. */
  private looseHandles = new Map<string, FileSystemFileHandle>();
  looseGranted = $state.raw<Set<string>>(new Set());
  /** Hooks for derived views (duplicates): a collection opened / closed, the background analysis went quiet. */
  onOpened: (() => void) | null = null;
  onSettled: (() => void) | null = null;
  /** A collection is about to show: the player restores its queue first, so a song started at once
      isn't overwritten by the restored queue (a race once did, 2026-09-27). */
  onQueue: ((cid: string) => void) | null = null;
  /** A track's mini spectrogram is ready (the thumbnail cache stores it). */
  onThumb: ((id: string, data: Uint8Array) => void) | null = null;
  /** …and its mini waveform (the user's list, 2026-09-27). */
  onWave: ((id: string, data: Uint8Array) => void) | null = null;
  /** A cover found at analysis (ADR 0072): stored before the track names it. */
  onArt: ((c: Cover) => Promise<void>) | null = null;
  /** A collection from GLUE Cloud on screen instead of a local one (ADR 0040): nothing is analysed,
      scanned or written to this computer; edits go to the device that owns the data. */
  /** Sync hooks (lib/sync): a local profile's files were saved / a collection opened. */
  onFlushed: ((pid: string) => void) | null = null;
  onCollectionOpened: ((pid: string, cid: string) => void) | null = null;
  /** The GLUE folder (sync reads the profile's files from it). */
  get homeHandle() { return this.homeDir; }
  /** First run: after the profile, a step that explains how to add music. */
  onboarding = $state<null | 'music'>(null);
  /** A backup chosen on the start screen, restored once the GLUE folder is chosen. */
  pendingRestore = $state.raw<{ manifest: BackupManifest; entries: ZipEntry[] } | null>(null);

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void this.flush(); });
      window.addEventListener('pagehide', () => void this.flush());
    }
    stems.onBusy = busy => { this.stemsBusy = busy; if (!busy) this.pump(); };
  }

  // ─── GLUE folder ────────────────────────────────────────────────────────────
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
    // The GLUE folder's look wins over this browser's (another computer opens with the same theme).
    const look = this.home.index.appearance;
    if (look && (look.theme !== themes.theme || look.mode !== themes.mode)) themes.set(look.theme, look.mode);
    themes.onChange = (theme, mode) => { if (!this.readOnly) void this.home?.setAppearance({ theme, mode }); };
    if (this.pendingRestore) { const b = this.pendingRestore; this.pendingRestore = null; await this.applyBackup(b, true); return; }
    const last = this.home.index.lastProfile;
    if (last && this.home.index.profiles.some(p => p.id === last)) await this.openProfile(last);
    else this.phase = 'profiles';
  }
  // ─── Home mode and back (ADR 0051) ────────────────────────────────────────
  /** GLUE Home stopped while the library was open on its disk: '' (fine), 'needs-access' (the browser's
      own folder needs a click to be used), 'no-folder' (this browser never had the folder itself). */
  homeLost = $state<'' | 'needs-access' | 'no-folder'>('');
  private switching = false;
  /** On GLUE Home's disk now. */
  get onHome() { return platform.isHomeDir(this.homeDir); }
  /** GLUE Home stopped: carry on with the browser's own handles, the library staying open. Callers at
      the same time share one switch. */
  private leaving: Promise<void> | null = null;
  leaveHomeMode() { return (this.leaving ??= this.leaveOnce().finally(() => { this.leaving = null; })); }
  private async leaveOnce() {
    if (!this.onHome) return;
    platform.leaveHome();
    const b = await platform.browserHome();
    if (!b) { this.homeLost = 'no-folder'; return; }
    if (!b.granted) { this.homeLost = 'needs-access'; return; }
    await this.useDisk(b.dir);
  }
  /** The click that lets the browser use its own GLUE folder again (while GLUE Home is stopped). */
  async allowBrowserFolder() {
    const b = await platform.browserHome();
    if (b && await platform.permission(b.dir, 'readwrite', true)) await this.useDisk(b.dir);
  }
  /** GLUE Home is back: onto its disk again, if it has this library's GLUE folder. */
  async enterHomeMode() {
    if (this.onHome || this.switching || !this.home) return;
    const dir = await platform.homeDirFor(this.homeLost ? null : this.homeDir);
    if (!dir) return;
    // What was saved while GLUE Home was away is on disk first.
    if (!this.homeLost) await this.flush();
    await this.useDisk(dir);
  }
  /** Move the open library onto another disk: the same folder, reached another way. Unsaved changes
      are written there; music folders and the incoming folder are looked up again. */
  private async useDisk(dir: FileSystemDirectoryHandle) {
    const home = this.home;
    if (!home) return;
    this.switching = true;
    try {
      this.homeDir = dir; home.root = dir; this.homeName = dir.name; this.homeLost = '';
      const s = this.store;
      if (s) {
        s.root = dir;
        this.stopAnalysis();
        await this.loadRoots();
        await this.adoptIncoming();
        this.version++;
        this.scheduleFlush();
        this.enqueueAll();
        void this.writeInfo();
      }
    } finally { this.switching = false; }
  }

  /** Only one tab writes to the GLUE folder; others open read-only. */
  private unlock: (() => void) | null = null;
  private async takeLock() {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (!locks) return;
    await new Promise<void>(resolve => {
      void locks.request('mco-writer', { ifAvailable: true }, lock => {
        this.readOnly = !lock;
        resolve();
        // Held for the life of the tab, unless it hands the library to another tab (lib/tabs).
        return lock ? new Promise<void>(r => { this.unlock = r; }) : undefined;
      });
    });
  }
  /** Another GLUE tab takes over: stop, and let go of the GLUE folder. */
  releaseFolder() {
    this.stopAnalysis();
    this.unlock?.(); this.unlock = null;
    this.readOnly = true;
  }

  // ─── Profiles and collections ──────────────────────────────────────────────
  /** `cloudSync: false`: "Just this computer" (ADR 0092), so even signed in nothing is uploaded. */
  async createProfile(name: string, opts: { cloudSync?: boolean } = {}) {
    if (!this.home) return;
    let p = await this.home.createProfile(name);
    if (opts.cloudSync === false) { p = { ...p, cloudSync: false }; await this.home.saveProfile(p); }
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
    downloadBlob(blob, `GLUE backup - ${safe} - ${day}.zip`);
    return blob.size;
  }
  /** Read a backup zip (checks it's a GLUE backup a this version can open). */
  async readBackupFile(file: File) { return readBackup(new Uint8Array(await file.arrayBuffer())); }
  profileExists(pid: string) { return !!this.home?.index.profiles.some(p => p.id === pid); }
  /** Put a backup's profile into the GLUE folder and open it. `replace`: an existing copy is removed first. */
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
  /** Delete every file GLUE made (in its folder and in the browser) and start again. */
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
  /** The incoming folder was scanned (TO BE SORTED shows what's in it now). */
  onIncoming: (() => void) | null = null;
  /** Things shown but not saved, by who shows them ('incoming': TO BE SORTED). */
  private groups = new Map<string, Set<string>>();
  private group(key: string) { let g = this.groups.get(key); if (!g) this.groups.set(key, g = new Set()); return g; }
  private dropGroup(key: string) {
    const s = this.store, g = this.groups.get(key);
    if (!s || !g) return;
    s.dropShown(g);
    g.clear();
  }
  /** Show tracks and lists that aren't this collection's own (never saved). */
  showGroup(key: string, tracks: Track[], lists: List[], analysis?: Map<string, AnalysisSummary>) {
    const s = this.store;
    if (!s) return;
    this.dropGroup(key);
    const g = this.group(key);
    for (const t of tracks) g.add(t.id);
    for (const l of lists) g.add(l.id);
    s.putShown(tracks, lists, analysis);
    this.version++;
  }
  /** This device's own tracks and playlists (without other devices' ones). */
  ownTracks(): Track[] { const s = this.store; return s ? [...s.tracks.values()].filter(t => !s.ephemeral.has(t.id)) : []; }
  /** Turn cloud sync on or off for a profile of this GLUE folder (it's on by default, ADR 0042). */
  async setProfileSync(pid: string, on: boolean) {
    const home = this.home;
    if (!home) return;
    const p = { ...(this.profile?.id === pid ? this.profile : await home.loadProfile(pid)), cloudSync: on };
    await home.saveProfile(p);
    if (this.profile?.id === pid) this.profile = p;
    this.home = null; this.home = home;
  }
  async profileInfo(pid: string) { return this.profile?.id === pid ? this.profile : this.home ? this.home.loadProfile(pid) : null; }
  /** The profile the profile screen was opened from: "Back to the library" and the logo return to it. */
  lastProfile = $state<string | null>(null);
  switchProfile() { const from = this.profile?.id ?? null; void this.closeCollection().then(() => { this.lastProfile = from; this.profile = null; this.phase = 'profiles'; }); }
  /** Back to the profile the profile screen was opened from, if it's still there. */
  backToLibrary() { const id = this.lastProfile; if (id && this.home?.index.profiles.some(p => p.id === id)) { void this.openProfile(id); return true; } return false; }

  async createCollection(name: string) {
    if (!this.home || !this.profile) return;
    const c = await this.home.createCollection(this.profile, name);
    this.profile = { ...this.profile };
    await this.openCollection(c.id);
  }
  async openCollection(cid: string) {
    if (!this.home || !this.profile || !this.homeDir) return;
    await this.closeCollection();
    const t0 = performance.now();
    const s = await CollectionStore.load(this.homeDir, this.profile.id, cid, await this.loadOpts?.() ?? {});
    s.onChange = () => { this.version++; };
    // A sync brought files in (a shared collection, ADR 0094): redraw, nothing to save or send.
    s.onReloaded = () => { this.version++; };
    s.onDirty = () => this.scheduleFlush();
    this.store = s;
    if (this.profile.lastCollection !== cid) { this.profile = { ...this.profile, lastCollection: cid }; await this.home.saveProfile(this.profile); }
    this.found = [];
    this.analysis = { ...this.analysis, paused: s.meta.autoAnalyse === false };
    if (s.damaged.length) this.notice = 'Some files in your GLUE folder couldn’t be read and were set aside (' + s.damaged.join(', ') + ', saved as .damaged). Anything they held may need re-importing or re-scanning.';
    await this.loadRoots();
    // Tracks naming imports that are gone, and tracks without a file whose file is here after all
    // (music folders' places known by now).
    if (!this.readOnly) { const t = tidyTracks(s); if (t.dropped || t.relinked) console.info('Tidied: ' + t.dropped + ' leftover tracks of removed imports, ' + t.relinked + ' tracks linked to their file'); }
    await this.loadLoose();
    await this.adoptIncoming();
    this.onQueue?.(cid);
    this.phase = 'library';
    this.version++;
    record('open.collection', performance.now() - t0);
    this.enqueueAll();
    void this.writeInfo();
    this.onOpened?.();
    this.onCollectionOpened?.(this.profile.id, cid);
    // The day's backup of this profile, a little after it opens (ADR 0090).
    const pid = this.profile.id;
    setTimeout(() => { const d = this.homeDir, p = this.profile; if (d && p?.id === pid && !this.readOnly) void autoBackup(d, p).catch(e => console.warn('GLUE: the daily backup failed', e)); }, 20_000);
    void this.detectLibraries();
    void this.recheckVerdicts();
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
  /** How a collection is opened (a shared one is seen as this computer, ADR 0094, 0108). */
  loadOpts: (() => LoadOpts | Promise<LoadOpts>) | null = null;
  /** Before the open collection closes (cloud sync lets go of it, ADR 0089). */
  onCollectionClosing: (() => void) | null = null;
  /** Closed: saved, analysis stopped, nothing more written for it (before its files change under it). */
  async closeCollection() {
    if (this.store) this.onCollectionClosing?.();
    this.stopAnalysis();
    // Until nothing is left: what's marked while a save runs (the analysis's last song…) is saved by the
    // next one, and after this there's no next one for this store.
    for (let i = 0; i < 5 && this.store?.hasPending && !this.readOnly; i++) await this.flush();
    await this.beforeClose?.().catch(() => {});   // GLUE Home's engine has every change made here (ADR 0104)
    this.store = null; this.roots = []; this.groups.clear();
    this.looseHandles.clear(); this.looseGranted = new Set();
  }

  // ─── Saving ────────────────────────────────────────────────────────────────
  private scheduleFlush() {
    if (this.readOnly) return;
    this.unsaved = true;
    clearTimeout(this.flushTimer);
    // A pause of 0.8 s, but never put off more than 3 s: a stream of changes (the analysis) mustn't
    // keep new songs unsaved.
    const now = Date.now();
    this.unsavedSince ||= now;
    this.flushTimer = window.setTimeout(() => void this.flush(), Math.max(0, Math.min(800, this.unsavedSince + 3000 - now)));
  }
  async flush() {
    const s = this.store;
    if (!s || this.readOnly || !s.hasPending) { this.unsaved = false; this.unsavedSince = 0; return; }
    clearTimeout(this.flushTimer);
    this.unsavedSince = 0;
    this.saving = true;
    try { await s.flush(); this.saveError = ''; if (this.profile) this.onFlushed?.(this.profile.id); }
    catch (e) {
      console.error(e);
      // Say it once (the save is retried quietly), and again only if the problem changes.
      const msg = 'Couldn’t save some changes to your GLUE folder: ' + ((e as Error).message || e) + ' GLUE keeps retrying.';
      if (msg !== this.saveError) { this.saveError = msg; this.notice = msg; }
    }
    finally { this.saving = false; this.unsaved = s.hasPending; if (s.hasPending) this.scheduleFlush(); }
  }

  // ─── Music folders ─────────────────────────────────────────────────────────
  private async loadRoots() {
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
  }
  rootState(id: string | null) { return this.roots.find(r => r.root.id === id) ?? null; }
  /** The music folders the user chose (not the ones GLUE keeps for itself, like the incoming folder). */
  get musicFolders() { return this.roots.filter(r => !r.root.hidden); }

  /** In Home mode, GLUE Home's incoming folder is a hidden music folder of the open collection (ADR
      0051): songs sent to this computer are its own tracks, analysed and synced like any other, and
      one row with other devices' copies of them. They're TO BE SORTED (lib/incoming). */
  private async adoptIncoming() {
    const s = this.store, inc = await platform.incomingFolder();
    if (!s || !inc || this.readOnly) return;
    let r = s.meta.roots.find(x => x.id === INCOMING_ROOT);
    if (!r) { r = { id: INCOMING_ROOT, name: 'TO BE SORTED', absPath: inc.path, handleKey: 'home:' + INCOMING_ROOT, addedAt: now(), hidden: true }; s.meta.roots.push(r); s.saveMeta(); }
    else if (r.absPath !== inc.path) { r.absPath = inc.path; s.saveMeta(); }
    this.roots = [...this.roots.filter(x => x.root.id !== INCOMING_ROOT), { root: r, dir: inc.dir, granted: true }];
    await this.scanRoot(INCOMING_ROOT, { quiet: true });
    this.onIncoming?.();
  }
  /** GLUE Home moved a song out of the incoming folder into a music folder (top level, under
      `fileName`): the same track, now there. */
  movedFromIncoming(id: string, rootId: string, fileName: string) {
    const s = this.store, t = s?.tracks.get(id);
    if (!s || !t || t.rootId !== INCOMING_ROOT) return;
    s.putTrack({ ...t, rootId, relPath: fileName, fileName });
  }
  /** The incoming folder changed (a song arrived, or left it): scan it again. */
  /** False when it couldn't now (no folder, or another scan running): try again later. */
  async rescanIncoming() {
    if (!this.rootState(INCOMING_ROOT)?.dir || this.job) return false;
    await this.scanRoot(INCOMING_ROOT, { quiet: true });
    this.onIncoming?.();
    return true;
  }

  async addFolder(dropped?: FileSystemDirectoryHandle) {
    const s = this.store;
    if (!s) return;
    let picked: { dir: FileSystemDirectoryHandle; key: string; path?: string };
    const id = newId();
    try { picked = dropped ? await platform.rememberFolder(dropped) : await platform.pickMusicFolder(id); }
    catch (e) { if ((e as DOMException).name !== 'AbortError') this.notice = (e as Error).message; return; }
    if (dropped && !(await platform.permission(dropped, 'read', true))) { await platform.forgetFolder(picked.key); return; }
    const same = await Promise.all(this.roots.map(async r => r.dir ? r.dir.isSameEntry(picked.dir) : false));
    if (same.some(Boolean)) { this.notice = '“' + picked.dir.name + '” is already one of this collection’s music folders.'; await platform.forgetFolder(picked.key); return; }
    const root: Root = { id, name: picked.dir.name, absPath: picked.path ?? null, handleKey: picked.key, addedAt: now() };
    s.meta.roots.push(root); s.saveMeta();
    this.roots = [...this.roots, { root, dir: picked.dir, granted: true }];
    await this.scanRoot(root.id);
  }
  /** A folder whose handle is gone (restored backup, cleared browser data): choose it again. */
  async relinkFolder(id: string) {
    const s = this.store, r = s?.meta.roots.find(x => x.id === id);
    if (!s || !r) return;
    let picked;
    try { picked = await platform.pickMusicFolder(id); } catch (e) { if ((e as DOMException).name !== 'AbortError') this.notice = (e as Error).message; return; }
    await platform.forgetFolder(r.handleKey);
    r.handleKey = picked.key; if (picked.path) r.absPath = picked.path; s.saveMeta();
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

  /** `quiet`: no message when it's done (the incoming folder, scanned whenever it changes). */
  async scanRoot(id: string, opts: { quiet?: boolean } = {}) {
    const s = this.store, r = this.rootState(id);
    if (!s || !r?.dir || this.job) return;
    this.job = { text: 'Scanning ' + r.root.name + '…', done: 0, total: null };
    try {
      const { files, libraries } = await scanFolder(r.dir, n => { this.job = { text: 'Scanning ' + r.root.name + '…', done: n, total: null }; });
      this.found = [...this.found.filter(f => f.rootId !== id), ...libraries.map(l => ({ ...l, rootId: id }))];
      this.job = { text: 'Reading file details…', done: 0, total: files.length };
      const entries = [], handles = new Map<string, FileSystemFileHandle>();
      for (let i = 0; i < files.length; i++) {
        const f = await fileMeta(files[i].handle);
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
        if (h) batch.push(await quickTags(t, await fileHead(h, TAG_BYTES)));
        if (batch.length >= 200 || i === added.length - 1) { s.putTracks(batch.splice(0)); this.job = { text: 'Reading tags…', done: i + 1, total: added.length }; }
      }
      const bits = [added.length + ' new track' + (added.length === 1 ? '' : 's')];
      if (linked) bits.push(linked + ' imported track' + (linked === 1 ? '' : 's') + ' linked');
      if (missing) bits.push(missing + ' missing');
      if (libraries.length) bits.push(libraries.length + ' DJ librar' + (libraries.length === 1 ? 'y' : 'ies') + ' found');
      // A song that left the incoming folder was moved away or deleted there: it's no longer waiting.
      if (id === INCOMING_ROOT) for (const t of [...s.tracks.values()]) if (t.rootId === INCOMING_ROOT && t.status === 'missing' && !t.remote) s.removeTrack(t.id);
      if (!opts.quiet) this.notice = r.root.name + ': ' + bits.join(', ') + '.';
      void this.detectLibraries();
    } catch (e) { console.error(e); if (!opts.quiet) this.notice = 'Couldn’t scan ' + r.root.name + ': ' + ((e as Error).message || e); }
    finally { this.job = null; }
    this.enqueueAll();
  }

  // ─── Finding DJ libraries ──────────────────────────────────────────────────
  /** Look for DJ libraries in every folder GLUE may read: music folders, the GLUE folder, remembered places. */
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
      const add = (d: Detected, place: string, placeName: string) => {
        if (found.some(x => x.place === place && x.relPath === d.relPath)) return;
        // Only this computer's libraries: another computer's same app is that computer's (ADR 0099).
        const mine = [...s.sources.values()].filter(x => s.ownSource(x));
        const src = mine.find(x => x.origin?.place === place && x.origin.relPath === d.relPath)
          ?? mine.find(x => !x.origin && x.app === d.kind && x.fileName === (d.relPath.split('/').pop() ?? ''))
          // An Engine DJ set is one source: another database of it is part of that source.
          ?? (d.kind === 'engine' ? mine.find(x => x.app === 'engine') : undefined);
        const own = src?.origin?.place === place && src.origin.relPath === d.relPath;
        const status = !src ? 'new' : own && d.modified > src.origin!.modified + 1000 ? 'changed' : 'imported';
        found.push({ ...d, place, placeName, status, sourceId: src?.id ?? null });
      };
      for (const w of where) for (const d of await findLibraries(w.dir, w.place === 'home' ? 2 : 3)) add(d, w.place, w.name);
      // The DJ libraries GLUE Home follows (ADR 0065): their files are known, no looking around.
      for (const h of await platform.homeLibraries()) {
        const d = await libraryAt(h.dir, h.file).catch(() => null);
        if (d) add(d, h.place, h.name);
      }
      if (this.store === s) this.detected = found;
      // A library imported by hand (no place remembered) found here: it's kept up to date from now on
      // (ADR 0063). Of several (an Engine DJ set), the biggest file: the computer's own library.
      // modified 0: the next look reads it once, and keeps its tree.
      for (const src of s.sources.values()) {
        if (src.origin || this.store !== s || !s.ownSource(src)) continue;
        const d = found.filter(x => x.sourceId === src.id).sort((a, b) => b.size - a.size)[0];
        if (d) this.markOrigin(src.id, { place: d.place, relPath: d.relPath, modified: 0 });
      }
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
  /** Bring a DJ library's lists into GLUE, linked to it (ADR 0063); '' = all of them. */
  importLists(sourceId: string, ids: string[]): number {
    const s = this.store, src = s?.sources.get(sourceId);
    return s && src ? importListsInto(s, src, ids) : 0;
  }
  /** GLUE's copy of a DJ library's list, when it has one. */
  linkedCopy(sourceId: string, externalId: string): List | null {
    return this.memo('linked', s => s.rev.lists, s => {
      const m = new Map<string, List>();
      for (const l of s.lists.values()) if (l.origin) m.set(l.origin.sourceId + '\n' + l.origin.externalId, l);
      return m;
    }, NO_LINKED).get(sourceId + '\n' + externalId) ?? null;
  }
  deleteSource(id: string) {
    const s = this.store, src = s?.sources.get(id);
    if (!s || !src) return;
    for (const l of [...s.lists.values()]) if (l.origin?.sourceId === id && !l.parentId) s.deleteList(l.id);
    for (const l of [...s.lists.values()]) if (l.origin?.sourceId === id) s.deleteList(l.id);
    const drop: string[] = [], keep: Track[] = [];
    // Every track naming it (an import's list can miss tracks that later took its records in).
    for (const t of [...s.tracks.values()]) {
      if (!t.sources.includes(id)) continue;
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
  /** The Prepare tab's settings for a track (ADR 0052): \`undefined\` removes one. */
  setPrep(id: string, patch: Partial<Prep>) {
    const s = this.store, t = s?.tracks.get(id);
    if (!s || !t || this.readOnly) return;
    const prep: Prep = { ...t.prep, ...patch };
    for (const k of Object.keys(prep) as (keyof Prep)[]) if (prep[k] === undefined) delete prep[k];
    s.putTrack({ ...t, prep: Object.keys(prep).length ? prep : undefined });
  }
  /** How BPMs are shown for a profile (ADR 0052). */
  async setBpmRange(pid: string, range: Profile['bpmRange']) {
    const home = this.home;
    if (!home) return;
    const p: Profile = { ...(this.profile?.id === pid ? this.profile : await home.loadProfile(pid)), bpmRange: range };
    if (!range) delete p.bpmRange;
    await home.saveProfile(p);
    if (this.profile?.id === pid) this.profile = p;
    this.version++;
  }
  /** Add and remove tags on tracks (ADR 0032). Tags new to the collection join its tag list. */
  tagTracks(ids: string[], add: string[], remove: string[] = []) {
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
  }
  setListTags(id: string, tags: string[]) {
    const l = this.store?.lists.get(id);
    if (!l) return;
    const next = uniqTags(tags);
    this.store!.putList({ ...l, tags: next.length ? next : undefined });
    this.rememberTags(next);
  }
  /** Keep tags in the collection's list, so a tag made in GLUE stays offered while nothing uses it. */
  rememberTags(tags: string[]) {
    const s = this.store;
    if (!s || !tags.length) return;
    const all = s.meta.tags ?? [], next = uniqTags([...all, ...tags]);
    if (next.length !== all.length) { s.meta.tags = next; s.saveMeta(); }
  }
  /** Rename a tag everywhere (tracks, playlists, the tag list); renaming onto another tag merges them. */
  renameTag(from: string, to: string) {
    const s = this.store, name = cleanTag(to);
    if (!s || !name || tagKey(from) === '') return;
    const k = tagKey(from), swap = (tags: string[]) => tags.some(t => t.toLowerCase() === k) ? uniqTags(tags.map(t => t.toLowerCase() === k ? name : t)) : null;
    const ts: Track[] = [];
    for (const t of s.tracks.values()) { const n = swap(tagsOf(t)); if (n) ts.push({ ...t, tags: n }); }
    if (ts.length) s.putTracks(ts);
    for (const l of s.lists.values()) { const n = l.tags && swap(l.tags); if (n) s.putList({ ...l, tags: n }); }
    s.meta.tags = uniqTags((s.meta.tags ?? []).map(t => t.toLowerCase() === k ? name : t).concat(name)); s.saveMeta();
  }
  /** Remove a tag from every track and playlist, and from the tag list. */
  deleteTag(tag: string) {
    const s = this.store, k = tagKey(tag);
    if (!s || !k) return;
    const ts: Track[] = [];
    for (const t of s.tracks.values()) { const cur = tagsOf(t); if (cur.some(x => x.toLowerCase() === k)) ts.push({ ...t, tags: cur.filter(x => x.toLowerCase() !== k) }); }
    if (ts.length) s.putTracks(ts);
    for (const l of s.lists.values()) if (l.tags?.some(x => x.toLowerCase() === k)) s.putList({ ...l, tags: l.tags.filter(x => x.toLowerCase() !== k) });
    if (s.meta.tags?.some(x => x.toLowerCase() === k)) { s.meta.tags = s.meta.tags.filter(x => x.toLowerCase() !== k); s.saveMeta(); }
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
  /** Can this song's info be edited here: this computer's own, or another computer's (the edit goes to
      it, ADR 0087). Not a song waiting in an incoming folder (it's no collection's yet). */
  canEditInfo(t: Track) { return !this.readOnly && !(t.remote && (!t.remote.id || t.remote.incoming)); }
  /** Edit songs' info (ADR 0071): kept in GLUE at once, then written into the files of this computer's
      music folders by GLUE Home (now, or when it next runs). Another computer's songs: changed here and
      sent to that computer, which keeps it as its own edit (ADR 0087). Only the fields given change; a
      title can't be emptied. */
  editInfo(ids: string[], patch: { [K in InfoField]?: string }) {
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
  }
  /** Mark songs' verdicts as fine (false positives), or show GLUE's verdict again (`fine` false). The mark
      holds for the verdict each song has now; a different one later shows again. */
  markFine(ids: string[], fine: boolean) {
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
  }
  /** Can this song play here now: its file here, or another computer's GLUE Home streams it. */
  playsHere(t: Track) { return t.status === 'linked' && (t.remote ? this.canRead(t) : true); }
  /** Songs whose edited info isn't in their file yet. */
  unwrittenCount() { let n = 0; for (const t of this.store?.tracks.values() ?? []) if (t.unwritten?.length) n++; return n; }
  private writing: Promise<void> | null = null;
  /** Edited info into the files, through GLUE Home (Home mode only; the rest waits for it). */
  writeInfo() { return (this.writing ??= this.writeInfoOnce().finally(() => { this.writing = null; })); }
  private async writeInfoOnce() {
    const s = this.store;
    if (!s || this.readOnly || !platform.homeMode()) return;
    const stop = () => this.store !== s || this.readOnly || !platform.homeMode();
    let r: { failed: number; why: string };
    try {
      r = await writeUnwritten(s, (t, tags) => {
        const root = this.rootState(t.rootId)?.root;
        if (!root || !t.relPath) throw new Error('its music folder isn’t known here');
        return platform.writeTags(root, t.relPath, tags);
      }, {
        stop,
        restamp: async (t, was, now) => { const cache = await platform.cacheDir(); if (cache) await restampDetails(cache, s.meta.id, t.id, was, now); },
        fatal: e => (e as Error).name === 'HomeDown',
      });
    } catch { return; }
    const { failed, why } = r;
    if (failed) this.notice = 'GLUE Home couldn’t write the info into ' + (failed === 1 ? 'one song’s file' : failed + ' songs’ files') + ': ' + why + ' GLUE keeps the edits, and tries again when GLUE Home next connects.';
  }
  addToList(id: string, trackIds: string[], at?: number) {
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
  // ─── Indexes, rebuilt only when their part of the store changed (ADR 0059) ─────
  private memos = new Map<string, { store: CollectionStore; rev: number; value: unknown }>();
  private memo<T>(key: string, rev: (s: CollectionStore) => number, build: (s: CollectionStore) => T, empty: T): T {
    const s = this.store;
    if (!s) return empty;
    const r = rev(s), m = this.memos.get(key);
    if (m && m.store === s && m.rev === r) return m.value as T;
    const value = time('index.' + key, () => build(s));
    this.memos.set(key, { store: s, rev: r, value });
    return value;
  }
  /** What the imported DJ libraries say about each track (BPM, key, rating). */
  djIndex(): Map<string, DjValues> { return this.memo('dj', s => s.rev.sources, s => djValues(s.sources.values()), NO_DJ); }
  djOf(trackId: string): DjValues | null { return this.djIndex().get(trackId) ?? null; }
  /** The playlists and folders a track is in, in the lists' order. */
  listsContaining(trackId: string): List[] { return (this.memo('lists', s => s.rev.lists, s => listsByTrack(s.lists.values()), NO_LISTS).get(trackId) ?? []).slice(); }
  listPath(l: List): string {
    const names = [l.name];
    for (let p = l.parentId; p; p = this.store?.lists.get(p)?.parentId ?? null) names.unshift(this.store?.lists.get(p)?.name ?? '');
    return names.join(' › ');
  }

  // ─── Files and background analysis ─────────────────────────────────────────
  /** Another computer's songs, through its GLUE Home (lib/remoteFiles, ADR 0045). */
  remoteFile: ((t: Track) => Promise<File>) | null = null;
  canStream: ((t: Track) => boolean) | null = null;
  /** Another computer's song as a stream (ADR 0076), when its GLUE Home can: an address; null otherwise. */
  streamFor: ((t: Track) => Promise<string | null>) | null = null;
  /** Other computers' songs' covers, from their GLUE Home (ADR 0082): per track, its hash ('' none) and the JPEG. */
  remoteArt: ((ts: Track[], px: 64 | 320) => Promise<Map<string, { hash: string; bytes: Uint8Array | null }>>) | null = null;
  /** Is there a GLUE Home to ask for this song's cover? */
  artReachable: ((t: Track) => boolean) | null = null;
  /** Covers looked up on public services by a GLUE Home of the account (ADR 0086): per track its hash ('?'
      while looked up, '' none) and the JPEG; `refuse`: that album's cover is wrong. */
  findArt: ((ts: Track[], px: 64 | 320, refuse?: boolean) => Promise<Map<string, { hash: string; bytes: Uint8Array | null }>>) | null = null;
  canFindArt: (() => boolean) | null = null;
  /** What to play a song from (ADR 0076): an address that streams (this computer's GLUE Home's local link,
      or another computer's GLUE Home) when the browser plays the format by itself; otherwise the file. */
  async mediaFor(t: Track): Promise<Blob | string> {
    // Another computer's song: streamed when it can be; a connection that fails says so (not a silent
    // whole download, ADR 0084).
    if (t.remote) { const u = await this.streamFor?.(t); if (u) return u; }
    else if (!t.fileKey && t.rootId && t.relPath && t.status === 'linked' && platform.homeMode() && playsNatively(typeOfName(t.fileName))) {
      const r = this.rootState(t.rootId), link = r ? await platform.fileLink(r.root, t.relPath) : null;
      if (link) return link;
    }
    return playable(await this.fileFor(t));
  }
  async fileFor(t: Track): Promise<File> {
    try { return await this.fileFrom(t); }
    catch (e) {
      // GLUE Home stopped just now: carry on in the browser, and try once more from there.
      if ((e as Error).name !== 'HomeDown') throw e;
      await this.leaveHomeMode();
      if (this.onHome || this.homeLost) throw e;
      return this.fileFrom(t);
    }
  }
  private async fileFrom(t: Track): Promise<File> {
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
  }
  /** Can this track's file be read right now without asking the user? */
  canRead(t: Track) {
    if (t.status !== 'linked') return false;
    // Another computer's song (a merged collection, or the cloud library on a phone: ADR 0077) streams from it.
    if (t.remote) return !!this.canStream?.(t);
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
    if (!h) throw Object.assign(new Error('GLUE lost track of this file. Add it again.'), { name: 'NotFoundError' });
    this.looseHandles.set(t.id, h);
    if (!this.looseGranted.has(t.id)) {
      if (!(await platform.permission(h, 'read', ask))) throw new Error('GLUE needs your permission to read “' + t.fileName + '” again.');
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
  /** Browsers without file handles: keep a copy of each song in the GLUE folder. */
  async addFileCopies(files: File[]) {
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
  }
  private async createSongTracks(items: SongInput[]) {
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
      const t: Track = { ...base, status: 'linked', rootId: it.rootId, relPath: it.relPath, fileKey, fileName: it.file.name, size: it.file.size, mtime: it.file.lastModified };
      if (it.handle) { this.looseHandles.set(t.id, it.handle); granted.add(t.id); }
      out.push(await quickTags(t, new Uint8Array(await it.file.slice(0, TAG_BYTES).arrayBuffer())));
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
  /** After a verdict rule change: judge stored analyses again (no decoding), one at a time in the
      background. Only warnings and failures can change, so only those are re-read. */
  private async recheckVerdicts() {
    const s = this.store, dir = await platform.cacheDir();
    if (!s || !dir) return;
    const todo = [...s.analysis].filter(([, a]) => (a.vv ?? 1) < VERDICT_VERSION && !a.error && (a.grade === 'warn' || a.grade === 'bad')).map(([id]) => id);
    let cleared = 0;
    for (const id of todo) {
      if (this.store !== s) return;
      const t = s.tracks.get(id), prev = s.analysis.get(id);
      if (!t || !prev || (prev.vv ?? 1) >= VERDICT_VERSION) continue;
      try {
        const d = await loadDetails(dir, s.meta.id, id, { size: t.size, mtime: t.mtime });
        if (this.store !== s) return;
        if (!d) continue;   // no stored analysis: the next full analysis brings the new rules
        const next = summarize(d.info, d.res, classify(d.info, d.res), { size: prev.fileSize, mtime: prev.fileMtime });
        s.putAnalysis(id, { ...next, at: prev.at, fp: prev.fp });
        if (next.grade === 'ok' && prev.grade !== 'ok') cleared++;
      } catch (e) { console.warn('Couldn’t re-check the verdict of', id, e); }
      await new Promise(r => setTimeout(r, 0));   // stay out of the way of the page
    }
    if (cleared && this.store === s) this.notice = 'Quality verdicts updated: ' + cleared + ' track' + (cleared === 1 ? '' : 's') + ' with a gently rolled-off top end now count as lossless.';
  }
  /** The full analysis stored for a track's page, if it's still valid for the file. */
  async trackDetails(t: Track) {
    const s = this.store, dir = await platform.cacheDir();
    return s && dir ? loadDetails(dir, s.meta.id, t.id, { size: t.size, mtime: t.mtime }) : null;
  }
  async saveTrackDetails(t: Track, info: FileInfo, res: AnalysisResult) {
    if (t.size == null || t.mtime == null) return;
    try { await this.putDetails(t.id, await encodeDetails(info, res, { size: t.size, mtime: t.mtime })); this.onThumb?.(t.id, makeThumb(res)); this.onWave?.(t.id, makeWaveThumb(res)); }
    catch (e) { console.warn('Couldn’t store the track analysis', e); }
  }
  async putDetails(id: string, d: { header: DetailsHeader; bin: Uint8Array }) {
    const s = this.store, dir = await platform.cacheDir();
    if (s && dir) await writeDetails(dir, s.meta.id, id, d);
  }
  /** Copies whose files GLUE Home put aside or recycled (duplicates, ADR 0070) fold into the copy that
      stays: its playlists' places, the DJ libraries' records, rating, notes, tags and Prepare. */
  async foldCopies(into: Map<string, Track>) {
    const s = this.store;
    if (!s || !into.size) return;
    absorbTracks(s, into);
    const cache = await platform.cacheDir();
    if (cache) for (const id of into.keys()) { await removeDetails(cache, s.meta.id, id).catch(() => {}); await removeFingerprint(cache, s.meta.id, id).catch(() => {}); }
  }
  /** Take tracks out of the collection. Files on disk are never touched (copies GLUE made are). */
  async removeTracks(ids: string[]) {
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
  }

  needsAnalysis(t: Track) { return needsAnalysis(t, this.store?.analysis.get(t.id), ANALYSIS_VERSION); }
  pendingCount() { let n = 0; for (const t of this.store?.tracks.values() ?? []) if (this.needsAnalysis(t)) n++; return n; }
  enqueueAll() {
    const s = this.store;
    if (!s) return;
    // Another computer's songs are analysed there (and shared): never downloaded here to be analysed.
    this.queue = [...s.tracks.values()].filter(t => !t.remote && this.canRead(t) && this.needsAnalysis(t) && !this.active.has(t.id))
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
    this.analysisElsewhere?.pause(p);
    if (!p) this.enqueueAll();
  }
  /** Before the open collection closes: the changes still on their way to GLUE Home's engine (ADR 0104). */
  beforeClose: (() => Promise<void>) | null = null;
  /** This computer's GLUE Home analyses its songs (ADR 0103, 0104): lib/engine says so, and takes the asks. */
  analysisElsewhere: { active: () => boolean; now: (ids: string[]) => number; pause: (p: boolean) => void } | null = null;
  /** A song analysed elsewhere on this computer (its GLUE Home), taken in like one analysed here. */
  takeAnalysed(id: string, a: import('../core/library/analysed').Analysed) {
    const s = this.store, cur = s?.tracks.get(id);
    if (!s || !cur || cur.remote) return false;
    s.putAnalysis(id, a.summary);
    s.putTrack(afterAnalysis(cur, a));
    this.analysis = { ...this.analysis, done: this.analysis.done + 1, failed: this.analysis.failed + (a.summary.error ? 1 : 0) };
    return true;
  }
  /** This tab's own analysis stops (its GLUE Home took over, ADR 0103); nothing is paused. */
  stopOwnAnalysis() { const paused = this.analysis.paused; this.stopAnalysis(); this.analysis = { ...this.analysis, paused }; }
  /** Stop now: what runs stops, and background analysis is off until it's turned on again. */
  stopAnalysisNow() {
    this.pauseAnalysis(true);
    this.stopAnalysis();
  }
  /** Analyse these tracks now (asked for: analysed or not), even with background analysis off. */
  analyseNow(ids: string[]) {
    const s = this.store;
    if (!s) return 0;
    if (this.analysisElsewhere?.active()) return this.analysisElsewhere.now(ids);
    const want = ids.filter(id => { const t = s.tracks.get(id); return !!t && !t.remote && t.status === 'linked' && this.canRead(t) && !this.active.has(id); });
    for (const id of want) this.forced.add(id);
    this.manual = [...want, ...this.manual.filter(x => !want.includes(x))];
    this.pump();
    return want.length;
  }
  /** Asked for by hand: analysed again even if its analysis is up to date. */
  private forced = new Set<string>();
  private manual: string[] = [];
  /** Stem separation is running: no new analyses start (they'd compete for the processor and memory). */
  private stemsBusy = false;
  /** Bumped by every stop: an analysis that was running then is dropped, never stored as failed. */
  private stops = 0;
  private stopAnalysis() { this.stops++; this.queue = []; this.manual = []; this.pool?.stop(); this.pool = null; this.active.clear(); this.analysis = { running: 0, done: 0, failed: 0, paused: this.analysis.paused }; }

  private pump() {
    if (this.readOnly || this.stemsBusy) return;
    // This computer's GLUE Home analyses its songs (ADR 0103): none here.
    if (this.analysisElsewhere?.active()) return;
    // With background analysis off, only tracks asked for explicitly are analysed.
    if (this.analysis.paused && !this.manual.length) return;
    this.pool ??= new AnalysisPool();
    // One at a time while music is playing, so playback and the live view stay smooth.
    const limit = player.paused ? this.pool.size : 1;
    while (this.active.size < limit && (this.manual.length || (!this.analysis.paused && this.queue.length))) {
      const id = this.manual.length ? this.manual.shift()! : this.queue.shift()!;
      const t = this.store?.tracks.get(id);
      if (!t || (!this.needsAnalysis(t) && !this.forced.delete(id))) continue;
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
    const s = this.store, pool = this.pool, stops = this.stops;
    if (!s || !pool) return;
    let file: File;
    try { file = t.fileKey ? await this.looseFile(t, false) : await fileAt(this.rootState(t.rootId)!.dir!, t.relPath!); }
    catch (e) { if ((e as DOMException).name === 'NotFoundError') s.putTrack({ ...t, status: 'missing' }); return; }
    try {
      const r = await timeAsync('analysis.track', () => pool.analyze(file, file.lastModified));
      if (this.store !== s || this.stops !== stops) return;
      // The stored analysis and fingerprint go first: once a track shows as analysed, its page opens instantly.
      if (r.details) await this.putDetails(t.id, r.details).catch(e => console.warn('Couldn’t store the track analysis', e));
      if (r.fp) { const d = await platform.cacheDir(); if (d) await writeFingerprint(d, s.meta.id, t.id, r.fp).catch(e => console.warn('Couldn’t store the fingerprint', e)); }
      if (this.store !== s) return;
      if (r.thumb) this.onThumb?.(t.id, r.thumb);
      if (r.wave) this.onWave?.(t.id, r.wave);
      if (r.art) await this.onArt?.(r.art);
      s.putAnalysis(t.id, r.summary);
      s.putTrack(afterAnalysis(s.tracks.get(t.id) ?? t, analysed(r, file.size, file.lastModified)));
      this.analysis = { ...this.analysis, done: this.analysis.done + 1 };
    } catch (e) {
      if (this.store !== s || this.stops !== stops) return;   // stopped: not a failure, analysed another time
      s.putAnalysis(t.id, failed(String((e as Error)?.message || 'The browser couldn’t decode it.').replace(/^(EncodingError: )?(Unable to decode.*|decode failed)$/i, 'The browser couldn’t decode it.'), { size: file.size, mtime: file.lastModified }));
      this.analysis = { ...this.analysis, done: this.analysis.done + 1, failed: this.analysis.failed + 1 };
    }
  }

  private fail(e: unknown) { console.error(e); this.error = String((e as Error)?.message || e); this.phase = 'error'; }
}

/** Enough of a file's start for its tags (most files; the background analysis reads the rest). */
const TAG_BYTES = 512 * 1024;
async function quickTags(t: Track, head: Uint8Array): Promise<Track> {
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

/** Why another device's track can't be played or analysed here yet. */
export function remoteFileMessage(device: string) {
  return 'This track’s file is on ' + device + '. To play it here, run GLUE Home on ' + device + '.';
}


export const lib = new Library();
