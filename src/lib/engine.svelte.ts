/* The GLUE tab on a computer with GLUE Home is its screen (ADR 0104): GLUE Home's engine writes the library,
   and this tab asks it for every change. Over the local link (no account needed):
   - the open collection's store sends each change as an op (CollectionStore.sink): shown here at once,
     written there, in order;
   - a long poll on the engine's feed: files it changed are read again here; songs it analysed get their
     mini spectrogram, waveform, details and fingerprint from its cache, into this browser's;
   - analysis, Analyse now, Stop and Resume are the engine's; its numbers show in the analysis bar.
   This tab no longer holds the writer lease (that's for tabs from before the engine). */
import { Gate } from './gate';
import { lib } from './library.svelte';
import { thumbs, waves } from './thumbs.svelte';
import { homeSocket, localHome } from './localHome.svelte';
import { cacheDir, homeMode, setLeaseHeld } from '../platform';
import { decodeFingerprint, writeFingerprint } from '../store/fingerprints';
import { shardOf } from '../store/types';
import type { CollectionStore, StoreOp } from '../store/collection';
import type { Analysed } from '../core/library/analysed';
import type { DetailsHeader } from '../store/details';
import type { Clash } from '../core/shared/merge3';
import type { DupGroup, Match } from '../core/library/duplicates';

interface EngineState { rev: number; jobs: { kind: string; left: number; total: number }[]; analysis: { paused: boolean; running: number; current: string[]; left: number; done: number; failed: number; waiting: number } }
type Change = { rev: number; p: string; c: string; paths: string[]; analysed?: string[] };

class EngineClient {
  /** GLUE Home's engine is this library's writer: attached to the open collection's store. */
  active = $state(false);
  /** GLUE Home's engine runs the library (it answered, in Home mode): known before a collection opens (asked for this
      computer first), so the page never starts the library's work meanwhile (ADR 0162). */
  runs = $state(false);
  state = $state<EngineState | null>(null);
  private rev = 0;
  private attached: CollectionStore | null = null;
  private outbox: StoreOp[] = [];
  private sending: Promise<void> | null = null;
  private timer = 0;
  private polling = false;
  /** Told when the tab attaches (`null`) and after each batch of the engine's feed (the files it changed): the clashes
      waiting, the duplicates it found. */
  readonly onFeed: ((paths: string[] | null) => void)[] = [];

