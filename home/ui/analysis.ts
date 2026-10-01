/* GLUE Home analyses its computer's songs (ADR 0103), like a GLUE tab does, and goes on when no tab is open.
   - One queue: the songs asked for now first ("Analyse now", on any device), then those never analysed or
     whose file changed, oldest added first.
   - Each result goes to GLUE Home's cache (cache.ts: the summary and the file's facts, the fingerprint,
     the mini spectrogram and waveform, the full analysis, the cover).
   - The collection's writer takes them in (one writer, ADR 0051): GLUE Home itself while no GLUE tab holds
     the lease (then the account's copy is synced); else the open tab, which asks for them over the channel
     and says which it took (it "delegates" the analysis to GLUE Home by asking, every few seconds).
   - A tab in Home mode that doesn't ask (it can't reach GLUE Home over the channel) analyses by itself:
     GLUE Home leaves the songs to it while it holds the lease.
   - Paused: nothing new starts (what runs finishes); asked-for songs still are analysed. */
import { bridge, type HomeConfig } from './bridge';
import { describe, here } from './library';
import * as cache from './cache';
import * as engine from './engine';
import { isNetwork, pickNext } from './lanes';
import { afterAnalysis, needsAnalysis } from '../../src/core/library/analysed';
import { unknownComputer, type SharedCollection } from '../../src/core/shared/project';
import { ANALYSIS_VERSION, type AnalysisSummary, type Collection, type Track } from '../../src/store/types';

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
}
export const state: AnalysisState = { paused: false, running: 0, current: [], left: 0, done: 0, failed: 0, waiting: 0, by: 'idle', why: '', away: 0 };

/** `net`: its network folder (ADR 0135), if it's in one. */
type Job = { p: string; c: string; id: string; name: string; net?: string };
const PENDING = 's/pending.json';
const key = (p: string, c: string) => p + '/' + c;

/** Results not taken into their collection yet: "profile/collection" → song ids. */
const pending = new Map<string, Set<string>>();
let urgent: Job[] = [], queue: Job[] = [], scanned = 0;
let delegatedUntil = 0, looping = false, loaded = false;
/** Songs were added since the last look (a tab scanned new folders): looked for again at once, even mid-run. */
let stale = false;
/** Being analysed now (a look while running doesn't queue them again). */
const active = new Set<string>();
const hooks: { changed: (() => void) | null; event: ((text: string) => void) | null; written: ((changed: number) => void) | null } = { changed: null, event: null, written: null };
export const on = hooks;

const count = () => [...pending.values()].reduce((n, s) => n + s.size, 0);
const changed = () => { state.waiting = count(); hooks.changed?.(); };
async function savePending() {
  const out: [string, string, string][] = [];
  for (const [k, ids] of pending) { const [p, c] = k.split('/'); for (const id of ids) out.push([p, c, id]); }
  await bridge.cacheWrite(PENDING, new TextEncoder().encode(JSON.stringify(out))).catch(() => {});
}
async function load() {
  if (loaded) return;
  loaded = true;
  try { for (const [p, c, id] of JSON.parse(new TextDecoder().decode(new Uint8Array(await bridge.cacheRead(PENDING)))) as [string, string, string][]) add(p, c, id); } catch { /* none yet */ }
  changed();
}
function add(p: string, c: string, id: string) { const k = key(p, c); (pending.get(k) ?? pending.set(k, new Set()).get(k)!).add(id); }
cache.onAnalysed.f = (p, c, id) => { add(p, c, id); changed(); void savePending(); };

