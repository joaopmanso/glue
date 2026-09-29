/* GLUE Home is the library's engine (ADR 0104): on this computer it's the only writer of the GLUE folder, and a
   GLUE tab here is its screen. The tab reads the library through the local link and asks for every change:
   - `edit`: the changes the tab made on its copy (StoreOp records), applied to the engine's own store and
     saved, in order;
   - `job`: work that takes a while and must go on without the tab (removing songs), kept in GLUE Home's
     cache and carried on after a restart;
   - `analyse` / `pause`: the analysis queue (analysis.ts);
   - `wait`: the feed of changes (which files, which songs analysed), a long poll;
   - `status`: what the engine is doing.
   One store per collection, shared by everything here that writes it (the edits, the analysis, the sync),
   so no copy is ever stale. A GLUE tab from before the engine (it writes by itself and holds the lease):
   the engine forgets its stores and writes nothing while the lease is held. */
import { bridge, type HomeConfig } from './bridge';
import { HomeDisk } from '../../src/platform/homeDisk';
import { CollectionStore, type StoreOp } from '../../src/store/collection';
import { removePath } from '../../src/store/fsx';
import { meFor, type SharedCollection } from '../../src/core/shared/project';
import type { Collection } from '../../src/store/types';

export interface Job { id: string; kind: 'remove-tracks'; p: string; c: string; ids: string[]; done: number; at: number }
export interface EngineStatus { rev: number; jobs: { kind: string; left: number; total: number }[] }
type Change = { rev: number; p: string; c: string; paths: string[]; analysed?: string[] };

const JOBS = 'j/jobs.json';
const key = (p: string, c: string) => p + '/' + c;
const stores = new Map<string, Promise<CollectionStore>>();
let rev = 0, jobs: Job[] = [], jobsLoaded = false, running = false;
const log: Change[] = [];
let wake: (() => void)[] = [];
export const on: { event: ((text: string) => void) | null; changed: (() => void) | null } = { event: null, changed: null };

/** The GLUE folder, written through the local link with GLUE Home's own (full) token. */
async function glueDir(cfg: HomeConfig) {
  const port = await bridge.localPort();
  if (!port || !cfg.localToken) throw new Error('GLUE Home’s local link isn’t running');
  const disk = new HomeDisk('http://127.0.0.1:' + port, cfg.localToken), roots = await disk.roots();
  if (!roots.glue) throw new Error('No GLUE folder chosen in GLUE Home');
  return disk.dir(roots.glue);
}

/** A collection's store, loaded once and kept (a shared one as this computer). */
export function store(cfg: HomeConfig, p: string, c: string): Promise<CollectionStore> {
  const k = key(p, c);
  let s = stores.get(k);
  if (!s) {
    s = (async () => {
      const glue = await glueDir(cfg);
      let meta: SharedCollection | Collection | null = null;
      try { meta = JSON.parse(await bridge.glueRead(`profiles/${p}/collections/${c}/collection.json`)); } catch { /* checked by load */ }
      const me = meta && (meta as SharedCollection).shared ? meFor(meta as SharedCollection, p, cfg.deviceId) ?? undefined : undefined;
      const st = await CollectionStore.load(glue, p, c, me ? { me } : {});
      st.onWrote = paths => changed(p, c, paths);
      return st;
    })();
    stores.set(k, s);
    s.catch(() => stores.delete(k));
  }
  return s;
}
/** Files changed under a store by another writer (the shared sync): read again, and in the feed. */
export async function reload(cfg: HomeConfig, p: string, c: string, paths: string[]) {
  if (!paths.length) return;
  const s = stores.get(key(p, c));
  if (s) await (await s).reloadFiles(paths).catch(() => {});
  changed(p, c, paths);
}
/** A tab saved this collection itself just now (before it became the engine's screen): read it again. */
export function drop(p: string, c: string) { stores.delete(key(p, c)); }
/** A GLUE tab from before the engine holds the lease (it writes by itself): nothing kept here goes stale. */
export function forget() { stores.clear(); }

export function changed(p: string, c: string, paths: string[], analysed?: string[]) {
  rev++;
  log.push({ rev, p, c, paths, ...(analysed?.length ? { analysed } : {}) });
  if (log.length > 500) log.splice(0, log.length - 500);
  const w = wake; wake = [];
  for (const f of w) f();
  on.changed?.();
}
/** What changed since `since` (waiting up to `ms` for something); `reset`: too far behind, read it all again. */
export async function wait(since: number, ms = 25_000): Promise<{ rev: number; changes: Change[]; reset?: boolean }> {
  if (rev <= since) await new Promise<void>(res => { const t = setTimeout(res, ms); wake.push(() => { clearTimeout(t); res(); }); });
  if (log.length && since < log[0].rev - 1) return { rev, changes: [], reset: true };
  return { rev, changes: log.filter(x => x.rev > since) };
}

async function loadJobs() {
  if (jobsLoaded) return;
  jobsLoaded = true;
  try { jobs = JSON.parse(new TextDecoder().decode(new Uint8Array(await bridge.cacheRead(JOBS)))) as Job[]; } catch { jobs = []; }
}
const saveJobs = () => bridge.cacheWrite(JOBS, new TextEncoder().encode(JSON.stringify(jobs))).catch(() => {});

export async function addJob(cfg: () => HomeConfig | null, j: Omit<Job, 'id' | 'done' | 'at'>) {
  await loadJobs();
  jobs.push({ ...j, id: crypto.randomUUID(), done: 0, at: Date.now() });
  await saveJobs();
  on.event?.('Removing ' + j.ids.length + ' song' + (j.ids.length === 1 ? '' : 's'));
  void runJobs(cfg);
}
/** Carry on with the jobs (after a restart too), one at a time. */
export async function runJobs(cfg: () => HomeConfig | null) {
  await loadJobs();
  if (running || !jobs.length) return;
  running = true;
  try {
    while (jobs.length) {
      const c = cfg(), j = jobs[0];
      if (!c) return;
      if (await bridge.leaseHeld()) return;   // a GLUE tab from before the engine writes: later
      const s = await store(c, j.p, j.c);
      const glue = await glueDir(c);
      // In steps, saved as it goes: stopped halfway (GLUE Home quit), it carries on where it was.
      while (j.done < j.ids.length) {
        for (const id of j.ids.slice(j.done, j.done + 250)) {
          const t = s.tracks.get(id);
          if (!t || t.remote) continue;
          if (t.fileKey?.startsWith('copy:')) await removePath(glue, t.fileKey.slice(5)).catch(() => {});
          s.removeTrack(id);
        }
        j.done = Math.min(j.ids.length, j.done + 250);
        await s.flush();
        await saveJobs();
        on.changed?.();
      }
      jobs.shift();
      await saveJobs();
      on.event?.('Removed ' + j.ids.length + ' song' + (j.ids.length === 1 ? '' : 's'));
    }
  } finally { running = false; on.changed?.(); }
}

export function status(): EngineStatus {
  return { rev, jobs: jobs.map(j => ({ kind: j.kind, left: j.ids.length - j.done, total: j.ids.length })) };
}

/** A GLUE tab's changes on its copy of a collection, applied here in order, then saved. */
export async function edit(cfg: HomeConfig, p: string, c: string, ops: StoreOp[]) {
  if (await bridge.leaseHeld()) throw new Error('a GLUE tab from before GLUE Home’s engine is writing this library: close it, or update it');
  const s = await store(cfg, p, c);
  for (const op of ops) s.apply(op);
  await s.flush();
  return { rev };
}
