/* Songs on another computer, played here through its GLUE Home (ADR 0045): a 'stream' channel, one
   request at a time; the file comes whole and plays (and seeks) like a local one. The last few are
   kept, so playing one again is instant. */
import { account, type CloudDevice } from './account.svelte';
import { lib } from './library.svelte';
import { connectHome, type HomeChannel } from './homeLink';
import type { StreamCtrl } from '../core/transfer';
import type { Track } from '../store/types';

/** The GLUE Home serving a browser device of the account, if there is one. */
export function companionOf(browser: string): CloudDevice | null {
  return account.devices.find(d => d.kind === 'home' && d.companionOf === browser) ?? null;
}
/** …and it's online. */
export function companionOnline(browser: string): CloudDevice | null {
  const h = companionOf(browser);
  return h && account.online.has(h.id) ? h : null;
}

const KEEP = 3;

class RemoteFiles {
  /** The song being fetched (the player shows it). */
  loading = $state<{ name: string; device: string; got: number; size: number } | null>(null);
  private links = new Map<string, Promise<HomeChannel>>();
  private kept = new Map<string, File>();
  private queue: Promise<unknown> = Promise.resolve();

  canStream(t: Track) { return !!t.remote?.id && !!companionOnline(t.remote.device); }

  get(t: Track): Promise<File> {
    const r = t.remote;
    if (!r?.id || !r.profile || !r.collection) return Promise.reject(new Error('This track’s file is on ' + (r?.name ?? 'another computer') + '.'));
    const key = r.device + '/' + r.id, hit = this.kept.get(key);
    if (hit) return Promise.resolve(hit);
    const job = this.queue.then(() => this.fetch(t, key));
    this.queue = job.catch(() => {});
    return job;
  }

  private link(home: string): Promise<HomeChannel> {
    let l = this.links.get(home);
    if (!l) {
      l = connectHome(home, 'stream', { onFail: () => this.links.delete(home) });
      l.catch(() => this.links.delete(home));
      this.links.set(home, l);
    }
    return l;
  }

  private async fetch(t: Track, key: string): Promise<File> {
    const r = t.remote!, home = companionOnline(r.device);
    if (!home) throw new Error(r.name + '’s GLUE Home is offline: start it there to play its songs here.');
    const { dc } = await this.link(home.id);
    const n = Date.now() % 1e9;
    const parts: ArrayBuffer[] = [];
    this.loading = { name: t.title || t.fileName, device: r.name, got: 0, size: t.size ?? 0 };
    try {
      const file = await new Promise<File>((resolve, reject) => {
        let size = 0, got = 0, name = t.fileName;
        const onMsg = (e: MessageEvent) => {
          if (typeof e.data !== 'string') { parts.push(e.data as ArrayBuffer); got += (e.data as ArrayBuffer).byteLength; if (this.loading) this.loading = { ...this.loading, got }; return; }
          const c = JSON.parse(e.data) as StreamCtrl;
          if (!('n' in c) || c.n !== n) return;
          if (c.t === 'meta') { size = c.size; name = c.name; if (this.loading) this.loading = { ...this.loading, size }; }
          else if (c.t === 'eof') { done(); got === size ? resolve(new File(parts, name, { type: c.type || '' })) : reject(new Error('The song arrived incomplete.')); }
          else if (c.t === 'error') { done(); reject(new Error(r.name + ': ' + c.error)); }
        };
        const onClose = () => { done(); reject(new Error('The connection to ' + r.name + ' closed.')); };
        const done = () => { dc.removeEventListener('message', onMsg); dc.removeEventListener('close', onClose); };
        dc.addEventListener('message', onMsg);
        dc.addEventListener('close', onClose);
        dc.send(JSON.stringify({ t: 'get', n, profile: r.profile!, collection: r.collection!, track: r.id! } satisfies StreamCtrl));
      });
      this.kept.set(key, file);
      while (this.kept.size > KEEP) this.kept.delete(this.kept.keys().next().value!);
      return file;
    } finally { this.loading = null; }
  }
}

export const remoteFiles = new RemoteFiles();
// The library plays and analyses another computer's songs through this.
lib.remoteFile = t => remoteFiles.get(t);
lib.canStream = t => remoteFiles.canStream(t);
