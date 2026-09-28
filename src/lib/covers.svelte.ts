/* Songs' covers (ADR 0072), for the table's Cover column and the track page: small JPEGs in the
   browser's cache (`art/<cid>/<hash>-64.jpg` and `-320.jpg`; derived data, safe to lose). Made when a
   song is analysed; for songs analysed before (or in another browser), made from their tags alone, a
   few at a time, only for songs on screen. A track keeps its cover's hash (`art`, '' for none). */
import { lib } from './library.svelte';
import * as platform from '../platform';
import { fileAt, writeBlob } from '../store/fsx';
import type { Track } from '../store/types';
import type { Cover } from '../workers/cover';
import type { CoverReply, CoverRequest } from '../workers/cover.worker';

export type CoverSize = 64 | 320;
const MAX_URLS = 600, AT_ONCE = 3;

class Covers {
  /** Bumps when pictures arrive, so cells show them. */
  version = $state(0);
  private urls = new Map<string, string | null>();   // `${hash}-${size}`: an object URL, or null (not in the cache)
  private reading = new Set<string>();
  private want: string[] = [];
  private busy = 0;
  private tried = new Set<string>();                 // tracks whose tags were read this visit
  private found = new Map<string, string>();         // hashes found for tracks while the library is read only
  private worker: Worker | null = null;
  private replies = new Map<number, (r: CoverReply) => void>();
  private seq = 0;
  private cid = '';

  /** The track's cover hash as known now: '' none, undefined not looked for yet (what was just read from
      the file, or from its computer's GLUE Home, first). */
  hashOf(t: Track) { return this.found.get(t.id) ?? t.art; }
  /** A cover's picture: a URL, null (the song has none, or GLUE can't get it here), undefined (on its way). */
  get(t: Track, size: CoverSize): string | null | undefined {
    this.checkCollection();
    const h = this.hashOf(t);
    if (h === '') return null;
    const can = this.canRead(t) || this.canAsk(t);
    if (h) { const u = this.urls.get(h + '-' + size); return u ?? (u === null && !can ? null : undefined); }
    return can ? undefined : null;
  }
  /** Called from an effect while a cell shows `undefined`. */
  request(t: Track, size: CoverSize) {
    this.checkCollection();
    const h = this.hashOf(t);
    if (h === '') return;
    if (h && !this.urls.has(h + '-' + size)) { void this.load(t, h, size); return; }
    if (this.canRead(t)) this.fromTags(t); else if (this.canAsk(t)) this.fromHome(t, size);
  }
  /** A fresh analysis found one: stored before the track names it. */
  async put(c: Cover) {
    const dir = await platform.cacheDir(), cid = lib.store?.meta.id;
    if (!dir || !cid) return;
    await writeBlob(dir, `art/${cid}/${c.hash}-64.jpg`, new Blob([c.small.slice()], { type: 'image/jpeg' })).catch(() => {});
    await writeBlob(dir, `art/${cid}/${c.hash}-320.jpg`, new Blob([c.large.slice()], { type: 'image/jpeg' })).catch(() => {});
    for (const [size, b] of [[64, c.small], [320, c.large]] as const) if (!this.urls.get(c.hash + '-' + size)) this.remember(c.hash + '-' + size, URL.createObjectURL(new Blob([b.slice()], { type: 'image/jpeg' })));
  }

  private checkCollection() {
    const cid = lib.store?.meta.id ?? '';
    if (cid === this.cid) return;
    this.cid = cid;
    for (const u of this.urls.values()) if (u) URL.revokeObjectURL(u);
    this.urls.clear(); this.want = []; this.tried.clear(); this.found.clear(); this.homeWant.clear(); this.homeTried.clear();
  }
  private remember(k: string, u: string | null) {
    const old = this.urls.get(k);
    if (old) URL.revokeObjectURL(old);
    this.urls.delete(k); this.urls.set(k, u);
    while (this.urls.size > MAX_URLS) { const [k0, u0] = this.urls.entries().next().value!; if (u0) URL.revokeObjectURL(u0); this.urls.delete(k0); }
    this.version++;
  }
  private canRead(t: Track) { return t.status === 'linked' && !t.remote && !lib.cloud && !!t.rootId && !!t.relPath && !t.fileKey; }
  /** Another computer's song (a phone's cloud library, ADR 0077): its GLUE Home has the cover (ADR 0082). */
  private canAsk(t: Track) { return !!t.remote && !!lib.artReachable?.(t); }

