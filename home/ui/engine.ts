/* GLUE Home is the library's engine (ADR 0104), native since 0.52 (crates/glue-engine, ADR 0153, 0154): a GLUE tab's
   requests (edits, the feed of changes, jobs, the analysis) are answered in Rust, which writes the GLUE folder itself
   and analyses this computer's songs. What's left here, until the shared sync and the answers to other devices are
   native too (the plan's E4), is how they use the engine: the library as it sees it, a song analysed now, the queue's
   state. */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Collection } from '../../src/store/types';

export interface EngineStatus { rev: number; jobs: { kind: string; left: number; total: number }[] }

/** The analysis queue's state (crates/glue-engine/src/queue.rs `State`): GLUE Home's window and a tab show it. */
export interface AnalysisState {
  paused: boolean;
  /** Analysing now, and the songs' names. */
  running: number; current: string[];
  /** Still to analyse; analysed and failed since GLUE Home started; results not in the collection yet. */
  left: number; done: number; failed: number; waiting: number;
  /** Who takes the results in: GLUE Home, the open tab (it asked), or the open tab analysing by itself. */
  by: 'home' | 'tab' | 'tab-self' | 'idle';
  /** Why results wait to go into the library, if something keeps them ('' nothing: they go in soon). */
  why: string;
  /** Songs this run left for later: their music folder isn't reachable (a network folder not connected). */
  away: number;
  /** How fast, over the last two minutes, and a suggestion from it (ADR 0136). */
  speed?: Speed | null; suggestion?: string;
  /** The songs running now by step: reading their file, or analysing it (ADR 0136). */
  steps?: { reading: number; analysing: number };
}
export interface Speed {
  /** Songs analysed a minute, over the last two minutes. */
  perMin: number;
  /** MB read a second, from this computer's drives and from network folders. */
  localMBs: number; netMBs: number;
  /** A song's average time reading (this computer's drives, network folders) and analysing, ms. */
  localReadMs: number; netReadMs: number; analyseMs: number;
  songs: number; netSongs: number;
  /** Songs a minute over the last ten minutes, in half-minute steps, oldest first (the window's little chart). */
  history: number[];
}

/** The profiles and collections in the GLUE folder (and each collection's music folders). */
export interface LibraryInfo { profiles: { id: string; name: string; collections: { id: string; name: string; roots: Collection['roots'] }[] }[] }
/** Where a song is on this computer; `folder`: its music folder, found somewhere other than the settings say. */
export interface SongFile { path: string; name: string; mtime: number; size: number | null; folder: { id: string; path: string } | null }

const cmd = <T>(c: Record<string, unknown>) => invoke<T>('engine_cmd', { cmd: c });

export const on: {
  event: ((text: string) => void) | null; changed: (() => void) | null; edited: ((p: string, c: string, paths: string[]) => void) | null;
  analysis: (() => void) | null; made: ((p: string, c: string, id: string) => void) | null;
} = { event: null, changed: null, edited: null, analysis: null, made: null };

/** The engine's status, as it last said it (the settings window shows its jobs). */
let last: EngineStatus = { rev: 0, jobs: [] };
export const status = () => last;
const refresh = () => cmd<EngineStatus>({ cmd: 'status' }).then(s => { last = s; on.changed?.(); }).catch(() => {});
/** The analysis queue's state, as it last said it. */
let queue: AnalysisState = { paused: false, running: 0, current: [], left: 0, done: 0, failed: 0, waiting: 0, by: 'idle', why: '', away: 0 };
export const analysisState = () => queue;

/** What the engine says, to the service page's hooks. */
export async function listenToEngine() {
  await listen<string>('engine-event', e => on.event?.(e.payload));
  await listen<{ p: string; c: string; paths: string[] }>('engine-edited', e => on.edited?.(e.payload.p, e.payload.c, e.payload.paths));
  await listen<AnalysisState>('engine-analysis', e => { queue = e.payload; on.analysis?.(); });
  await listen<{ p: string; c: string; id: string }>('engine-made', e => on.made?.(e.payload.p, e.payload.c, e.payload.id));
  await listen('engine-changed', () => void refresh());
  void refresh();
  void cmd<AnalysisState>({ cmd: 'analysisState' }).then(s => { queue = s; on.analysis?.(); }).catch(() => {});
}

/** A GLUE tab from before the engine holds the lease: nothing kept goes stale. */
export const forget = () => void cmd<boolean>({ cmd: 'forget' }).catch(() => {});
/** The shared collections synced with GLUE Cloud now (ADR 0097, 0155: in Rust): the files that changed here. */
export const syncShared = () => cmd<number>({ cmd: 'syncShared' }).catch(e => { throw new Error(String(e)); });

// ---- the library as GLUE Home sees it (crates/glue-engine/src/library.rs) ------------------------------------------
export const describe = () => cmd<LibraryInfo | null>({ cmd: 'describe' }).catch(() => null);
/** The profile folder a collection is in, asked for with another folder's id (ADR 0108). */
export const folderOf = (p: string, c: string) => cmd<string>({ cmd: 'folderOf', p, c });
/** A song's file on this computer (asked for by another device). */
export const trackPath = (p: string, c: string, id: string) => cmd<SongFile>({ cmd: 'trackPath', p, c, id }).catch(e => { throw new Error(String(e)); });
/** Every music folder of every shared collection, looked for: what was found, and what wasn't. */
export const locateAll = () => cmd<{ folders: Record<string, string>; missing: { id: string; name: string; collection: string }[] }>({ cmd: 'locateAll' });

// ---- the analysis (crates/glue-engine/src/queue.rs) ----------------------------------------------------------------
/** A song analysed now, its parts into the cache (`tell`: for the library too; false: only this cache's). */
export const analyseSong = (p: string, c: string, id: string, tell = true) => cmd<{ bytes: number; readMs: number; analyseMs: number }>({ cmd: 'analyseSong', p, c, id, tell }).catch(e => { throw new Error(String(e)); });
/** A GLUE tab's ask over the channel: it takes the results in, pauses, asks for songs now, says which it took. */
export const analysisAsk = (a: { p: string; c: string; take?: boolean; pause?: boolean; now?: string[]; names?: Record<string, string>; taken?: string[] }) => cmd<{ state: AnalysisState; waiting: string[] }>({ cmd: 'analysisAsk', ...a });
/** Look for songs to analyse now. */
export const analysisRun = () => void cmd({ cmd: 'analysisRun' }).catch(() => {});
/** Restart: songs that failed this session are tried again, everything looked for anew. */
export const analysisRestart = () => void cmd({ cmd: 'analysisRestart' }).catch(() => {});
/** Paused or not, as the settings say. */
export const setPaused = (on: boolean) => void cmd({ cmd: 'setPaused', on }).catch(() => {});
/** Another device streamed a song from here just now: the analysis eases off (ADR 0138). */
export const played = () => void cmd({ cmd: 'played' }).catch(() => {});
