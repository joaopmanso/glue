/* Another computer's GLUE Home, from here (ADR 0045, 0046): its songs (played here), their mini
   spectrograms and full analyses (without the audio), what's in its incoming folder, and moving
   those songs into its music folders. One 'stream' channel per GLUE Home, one request at a time. */
import { account, type CloudDevice } from './account.svelte';
import { lib } from './library.svelte';
import { connectHome, type HomeChannel } from './homeLink';
import { PENDING, frame, incomingKey, unframe, type HomeFolder, type IncomingFile, type StreamReply, type StreamReq } from '../core/transfer';
import { localHome } from './localHome.svelte';
import { wavBytes, wavView, type WavView } from '../core/formats/wavStream';
import type { DetailsHeader } from '../store/details';
import type { Track } from '../store/types';
import { thumbs, waves } from './thumbs.svelte';
import { playsNatively, typeOfName } from './playable';

/** The GLUE Home serving a browser device of the account, if there is one. */
export function companionOf(browser: string): CloudDevice | null {
  return account.devices.find(d => d.kind === 'home' && d.companionOf === browser) ?? null;
}
/** …and it's online. */
export function companionOnline(browser: string): CloudDevice | null {
  const h = companionOf(browser);
  return h && account.online.has(h.id) ? h : null;
}

type Req = StreamReq extends infer R ? R extends { n: number } ? Omit<R, 'n'> : never : never;
type Answer = { data: unknown; bytes: Uint8Array; name?: string; type?: string };
const KEEP = 3;
/** Give up on an answer that doesn't start (or stops coming) in this long (ADR 0047). */
const FIRST_WAIT = 40_000, IDLE_WAIT = 20_000;
/** At most this many at once per GLUE Home (whole songs: 2). Covers, waveforms and analyses never take
    the last two places: those are kept for what's playing (ADR 0084). */
const MAX_AT_ONCE = 6, MAX_FILES = 2, MAX_BACKGROUND = MAX_AT_ONCE - 2;
let seq = 1;

/** One channel to a GLUE Home, shared by requests that run at once: answers come back by number. */
interface Link {
  ch: HomeChannel;
  waiting: Map<number, { text: (c: StreamReply) => void; bytes: (b: Uint8Array) => void; gone: () => void }>;
  running: number; files: number; timeouts: number;
  queue: { file: boolean; play: boolean; go: () => void }[];
}

class RemoteFiles {
  /** The song being fetched (the player and its track page show it). */
  loading = $state<{ trackId: string; name: string; device: string; got: number; size: number } | null>(null);
  private links = new Map<string, Promise<Link>>();
  private kept = new Map<string, File>();

  /** A GLUE Home that can answer now: this computer's over the local link (ADR 0048), or online. */
  private reachable(home: string | null | undefined) { return !!home && (!!localHome.for(home) || account.online.has(home)); }
  canStream(t: Track) {
    const r = t.remote;
    if (!r) return false;
    if (r.via && this.reachable(r.via.home)) return true;
    return r.home ? this.reachable(r.home) : !!r.id && !!companionOnline(r.device);
  }
  /** Why a song of another computer can't stream from here (null: it can): no GLUE Home serves that
      computer on this account, or it's offline (since when). */
  whyNot(t: Track): string | null {
    const r = t.remote;
    if (!r || this.canStream(t)) return null;
    const home = r.home ? account.devices.find(d => d.id === r.home) : companionOf(r.device);
    if (!home) return 'no GLUE Home on ' + r.name + ' is connected to this account';
    const m = home.lastSeen ? Math.round((Date.now() - home.lastSeen) / 60e3) : null;
    return r.name + '’s GLUE Home is offline' + (m == null ? '' : m < 2 ? ' (seen just now)' : m < 120 ? ' (seen ' + m + ' min ago)' : ' (seen ' + Math.round(m / 60) + ' h ago)');
  }
  private homeFor(t: Track) { return t.remote?.home ?? companionOnline(t.remote?.device ?? '')?.id ?? null; }
  /** Where a song's file comes from: an incoming folder (its own, or a copy of another computer's
      song), else the other computer's library. */
  private source(t: Track): { home: string; incoming?: string } | null {
    const r = t.remote;
    if (!r) return null;
    if (r.incoming && r.home) return { home: r.home, incoming: r.incoming };
    if (r.via && this.reachable(r.via.home)) return { home: r.via.home, incoming: r.via.incoming };
    const h = this.homeFor(t);
    return h ? { home: h } : null;
  }