  private async rpc<T>(body: unknown, ms = 30_000): Promise<T> {
    const r = await fetch(localHome.url('/rpc'), { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
    const j = await r.json().catch(() => ({})) as T & { error?: string };
    if (!r.ok || j.error) throw new Error(j.error || 'GLUE Home said no (' + r.status + ')');
    return j;
  }
  private where() { const s = lib.store, p = lib.profile; return s && p ? { p: p.id, c: s.meta.id } : null; }

  /** Which computer GLUE Home says this is (ADR 0108); null: it doesn't know yet, or it's from before 0.34. */
  /** Where a dropped music folder is on this computer (GLUE Home finds it, and remembers it as the folder `id`). */
  async findFolder(id: string, name: string, sample: string): Promise<string | null> { return (await this.rpc<{ path?: string | null }>({ op: 'where', id, name, sample }, 60_000)).path ?? null; }
  /** Where a dropped song is on this computer, and the music folder it's in (ADR 0125). */
  async findFile(name: string, size: number, roots: string[]) { return this.rpc<{ path: string | null; folder?: { id: string; relPath: string } }>({ op: 'whereFile', name, size, roots }, 60_000); }
  async computer(): Promise<string | null> {
    const h = await this.rpc<{ engine?: number; computer?: string | null }>({ op: 'hello' }, 5000).catch(() => null);
    if (h) this.runs = !!h.engine;
    return h?.computer ?? null;
  }

  /** In Home mode, with an engine that answers: the open collection's changes go to it. */
  async check() {
    const on = homeMode() && !!localHome.link && !!lib.store && !lib.readOnly;
    if (!on) { this.detach(); return; }
    if (this.attached === lib.store) return;
    let computer: string | null = null;
    try { const h = await this.rpc<{ engine?: number; rev: number; computer?: string | null }>({ op: 'hello' }, 5000); if (!h.engine) throw new Error('an older GLUE Home'); this.rev = h.rev; computer = h.computer ?? null; this.runs = true; }
    catch { this.runs = false; this.detach(); return; }   // GLUE Home from before its engine: this tab writes, as before
    const s = lib.store;
    if (!s) return;
    // Opened as another computer than GLUE Home's (before it knew, ADR 0108): seen again as GLUE Home's.
    if (computer && s.shared && s.shared.here.me !== computer) { void lib.openCollection(s.meta.id); return; }
    await lib.flush();   // what this tab had waiting, saved first (as it did before)
    setLeaseHeld(false);
    const w = this.where();
    if (!w) return;
    await this.rpc({ op: 'open', ...w }).catch(() => {});   // the engine reads it again (saved from here just now)
    this.attached = s;
    s.sink = op => { this.outbox.push(op); clearTimeout(this.timer); this.timer = window.setTimeout(() => void this.send(), 150); };
    this.active = true;
    thumbs.retryMissing(); waves.retryMissing();   // asked for before GLUE Home's cache could answer
    lib.stopOwnAnalysis?.();
    void this.poll();
    void this.refresh();
    for (const f of this.onFeed) f(null);
  }
  private detach() {
    if (this.attached) this.attached.sink = null;
    this.attached = null;
    if (!this.active) return;
    this.active = false; this.state = null;
    setLeaseHeld(true);
    lib.enqueueAll();
  }

  /** The changes made here, to the engine (in order, one batch at a time). */
  send(): Promise<void> {
    if (this.sending) return this.sending.then(() => (this.outbox.length ? this.send() : undefined));
    const w = this.where();
    if (!w || !this.outbox.length) return Promise.resolve();
    const ops = this.outbox.splice(0);
    return (this.sending = this.rpc<{ rev: number }>({ op: 'edit', ...w, ops }, 60_000)
      .then(() => undefined, e => { lib.notice = 'GLUE Home couldn’t save a change: ' + (e as Error).message; })
      .finally(() => { this.sending = null; }));
  }
  /** Everything changed here is at the engine (closing, switching collections). */
  async flush() { clearTimeout(this.timer); while (this.outbox.length || this.sending) await this.send(); }

  /** The engine's feed: what it changed, read again here. */
  private async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      while (this.active) {
        const r = await this.rpc<{ rev: number; changes: Change[]; reset?: boolean }>({ op: 'wait', since: this.rev }, 40_000).catch(() => null);
        if (!this.active) return;
        // No answer: GLUE Home may be stopped or quit (the library then carries on in the browser).
        // No answer (or not one of the feed's): GLUE Home may be stopped or quit (the library then carries on in the browser).
        if (!r || !Array.isArray(r.changes)) { void localHome.check(); await new Promise(res => setTimeout(res, 3000)); continue; }
        const s = this.attached, w = this.where();
        this.rev = r.rev;
        if (!s || !w) continue;
        // Its own changes first at the engine, so reading them back never undoes one waiting here.
        await this.flush();
        if (r.reset) { await lib.openCollection(w.c); continue; }
        const mine = r.changes.filter(x => x.p === w.p && x.c === w.c);
        const all = [...new Set(mine.flatMap(x => x.paths))], paths = all.filter(p => !p.startsWith('dupes'));
        if (paths.length && lib.store === s) await s.reloadFiles(paths);
        const analysed = [...new Set(mine.flatMap(x => x.analysed ?? []))];
        if (analysed.length) void this.takeDerived(w, analysed);
        if (all.length) for (const f of this.onFeed) f(all);
        void this.refresh();
      }
    } finally { this.polling = false; }
  }
  /** A file of GLUE Home's cache for a song of the open collection (ADR 0110): `t` its mini spectrogram, `w` its
      waveform, `d` its details, `p` its fingerprint. Null: not there (or no engine). */
  /** `first`: the user's (a song's page), ahead of the rows' and the analyses' results in the gate (ADR 0138). */
  /** `signal`: not wanted any more (its row scrolled away), cancelled on the socket (ADR 0139). */
  async fromCache(kind: 't' | 'w' | 'd' | 'p', id: string, ext: 'bin' | 'json' = 'bin', w = this.where(), first = false, signal?: AbortSignal): Promise<Uint8Array | null> {
    // GLUE Home runs the library (known before the tab attaches, ADR 0162): its cache, not one made here meanwhile.
    if (!lib.homeRuns() || !w || !localHome.link) return null;
    return cacheFile(`${kind}/${w.p}/${w.c}/${shardOf(id)}/${id}.${ext}`, first, signal);
  }
  /** A song's tags were written from here: GLUE Home's copy of its analysis follows the file. */
  async restamp(id: string, was: { size: number | null; mtime: number | null }, now: { size: number; mtime: number }) {
    const w = this.where();
    if (this.active && w) await this.rpc({ op: 'restamp', ...w, id, was, now }).catch(() => {});
  }
  /** A song's details from GLUE Home's cache. */
  async details(id: string): Promise<{ header: DetailsHeader; bin: Uint8Array } | null> {
    const w = this.where();
    const [h, bin] = await Promise.all([this.fromCache('d', id, 'json', w, true), this.fromCache('d', id, 'bin', w, true)]);
    return h && bin ? { header: JSON.parse(new TextDecoder().decode(h)) as DetailsHeader, bin } : null;
  }

