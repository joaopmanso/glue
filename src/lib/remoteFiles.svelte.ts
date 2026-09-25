/* Another computer's GLUE Home, from here (ADR 0045, 0046): its songs (played here), their mini
   spectrograms and full analyses (without the audio), what's in its incoming folder, and moving
   those songs into its music folders. One 'stream' channel per GLUE Home, one request at a time. */
import { account, type CloudDevice } from './account.svelte';
import { lib } from './library.svelte';
import { connectHome, type HomeChannel } from './homeLink';
import type { HomeFolder, IncomingFile, StreamReply, StreamReq } from '../core/transfer';
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
const KEEP = 3;
let seq = 1;

class RemoteFiles {
  /** The song being fetched (the player shows it). */
  loading = $state<{ name: string; device: string; got: number; size: number } | null>(null);
  private links = new Map<string, Promise<HomeChannel>>();
  private queues = new Map<string, Promise<unknown>>();
  private kept = new Map<string, File>();

  canStream(t: Track) { return !!t.remote && !!(t.remote.home ? account.online.has(t.remote.home) : t.remote.id && companionOnline(t.remote.device)); }
  private homeFor(t: Track) { return t.remote?.home ?? companionOnline(t.remote?.device ?? '')?.id ?? null; }

  private link(home: string): Promise<HomeChannel> {
    let l = this.links.get(home);
    if (!l) {
      l = connectHome(home, 'stream', { onFail: () => this.links.delete(home) });
      l.catch(() => this.links.delete(home));
      this.links.set(home, l);
    }
    return l;
  }

  /** One request to a GLUE Home: its answer's `data`, and the bytes that came with it. `upload`: bytes
      sent after the request (then `end`). */
  ask(home: string, req: Req, opts: { onBytes?: (got: number, size: number) => void; upload?: Uint8Array } = {}): Promise<{ data: unknown; bytes: Uint8Array; name?: string; type?: string }> {
    const job = (this.queues.get(home) ?? Promise.resolve()).then(async () => {
      const { dc } = await this.link(home);
      const n = seq++;
      return new Promise<{ data: unknown; bytes: Uint8Array; name?: string; type?: string }>((resolve, reject) => {
        const parts: ArrayBuffer[] = [];
        let size = 0, got = 0, head: Extract<StreamReply, { t: 'meta' }> | null = null;
        const onMsg = (e: MessageEvent) => {
          if (typeof e.data !== 'string') { if (!head) return; parts.push(e.data as ArrayBuffer); got += (e.data as ArrayBuffer).byteLength; opts.onBytes?.(got, size); return; }
          const c = JSON.parse(e.data) as StreamReply;
          if (!('n' in c) || c.n !== n) return;
          if (c.t === 'meta') { head = c; size = c.size; opts.onBytes?.(0, size); }
          else if (c.t === 'eof') {
            done();
            if (got !== size) return reject(new Error('It arrived incomplete.'));
            const bytes = new Uint8Array(size); let at = 0;
            for (const p of parts) { bytes.set(new Uint8Array(p), at); at += p.byteLength; }
            resolve({ data: head?.data, bytes, name: head?.name, type: c.type || head?.type });
          } else if (c.t === 'error') { done(); reject(new Error(c.error)); }
        };
        const onClose = () => { done(); reject(new Error('The connection closed.')); };
        const done = () => { dc.removeEventListener('message', onMsg); dc.removeEventListener('close', onClose); };
        dc.addEventListener('message', onMsg);
        dc.addEventListener('close', onClose);
        dc.send(JSON.stringify({ ...req, n }));
        if (opts.upload) {
          const up = new Uint8Array(opts.upload);
          for (let i = 0; i < up.length; i += 64 * 1024) dc.send(up.subarray(i, Math.min(up.length, i + 64 * 1024)));
          dc.send(JSON.stringify({ t: 'end', n }));
        }
      });
    });
    this.queues.set(home, job.catch(() => {}));
    return job;
  }

  /** A song's file: from its computer's GLUE Home (or that GLUE Home's incoming folder). */
  get(t: Track): Promise<File> {
    const r = t.remote, home = r ? this.homeFor(t) : null;
    if (!r || !home) return Promise.reject(new Error('This track’s file is on ' + (r?.name ?? 'another computer') + '.'));
    const key = home + '/' + (r.incoming ?? r.id), hit = this.kept.get(key);
    if (hit) return Promise.resolve(hit);
    this.loading = { name: t.title || t.fileName, device: r.name, got: 0, size: t.size ?? 0 };
    const req: Req = r.incoming ? { t: 'get-incoming', name: r.incoming } : { t: 'get', profile: r.profile!, collection: r.collection!, track: r.id! };
    return this.ask(home, req, { onBytes: (got, size) => { if (this.loading) this.loading = { ...this.loading, got, size }; } })
      .then(a => {
        const f = new File([a.bytes.slice().buffer], a.name ?? t.fileName, { type: a.type ?? '' });
        this.kept.set(key, f);
        while (this.kept.size > KEEP) this.kept.delete(this.kept.keys().next().value!);
        return f;
      })
      .catch(e => { throw new Error(r.name + ': ' + (e as Error).message); })
      .finally(() => { this.loading = null; });
  }

  /** Mini spectrograms of songs on one computer (those its GLUE Home has; the rest come later). */
  async thumbs(ts: Track[]): Promise<Map<string, Uint8Array>> {
    const out = new Map<string, Uint8Array>();
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
