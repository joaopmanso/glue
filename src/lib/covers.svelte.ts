/* Songs' covers (ADR 0072), for the table's Cover column and the track page: small JPEGs in the
   browser's cache (`art/<cid>/<hash>-64.jpg` and `-320.jpg`; derived data, safe to lose). Made when a
   song is analysed; for songs analysed before (or in another browser), made from their tags alone, a
   few at a time, only for songs on screen. A track keeps its cover's hash (`art`, '' for none).
   A song whose tags have none: a GLUE Home of the account looks it up on public services (ADR 0086);
   that cover is shown, never written into the song or the collection. */
import { lib } from './library.svelte';
import * as platform from '../platform';
import { fileAt, writeBlob } from '../store/fsx';
import type { Track } from '../store/types';
import type { Cover } from '../workers/cover';
import type { CoverReply, CoverRequest } from '../workers/cover.worker';
import { OnScreen, Retries } from './onScreen';

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
  private web = new Map<string, string>();           // looked up on public services: a hash, '' none, '?' being looked up
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
    if (h === '') return this.webGet(t, size);
    const can = this.canRead(t) || this.canAsk(t);
    if (h) { const u = this.urls.get(h + '-' + size); return u ?? (u === null && !can ? null : undefined); }
    return can ? undefined : null;
  }
  /** Called from an effect while a cell shows `undefined`. */
  request(t: Track, size: CoverSize) {
    this.checkCollection();
    const h = this.hashOf(t);
    if (h === '') {
      const w = this.web.get(t.id);
      if (w === undefined) this.fromWeb(t, size);
      else if (w && w !== '?' && !this.urls.has(w + '-' + size)) void this.load(t, w, size, true);
      return;
    }
    if (h && !this.urls.has(h + '-' + size)) { void this.load(t, h, size); return; }
    if (this.canRead(t)) this.fromTags(t); else if (this.canAsk(t)) this.fromHome(t, size);
  }
  /** The rows on screen: one that scrolls away drops what it asked for (its tag read, its place in the next batch
      from another computer's GLUE Home), and may ask again when it's back (2026-09-30). */
  private screen = new OnScreen();
  private retries = new Retries();
  /** By the song's id: its track changing (a cover found, the engine's feed) isn't leaving the screen (ADR 0142). */
  hold(id: string, size: CoverSize) { this.screen.hold(id + '-' + size); }
  drop(id: string, size: CoverSize) {
    const k = id + '-' + size;
    if (!this.screen.drop(k)) return;
    this.retries.cancel(k);
    const w = this.want.indexOf(id); if (w >= 0) { this.want.splice(w, 1); this.tried.delete(id); }
    if (this.homeWant.delete(k)) this.homeTried.delete(k);
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
    this.urls.clear(); this.want = []; this.tried.clear(); this.found.clear(); this.homeWant.clear(); this.homeTried.clear(); this.web.clear(); this.webWant.clear(); this.retries.clear();
  }
  private remember(k: string, u: string | null) {
    const old = this.urls.get(k);
    if (old) URL.revokeObjectURL(old);
    this.urls.delete(k); this.urls.set(k, u);
    while (this.urls.size > MAX_URLS) { const [k0, u0] = this.urls.entries().next().value!; if (u0) URL.revokeObjectURL(u0); this.urls.delete(k0); }
    this.version++;
  }
  private canRead(t: Track) { return t.status === 'linked' && !t.remote && !!t.rootId && !!t.relPath && !t.fileKey; }
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
    // A cover its GLUE Home couldn't be asked about (the link still opening, a time-out): asked again soon while its
    // row is on screen, not marked tried for good (ADR 0131).
    const onScreen = (k: string) => this.cid === cid && this.screen.has(k);
    const unreached = (ts: Track[], size: CoverSize) => { for (const t of ts) {
      const k = t.id + '-' + size;
      this.homeTried.delete(k);
      this.retries.later(k, 'unreached', onScreen, () => this.fromHome(t, size));
    } };
    for (const size of [64, 320] as const) {
      const ts = want.filter(w => w.size === size).map(w => w.t);
      for (let i = 0; i < ts.length; i += 60) {
        const batch = ts.slice(i, i + 60);
        const got = await lib.remoteArt?.(batch, size).catch(() => null);
        if (this.cid !== cid || lib.store !== s) return;
        if (!got) { unreached(ts.slice(i), size); break; }
        unreached(batch.filter(t => !got.has(t.id)), size);
        const dir = await platform.cacheDir();
        for (const [id, { hash, bytes }] of got) {
          this.retries.done(id + '-' + size);
          this.found.set(id, hash);
          // None in its tags: looked up on public services now (the cell is still waiting, ADR 0086).
          if (hash === '') { const t = s?.tracks.get(id); if (t) this.fromWeb(t, size); }
          if (!hash || !bytes) continue;
          if (dir) await writeBlob(dir, `art/${cid}/${hash}-${size}.jpg`, new Blob([bytes.slice()], { type: 'image/jpeg' })).catch(() => {});
          this.remember(hash + '-' + size, URL.createObjectURL(new Blob([bytes.slice()], { type: 'image/jpeg' })));
        }
        this.version++;
      }
    }
  }

  private async load(t: Track, hash: string, size: CoverSize, web = false) {
    const k = hash + '-' + size, cid = this.cid;
    if (this.reading.has(k)) return;
    this.reading.add(k);
    try {
      const dir = await platform.cacheDir();
      const f = dir ? await fileAt(dir, `art/${cid}/${k}.jpg`).catch(() => null) : null;
      if (this.cid !== cid) return;
      this.remember(k, f ? URL.createObjectURL(f) : null);
      // Not in this browser's cache: from the file again, or from its computer's GLUE Home.
      if (!f) { if (web) { this.web.delete(t.id); this.fromWeb(t, size); } else if (this.canRead(t)) this.fromTags(t); else if (this.canAsk(t)) this.fromHome(t, size); }
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
      const id = this.want.pop()!;   // newest first: what was just scrolled to
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
    // None in its tags: looked up on public services (ADR 0086), both sizes as they're asked for.
    if (!hash) this.fromWeb(now, 64);
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

  // ─── Looked up on public services by a GLUE Home (ADR 0086), for songs whose tags have none ───
  /** Is there a GLUE Home to look this song's cover up, and enough to look for? */
  private canFind(t: Track) { return !!t.artist.trim() && !!(t.album.trim() || t.title.trim()) && !!lib.canFindArt?.(); }
  private webGet(t: Track, size: CoverSize): string | null | undefined {
    const w = this.web.get(t.id);
    if (w === undefined) return this.canFind(t) ? undefined : null;
    if (w === '?') return undefined;
    if (!w) return null;
    const u = this.urls.get(w + '-' + size);
    return u === null ? null : u;
  }
  private webWant = new Map<string, { t: Track; size: CoverSize }>();
  private webTries = new Map<string, number>();
  private webTimer = 0;
  private fromWeb(t: Track, size: CoverSize) {
    if (!this.canFind(t)) return;
    const k = t.id + '-' + size;
    if (this.webWant.has(k)) return;
    this.webWant.set(k, { t, size });
    clearTimeout(this.webTimer);
    this.webTimer = window.setTimeout(() => void this.askWeb(), 80);
  }
  private async askWeb() {
    const cid = this.cid, want = [...this.webWant.values()];
    this.webWant.clear();
    for (const size of [64, 320] as const) {
      const ts = want.filter(w => w.size === size).map(w => w.t);
      for (let i = 0; i < ts.length; i += 60) {
        const batch = ts.slice(i, i + 60);
        for (const t of batch) if (!this.web.has(t.id)) this.web.set(t.id, '?');
        const got = await lib.findArt?.(batch, size).catch(() => null);
        if (this.cid !== cid) return;
        const dir = await platform.cacheDir();
        for (const t of batch) {
          const r = got?.get(t.id);
          if (!r) { this.web.delete(t.id); continue; }
          if (r.hash === '?') {
            // Being looked up now: ask again in a while (a few times).
            this.web.set(t.id, '?');
            const n = (this.webTries.get(t.id) ?? 0) + 1;
            this.webTries.set(t.id, n);
            if (n < 8) setTimeout(() => { if (this.cid === cid) { this.web.delete(t.id); this.fromWeb(t, size); } }, 5000 * n);
            else this.web.set(t.id, '');
            continue;
          }
          this.web.set(t.id, r.hash);
          if (!r.hash || !r.bytes) continue;
          if (dir) await writeBlob(dir, `art/${cid}/${r.hash}-${size}.jpg`, new Blob([r.bytes.slice()], { type: 'image/jpeg' })).catch(() => {});
          this.remember(r.hash + '-' + size, URL.createObjectURL(new Blob([r.bytes.slice()], { type: 'image/jpeg' })));
        }
        this.version++;
      }
    }
  }
  /** Was this song's cover looked up (not from its own tags)? The song's page offers "Wrong cover". */
  isFound(t: Track) { const w = this.web.get(t.id); return this.hashOf(t) === '' && !!w && w !== '?'; }
  /** The user says the cover found for this song's album is wrong: GLUE Home won't show or look for it again. */
  async refuse(t: Track) {
    await lib.findArt?.([t], 64, true).catch(() => null);
    this.web.set(t.id, '');
    // The album's other songs, shown now, lose it too.
    const w = this.web;
    for (const [id, h] of [...w]) { const o = lib.store?.tracks.get(id); if (o && h && o.artist === t.artist && (o.album || o.title) === (t.album || t.title)) w.set(id, ''); }
    this.version++;
  }
}

export const covers = new Covers();
lib.onArt = c => covers.put(c);