  /** Songs the engine analysed: their mini spectrogram, waveform, details and fingerprint, from its cache. */
  private async takeDerived(w: { p: string; c: string }, ids: string[]) {
    const dir = await cacheDir();
    const k = (kind: string, id: string, ext: string) => `${kind}/${w.p}/${w.c}/${shardOf(id)}/${id}.${ext}`;
    const get = (key: string) => cacheFile(key);
    for (let i = 0; i < ids.length; i += 4) await Promise.all(ids.slice(i, i + 4).map(async id => {
      const [th, wv, dh, db, fp] = await Promise.all([get(k('t', id, 'bin')), get(k('w', id, 'bin')), get(k('d', id, 'json')), get(k('d', id, 'bin')), get(k('p', id, 'bin'))]);
      if (lib.store?.meta.id !== w.c) return;
      if (th) lib.onThumb?.(id, th);
      if (wv) lib.onWave?.(id, wv);
      if (dh && db) await lib.putDetails(id, { header: JSON.parse(new TextDecoder().decode(dh)) as DetailsHeader, bin: db }).catch(() => {});
      const f = fp ? decodeFingerprint(fp) : null;
      if (f && dir) await writeFingerprint(dir, w.c, id, f).catch(() => {});
    }));
  }
  /** What the engine is doing (the analysis bar). */
  private refreshing = false;
  async refresh() {
    // One at a time: a slow GLUE Home doesn't get a new one every 4 s on top (ADR 0138).
    if (!this.active || this.refreshing) return;
    this.refreshing = true;
    const st = await this.rpc<EngineState>({ op: 'status' }, 8000).catch(() => null).finally(() => { this.refreshing = false; });
    if (!st || !this.active) return;
    this.state = st;
    lib.analysis = { ...lib.analysis, running: st.analysis.running, paused: st.analysis.paused };
  }

