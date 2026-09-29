/* The GLUE tab on a computer with GLUE Home is its screen (ADR 0104): GLUE Home's engine writes the library,
   and this tab asks it for every change. Over the local link (no account needed):
   - the open collection's store sends each change as an op (CollectionStore.sink): shown here at once,
     written there, in order;
   - a long poll on the engine's feed: files it changed are read again here; songs it analysed get their
     mini spectrogram, waveform, details and fingerprint from its cache, into this browser's;
   - analysis, Analyse now, Stop and Resume are the engine's; its numbers show in the analysis bar.
   This tab no longer holds the writer lease (that's for tabs from before the engine). */
import { lib } from './library.svelte';
import { localHome } from './localHome.svelte';
import { cacheDir, homeMode, setLeaseHeld } from '../platform';
import { decodeFingerprint, writeFingerprint } from '../store/fingerprints';
import { shardOf } from '../store/types';
import type { CollectionStore, StoreOp } from '../store/collection';
import type { Analysed } from '../core/library/analysed';
import type { DetailsHeader } from '../store/details';

interface EngineState { rev: number; jobs: { kind: string; left: number; total: number }[]; analysis: { paused: boolean; running: number; current: string[]; left: number; done: number; failed: number; waiting: number } }
type Change = { rev: number; p: string; c: string; paths: string[]; analysed?: string[] };

class EngineClient {
  /** GLUE Home's engine is this library's writer. */
  active = $state(false);
  state = $state<EngineState | null>(null);
  private rev = 0;
  private attached: CollectionStore | null = null;
  private outbox: StoreOp[] = [];
  private sending: Promise<void> | null = null;
  private timer = 0;
  private polling = false;

  private async rpc<T>(body: unknown, ms = 30_000): Promise<T> {
    const r = await fetch(localHome.url('/rpc'), { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
    const j = await r.json().catch(() => ({})) as T & { error?: string };
    if (!r.ok || j.error) throw new Error(j.error || 'GLUE Home said no (' + r.status + ')');
    return j;
  }
  private where() { const s = lib.store, p = lib.profile; return s && p ? { p: p.id, c: s.meta.id } : null; }

  /** In Home mode, with an engine that answers: the open collection's changes go to it. */
  async check() {
    const on = homeMode() && !!localHome.link && !!lib.store && !lib.readOnly;
    if (!on) { this.detach(); return; }
    if (this.attached === lib.store) return;
    try { const h = await this.rpc<{ engine?: number; rev: number }>({ op: 'hello' }, 5000); if (!h.engine) throw new Error('an older GLUE Home'); this.rev = h.rev; }
    catch { this.detach(); return; }   // GLUE Home from before its engine: this tab writes, as before
    const s = lib.store;
    if (!s) return;
    await lib.flush();   // what this tab had waiting, saved first (as it did before)
    setLeaseHeld(false);
    const w = this.where();
    if (!w) return;
    await this.rpc({ op: 'open', ...w }).catch(() => {});   // the engine reads it again (saved from here just now)
    this.attached = s;
    s.sink = op => { this.outbox.push(op); clearTimeout(this.timer); this.timer = window.setTimeout(() => void this.send(), 150); };
    this.active = true;
    lib.stopOwnAnalysis?.();
    void this.poll();
    void this.refresh();
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
        if (!r) { await new Promise(res => setTimeout(res, 3000)); continue; }
        const s = this.attached, w = this.where();
        this.rev = r.rev;
        if (!s || !w) continue;
        // Its own changes first at the engine, so reading them back never undoes one waiting here.
        await this.flush();
        if (r.reset) { await lib.openCollection(w.c); continue; }
        const mine = r.changes.filter(x => x.p === w.p && x.c === w.c);
        const paths = [...new Set(mine.flatMap(x => x.paths))];
        if (paths.length && lib.store === s) await s.reloadFiles(paths);
        const analysed = [...new Set(mine.flatMap(x => x.analysed ?? []))];
        if (analysed.length) void this.takeDerived(w, analysed);
        void this.refresh();
      }
    } finally { this.polling = false; }
  }
  /** Songs the engine analysed: their mini spectrogram, waveform, details and fingerprint, from its cache. */
  private async takeDerived(w: { p: string; c: string }, ids: string[]) {
    const dir = await cacheDir();
    const k = (kind: string, id: string, ext: string) => `${kind}/${w.p}/${w.c}/${shardOf(id)}/${id}.${ext}`;
    const get = (key: string) => localHome.get<ArrayBuffer>('/cache?key=' + encodeURIComponent(key)).then(b => new Uint8Array(b)).catch(() => null);
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
  async refresh() {
    if (!this.active) return;
    const st = await this.rpc<EngineState>({ op: 'status' }, 8000).catch(() => null);
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
  pause(p: boolean) { if (this.active) void this.rpc({ op: 'pause', on: p }).then(() => this.refresh()).catch(() => {}); }
}

export const engineClient = new EngineClient();
lib.analysisElsewhere = { active: () => engineClient.active, now: ids => engineClient.now(ids), pause: p => engineClient.pause(p) };
lib.beforeClose = () => engineClient.flush();
// A collection opened: attached at once (not a change saved from here meanwhile).
const prevOpened = lib.onCollectionOpened;
lib.onCollectionOpened = (pid, cid) => { prevOpened?.(pid, cid); void engineClient.check(); };
if (typeof window !== 'undefined') {
  window.setInterval(() => void engineClient.check(), 3000);
  window.setInterval(() => void engineClient.refresh(), 4000);
}