/** A tab holding the lease asked (it takes the results in): GLUE Home analyses for it. */
export function delegate() { delegatedUntil = Date.now() + 30_000; }
/** The results of one collection waiting to be taken in. */
export const waitingIn = (p: string, c: string) => [...(pending.get(key(p, c)) ?? [])];
/** The tab took these in. */
export async function taken(p: string, c: string, ids: string[]) {
  const s = pending.get(key(p, c));
  if (!s) return;
  for (const id of ids) s.delete(id);
  changed(); await savePending();
}
/** Analyse these first (any device asked). */
export function now(p: string, c: string, ids: string[], names: Record<string, string> = {}, cfg?: () => HomeConfig | null) {
  const want = new Set(ids);
  urgent = [...ids.map(id => ({ p, c, id, name: names[id] ?? id })), ...urgent.filter(j => !(j.p === p && j.c === c && want.has(j.id)))];
  queue = queue.filter(j => !(j.p === p && j.c === c && want.has(j.id)));
  state.left = urgent.length + queue.length;
  hooks.event?.('Analysing ' + ids.length + ' song' + (ids.length === 1 ? '' : 's') + ' now, as asked');
  changed();
  if (cfg) void run(cfg);
}
/** Songs added to a collection (a GLUE tab scanned new music folders): looked for now, not at the next
    5-minute look (they waited until a restart, 2026-09-30). */
export function added(cfg: () => HomeConfig | null) { stale = true; void run(cfg); }
/** Restart (the settings or the tray): songs that failed this session are tried again, and everything is looked for anew. */
export function restart() { tries.clear(); stale = true; }
/** Paused or not, as the settings say (HomeConfig.analysisPaused); `quiet`: GLUE Home starting. */
export function setPaused(paused: boolean, cfg?: () => HomeConfig | null, quiet = false) {
  if (state.paused === paused) return;
  state.paused = paused;
  if (!quiet) hooks.event?.(paused ? 'Analysis paused' : 'Analysis resumed');
  changed();
  if (!paused && cfg) void run(cfg);
}

/** Songs that failed this session (ran out of time or memory: tried again, ADR 0109), at most three times. */
const tries = new Map<string, number>();

/** This computer's songs that need an analysis, oldest added first (a result already made is waiting). */
async function scan(cfg: HomeConfig): Promise<Job[]> {
  const lib = await describe(), jobs: (Job & { added: string })[] = [];
  for (const p of lib?.profiles ?? []) for (const col of p.collections) {
    let meta: Collection | SharedCollection | null = null;
    try { meta = JSON.parse(await bridge.glueRead(`profiles/${p.id}/collections/${col.id}/collection.json`)); } catch { continue; }
    if (!meta || (meta as { movedTo?: string }).movedTo) continue;
    const sh = (meta as SharedCollection).shared ? meta as SharedCollection : null;
    // A shared collection: this computer's songs, once GLUE Home knows which computer it is (ADR 0108).
    if (sh && unknownComputer(cfg.computer)) continue;
    const me = sh ? cfg.computer! : null;
    const h = here(meta, p.id, col.id, cfg.computer), waiting = pending.get(key(p.id, col.id));
    // Where each of this computer's music folders is: a network folder's songs take turns (ADR 0135).
    const roots = (sh ? sh.rootsBy?.[me ?? ''] : (meta as Collection).roots) ?? [];
    const netOf = (rootId: string | null) => { if (!rootId) return undefined; const at = cfg.folders?.[rootId] ?? roots.find(r => r.id === rootId)?.absPath; return isNetwork(at) ? at! : undefined; };
    // The shards there are (listed, not guessed).
    for (const f of (await bridge.glueList(`profiles/${p.id}/collections/${col.id}/tracks`).catch(() => [] as string[])).filter(n => n.endsWith('.json'))) {
      let tracks: Record<string, Track> = {}, an: Record<string, unknown> = {};
      try { tracks = (JSON.parse(await bridge.glueRead(`profiles/${p.id}/collections/${col.id}/tracks/${f}`)) as { items: Record<string, Track> }).items; } catch { continue; }
      try { an = (JSON.parse(await bridge.glueRead(`profiles/${p.id}/collections/${col.id}/analysis/${f}`)) as { items: Record<string, unknown> }).items; } catch { /* none yet */ }
      for (const raw of Object.values(tracks)) {
        const t = h.track(raw);
        if ((!t.rootId || !t.relPath) && !t.fileKey?.startsWith('copy:') && !t.filePath) continue;
        const mine = (sh ? (an[t.id] as Record<string, AnalysisSummary> | undefined)?.[me ?? ''] : an[t.id]) as AnalysisSummary | undefined;
        if (!needsAnalysis(t, mine, ANALYSIS_VERSION) || waiting?.has(t.id) || (tries.get(key(p.id, col.id) + '/' + t.id) ?? 0) >= 3) continue;
        // Analysed already (the result wasn't taken in yet, GLUE Home was restarted): waiting, not again.
        const r = await cache.result(p.id, col.id, t.id);
        if (r && r.size === t.size && r.mtime === t.mtime && r.summary.v >= ANALYSIS_VERSION) { add(p.id, col.id, t.id); continue; }
        jobs.push({ p: p.id, c: col.id, id: t.id, name: t.title || t.fileName, added: t.addedAt, net: netOf(t.rootId) });
      }
    }
  }
  changed(); void savePending();
  return jobs.sort((x, y) => x.added.localeCompare(y.added));
}