  private link(home: string): Promise<Link> {
    let l = this.links.get(home);
    if (!l) {
      const drop = () => { if (this.links.get(home) === l) this.links.delete(home); };
      l = connectHome(home, 'stream', { onFail: () => { drop(); void l?.then(k => { for (const w of k.waiting.values()) w.gone(); }); } }).then(ch => {
        const k: Link = { ch, waiting: new Map(), running: 0, files: 0, timeouts: 0, queue: [] };
        const onmessage = (e: MessageEvent) => {
          if (typeof e.data === 'string') { let c: StreamReply; try { c = JSON.parse(e.data); } catch { return; } k.waiting.get(c.n)?.text(c); }
          else { const f = unframe(e.data as ArrayBuffer); k.waiting.get(f.n)?.bytes(f.data); }
        };
        ch.dc.onmessage = onmessage;
        if (ch.play) ch.play.onmessage = onmessage;
        return k;
      });
      l.catch(drop);
      this.links.set(home, l);
    }
    return l;
  }
  private closeLink(home: string) { const l = this.links.get(home); this.links.delete(home); void l?.then(k => { k.ch.close(); for (const w of k.waiting.values()) w.gone(); }); }

  /** One request to a GLUE Home: its answer's `data`, and the bytes that came with it. Several run at
      once; each gives up if its answer doesn't come. `upload`: bytes sent after the request. */
  async ask(home: string, req: Req, opts: { onBytes?: (got: number, size: number) => void; upload?: Uint8Array; firstWait?: number } = {}): Promise<Answer> {
    const k = await this.link(home);
    const file = req.t === 'get' || req.t === 'get-incoming', play = file || req.t === 'range';
    // Wait for a free place: what's playing goes first, and background asks leave it room.
    const fits = (f: boolean, p: boolean) => k.running < (p ? MAX_AT_ONCE : MAX_BACKGROUND) && (!f || k.files < MAX_FILES);
    if (!fits(file, play)) await new Promise<void>(go => { const q = { file, play, go }; if (play) k.queue.splice(k.queue.findIndex(x => !x.play) >>> 0, 0, q); else k.queue.push(q); });
    k.running++; if (file) k.files++;
    const next = () => {
      k.running--; if (file) k.files--;
      const i = k.queue.findIndex(q => fits(q.file, q.play));
      if (i >= 0) k.queue.splice(i, 1)[0].go();
    };
    const n = seq++;
    try {
      return await new Promise<Answer>((resolve, reject) => {
        const parts: Uint8Array[] = [];
        let size = 0, got = 0, head: Extract<StreamReply, { t: 'meta' }> | null = null, timer = 0;
        const wait = (ms: number) => { clearTimeout(timer); timer = window.setTimeout(() => { finish(); if (++k.timeouts >= 2) this.closeLink(home); reject(new Error('it didn’t answer in time')); }, ms); };
        const finish = () => { clearTimeout(timer); k.waiting.delete(n); };
        k.waiting.set(n, {
          text: c => {
            if (c.t === 'meta') { head = c; size = c.size; opts.onBytes?.(0, size); wait(IDLE_WAIT); }
            else if (c.t === 'eof') {
              finish(); k.timeouts = 0;
              if (got !== size) return reject(new Error('it arrived incomplete'));
              const bytes = new Uint8Array(size); let at = 0;
              for (const p of parts) { bytes.set(p, at); at += p.length; }
              resolve({ data: head?.data, bytes, name: head?.name, type: c.type || head?.type });
            } else if (c.t === 'error') { finish(); k.timeouts = 0; reject(Object.assign(new Error(c.error), { pending: c.error === PENDING })); }
          },
          bytes: b => { if (!head) return; parts.push(b.slice()); got += b.length; opts.onBytes?.(got, size); wait(IDLE_WAIT); },
          gone: () => { finish(); reject(new Error('the connection closed')); },
        });
        wait(opts.firstWait ?? FIRST_WAIT);
        const dc = play ? k.ch.play ?? k.ch.dc : k.ch.dc;
        dc.send(JSON.stringify({ ...req, n }));
        if (opts.upload) {
          for (let i = 0; i < opts.upload.length; i += 64 * 1024) dc.send(frame(n, opts.upload.subarray(i, Math.min(opts.upload.length, i + 64 * 1024))));
          dc.send(JSON.stringify({ t: 'end', n }));
        }
      });
    } finally { next(); }
  }

