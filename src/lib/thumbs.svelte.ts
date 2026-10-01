/* Mini spectrograms for the track table (ADR 0031). Built to show dozens at once:
   - stored per track (3 KB) in the browser cache, written when a track is analysed;
   - read only for rows on screen, a few at a time, and kept in a memory cache (LRU) while scrolling;
   - for tracks analysed before thumbnails existed, made once from the stored analysis.
   Two kinds (2026-09-27): the spectrogram (`thumbs`) and the waveform (`waves`, the Overview
   column's other look); the same code keeps both, and other computers' songs get both from their
   GLUE Home (ADR 0085). */
import { lib } from './library.svelte';
import { cacheDir } from '../platform';
import { writeBlob } from '../store/fsx';
import { shardOf, type Track } from '../store/types';
import { makeThumb, makeWaveThumb, THUMB_H, THUMB_W, WAVE_BYTES } from '../core/library/thumb';
import type { AnalysisResult } from '../core/types';
import { OnScreen, Retries } from './onScreen';

const MAX_CACHED = 800, READERS = 6;

class Thumbs {
  /** `dir`: where they're kept in the cache; `size`: bytes each; `make`: from a stored analysis;
      `remoteOk`: other computers' songs get theirs from their GLUE Home. */
  constructor(private dir: string, private size: number, private make: (res: AnalysisResult) => Uint8Array, private remoteOk: boolean) {}
  private path(cid: string, id: string) { return this.dir + '/' + cid + '/' + shardOf(id) + '/' + id + '.bin'; }
  /** Bumps when thumbnails arrive, so visible cells redraw. */
  version = $state(0);
  private cache = new Map<string, Uint8Array | null>();   // null: none (not analysed)
  private queue: string[] = [];
  private reading = 0;
  private deriving = false;
  private derive: string[] = [];
  private cid = '';

  /** undefined: not loaded yet (call request); null: there is none. */
  get(id: string): Uint8Array | null | undefined {
    this.checkCollection();
    const v = this.cache.get(id);
    if (v !== undefined) { this.cache.delete(id); this.cache.set(id, v); }   // LRU: most recent last
    return v;
  }
  request(id: string) {
    this.checkCollection();
    if (this.cache.has(id) || this.queue.includes(id)) return;
    this.queue.push(id);
    this.pump();
  }
  /** The rows on screen (plus the table's overscan): a jump down the list drops what the rows it left asked for, so
      the new ones load at once (the user, 2026-09-30: every jump got slower). */
  private screen = new OnScreen();
  private retries = new Retries();
  /** Another computer's songs it had none for yet: asked again when they come back on screen. */
  private notYet = new Set<string>();
  hold(id: string) {
    if (!this.screen.hold(id) || !this.notYet.delete(id)) return;
    this.cache.delete(id);
    this.request(id);
  }
  drop(id: string) {
    if (!this.screen.drop(id)) return;
    this.retries.cancel(id);
    const q = this.queue.indexOf(id); if (q >= 0) this.queue.splice(q, 1);
    const d = this.derive.indexOf(id); if (d >= 0) this.derive.splice(d, 1);
    const w = this.wantRemote.findIndex(t => t.id === id); if (w >= 0) this.wantRemote.splice(w, 1);
  }
  /** A fresh analysis made one: keep it and store it. */
  async put(id: string, data: Uint8Array) {
    this.checkCollection();
    this.remember(id, data);
    const dir = await cacheDir(), cid = lib.store?.meta.id;
    if (dir && cid) await writeBlob(dir, this.path(cid, id), new Blob([data.slice().buffer])).catch(() => {});
  }
  forget(id: string) { this.cache.delete(id); }
  /** Those found missing are looked for again (GLUE Home's cache just became reachable, ADR 0110). */
  retryMissing() {
    let n = 0;
    for (const [id, v] of this.cache) if (v === null) { this.cache.delete(id); n++; }
    if (n) this.version++;
  }

