/* This computer's GLUE Home analyses its songs (ADR 0103), and this tab takes the results in. In Home mode,
   signed in, with the computer's GLUE Home online and answering: the tab runs no analysis of its own; every
   few seconds it asks GLUE Home how it's going (which also tells GLUE Home that this tab takes the results),
   fetches what's done (the summary and file facts, the fingerprint, the mini spectrogram and waveform, the
   full analysis), puts it in, and says which it took. "Analyse now", pause and resume
   go to GLUE Home. Another computer's songs are asked of that computer's GLUE Home. Without all that (no
   account, GLUE Home not running, an older one), the tab analyses by itself, as before. */
import { lib } from './library.svelte';
import { account } from './account.svelte';
import { companionOnline, remoteFiles } from './remoteFiles.svelte';
import { cacheDir, homeMode } from '../platform';
import { decodeFingerprint, writeFingerprint } from '../store/fingerprints';
import { shardOf } from '../store/types';
import type { Analysed } from '../core/library/analysed';
import type { DetailsHeader } from '../store/details';

interface HomeState { paused: boolean; running: number; current: string[]; left: number; done: number; failed: number; waiting: number; by: string }
const EVERY = 4000, TAKE = 30;   // 6 files a song: under the 200 of one `cache` ask

class HomeAnalysis {
  /** GLUE Home is analysing for this tab (it answered lately). */
  active = $state(false);
  state = $state<HomeState | null>(null);
  private failures = 0;
  private busy = false;

  private home() {
    const me = account.thisDevice;
    return homeMode() && account.signedIn && me ? companionOnline(me) : null;
  }
  private where() { const s = lib.store, p = lib.profile; return s && p && !lib.readOnly ? { profile: p.id, collection: s.meta.id } : null; }

  /** Ask how it's going, take in what's done. */
  async tick() {
    const h = this.home(), w = this.where();
    if (!h || !w) { this.stop(); return; }
    if (this.busy) return;
    this.busy = true;
    try {
      const a = await remoteFiles.ask(h.id, { t: 'analysis', ...w, take: true }, { firstWait: 8000 });
      const d = a.data as { state: HomeState; waiting: string[] };
      if (!d?.state) throw new Error('an older GLUE Home');
      this.failures = 0;
      const was = this.active;
      this.active = true; this.state = d.state;
      lib.analysis = { ...lib.analysis, running: d.state.running, paused: d.state.paused };
      if (!was) lib.stopOwnAnalysis?.();   // GLUE Home took over: this tab's own analysis stops
      if (d.waiting.length) await this.take(h.id, w, d.waiting.slice(0, TAKE));
    } catch {
      // Not answering (or too old): after a couple of tries, this tab analyses by itself again.
      if (++this.failures >= 2) this.stop();
    } finally { this.busy = false; }
  }
  private stop() {
    if (!this.active) return;
    this.active = false; this.state = null;
    lib.analysis = { ...lib.analysis, running: 0 };
    lib.enqueueAll();
  }

  /** GLUE Home's results into the open collection, and this browser's cache. */
  private async take(home: string, w: { profile: string; collection: string }, ids: string[]) {
    const base = (k: string, id: string, ext: string) => `${k}/${w.profile}/${w.collection}/${shardOf(id)}/${id}.${ext}`;
    const keys = ids.flatMap(id => [base('s', id, 'json'), base('p', id, 'bin'), base('t', id, 'bin'), base('w', id, 'bin'), base('d', id, 'json'), base('d', id, 'bin')]);
    // Over the channel (GLUE Home's own cache: the local link serves only what's in its incoming folder).
    const got = new Map<string, Uint8Array>();
    const a = await remoteFiles.ask(home, { t: 'cache', keys });
    let at = 0;
    for (const [k, size] of a.data as [string, number][]) { if (size) got.set(k, a.bytes.slice(at, at + size)); at += size; }
    const dir = await cacheDir(), taken: string[] = [];
    for (const id of ids) {
      const s = got.get(base('s', id, 'json'));
      if (!s) { taken.push(id); continue; }   // gone meanwhile: nothing to take
      if (lib.store?.meta.id !== w.collection) return;
      const a = JSON.parse(new TextDecoder().decode(s)) as Analysed;
      const header = got.get(base('d', id, 'json')), bin = got.get(base('d', id, 'bin'));
      if (header && bin) await lib.putDetails(id, { header: JSON.parse(new TextDecoder().decode(header)) as DetailsHeader, bin }).catch(() => {});
      const fp = got.get(base('p', id, 'bin')), f = fp ? decodeFingerprint(fp) : null;
      if (f && dir) await writeFingerprint(dir, w.collection, id, f).catch(() => {});
      const th = got.get(base('t', id, 'bin')), wv = got.get(base('w', id, 'bin'));
      if (th) lib.onThumb?.(id, th);
      if (wv) lib.onWave?.(id, wv);
      lib.takeAnalysed(id, a);
      taken.push(id);
    }
    if (taken.length) await remoteFiles.ask(home, { t: 'analysis', ...w, take: true, taken }).catch(() => {});
  }

  /** Analyse these first: this computer's by its GLUE Home. */
  now(ids: string[]): number {
    const h = this.home(), w = this.where(), s = lib.store;
    if (!h || !w || !s) return 0;
    // Asked for: analysed again even if up to date.
    const mine = ids.filter(id => { const t = s.tracks.get(id); return !!t && !t.remote && t.status === 'linked'; });
    if (!mine.length) return 0;
    const names = Object.fromEntries(mine.map(id => [id, s.tracks.get(id)?.title || s.tracks.get(id)?.fileName || id]));
    void remoteFiles.ask(h.id, { t: 'analysis', ...w, take: true, now: mine, names }).then(() => this.tick()).catch(() => {});
    return mine.length;
  }
  pause(p: boolean) {
    const h = this.home(), w = this.where();
    if (h && w && this.active) void remoteFiles.ask(h.id, { t: 'analysis', ...w, take: true, pause: p }).then(() => this.tick()).catch(() => {});
  }

  /** Another computer's songs (analysed or not): asked of that computer's GLUE Home. The number asked. */
  remoteNow(ids: string[]): number {
    const s = lib.store;
    if (!s) return 0;
    const by = new Map<string, { profile: string; collection: string; ids: string[]; names: Record<string, string> }>();
    for (const id of ids) {
      const t = s.tracks.get(id), r = t?.remote;
      if (!t || !r?.profile || !r.collection || !r.id || t.status !== 'linked') continue;
      const home = companionOnline(r.device);
      if (!home) continue;
      const g = by.get(home.id) ?? by.set(home.id, { profile: r.profile, collection: r.collection, ids: [], names: {} }).get(home.id)!;
      g.ids.push(r.id); g.names[r.id] = t.title || t.fileName;
    }
    let n = 0;
    for (const [home, g] of by) { n += g.ids.length; void remoteFiles.ask(home, { t: 'analysis', profile: g.profile, collection: g.collection, now: g.ids, names: g.names }).catch(() => {}); }
    return n;
  }
}

export const homeAnalysis = new HomeAnalysis();
// This computer's GLUE Home is the engine now (lib/engine, ADR 0104): only the ask for another computer's songs is used here.