  /** A song's file: from its computer's GLUE Home (or that GLUE Home's incoming folder). */
  get(t: Track): Promise<File> {
    const r = t.remote, src = this.source(t), home = src?.home;
    if (!r || !src || !home) return Promise.reject(new Error('This track’s file is on ' + (r?.name ?? 'another computer') + '.'));
    const key = home + '/' + (src.incoming ?? r.id), hit = this.kept.get(key);
    if (hit) return Promise.resolve(hit);
    // This computer's GLUE Home: straight from its disk, over the local link.
    if (src.incoming && localHome.for(home)) {
      return fetch(localHome.url('/incoming/file?name=' + encodeURIComponent(src.incoming))).then(async res => {
        if (!res.ok) throw new Error('GLUE Home: ' + res.status);
        const f = new File([await res.blob()], src.incoming!, { type: res.headers.get('content-type') ?? '' });
        this.kept.set(key, f);
        return f;
      });
    }
    // Named after the computer the file comes from (a copy in an incoming folder may be on another one).
    const from = src.incoming && src.home !== r.home ? localHome.computer(src.home) : r.name;
    this.loading = { trackId: t.id, name: t.title || t.fileName, device: from, got: 0, size: t.size ?? 0 };
    const req: Req = src.incoming ? { t: 'get-incoming', name: src.incoming } : { t: 'get', profile: r.profile!, collection: r.collection!, track: r.id! };
    return this.ask(home, req, { onBytes: (got, size) => { if (this.loading) this.loading = { ...this.loading, got, size }; } })
      .then(a => {
        const f = new File([a.bytes.slice().buffer], a.name ?? t.fileName, { type: a.type ?? '' });
        this.kept.set(key, f);
        while (this.kept.size > KEEP) this.kept.delete(this.kept.keys().next().value!);
        return f;
      })
      .catch(e => { throw new Error(from + ': ' + (e as Error).message); })
      .finally(() => { if (this.loading?.trackId === t.id) this.loading = null; });
  }

