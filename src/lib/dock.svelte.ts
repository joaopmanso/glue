/* The drag dock (ADR 0054): GLUE Home's small window to drag songs from into Engine DJ, Rekordbox or
   Explorer, which a web page can't do itself (research/drag-to-dj-apps.md). In Home mode, once it's
   been opened, it holds what's selected in the library, or the open playlist when nothing is:
   each song as its music folder and path in it (GLUE Home finds the file). */
import { lib } from './library.svelte';
import { view } from './view.svelte';
import { app } from './app.svelte';
import { localHome } from './localHome.svelte';
import { homeMode } from '../platform';
import { readPref, writePref } from './prefs';

class Dock {
  /** Opened on this browser: the selection is kept in the dock from then on. */
  on = $state(readPref('dock', '0') === '1');
  songs = $state(0);
  private timer = 0;
  /** It can be offered: GLUE Home runs here and the library is on its disk. */
  get available() { return !!localHome.link && homeMode(); }

  async show() {
    this.on = true; writePref('dock', '1');
    await localHome.post('/dock/show').catch(e => { lib.notice = 'The drag dock needs GLUE Home 0.6 or later: ' + (e as Error).message; });
    this.send();
  }
  /** The selection changed: send it in a moment (clicks and shift-selects come in bursts). */
  update() { if (!this.on || !this.available) return; clearTimeout(this.timer); this.timer = window.setTimeout(() => this.send(), 250); }

  private send() {
    if (!this.available || !lib.store) return;
    const rows = view.rows(app.keyNotation), sel = view.selected;
    const list = view.sel.kind === 'list' ? lib.store.lists.get(view.sel.id) : null;
    const picked = sel.size ? rows.filter(r => sel.has(r.t.id)) : list ? rows : [];
    const items = picked.map(r => r.t).filter(t => !t.remote && t.status === 'linked' && t.rootId && t.relPath).map(t => ({ root: t.rootId!, path: t.relPath! }));
    const n = items.length, name = sel.size ? '' : list?.name ?? '';
    const title = n ? n + ' song' + (n === 1 ? '' : 's') + (name ? ' · ' + name : '') : '';
    void localHome.post<{ songs: number }>('/dock', JSON.stringify({ title, items })).then(r => { this.songs = r.songs; }).catch(() => {});
  }
}

export const dock = new Dock();