  /** Analyse these now (analysed or not): the engine's queue, first. */
  now(ids: string[]): number {
    const w = this.where(), s = lib.store;
    if (!w || !s) return 0;
    const mine = ids.filter(id => { const t = s.tracks.get(id); return !!t && !t.remote && t.status === 'linked'; });
    if (!mine.length) return 0;
    const names = Object.fromEntries(mine.map(id => [id, s.tracks.get(id)?.title || s.tracks.get(id)?.fileName || id]));
    void this.rpc({ op: 'analyse', ...w, ids: mine, names }).then(() => this.refresh()).catch(e => { lib.notice = 'GLUE Home couldn’t analyse them: ' + (e as Error).message; });
    return mine.length;
  }
  /** The duplicates GLUE Home found among this computer's songs (ADR 0164): its last result, or matched now; `full`:
      every song matched again. `missing`: songs analysed with no fingerprint there. */
  async dupes(full = false): Promise<{ at: number; matches: Match[]; missing: number; groups?: DupGroup[] } | null> {
    const w = this.where();
    return w ? this.rpc<{ at: number; matches: Match[]; missing: number; groups?: DupGroup[] }>({ op: 'dupes', ...w, ...(full ? { full } : {}) }, 180_000) : null;
  }
  /** The open shared collection's clashes waiting (GLUE Home syncs it, ADR 0162). */
  async clashes(): Promise<Clash[]> {
    const w = this.where();
    return w ? (await this.rpc<{ clashes: Clash[] }>({ op: 'clashes', ...w }, 10_000)).clashes : [];
  }
  /** A clash answered here, settled by GLUE Home (`value` undefined: removed; `keepRemote`: the value in place). */
  async resolveClash(c: Clash, value: unknown, keepRemote: boolean) {
    const w = this.where();
    if (w) await this.rpc({ op: 'resolve', ...w, file: c.file, at: c.at, ...(value === undefined ? {} : { value }), keepRemote }, 20_000);
  }
  pause(p: boolean) { if (this.active) void this.rpc({ op: 'pause', on: p }).then(() => this.refresh()).catch(() => {}); }
}

/** GLUE Home's cache (the rows' spectrograms and waveforms, the analyses' results) at most 3 requests at a time: a
    browser has 6 connections to 127.0.0.1, and these took them all, so a song clicked waited (ADR 0138). */
const cacheGate = new Gate(3);
/** One of GLUE Home's cache files: on its socket (GLUE Home 0.42, ADR 0139), else over HTTP through the gate. */
async function cacheFile(key: string, first = false, signal?: AbortSignal): Promise<Uint8Array | null> {
  const s = await homeSocket.cache(key, signal).catch(() => undefined);
  if (s !== undefined) return s;
  if (signal?.aborted) return null;
  return cacheGate.run(() => localHome.get<ArrayBuffer>('/cache?key=' + encodeURIComponent(key)).then(b => new Uint8Array(b)).catch(() => null), first);
}
export const engineClient = new EngineClient();
lib.homeRuns = () => engineClient.runs && homeMode() && !!localHome.link;
lib.analysisElsewhere = { active: () => lib.homeRuns(), now: ids => engineClient.now(ids), pause: p => engineClient.pause(p) };
lib.beforeClose = () => engineClient.flush();
// A collection opened: attached at once (not a change saved from here meanwhile).
const prevOpened = lib.onCollectionOpened;
lib.homeFind = (id, name, sample) => engineClient.findFolder(id, name, sample);
lib.homeFindFile = (name, size, roots) => homeMode() ? engineClient.findFile(name, size, roots) : Promise.resolve({ path: null });
lib.onCollectionOpened = (pid, cid) => { prevOpened?.(pid, cid); void engineClient.check(); };
if (typeof window !== 'undefined') {
  window.setInterval(() => void engineClient.check(), 3000);
  window.setInterval(() => void engineClient.refresh(), 4000);
}

// This computer's songs' mini spectrograms, waveforms and details, from GLUE Home when this browser has none (ADR 0110).
thumbs.fromHome = (id, signal) => engineClient.fromCache('t', id, 'bin', undefined, false, signal);
waves.fromHome = (id, signal) => engineClient.fromCache('w', id, 'bin', undefined, false, signal);
lib.detailsFromHome = id => engineClient.details(id);
lib.restampHome = (id, was, now) => engineClient.restamp(id, was, now);