  private checkCollection() {
    const cid = lib.store?.meta.id ?? '';
    if (cid !== this.cid) { this.cid = cid; this.cache.clear(); this.queue = []; this.derive = []; this.notYet.clear(); this.retries.clear(); }
  }
  private remember(id: string, v: Uint8Array | null) {
    this.cache.set(id, v);
    while (this.cache.size > MAX_CACHED) this.cache.delete(this.cache.keys().next().value!);
    this.version++;
  }
  private pump() {
    while (this.reading < READERS && this.queue.length) {
      const id = this.queue.pop()!;
      this.reading++;
      void this.read(id).finally(() => { this.reading--; this.pump(); });
    }
  }
  /** Another computer's songs: from its GLUE Home, a screenful at a time (ADR 0046). The answer has each song
      it reached: its bytes, or null (none there yet); a song missing from it couldn't be asked (ADR 0131). */
  remote: ((ts: Track[]) => Promise<Map<string, Uint8Array | null>>) | null = null;
  /** This computer's song, analysed by GLUE Home (ADR 0110): its copy in GLUE Home's cache, when this browser has
      none (it was analysed while no tab listened, or in another browser). */
  fromHome: ((id: string) => Promise<Uint8Array | null>) | null = null;
  private wantRemote: Track[] = [];
  private remoteTimer = 0;
  private fromRemote(t: Track) {
    this.wantRemote.push(t);
    clearTimeout(this.remoteTimer);
    this.remoteTimer = window.setTimeout(() => {
      const batch = this.wantRemote.splice(0), cid = this.cid;
      const onScreen = (id: string) => this.cid === cid && this.screen.has(id);
      void (this.remote?.(batch) ?? Promise.resolve(new Map<string, Uint8Array | null>())).catch(() => new Map<string, Uint8Array | null>()).then(got => {
        if (this.cid !== cid) return;
        for (const t of batch) {
          const b = got.get(t.id);
          if (b && b.length === this.size) { this.retries.done(t.id); this.remember(t.id, b); continue; }
          if (b === undefined) {
            // Couldn't ask (the link still opening): left unknown, asked again soon while on screen.
            this.retries.later(t.id, 'unreached', onScreen, () => this.request(t.id));
            continue;
          }
          // Not made there yet (GLUE Home makes it now): none for now, asked again in a while, or when it's back.
          this.notYet.add(t.id);
          this.remember(t.id, null);
          this.retries.later(t.id, 'notYet', onScreen, () => { this.notYet.delete(t.id); this.cache.delete(t.id); this.request(t.id); });
        }
      });
    }, 120);
  }
  private async read(id: string) {
    const rt = lib.store?.tracks.get(id);
    // Another computer's: from its GLUE Home. Not reachable yet: left unknown, so the row asks once it is.
    if (rt?.remote) { if (!this.remoteOk) this.remember(id, null); else if (lib.canRead(rt)) this.fromRemote(rt); return; }
    const dir = await cacheDir(), cid = this.cid;
    if (!dir || !cid) return;
    try {
      const parts = this.path(cid, id).split('/'), name = parts.pop()!;
      let d = dir;
      for (const p of parts) d = await d.getDirectoryHandle(p);
      const b = new Uint8Array(await (await (await d.getFileHandle(name)).getFile()).arrayBuffer());
      if (this.cid === cid && b.length === this.size) { this.remember(id, b); return; }
    } catch { /* not stored yet */ }
    if (this.cid !== cid) return;
    const home = await this.fromHome?.(id).catch(() => null);
    if (this.cid !== cid) return;
    if (home && home.length === this.size) { await this.put(id, home); return; }
    // Analysed before thumbnails existed: make it from the stored analysis, one at a time.
    const a = lib.store?.analysis.get(id);
    if (a && !a.error) { if (!this.derive.includes(id)) this.derive.push(id); void this.deriveNext(); }
    else this.remember(id, null);
  }
  private async deriveNext() {
    if (this.deriving) return;
    this.deriving = true;
    try {
      while (this.derive.length) {
        const id = this.derive.pop()!, t = lib.store?.tracks.get(id);
        if (!t) continue;
        const d = await lib.trackDetails(t);
        if (d) await this.put(id, this.make(d.res)); else this.remember(id, null);
        await new Promise(r => setTimeout(r, 0));   // let the page breathe between them
      }
    } finally { this.deriving = false; }
  }
}
export const thumbs = new Thumbs('thumbs', THUMB_W * THUMB_H, makeThumb, true);
export const waves = new Thumbs('wthumbs', WAVE_BYTES, makeWaveThumb, true);
lib.onThumb = (id, data) => void thumbs.put(id, data);
lib.onWave = (id, data) => void waves.put(id, data);
