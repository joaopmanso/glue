/* The drag dock (ADR 0054): GLUE Home's small window to drag songs from into Engine DJ, Rekordbox or
   Explorer, which a web page can't do itself (research/drag-to-dj-apps.md). A queue: songs are added
   (the selection, a playlist or a folder with what's inside it, a music folder), and taken out or
   cleared there or here. Each song goes as its music folder and path in it (GLUE Home finds the file). */
import { lib } from './library.svelte';
import { localHome } from './localHome.svelte';
import { homeMode } from '../platform';
import { drag, type Payload } from './drag.svelte';
import type { Track } from '../store/types';

class Dock {
  songs = $state(0);
  /** It can be offered: GLUE Home runs here and the library is on its disk. */
  get available() { return !!localHome.link && homeMode(); }

  async show() {
    await localHome.post('/dock/show').catch(e => { lib.notice = 'The drag dock needs GLUE Home 0.6 or later: ' + (e as Error).message; });
  }
  /** Add songs to the queue (and show the dock). Songs without a file here are left out. */
  async add(tracks: Track[], what = '') {
    if (!this.available) return;
    const items = tracks.filter(t => !t.remote && t.status === 'linked' && t.rootId && t.relPath).map(t => ({ root: t.rootId!, path: t.relPath! }));
    const skipped = tracks.length - items.length;
    try {
      const r = await localHome.post<{ songs: number }>('/dock', JSON.stringify({ mode: 'add', items }));
      this.songs = r.songs;
      await this.show();
      lib.notice = 'Added ' + items.length + ' song' + (items.length === 1 ? '' : 's') + (what ? ' of ' + what : '') + ' to the drag dock (' + r.songs + ' in it).' + (skipped ? ' ' + skipped + ' without a file on this computer left out.' : '');
    } catch (e) { lib.notice = 'The drag dock needs GLUE Home 0.6 or later: ' + (e as Error).message; }
  }
  /** What a playlist drag carries for the dock window (it adds them when dropped there). */
  payload(tracks: Track[]) {
    const items = tracks.filter(t => !t.remote && t.status === 'linked' && t.rootId && t.relPath).map(t => ({ root: t.rootId!, path: t.relPath! }));
    return 'GLUE-DOCK ' + JSON.stringify({ mode: 'add', items });
  }
  async clear() { await localHome.post('/dock/clear').catch(() => {}); this.songs = 0; }

  /** Songs dragged in the library and let go outside the browser's window (ADR 0061): GLUE Home adds
      them if that point is on the dock window. Let go anywhere else, nothing happens. */
  async dropAt(tracks: Track[], x: number, y: number) {
    if (!this.available) return;
    const items = this.itemsOf(tracks);
    if (!items.length) return;
    try {
      const r = await localHome.post<{ on: boolean; songs?: number }>('/dock/drop', JSON.stringify({ x, y, mode: 'add', items }));
      if (!r.on) return;
      this.songs = r.songs ?? this.songs;
      lib.notice = 'Added ' + items.length + ' song' + (items.length === 1 ? '' : 's') + ' to the drag dock (' + this.songs + ' in it).';
    } catch (e) {
      if (/404/.test((e as Error).message)) lib.notice = 'Dropping songs on the drag dock needs GLUE Home 0.9 or later: it updates itself, or download it again.';
    }
  }
  private itemsOf(tracks: Track[]) { return tracks.filter(t => !t.remote && t.status === 'linked' && t.rootId && t.relPath).map(t => ({ root: t.rootId!, path: t.relPath! })); }
  /** The tracks a drag carries. */
  tracksOfDrag(p: Payload): Track[] {
    const s = lib.store;
    if (!s) return [];
    if (p.kind === 'tracks') return p.ids.map(id => s.tracks.get(id)).filter((t): t is Track => !!t);
    if (p.kind === 'list') return this.tracksOf(p.id);
    return [];
  }

  /** A playlist's songs, or a folder's: its own, then each playlist inside it, in the sidebar's order. */
  tracksOf(listId: string): Track[] {
    const s = lib.store, out: Track[] = [], seen = new Set<string>();
    if (!s) return out;
    const walk = (id: string) => {
      const l = s.lists.get(id);
      if (!l) return;
      for (const t of l.items) { const tr = s.tracks.get(t); if (tr && !seen.has(tr.id)) { seen.add(tr.id); out.push(tr); } }
      for (const c of lib.childLists(id)) walk(c.id);
    };
    walk(listId);
    return out;
  }
  /** A music folder's songs, by path. */
  tracksOfFolder(rootId: string): Track[] {
    return [...(lib.store?.tracks.values() ?? [])].filter(t => t.rootId === rootId && t.relPath).sort((a, b) => a.relPath!.localeCompare(b.relPath!));
  }
}

export const dock = new Dock();
// Drops on the "Drag dock" button, and song drags let go outside the window (ADR 0061).
drag.onDock = p => void dock.add(dock.tracksOfDrag(p), p.kind === 'list' ? p.label : '');
drag.onOutside = (p, x, y) => void dock.dropAt(dock.tracksOfDrag(p), x, y);
