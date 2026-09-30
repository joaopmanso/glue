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
import { removePath, writeBlob, type Dir } from '../../src/store/fsx';
import { OLD_STAND_IN, unknownComputer, type SharedCollection } from '../../src/core/shared/project';
import { absorbTracks } from '../../src/store/merge';
import { buildBackup } from '../../src/store/backup';
import type { Collection, Profile, Track } from '../../src/store/types';

export interface Job { id: string; kind: 'remove-tracks'; p: string; c: string; ids: string[]; done: number; at: number }
export interface EngineStatus { rev: number; jobs: { kind: string; left: number; total: number }[] }
type Change = { rev: number; p: string; c: string; paths: string[]; analysed?: string[] };

const JOBS = 'j/jobs.json';
const key = (p: string, c: string) => p + '/' + c;
const stores = new Map<string, Promise<CollectionStore>>();
let rev = 0, jobs: Job[] = [], jobsLoaded = false, running = false;
const log: Change[] = [];
let wake: (() => void)[] = [];
export const on: { event: ((text: string) => void) | null; changed: (() => void) | null; edited: ((p: string, c: string, paths: string[]) => void) | null } = { event: null, changed: null, edited: null };

/** Saved, and told as the user's own change (it goes up to GLUE Cloud within seconds, ADR 0106). */
async function flushEdit(s: CollectionStore, p: string, c: string) {
  const prev = s.onWrote;
  let wrote: string[] = [];
  s.onWrote = paths => { wrote = paths; prev?.(paths); };
  try { await s.flush(); } finally { s.onWrote = prev; }
  if (wrote.length) on.edited?.(p, c, wrote);
}

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
      // A shared collection as this computer (ADR 0108), once GLUE Home knows which it is; until then it's read,
      // and none of its per-computer parts is written. Then what was written under another id is put right.
      const shared = !!(meta as SharedCollection | null)?.shared, computer = !unknownComputer(cfg.computer) ? cfg.computer! : null;
      const st = await CollectionStore.load(glue, p, c, shared ? (computer ? { me: computer } : { shownOnly: true }) : {});
      if (shared && computer) await repair(glue, st, p, c, computer);
      st.onWrote = paths => { wrote(p, c, paths); changed(p, c, paths); };
      return st;
    })();
    stores.set(k, s);
    s.catch(() => stores.delete(k));
  }
  return s;
}
/** A shared collection's parts written under another id (the old stand-in, another folder's claim), folded back
    into this computer, once (ADR 0108): a backup of the profile first (backups/pre-repair-…zip), then the fold,
    saved and sent up like an edit. A backup that fails puts nothing right. */
async function repair(glue: Dir, st: CollectionStore, p: string, c: string, computer: string) {
  const r = st.foldComputer(computer);
  if (!r) return;
  const profile = JSON.parse(await bridge.glueRead(`profiles/${p}/profile.json`)) as Profile;
  await writeBlob(glue, `backups/pre-repair-${new Date().toISOString().slice(0, 10)}-${p}-${c}.zip`, await buildBackup(glue, profile, { songs: false }));
  const twins = new Map<string, Track>();
  for (const [from, into] of r.twins) { const t = st.tracks.get(into); if (t) twins.set(from, t); }
  absorbTracks(st, twins);
  await removePath(glue, `profiles/${p}/collections/${c}/dupes/${OLD_STAND_IN}.json`).catch(() => {});
  await flushEdit(st, p, c);
  const n = r.counts.copiesMoved + r.counts.copiesDropped + r.counts.analysesMoved + r.counts.twins;
  on.event?.('Put this computer’s part of “' + st.meta.name + '” back under it' + (n ? ' (' + n + ' record' + (n === 1 ? '' : 's') + ')' : ''));
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
/** A GLUE tab from before the engine holds the lease (it writes by itself): nothing kept here goes stale,
    and the next sync looks at every file. */
export function forget() { stores.clear(); lookedAt.clear(); }

// ---- what was written, for the shared sync (ADR 0107) ----------------------------------------------------
/** Files written by the stores here since the last sync, per collection; and when every file was last
    looked at (at the first sync, then every 30 minutes, in case something wrote around the stores). */
const written = new Map<string, Set<string>>(), lookedAt = new Map<string, number>();
const FULL_EVERY = 30 * 60e3;
function wrote(p: string, c: string, paths: string[]) { const k = key(p, c); const s = written.get(k) ?? written.set(k, new Set()).get(k)!; for (const x of paths) s.add(x); }
/** The files that may have changed since the last sync; undefined: look at every file this time. */
export function takeWritten(p: string, c: string): string[] | undefined {
  const k = key(p, c), s = written.get(k);
  written.delete(k);
  if (Date.now() - (lookedAt.get(k) ?? 0) > FULL_EVERY) { lookedAt.set(k, Date.now()); return undefined; }
  return [...(s ?? [])];
}
/** A sync that failed: what it was to look at is looked at next time. */
export function writtenAgain(p: string, c: string, paths: string[] | undefined) {
  if (!paths) lookedAt.delete(key(p, c)); else wrote(p, c, paths);
}

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
  if (rev <= since) await new Promise<void>(res => {
    const w = () => { clearTimeout(t); res(); };
    // Nothing changed in time: its call to wake goes too (a tab asks again and again while nothing happens).
    const t = setTimeout(() => { wake = wake.filter(x => x !== w); res(); }, ms);
    wake.push(w);
  });
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
      if (!c || c.running === false) return;   // stopped: carried on at Start
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
        await flushEdit(s, j.p, j.c);
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
  // Songs new to the collection (a scan of new music folders): the analysis looks for them now.
  const added = ops.some(op => op.m === 'tracks' && op.ts.some(t => !s.tracks.has(t.id)));
  for (const op of ops) s.apply(op);
  await flushEdit(s, p, c);
  return { rev, added };
}