  // ─── Streaming (ADR 0076) ───────────────────────────────────────────────────────────────────────
  /** `wav`: an AIFF played as WAV, its bytes worked out a piece at a time (ADR 0088). */
  private streams = new Map<string, { home: string; req: RangeReq; type: string; total: number; wav?: WavView }>();
  /** A song as an address that streams: this computer's GLUE Home's local link for its incoming folder,
      or another computer's GLUE Home through the streaming service worker, when this browser plays the
      format by itself. Null: take the whole file (get). */
  async stream(t: Track): Promise<string | null> {
    const r = t.remote, src = this.source(t), home = src?.home;
    if (!r || !src || !home) return null;
    const name = src.incoming ?? t.fileName, type = typeOfName(name);
    // AIFF (Chrome, Edge and Firefox don't play it) streams as WAV (ADR 0088); other formats the browser
    // doesn't play come whole.
    const aiff = type === 'audio/aiff' && !playsNatively(type) && playsNatively('audio/wav');
    if (!aiff && !playsNatively(type)) return null;
    if (src.incoming && localHome.for(home)) return aiff ? null : localHome.url('/incoming/file?name=' + encodeURIComponent(src.incoming));
    if (!(await streamsReady())) return null;
    const req: RangeReq = src.incoming ? { incoming: src.incoming } : { profile: r.profile!, collection: r.collection!, track: r.id! };
    // One small ask first: the file's size and type. A connection that went bad is made again once;
    // after that the player says why (no silent download of the whole song instead, ADR 0084).
    // An AIFF's first 64 kB: its chunk headers, to make the WAV header from.
    const probe = () => this.ask(home, { t: 'range', ...req, start: 0, len: aiff ? 64 * 1024 : 2 }, { firstWait: 25_000 });
    let head: Answer;
    try { head = await probe(); }
    catch (e) {
      if ((e as { pending?: boolean }).pending || !/in time|closed|connect|dropped/i.test((e as Error).message)) throw e;
      this.closeLink(home);
      head = await probe();
    }
    const d = head.data as { total: number; type: string } | null;
    if (!d?.total) return null;
    const wav = aiff ? wavView(head.bytes, d.total) : undefined;
    if (aiff && !wav) return null;   // not PCM that can be rewrapped: it comes whole
    const token = crypto.randomUUID();
    this.streams.set(token, wav ? { home, req, type: 'audio/wav', total: wav.total, wav } : { home, req, type: d.type || typeOfName(name), total: d.total });
    while (this.streams.size > 8) this.streams.delete(this.streams.keys().next().value!);
    return new URL('__stream/' + token, document.baseURI).href;
  }
  /** The service worker asks for bytes of a stream: from its GLUE Home, a piece at a time. */
  async answerStream(q: { token: string; start: number; end: number | null }): Promise<{ bytes: ArrayBuffer; total: number; type: string } | { unknown: true } | { error: string }> {
    const s = this.streams.get(q.token);
    if (!s) return { unknown: true };
    // The first piece small (it starts at once), then 2 MB; what the player asks for when it says.
    const len = q.end != null ? q.end - q.start + 1 : q.start === 0 ? 512 * 1024 : 2 * 1024 * 1024;
    try {
      const want = Math.min(len, 8 * 1024 * 1024);
      if (s.wav) {
        const b = await wavBytes(s.wav, q.start, q.start + want - 1, async (from, to) => (await this.ask(s.home, { t: 'range', ...s.req, start: from, len: to - from })).bytes);
        return { bytes: b.slice().buffer, total: s.total, type: s.type };
      }
      const a = await this.ask(s.home, { t: 'range', ...s.req, start: q.start, len: want });
      return { bytes: a.bytes.slice().buffer, total: s.total, type: s.type };
    } catch (e) { return { error: (e as Error).message }; }
  }

  /** Files of a GLUE Home's cache (the analyses of songs in its incoming folder): over the local link
      for this computer's, else one request. */
  async cacheFiles(home: string, keys: string[]): Promise<Map<string, Uint8Array>> {
    const out = new Map<string, Uint8Array>();
    if (localHome.for(home)) {
      await Promise.all(keys.map(async k => { const b = await localHome.get<ArrayBuffer>('/cache?key=' + encodeURIComponent(k)).catch(() => null); if (b) out.set(k, new Uint8Array(b)); }));
      return out;
    }
    const a = await this.ask(home, { t: 'cache', keys }).catch(() => null);
    if (!a) return out;
    let at = 0;
    for (const [k, size] of a.data as [string, number][]) { if (size) out.set(k, a.bytes.slice(at, at + size)); at += size; }
    return out;
  }