/** Analyse what's to analyse, cache.poolSize songs at a time; take the results in when GLUE Home is the writer. */
export async function run(cfg: () => HomeConfig | null): Promise<void> {
  await load();
  if (looping) return;
  looping = true;
  // What this run did: "Analysis done" tells only that (it ran every minute with the day's total, 2026-09-30).
  const done0 = state.done, failed0 = state.failed;
  state.away = 0;
  try {
    const c0 = cfg();
    if (!c0?.glue) return;
    // Looked for again at most every 5 minutes (a scan reads every collection's files).
    if (!urgent.length && !queue.length && (stale || Date.now() - scanned > 5 * 60e3)) { stale = false; scanned = Date.now(); queue = await scan(c0); }
    state.left = urgent.length + queue.length;
    if (state.left) hooks.event?.('Analysing ' + state.left + ' song' + (state.left === 1 ? '' : 's'));
    let sinceWrite = 0;
    const next = async (): Promise<Job | null> => {
      if (urgent.length) return urgent.shift()!;
      // Songs added while this runs: into the queue (those running or queued already aren't twice).
      const c = cfg();
      if (stale && c) {
        stale = false; scanned = Date.now();
        const have = new Set([...queue.map(j => j.p + '/' + j.c + '/' + j.id), ...active]);
        queue.push(...(await scan(c)).filter(j => !have.has(j.p + '/' + j.c + '/' + j.id)));
        state.left = urgent.length + queue.length;
      }
      // Stopped (GLUE Home's Stop): nothing new starts; what runs finishes.
      if (state.paused || !queue.length || c?.running === false) return null;
      // A tab here analysing by itself (it holds the lease and doesn't ask): the songs are its.
      if (await bridge.leaseHeld() && Date.now() > delegatedUntil) { state.by = 'tab-self'; return null; }
      // In order, but a network folder's songs take turns, so the other places go to songs on this computer's drives
      // (ADR 0135). None may start now: this place waits for one to finish.
      const i = pickNext(queue, netRunning);
      return i < 0 ? null : queue.splice(i, 1)[0];
    };
    // As many at a time as the settings say, changed while it runs too.
    let live = 0;
    const running: Promise<void>[] = [];
    const netRunning = new Map<string, number>();
    const spawn = () => { while (live < cache.poolSize(cfg())) { live++; running.push(worker().finally(() => { live--; })); } };
    const worker = async () => {
      for (let j = await next(); j; j = live > cache.poolSize(cfg()) ? null : await next()) {
        const c = cfg();
        if (!c) return;
        const jk = j.p + '/' + j.c + '/' + j.id;
        active.add(jk);
        if (j.net) netRunning.set(j.net, (netRunning.get(j.net) ?? 0) + 1);
        state.running++; state.current = [...state.current, j.name]; state.left = urgent.length + queue.length; changed();
        try { await cache.analyse(j.p, j.c, j.id, c); state.done++; }
        catch (e) {
          // Its folder isn't reachable (a network folder not connected): left for a later look, not a failure.
          if ((e as Error).name === 'FolderAway' || /isn’t reachable/.test(String((e as Error)?.message))) state.away++;
          else { state.failed++; const k = key(j.p, j.c) + '/' + j.id; tries.set(k, (tries.get(k) ?? 0) + 1); console.warn('GLUE Home: couldn’t analyse', j.name, e); }
        }
        active.delete(jk);
        if (j.net) netRunning.set(j.net, (netRunning.get(j.net) ?? 1) - 1);
        state.running--; state.current = state.current.filter(n => n !== j!.name); changed();
        if (++sinceWrite >= 25) { sinceWrite = 0; await write(c).catch(e => console.warn('GLUE Home: couldn’t take the analyses in', e)); }
        spawn();
      }
    };
    spawn();
    for (let n = 0; n < running.length; n = running.length) await Promise.all(running.slice(n));
    const c1 = cfg();
    if (c1) await write(c1).catch(e => console.warn('GLUE Home: couldn’t take the analyses in', e));
    const done = state.done - done0, failed = state.failed - failed0;
    if (!state.left && (done || failed)) hooks.event?.('Analysis done: ' + done + ' song' + (done === 1 ? '' : 's') + (failed ? ', ' + failed + ' couldn’t be read' : ''));
  } finally {
    looping = false; state.running = 0; state.current = []; state.left = urgent.length + queue.length;
    if (state.by !== 'tab-self') state.by = 'idle';
    changed();
  }
}

