/* TO BE SORTED (ADR 0046): the songs waiting in the incoming folder of every GLUE Home of the account
   (sent from any computer), as one playlist at the top of the sidebar, until they're moved into a
   music folder. Played through their GLUE Home. Shown, never saved into this computer's library. */
import { account } from './account.svelte';
import { lib } from './library.svelte';
import { remoteFiles } from './remoteFiles.svelte';
import { nameFields } from '../core/library/tags';
import { SCHEMA, type List, type Track } from '../store/types';
import type { IncomingFile } from '../core/transfer';

export const TO_BE_SORTED = 'tobesorted';
const EVERY = 30_000;
function fnv(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); }

class Incoming {
  /** Per GLUE Home: what's in its incoming folder. */
  files = $state.raw<Map<string, IncomingFile[]>>(new Map());
  private timer = 0;

  start() {
    clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.refresh(), EVERY);
    void this.refresh();
  }
  /** Ask every online GLUE Home what's waiting (and show it). */
  async refresh() {
    if (!lib.store || lib.cloud || !account.signedIn) { this.show(new Map()); return; }
    const homes = account.devices.filter(d => d.kind === 'home' && account.online.has(d.id));
    const next = new Map<string, IncomingFile[]>();
    for (const h of homes) { const l = await remoteFiles.incoming(h.id).catch(() => null); if (l) next.set(h.id, l); }
    this.show(next);
  }
  private show(files: Map<string, IncomingFile[]>) {
    this.files = files;
    const tracks: Track[] = [];
    for (const [home, list] of files) {
      const h = account.devices.find(d => d.id === home), browser = h?.companionOf ?? home;
      const device = account.devices.find(d => d.id === browser)?.name ?? h?.name ?? 'GLUE Home';
      for (const f of list) {
        const n = nameFields(f.name);
        tracks.push({
          id: 'in' + fnv(home + '/' + f.name), status: 'linked', rootId: null, relPath: null, importPath: null, fileName: f.name, size: f.size, mtime: f.mtime,
          title: n.title || f.name, artist: n.artist, album: '', genre: '', label: '', comment: '', year: '', duration: null, format: null,
          addedAt: new Date(f.mtime || Date.now()).toISOString(), sources: [], onDevices: [device],
          remote: { device: browser, name: device, home, incoming: f.name },
        });
      }
    }
    const list: List = { schemaVersion: SCHEMA, id: TO_BE_SORTED, kind: 'playlist', name: 'TO BE SORTED', parentId: null, position: -1, notes: 'Songs sent to your GLUE Homes, waiting to be moved into a music folder.', items: tracks.map(t => t.id), origin: null, createdAt: '' };
    lib.showGroup('incoming', tracks, tracks.length ? [list] : []);
  }

  /** Move songs of TO BE SORTED into a music folder on their computer (its GLUE Home does it). */
  async move(ids: string[], folder: string) {
    const ts = ids.map(id => lib.store?.tracks.get(id)).filter((t): t is Track => !!t?.remote?.incoming && !!t.remote.home);
    let moved = 0;
    for (const t of ts) { await remoteFiles.moveIncoming(t.remote!.home!, t.remote!.incoming!, folder); moved++; }
    await this.refresh();
    return moved;
  }
}

export const incoming = new Incoming();