  /** Mini spectrograms of songs on one computer (those its GLUE Home has; the rest come later). */
  async thumbs(ts: Track[], kind: 'thumb' | 'wave' = 'thumb'): Promise<Map<string, Uint8Array>> {
    const out = new Map<string, Uint8Array>(), file = kind === 'wave' ? 'wave.bin' : 'thumb.bin';
    // Songs in an incoming folder: made when they arrived.
    const waiting = new Map<string, Track[]>();
    for (const t of ts) if (t.remote?.incoming && t.remote.home) (waiting.get(t.remote.home) ?? waiting.set(t.remote.home, []).get(t.remote.home)!).push(t);
    for (const [home, list] of waiting) {
      const got = await this.cacheFiles(home, list.map(t => incomingKey(t.remote!.incoming!, file)));
      for (const t of list) { const b = got.get(incomingKey(t.remote!.incoming!, file)); if (b) out.set(t.id, b); }
    }
    ts = ts.filter(t => !t.remote?.incoming);
    const groups = new Map<string, Track[]>();
    for (const t of ts) {
      const home = this.homeFor(t), r = t.remote;
      if (!home || !r?.id || !r.profile || !r.collection) continue;
      const k = home + '|' + r.profile + '|' + r.collection;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
    }
    for (const [k, list] of groups) {
      const [home, profile, collection] = k.split('|');
      const a = await this.ask(home, { t: 'thumbs', profile, collection, tracks: list.map(t => t.remote!.id!), ...(kind === 'wave' ? { wave: true } : {}) }).catch(() => null);
      if (!a) continue;
      let at = 0;
      for (const [id, size] of a.data as [string, number][]) {
        const t = list.find(x => x.remote!.id === id);
        if (t && size) out.set(t.id, a.bytes.slice(at, at + size));
        at += size;
      }
    }
    return out;
  }

  /** Covers of songs on other computers (ADR 0082), from their GLUE Home (0.15 and later): kept there, or
      read from the songs' tags. Per track: its cover's hash ('' none) and the JPEG. */
  async art(ts: Track[], px: 64 | 320): Promise<Map<string, { hash: string; bytes: Uint8Array | null }>> {
    const out = new Map<string, { hash: string; bytes: Uint8Array | null }>(), groups = new Map<string, Track[]>();
    for (const t of ts) {
      const home = this.homeFor(t), r = t.remote;
      if (!home || !r?.id || !r.profile || !r.collection || r.incoming) continue;
      const k = home + '|' + r.profile + '|' + r.collection;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
    }
    for (const [k, list] of groups) {
      const [home, profile, collection] = k.split('|');
      const a = await this.ask(home, { t: 'art', profile, collection, px, items: list.map(t => ({ track: t.remote!.id!, ...(t.art ? { hash: t.art } : {}) })) }).catch(() => null);
      if (!a) continue;
      let at = 0;
      for (const [id, hash, size] of a.data as [string, string, number][]) {
        const t = list.find(x => x.remote!.id === id);
        if (t) out.set(t.id, { hash, bytes: size ? a.bytes.slice(at, at + size) : null });
        at += size;
      }
    }
    return out;
  }
  /** The GLUE Home that looks covers up (ADR 0086): this computer's, else any of the account's online. */
  private finder(): string | null {
    const me = account.thisDevice, mine = me ? companionOnline(me) : null;
    if (mine && !this.noFind.has(mine.id)) return mine.id;
    return account.devices.find(d => d.kind === 'home' && account.online.has(d.id) && !this.noFind.has(d.id))?.id ?? null;
  }
  /** GLUE Homes older than 0.18 (no `find-art`): not asked again this visit. */
  private noFind = new Set<string>();
  canFindArt() { return !!this.finder(); }
  async findArt(ts: Track[], px: 64 | 320, refuse = false): Promise<Map<string, { hash: string; bytes: Uint8Array | null }>> {
    const out = new Map<string, { hash: string; bytes: Uint8Array | null }>(), home = this.finder();
    if (!home || !ts.length) return out;
    const items = ts.map(t => ({ id: t.id, artist: t.artist, album: t.album, title: t.title }));
    const a = await this.ask(home, { t: 'find-art', px, items, ...(refuse ? { refuse: true } : {}) }, { firstWait: 10_000 })
      .catch(e => { if (/in time/.test((e as Error).message)) this.noFind.add(home); return null; });
    if (!a) return out;
    let at = 0;
    for (const [id, hash, size] of a.data as [string, string, number][]) { out.set(id, { hash, bytes: size ? a.bytes.slice(at, at + size) : null }); at += size; }
    return out;
  }
  artReachable(t: Track) { const r = t.remote; return !!r?.id && !r.incoming && !!this.homeFor(t) && account.online.has(this.homeFor(t)!); }

