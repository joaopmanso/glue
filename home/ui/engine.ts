/* GLUE Home is the library's engine (ADR 0104), native since 0.52 (crates/glue-engine, ADR 0153): a GLUE tab's
   requests (edits, the feed of changes, jobs) are answered in Rust, which writes the GLUE folder itself. What's left
   here, until the analysis queue and the shared sync are native too (the plan's E3, E4), is how they use the
   engine's stores: one per collection, in Rust, so nothing is ever written from a stale copy. */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { StoreOp } from '../../src/store/collection';
import type { AnalysisSummary, Track } from '../../src/store/types';

export interface EngineStatus { rev: number; jobs: { kind: string; left: number; total: number }[] }

const cmd = <T>(c: Record<string, unknown>) => invoke<T>('engine_cmd', { cmd: c });

export const on: { event: ((text: string) => void) | null; changed: (() => void) | null; edited: ((p: string, c: string, paths: string[]) => void) | null; added: (() => void) | null } = { event: null, changed: null, edited: null, added: null };

/** The engine's status, as it last said it (the settings window shows its jobs). */
let last: EngineStatus = { rev: 0, jobs: [] };
export const status = () => last;
const refresh = () => cmd<EngineStatus>({ cmd: 'status' }).then(s => { last = s; on.changed?.(); }).catch(() => {});

/** What the engine says, to the service page's hooks. */
export async function listenToEngine() {
  await listen<string>('engine-event', e => on.event?.(e.payload));
  await listen<{ p: string; c: string; paths: string[] }>('engine-edited', e => on.edited?.(e.payload.p, e.payload.c, e.payload.paths));
  await listen('engine-added', () => on.added?.());
  await listen('engine-changed', () => void refresh());
  void refresh();
}

/** A collection's store loaded (a shared one as this computer, put right once, ADR 0108). */
export const ensure = (p: string, c: string) => cmd<boolean>({ cmd: 'ensure', p, c });
/** A song and its analysis, as the engine's store has them. */
export const song = (p: string, c: string, id: string) => cmd<{ track: Track | null; analysis: AnalysisSummary | null }>({ cmd: 'song', p, c, id });
/** Changes into the engine's store, saved (the analysis's results): the files written. */
export const apply = (p: string, c: string, ops: StoreOp[]) => cmd<string[]>({ cmd: 'apply', p, c, ops });
/** Files a sync wrote, read again into the store (and in a GLUE tab's feed). */
export const reload = (p: string, c: string, paths: string[]) => paths.length ? cmd<boolean>({ cmd: 'reload', p, c, paths }) : Promise.resolve(true);
/** A tab saved this collection itself just now: read it again. */
export const drop = (p: string, c: string) => cmd<boolean>({ cmd: 'drop', p, c }).catch(() => false);
/** A GLUE tab from before the engine holds the lease: nothing kept goes stale. */
export const forget = () => void cmd<boolean>({ cmd: 'forget' }).catch(() => {});
/** The files written since the last sync; undefined: look at every file this time (ADR 0107). */
export const takeWritten = (p: string, c: string) => cmd<string[] | null>({ cmd: 'takeWritten', p, c }).then(x => x ?? undefined);
/** A sync that failed: what it was to look at is looked at next time. */
export const writtenAgain = (p: string, c: string, paths: string[] | undefined) => void cmd<boolean>({ cmd: 'writtenAgain', p, c, paths: paths ?? null }).catch(() => {});
/** Into a GLUE tab's feed: `analysed`, songs whose analysis is now in GLUE Home's cache. */
export const changed = (p: string, c: string, paths: string[], analysed?: string[]) => void cmd<boolean>({ cmd: 'changed', p, c, paths, analysed: analysed ?? [] }).catch(() => {});
/** This computer's numbers in a shared collection (ADR 0112), and whether songs wait for their info to be written. */
export const counts = (p: string, c: string) => cmd<{ tracks: number; songs: number; holds: boolean; unwritten: boolean }>({ cmd: 'counts', p, c });
/** Edited song info into this computer's files (ADR 0071), the cache following their new size and date. */
export const writeUnwritten = (p: string, c: string) => cmd<{ written: number; failed: number; why: string; away: string[] }>({ cmd: 'writeUnwritten', p, c });
