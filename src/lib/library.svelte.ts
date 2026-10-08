/* The library: GLUE folder → profile → collection, kept in memory and written back to JSON files.
   Components read `lib.version` to re-derive views after any change. */

import { HomeStore } from '../store/home';
import { time } from '../core/perf';
import { CollectionStore, type LoadOpts } from '../store/collection';
import type { Alias, Profile, Root, Track } from '../store/types';
import type { FoundLibrary } from '../core/library/scan';
import type { Detected } from '../core/library/detect';
import type { DetailsHeader } from '../store/details';
import type { Cover } from '../workers/cover';
import type { BackupManifest } from '../store/backup';
import type { ZipEntry } from '../core/zip';
import * as platform from '../platform';
import { AnalysisPool } from './pool';
import { stems } from './stems.svelte';
import { glueFolder } from './library/glueFolder';
import { profiles } from './library/profiles';
import { collections } from './library/collections';
import { folders } from './library/folders';
import { djLibraries } from './library/djLibraries';
import { edits } from './library/edits';
import { files } from './library/files';
import { analysis } from './library/analysis';

type Phase = 'boot' | 'welcome' | 'reconnect' | 'profiles' | 'collections' | 'library' | 'error';
export interface RootState { root: Root; dir: FileSystemDirectoryHandle | null; granted: boolean }
export interface Job { text: string; done: number; total: number | null }

/* The fields are its state; its methods are in src/lib/library/, by concern (ADR 0146): glueFolder, profiles,
   collections, folders, djLibraries, edits, files, analysis. A new method goes in its concern's part. */
export class Library {
  phase = $state<Phase>('boot');
  error = $state('');
  homeKind = $state<'folder' | 'private'>('folder');
  homeName = $state('');
  home = $state.raw<HomeStore | null>(null);
  /** The GLUE folder's library: its one profile folder (`index.container`, ADR 0113). */
  profile = $state.raw<Profile | null>(null);
  /** Who's using GLUE: one of the account's artist aliases (ADR 0113). The library is the same for each. */
  alias = $state.raw<Alias | null>(null);
  /** How BPMs show (ADR 0052): the alias's choice. */
  get bpmRange() { return this.alias?.bpmRange ?? this.profile?.bpmRange; }
  /** The account's side of aliases (lib/profiles, signed in): made, changed and removed there first. */
  aliasCloud: { create(a: Alias): Promise<Alias>; update(a: Alias): Promise<Alias>; remove(id: string): Promise<void> } | null = null;
  store = $state.raw<CollectionStore | null>(null);
  roots = $state.raw<RootState[]>([]);
  found = $state.raw<(FoundLibrary & { rootId: string })[]>([]);
  /** DJ libraries found in allowed folders, with where they are and whether they're imported (ADR 0030). */
  detected = $state.raw<FoundDj[]>([]);
  detecting = $state(false);
  places = $state.raw<{ key: string; name: string; granted: boolean }[]>([]);
  version = $state(0);
  job = $state<Job | null>(null);
  noticeText = $state('');
  noticeTimer = 0;
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
  saveError = '';
  analysis = $state({ running: 0, done: 0, failed: 0, paused: false });
  homeDir: FileSystemDirectoryHandle | null = null;
  flushTimer = 0;
  unsavedSince = 0;
  pool: AnalysisPool | null = null;
  queue: string[] = [];
  active = new Set<string>();
  /** Songs added on their own: their handles, and which ones we may read without asking. */
  looseHandles = new Map<string, FileSystemFileHandle>();
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
  /** GLUE Home stopped while the library was open on its disk: '' (fine), 'needs-access' (the browser's
      own folder needs a click to be used), 'no-folder' (this browser never had the folder itself). */
  homeLost = $state<'' | 'needs-access' | 'no-folder'>('');
  switching = false;
  /** On GLUE Home's disk now. */
  get onHome() { return platform.isHomeDir(this.homeDir); }
  /** The switch back to the browser's own handles running now (callers at the same time share it). */
  leaving: Promise<void> | null = null;