  /** The full analysis of a song on another computer (made there), without its audio. */
  async details(t: Track): Promise<{ header: DetailsHeader; bin: Uint8Array } | null> {
    const home = this.homeFor(t), r = t.remote;
    if (r?.incoming && r.home) {
      const k = [incomingKey(r.incoming, 'details.json'), incomingKey(r.incoming, 'details.bin')], got = await this.cacheFiles(r.home, k);
      const h = got.get(k[0]), bin = got.get(k[1]);
      if (!h || !bin) throw Object.assign(new Error(PENDING), { pending: true });
      return { header: JSON.parse(new TextDecoder().decode(h)) as DetailsHeader, bin };
    }
    if (!home || !r?.id || !r.profile || !r.collection) return null;
    const a = await this.ask(home, { t: 'details', profile: r.profile, collection: r.collection, track: r.id });
    return { header: a.data as DetailsHeader, bin: a.bytes };
  }

  incoming(home: string) { return this.ask(home, { t: 'incoming' }).then(a => a.data as IncomingFile[]); }
  folders(home: string) { return this.ask(home, { t: 'folders' }).then(a => a.data as HomeFolder[]); }
  moveIncoming(home: string, name: string, folder: string) { return this.ask(home, { t: 'move-incoming', name, folder }).then(a => a.data as string); }
}

export const remoteFiles = new RemoteFiles();
type RangeReq = { profile?: string; collection?: string; track?: string; incoming?: string };

/** The streaming service worker (public/glue-stream-sw.js), registered the first time a song streams;
    false when this browser can't have one (not a secure page, or no service workers). */
let workerReady: Promise<boolean> | null = null;
function streamsReady(): Promise<boolean> {
  return workerReady ??= (async () => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw || !window.isSecureContext) return false;
    try {
      await sw.register(new URL('glue-stream-sw.js', document.baseURI).href, { scope: './' });
      if (!sw.controller) {
        const done = new Promise<void>(res => { const t = setTimeout(res, 4000); sw.addEventListener('controllerchange', () => { clearTimeout(t); res(); }, { once: true }); });
        // After a hard reload the worker is running but doesn't control the page: ask it to.
        (await sw.ready).active?.postMessage({ glueClaim: true });
        await done;
      }
      return !!sw.controller;
    } catch (e) { console.warn('No streaming: the service worker didn’t start', e); return false; }
  })();
}
if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', e => {
    const q = (e.data as { glueStream?: { token: string; start: number; end: number | null } } | null)?.glueStream, port = e.ports[0];
    if (!q || !port) return;
    void remoteFiles.answerStream(q).then(a => port.postMessage(a, 'bytes' in a ? [a.bytes] : []));
  });
}
lib.streamFor = t => remoteFiles.stream(t);
// The library plays and analyses another computer's songs through this.
lib.remoteFile = t => remoteFiles.get(t);
lib.canStream = t => remoteFiles.canStream(t);
lib.remoteArt = (ts, px) => remoteFiles.art(ts, px);
lib.artReachable = t => remoteFiles.artReachable(t);
lib.findArt = (ts, px, refuse) => remoteFiles.findArt(ts, px, refuse);
lib.canFindArt = () => remoteFiles.canFindArt();
// Edits sent for a computer: its GLUE Home applies them at once (or tells its open tab, ADR 0087).
thumbs.remote = ts => remoteFiles.thumbs(ts);
waves.remote = ts => remoteFiles.thumbs(ts, 'wave');