  // ─── From another computer's GLUE Home (ADR 0082): the covers of the rows on screen, a batch at a time,
  // kept in this device's cache (never in GLUE Cloud) so they show at once next time ───
  private homeWant = new Map<string, { t: Track; size: CoverSize }>();
  private homeTried = new Set<string>();
  private homeTimer = 0;
  private fromHome(t: Track, size: CoverSize) {
    const k = t.id + '-' + size;
    if (this.homeTried.has(k)) return;
    this.homeTried.add(k);
    this.homeWant.set(k, { t, size });
    clearTimeout(this.homeTimer);
    this.homeTimer = window.setTimeout(() => void this.askHomes(), 60);
  }
  private async askHomes() {
    const cid = this.cid, s = lib.store, want = [...this.homeWant.values()];
    this.homeWant.clear();
    for (const size of [64, 320] as const) {
      const ts = want.filter(w => w.size === size).map(w => w.t);
      for (let i = 0; i < ts.length; i += 60) {
        const got = await lib.remoteArt?.(ts.slice(i, i + 60), size).catch(() => null);
        if (!got || this.cid !== cid || lib.store !== s) return;
        const dir = await platform.cacheDir();
        for (const [id, { hash, bytes }] of got) {
          this.found.set(id, hash);
          if (!hash || !bytes) continue;
          if (dir) await writeBlob(dir, `art/${cid}/${hash}-${size}.jpg`, new Blob([bytes.slice()], { type: 'image/jpeg' })).catch(() => {});
          this.remember(hash + '-' + size, URL.createObjectURL(new Blob([bytes.slice()], { type: 'image/jpeg' })));
        }
        this.version++;
      }
    }
  }

  private async load(t: Track, hash: string, size: CoverSize) {
    const k = hash + '-' + size, cid = this.cid;
    if (this.reading.has(k)) return;
    this.reading.add(k);
    try {
      const dir = await platform.cacheDir();
      const f = dir ? await fileAt(dir, `art/${cid}/${k}.jpg`).catch(() => null) : null;
      if (this.cid !== cid) return;
      this.remember(k, f ? URL.createObjectURL(f) : null);
      // Not in this browser's cache: from the file again, or from its computer's GLUE Home.
      if (!f) { if (this.canRead(t)) this.fromTags(t); else if (this.canAsk(t)) this.fromHome(t, size); }
    } finally { this.reading.delete(k); }
  }

  private fromTags(t: Track) {
    if (this.tried.has(t.id) || !this.canRead(t)) return;
    this.tried.add(t.id);
    this.want.push(t.id);
    this.pump();
  }
  private pump() {
    while (this.busy < AT_ONCE && this.want.length) {
      const id = this.want.shift()!;
      this.busy++;
      void this.readTags(id).catch(e => console.warn('Couldn’t read a cover', e)).finally(() => { this.busy--; this.pump(); });
    }
  }
  /** Where the worker reads the file: GLUE Home's local link (only the bytes it asks for), or the file. */
  private async sourceOf(t: Track): Promise<Blob | string | null> {
    const r = lib.rootState(t.rootId);
    if (!r || !t.relPath) return null;
    const link = await platform.fileLink(r.root, t.relPath);
    if (link) return link;
    return r.dir && r.granted ? fileAt(r.dir, t.relPath) : null;
  }
  private async readTags(id: string) {
    const s = lib.store, cid = this.cid, t = s?.tracks.get(id);
    if (!s || !t) return;
    const src = await this.sourceOf(t);
    if (!src) { this.tried.delete(id); return; }
    const r = await this.run(src);
    if (this.cid !== cid || lib.store !== s) return;
    if ('error' in r) return;
    if (r.out) await this.put(r.out);
    const hash = r.out?.hash ?? '', now = s.tracks.get(id);
    if (!now) return;
    if (lib.readOnly) this.found.set(id, hash); else if (now.art !== hash) s.putTrack({ ...now, art: hash });
    this.version++;
  }
  private run(src: Blob | string): Promise<CoverReply> {
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/cover.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<CoverReply>) => { const f = this.replies.get(e.data.id); this.replies.delete(e.data.id); f?.(e.data); };
      this.worker.onerror = e => { e.preventDefault(); for (const [id, f] of this.replies) f({ id, error: 'The cover worker stopped' }); this.replies.clear(); this.worker?.terminate(); this.worker = null; };
    }
    const id = ++this.seq;
    return new Promise(resolve => { this.replies.set(id, resolve); this.worker!.postMessage({ id, src } satisfies CoverRequest); });
  }
}

export const covers = new Covers();
lib.onArt = c => covers.put(c);
