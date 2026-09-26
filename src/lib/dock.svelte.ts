/* The drag dock (ADR 0054): GLUE Home's small window to drag songs from into Engine DJ, Rekordbox or
   Explorer, which a web page can't do itself (research/drag-to-dj-apps.md). A queue: songs are added
   (the selection, a playlist or a folder with what's inside it, a music folder), and taken out or
   cleared there or here. Each song goes as its music folder and path in it (GLUE Home finds the file). */
import { lib } from './library.svelte';
import { localHome } from './localHome.svelte';
import { homeMode } from '../platform';
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
  async clear() { await localHome.post('/dock/clear').catch(() => {}); this.songs = 0; }

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
