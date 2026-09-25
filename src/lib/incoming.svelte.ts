/* TO BE SORTED (ADR 0046, 0048): the songs waiting in the incoming folder of every GLUE Home of the
   account, as one playlist at the top of the sidebar, until they're moved into a music folder.
   - This computer's GLUE Home answers over the local link at once (no GLUE Cloud); the others over
     the account's channel.
   - Each song comes with the analysis GLUE Home made when it arrived.
   - A song the collection already has (the one sent from here, or another computer's) is that
     track: one row, on both computers, played from the nearest copy.
   Shown, never saved into this computer's library. */
import { account } from './account.svelte';
import { lib } from './library.svelte';
import { remoteFiles } from './remoteFiles.svelte';
import { localHome } from './localHome.svelte';
import { nameFields } from '../core/library/tags';
import { SCHEMA, type AnalysisSummary, type List, type Track, type TrackFormat } from '../store/types';
import type { IncomingFile } from '../core/transfer';

export const TO_BE_SORTED = 'tobesorted';
const EVERY = 30_000;
function fnv(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); }
/** "Song (2).mp3" was sent as "Song.mp3" (the name was taken there). */
const plain = (n: string) => n.toLowerCase().replace(/ \(\d+\)(\.[^.]*)$/, '$1');

class Incoming {
  /** Per GLUE Home: what's in its incoming folder. */
  files = $state.raw<Map<string, IncomingFile[]>>(new Map());
  private timer = 0;
  /** What it's asking now (shown with the cloud sync's status). */
  busy = $state('');
  private asked = new Set<string>();
  private stopWatch: (() => void) | null = null;
  private touched = new Map<string, { onDevices: string[] | undefined; remote: Track['remote'] }>();
  /** Each TO BE SORTED row's waiting file: which GLUE Home, and its name there. */
  private src = new Map<string, { home: string; name: string }>();
  sourceOf(id: string) { return this.src.get(id) ?? null; }

