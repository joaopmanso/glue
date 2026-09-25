/* Another computer's GLUE Home, from here (ADR 0045, 0046): its songs (played here), their mini
   spectrograms and full analyses (without the audio), what's in its incoming folder, and moving
   those songs into its music folders. One 'stream' channel per GLUE Home, one request at a time. */
import { account, type CloudDevice } from './account.svelte';
import { lib } from './library.svelte';
import { connectHome, type HomeChannel } from './homeLink';
import { PENDING, frame, incomingKey, unframe, type HomeFolder, type IncomingFile, type StreamReply, type StreamReq } from '../core/transfer';
import { localHome } from './localHome.svelte';
import type { DetailsHeader } from '../store/details';
import type { Track } from '../store/types';
import { thumbs } from './thumbs.svelte';

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
/** At most this many at once per GLUE Home (songs: 2). */
const MAX_AT_ONCE = 6, MAX_FILES = 2;
let seq = 1;

/** One channel to a GLUE Home, shared by requests that run at once: answers come back by number. */
interface Link {
  ch: HomeChannel;
  waiting: Map<number, { text: (c: StreamReply) => void; bytes: (b: Uint8Array) => void; gone: () => void }>;
  running: number; files: number; timeouts: number;
  queue: { file: boolean; go: () => void }[];
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
        ch.dc.onmessage = e => {
          if (typeof e.data === 'string') { let c: StreamReply; try { c = JSON.parse(e.data); } catch { return; } k.waiting.get(c.n)?.text(c); }
          else { const f = unframe(e.data as ArrayBuffer); k.waiting.get(f.n)?.bytes(f.data); }
        };
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
  async ask(home: string, req: Req, opts: { onBytes?: (got: number, size: number) => void; upload?: Uint8Array } = {}): Promise<Answer> {
    const k = await this.link(home);
    const file = req.t === 'get' || req.t === 'get-incoming';
    // Wait for a free place (songs have fewer).
    if (k.running >= MAX_AT_ONCE || (file && k.files >= MAX_FILES)) await new Promise<void>(go => k.queue.push({ file, go }));
    k.running++; if (file) k.files++;
    const next = () => {
      k.running--; if (file) k.files--;
      const i = k.queue.findIndex(q => !q.file || k.files < MAX_FILES);
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
        wait(FIRST_WAIT);
        const dc = k.ch.dc;
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
  async thumbs(ts: Track[]): Promise<Map<string, Uint8Array>> {
    const out = new Map<string, Uint8Array>();
    // Songs in an incoming folder: made when they arrived.
    const waiting = new Map<string, Track[]>();
    for (const t of ts) if (t.remote?.incoming && t.remote.home) (waiting.get(t.remote.home) ?? waiting.set(t.remote.home, []).get(t.remote.home)!).push(t);
    for (const [home, list] of waiting) {
      const got = await this.cacheFiles(home, list.map(t => incomingKey(t.remote!.incoming!, 'thumb.bin')));
      for (const t of list) { const b = got.get(incomingKey(t.remote!.incoming!, 'thumb.bin')); if (b) out.set(t.id, b); }
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
      const a = await this.ask(home, { t: 'thumbs', profile, collection, tracks: list.map(t => t.remote!.id!) }).catch(() => null);
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
// The library plays and analyses another computer's songs through this.
lib.remoteFile = t => remoteFiles.get(t);
lib.canStream = t => remoteFiles.canStream(t);
thumbs.remote = ts => remoteFiles.thumbs(ts);