/** The results into their collections, when no tab holds the lease (it takes them in itself). */
export async function write(cfg: HomeConfig): Promise<number> {
  if (!count() || !cfg.glue || !cfg.localToken) { state.why = ''; return 0; }
  if (cfg.running === false) { state.why = 'GLUE Home is stopped'; return 0; }
  if (await bridge.leaseHeld()) {
    state.by = Date.now() < delegatedUntil ? 'tab' : 'tab-self';
    // A GLUE tab that writes the library itself and doesn't ask (one from before GLUE Home's engine): they wait for it.
    state.why = state.by === 'tab' ? '' : 'a GLUE tab open on this computer writes the library itself; reload it, or close it';
    return 0;
  }
  state.by = 'home';
  try { return await writeAll(cfg); }
  catch (e) { state.why = 'couldn’t put them in: ' + ((e as Error).message || e); changed(); throw e; }
}
async function writeAll(cfg: HomeConfig): Promise<number> {
  state.why = '';
  let n = 0;
  for (const [k, ids] of [...pending]) {
    if (!ids.size) continue;
    const [p, c] = k.split('/');
    let meta: SharedCollection | Collection | null = null;
    try { meta = JSON.parse(await bridge.glueRead(`profiles/${p}/collections/${c}/collection.json`)); } catch { pending.delete(k); continue; }
    if (!meta) { pending.delete(k); continue; }
    // The engine's store (ADR 0104): the one everything here writes, never a copy that goes stale.
    const s = await engine.store(cfg, p, c);
    const done: string[] = [];
    for (const id of ids) {
      const a = await cache.result(p, c, id), cur = s.tracks.get(id);
      done.push(id);
      if (!a || !cur || cur.remote) continue;
      // The library has this already (the same file, as new an analysis): nothing to write, or to sync.
      const had = s.analysis.get(id);
      if (had && !had.error && had.v >= a.summary.v && had.fileSize === a.size && had.fileMtime === a.mtime) continue;
      s.putAnalysis(id, a.summary);
      s.putTrack(afterAnalysis(cur, a));
      n++;
    }
    if (await bridge.leaseHeld()) return 0;   // a tab opened meanwhile: it’s the writer now (these wait)
    await s.flush();
    engine.changed(p, c, [], done);   // a GLUE tab takes their mini spectrograms and details from the cache
    for (const id of done) ids.delete(id);
  }
  changed(); await savePending();
  if (n) hooks.written?.(n);
  return n;
}
