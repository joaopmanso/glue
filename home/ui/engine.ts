/* GLUE Home's engine (crates/glue-engine, ADR 0153–0160): everything GLUE Home does is in Rust; its settings window asks
   it for the library as it sees it, and shows its status (bridge.ts). */
import { invoke } from '@tauri-apps/api/core';
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

export const describe = () => invoke<LibraryInfo | null>('engine_cmd', { cmd: { cmd: 'describe' } }).catch(() => null);