  /** Lets go of the writer lock (another tab takes over). */
  unlock: (() => void) | null = null;
  /** The incoming folder was scanned (TO BE SORTED shows what's in it now). */
  onIncoming: (() => void) | null = null;
  /** Things shown but not saved, by who shows them ('incoming': TO BE SORTED). */
  groups = new Map<string, Set<string>>();
  /** The profile the profile screen was opened from: "Back to the library" and the logo return to it. */
  lastProfile = $state<string | null>(null);
  madeOnPurpose = new Set<string>();
  /** How a collection is opened (a shared one is seen as this computer, ADR 0094, 0108). */
  loadOpts: (() => LoadOpts | Promise<LoadOpts>) | null = null;
  /** Before the open collection closes (cloud sync lets go of it, ADR 0089). */
  onCollectionClosing: (() => void) | null = null;
  /** The music folders the user chose (not the ones GLUE keeps for itself, like the incoming folder). */
  get musicFolders() { return this.roots.filter(r => !r.root.hidden); }
  detectAgain = false;
  writing: Promise<void> | null = null;
  infoAgain: ReturnType<typeof setTimeout> | undefined;
  awayTold = new Set<string>();
  /** Indexes, rebuilt only when their part of the store changed (ADR 0059). */
  memos = new Map<string, { store: CollectionStore; rev: number; value: unknown }>();
  memo<T>(key: string, rev: (s: CollectionStore) => number, build: (s: CollectionStore) => T, empty: T): T {
    const s = this.store;
    if (!s) return empty;
    const r = rev(s), m = this.memos.get(key);
    if (m && m.store === s && m.rev === r) return m.value as T;
    const value = time('index.' + key, () => build(s));
    this.memos.set(key, { store: s, rev: r, value });
    return value;
  }

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
  /** GLUE Home's copy of a song's analysis follows its file after this tab wrote its tags (ADR 0110). */
  restampHome: ((id: string, was: { size: number | null; mtime: number | null }, now: { size: number; mtime: number }) => Promise<void>) | null = null;
  /** A song's full analysis in GLUE Home's cache (Home mode, ADR 0110). */
  detailsFromHome: ((id: string) => Promise<{ header: DetailsHeader; bin: Uint8Array } | null>) | null = null;
  /** Songs that ran out of time or memory this visit: tried at most three times. */
  tries = new Map<string, number>();
  /** Before the open collection closes: the changes still on their way to GLUE Home's engine (ADR 0104). */
  beforeClose: (() => Promise<void>) | null = null;
  /** GLUE Home is the app here (ADR 0162, lib/engine): its engine runs this library, known before it opens; the
      page starts none of the library's work then (sync, analysis, backups, repairs, looking for libraries). */
  homeRuns: () => boolean = () => false;
  /** The DJ libraries GLUE Home finds in the music folders and the GLUE folder (ADR 0167; lib/engine). */
  homeDjFind: (() => Promise<(Omit<Detected, 'handle'> & { place: string; placeName: string })[]>) | null = null;
  /** This computer's GLUE Home analyses its songs (ADR 0103, 0104): lib/engine says so, and takes the asks. */
  analysisElsewhere: { active: () => boolean; now: (ids: string[]) => number; pause: (p: boolean) => void } | null = null;
  /** Where GLUE Home finds a folder dropped onto the page (Home mode), by its name and a song in it; set by the engine client. */
  homeFind: ((id: string, name: string, sample: string) => Promise<string | null>) | null = null;
  /** Where GLUE Home finds a song dropped onto the page (Home mode, ADR 0125); set by the engine client. */
  homeFindFile: ((name: string, size: number, roots: string[]) => Promise<{ path: string | null; folder?: { id: string; relPath: string } }>) | null = null;
  /** Asked for by hand: analysed again even if its analysis is up to date. */
  forced = new Set<string>();
  manual: string[] = [];
  /** Stem separation is running: no new analyses start (they'd compete for the processor and memory). */
  stemsBusy = false;
  /** Bumped by every stop: an analysis that was running then is dropped, never stored as failed. */
  stops = 0;

  fail(e: unknown) { console.error(e); this.error = String((e as Error)?.message || e); this.phase = 'error'; }
}

/* Its methods, by concern, in src/lib/library/: glueFolder, profiles, collections, folders, djLibraries, edits, files, analysis. */
type Parts = typeof glueFolder & typeof profiles & typeof collections & typeof folders & typeof djLibraries & typeof edits & typeof files & typeof analysis;
export interface Library extends Parts {}
for (const part of [glueFolder, profiles, collections, folders, djLibraries, edits, files, analysis]) for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(part))) Object.defineProperty(Library.prototype, k, { ...d, enumerable: false });

export { remoteFileMessage } from './library/files';

export const lib = new Library();

/** `routes`: every place|relPath the same file was found by (a music folder and a place inside it…). `also`: an
    Engine DJ set's other databases (one per drive), imported with it. `followed`: GLUE Home follows this file. */
export type FoundDj = Detected & { place: string; placeName: string; status: 'new' | 'imported' | 'changed'; sourceId: string | null; routes: string[]; followed?: boolean; also?: FoundDj[] };
