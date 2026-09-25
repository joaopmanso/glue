/* Mini spectrograms for the track table (ADR 0031). Built to show dozens at once:
   - stored per track (3 KB) in the browser cache, written when a track is analysed;
   - read only for rows on screen, a few at a time, and kept in a memory cache (LRU) while scrolling;
   - for tracks analysed before thumbnails existed, made once from the stored analysis. */
import { lib } from './library.svelte';
import { cacheDir } from '../platform';
import { writeBlob } from '../store/fsx';
import { shardOf, type Track } from '../store/types';
import { makeThumb, THUMB_H, THUMB_W } from '../core/library/thumb';

const MAX_CACHED = 800, READERS = 6;
const path = (cid: string, id: string) => `thumbs/${cid}/${shardOf(id)}/${id}.bin`;

class Thumbs {
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
  /** A fresh analysis made one: keep it and store it. */
  async put(id: string, data: Uint8Array) {
    this.checkCollection();
    this.remember(id, data);
    const dir = await cacheDir(), cid = lib.store?.meta.id;
    if (dir && cid) await writeBlob(dir, path(cid, id), new Blob([data.slice().buffer])).catch(() => {});
  }
  forget(id: string) { this.cache.delete(id); }

  private checkCollection() {
    const cid = lib.store?.meta.id ?? '';
    if (cid !== this.cid) { this.cid = cid; this.cache.clear(); this.queue = []; this.derive = []; }
  }
  private remember(id: string, v: Uint8Array | null) {
    this.cache.set(id, v);
    while (this.cache.size > MAX_CACHED) this.cache.delete(this.cache.keys().next().value!);
    this.version++;
  }
  private pump() {
    while (this.reading < READERS && this.queue.length) {
      const id = this.queue.shift()!;
      this.reading++;
      void this.read(id).finally(() => { this.reading--; this.pump(); });
    }
  }
  /** Another computer's songs: from its GLUE Home, a screenful at a time (ADR 0046). */
  remote: ((ts: Track[]) => Promise<Map<string, Uint8Array>>) | null = null;
  private wantRemote: Track[] = [];
  private remoteTimer = 0;
  private tries = new Map<string, number>();
  private fromRemote(t: Track) {
    this.wantRemote.push(t);
    clearTimeout(this.remoteTimer);
    this.remoteTimer = window.setTimeout(() => {
      const batch = this.wantRemote.splice(0), cid = this.cid;
      void (this.remote?.(batch) ?? Promise.resolve(new Map<string, Uint8Array>())).then(got => {
        if (this.cid !== cid) return;
        for (const t of batch) {
          const b = got.get(t.id);
          if (b && b.length === THUMB_W * THUMB_H) { this.remember(t.id, b); continue; }
          // Not made there yet (GLUE Home makes it now): ask again in a while, a few times.
          this.remember(t.id, null);
          const n = (this.tries.get(t.id) ?? 0) + 1;
          this.tries.set(t.id, n);
          if (n < 10) setTimeout(() => { if (this.cid === cid) { this.cache.delete(t.id); this.request(t.id); } }, Math.min(60_000, 8_000 * n));
        }
      }).catch(() => { for (const t of batch) { this.remember(t.id, null); setTimeout(() => { if (this.cid === cid) { this.cache.delete(t.id); this.request(t.id); } }, 15_000); } });
    }, 120);
  }
  private async read(id: string) {
    const rt = lib.store?.tracks.get(id);
    if (rt?.remote) { if (lib.canRead(rt)) this.fromRemote(rt); else this.remember(id, null); return; }
    const dir = await cacheDir(), cid = this.cid;
    if (!dir || !cid) return;
    try {
      const parts = path(cid, id).split('/'), name = parts.pop()!;
      let d = dir;
      for (const p of parts) d = await d.getDirectoryHandle(p);
      const b = new Uint8Array(await (await (await d.getFileHandle(name)).getFile()).arrayBuffer());
      if (this.cid === cid && b.length === THUMB_W * THUMB_H) { this.remember(id, b); return; }
    } catch { /* not stored yet */ }
    if (this.cid !== cid) return;
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
        const id = this.derive.shift()!, t = lib.store?.tracks.get(id);
        if (!t) continue;
        const d = await lib.trackDetails(t);
        if (d) await this.put(id, makeThumb(d.res)); else this.remember(id, null);
        await new Promise(r => setTimeout(r, 0));   // let the page breathe between them
      }
    } finally { this.deriving = false; }
  }
}
export const thumbs = new Thumbs();
lib.onThumb = (id, data) => void thumbs.put(id, data);