  start() {
    clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.refresh(), EVERY);
    // A GLUE Home that comes online (or the sign-in finishing) is asked at once, not at the next round.
    this.stopWatch?.();
    this.stopWatch = $effect.root(() => {
      $effect(() => {
        const homes = account.devices.filter(d => d.kind === 'home' && account.online.has(d.id)).map(d => d.id);
        if (homes.some(h => !this.asked.has(h)) || (localHome.link && !this.asked.has(localHome.link.home))) queueMicrotask(() => void this.refresh());
      });
    });
    void (async () => {
      await localHome.find();
      // Until a collection is open there's nothing to show it in.
      for (let i = 0; i < 40 && !lib.store; i++) await new Promise(r => setTimeout(r, 250));
      await this.refresh();
    })();
  }
  /** Ask every GLUE Home what's waiting (this computer's first, directly), and show it. */
  private running: Promise<void> | null = null;
  refresh() { return (this.running ??= this.ask().finally(() => { this.running = null; })); }
  private async ask() {
    if (!lib.store || lib.cloud) { this.show(new Map()); return; }
    const next = new Map<string, IncomingFile[]>();
    const local = localHome.link;
    const homes = account.signedIn ? account.devices.filter(d => d.kind === 'home' && account.online.has(d.id) && d.id !== local?.home) : [];
    const first = homes.filter(h => !this.asked.has(h.id));
    // Only the first time for each: after that it refreshes quietly.
    if (first.length) this.busy = 'Looking for songs sent to ' + first.map(h => this.computer(h.id)).join(', ') + '…';
    try {
      if (local) { this.asked.add(local.home); const l = await localHome.get<IncomingFile[]>('/incoming').catch(() => null); if (l) next.set(local.home, l); else void localHome.check(); }
      await Promise.all(homes.map(async h => {
        const l = await remoteFiles.incoming(h.id).catch(() => null);
        this.asked.add(h.id);
        if (l) next.set(h.id, l);
      }));
    } finally { this.busy = ''; }
    this.show(next);
  }
  /** The name of a GLUE Home's computer (its browser's, when it's a companion). */
  computer(home: string) { return localHome.computer(home); }
  reshow() { this.show(this.files); }
  private show(files: Map<string, IncomingFile[]>) {
    const s = lib.store;
    if (!s) return;
    this.files = files;
    // What the last showing added to the collection's own rows goes first.
    for (const [id, was] of this.touched) { const t = s.tracks.get(id); if (t) { t.onDevices = was.onDevices; t.remote = was.remote; if (!was.remote) delete t.remote; } }
    this.touched.clear(); this.src.clear();
    const byName = new Map<string, Track[]>();
    for (const t of s.tracks.values()) {
      if (t.remote?.incoming) continue;
      const k = t.fileName.toLowerCase();
      (byName.get(k) ?? byName.set(k, []).get(k)!).push(t);
    }
    const tracks: Track[] = [], items: string[] = [], analysis = new Map<string, AnalysisSummary>();
    for (const [home, list] of files) {
      const h = account.devices.find(d => d.id === home), browser = h?.companionOf ?? home;
      const device = this.computer(home);
      for (const f of list) {
        const same = (byName.get(f.name.toLowerCase()) ?? byName.get(plain(f.name)) ?? []).find(t => t.size == null || t.size === f.size);
        if (same) {
          // Already in the collection: that track, also on this computer now.
          this.touched.set(same.id, { onDevices: same.onDevices, remote: same.remote });
          const here = localHome.deviceName;
          same.onDevices = [...new Set([...(same.onDevices?.length ? same.onDevices : [same.remote?.name ?? here]), device])];
          // Another computer's song, and its file is here too: play it from here.
          if (same.remote && !same.remote.via) same.remote = { ...same.remote, via: { home, incoming: f.name } };
          if (!items.includes(same.id)) items.push(same.id);
          this.src.set(same.id, { home, name: f.name });
          continue;
        }
        const n = nameFields(f.name), sum = f.summary as (AnalysisSummary & { format?: TrackFormat | null; duration?: number | null }) | null | undefined;
        const id = 'in' + fnv(home + '/' + f.name);
        tracks.push({
          id, status: 'linked', rootId: null, relPath: null, importPath: null, fileName: f.name, size: f.size, mtime: f.mtime,
          title: n.title || f.name, artist: n.artist, album: '', genre: '', label: '', comment: '', year: '', duration: sum?.duration ?? null, format: sum?.format ?? null,
          addedAt: new Date(f.mtime || Date.now()).toISOString(), sources: [], onDevices: [device],
          remote: { device: browser, name: device, home, incoming: f.name },
        });
        items.push(id);
        this.src.set(id, { home, name: f.name });
        if (sum) { const { format: _f, duration: _d, ...a } = sum; analysis.set(id, a as AnalysisSummary); }
      }
    }
    const list: List = { schemaVersion: SCHEMA, id: TO_BE_SORTED, kind: 'playlist', name: 'TO BE SORTED', parentId: null, position: -1, notes: 'Songs sent to your GLUE Homes, waiting to be moved into a music folder.', items, origin: null, createdAt: '' };
    lib.showGroup('incoming', tracks, items.length ? [list] : [], analysis);
  }

  /** Move songs of TO BE SORTED into a music folder on their computer (its GLUE Home does it). */
  async move(ids: string[], folder: string) {
    let moved = 0;
    for (const id of ids) {
      const src = this.src.get(id);
      if (!src) continue;
      if (localHome.for(src.home)) await localHome.post('/incoming/move?name=' + encodeURIComponent(src.name) + '&folder=' + encodeURIComponent(folder));
      else await remoteFiles.moveIncoming(src.home, src.name, folder);
      moved++;
    }
    await this.refresh();
    return moved;
  }
  /** Where a TO BE SORTED song can go on its computer: that GLUE Home's music folders. */
  folders(home: string) { return localHome.for(home) ? localHome.get<{ id: string; name: string; collection: string }[]>('/folders') : remoteFiles.folders(home); }
}

export const incoming = new Incoming();
// Other devices' songs were laid over again (new rows): mark those that are also waiting here again.
lib.onOverlay = () => { if (incoming.files.size) queueMicrotask(() => incoming.reshow()); };
