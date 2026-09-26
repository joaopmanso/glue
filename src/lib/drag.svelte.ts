/* Dragging inside GLUE (tracks onto playlists, playlists around the tree).
   - Tracks: pointer events (ADR 0022): the browser's drag-and-drop cancels a drag when the table
     re-renders under it, which background analysis does all the time.
   - Playlists: the browser's drag-and-drop (beginNative), so a playlist can also leave the window
     onto GLUE Home's drag dock (ADR 0056). The same drop targets and drops, fed by dragover / drop. */
import { lib } from './library.svelte';
import { view } from './view.svelte';
import { columns, type ColKey } from './columns.svelte';

export type Payload = { kind: 'tracks'; ids: string[]; label: string } | { kind: 'list'; id: string; label: string } | { kind: 'column'; key: ColKey; label: string };
/** Where a drop would land. */
export type Target =
  | { type: 'playlist'; id: string }                        // add the tracks to a playlist
  | { type: 'folder'; id: string }                          // add the tracks to a folder (folders are playlists too)
  | { type: 'col'; key: ColKey; at: 'before' | 'after' }    // reorder the table's columns
  | { type: 'new' }                                         // "+ Playlist": a new playlist with them
  | { type: 'tag'; name: string }                           // tag the tracks
  | { type: 'row'; listId: string; index: number }          // reorder / insert inside the open playlist
  | { type: 'list'; id: string; at: 'before' | 'after' | 'into' }
  | { type: 'top' }                                         // the end of the top level
  | { type: 'home'; home: string };                         // send the tracks' files to a GLUE Home (ADR 0046)

const THRESHOLD = 5;   // px of movement before a press becomes a drag

class Drag {
  payload = $state.raw<Payload | null>(null);
  active = $state(false);
  /** The browser runs this drag (it paints the dragged row itself). */
  native = $state(false);
  x = $state(0);
  y = $state(0);
  target = $state.raw<Target | null>(null);
  private sx = 0; private sy = 0;
  private openTimer = 0; private openFor: string | null = null;
  /** True just after a drag, so the click that ends it doesn't also select a row. */
  suppressClick = false;
  /** Hovering a drag over a closed folder asks the sidebar to open it. */
  onOpenFolder: ((id: string) => void) | null = null;
  /** Tracks dropped on a computer with GLUE Home (Devices): send their files there. */
  onHome: ((home: string, ids: string[]) => void) | null = null;

  begin(e: PointerEvent, payload: Payload) {
    if (e.button !== 0) return;
    this.end();
    this.payload = payload;
    this.sx = e.clientX; this.sy = e.clientY;
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('keydown', this.key);
  }

  private move = (e: PointerEvent) => {
    if (!this.payload) return;
    if (!this.active) {
      if (Math.hypot(e.clientX - this.sx, e.clientY - this.sy) < THRESHOLD) return;
      this.active = true;
      document.body.classList.add('mco-dragging');
      window.getSelection()?.removeAllRanges();
    }
    this.x = e.clientX; this.y = e.clientY;
    this.target = this.resolve(e.clientX, e.clientY);
  };
  private up = () => {
    const p = this.payload, t = this.target, was = this.active;
    this.end();
    if (!was) return;
    this.suppressClick = true;
    setTimeout(() => { this.suppressClick = false; });
    if (p && t) this.drop(p, t);
  };
  private key = (e: KeyboardEvent) => { if (e.key === 'Escape') this.end(); };

  /** A drag the browser runs (a playlist): targets from dragover, the drop from drop, ended by dragend. */
  beginNative(payload: Payload) {
    this.end();
    this.payload = payload; this.active = true; this.native = true;
    document.body.classList.add('mco-dragging');
    window.addEventListener('dragover', this.nativeOver);
    window.addEventListener('drop', this.nativeDrop);
  }
  private nativeOver = (e: DragEvent) => {
    if (!this.payload) return;
    this.x = e.clientX; this.y = e.clientY;
    this.target = this.resolve(e.clientX, e.clientY);
    if (this.target) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; }
  };
  private nativeDrop = (e: DragEvent) => {
    const p = this.payload, t = this.target;
    if (!p) return;
    e.preventDefault();
    this.end();
    this.suppressClick = true;
    setTimeout(() => { this.suppressClick = false; });
    if (t) this.drop(p, t);
  };

  end() {
    window.removeEventListener('dragover', this.nativeOver);
    window.removeEventListener('drop', this.nativeDrop);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('keydown', this.key);
    document.body.classList.remove('mco-dragging');
    clearTimeout(this.openTimer); this.openFor = null;
    this.payload = null; this.active = false; this.native = false; this.target = null;
  }

  /** What's under the pointer. Drop targets mark themselves with data-drop="…". */
  private resolve(x: number, y: number): Target | null {
    const p = this.payload!;
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]');
    if (!el) { this.hoverFolder(null); return null; }
    const kind = el.dataset.drop, id = el.dataset.id ?? '';
    if (kind === 'col') {
      if (p.kind !== 'column' || el.dataset.col === p.key) return null;
      const r = el.getBoundingClientRect();
      return { type: 'col', key: el.dataset.col as ColKey, at: x < r.left + r.width / 2 ? 'before' : 'after' };
    }
    if (p.kind === 'column') return null;
    if (kind === 'new') return p.kind === 'tracks' ? { type: 'new' } : null;
    if (kind === 'tag') return p.kind === 'tracks' && el.dataset.tag ? { type: 'tag', name: el.dataset.tag } : null;
    if (kind === 'top') return p.kind === 'list' ? { type: 'top' } : null;
    if (kind === 'home') return p.kind === 'tracks' && el.dataset.home ? { type: 'home', home: el.dataset.home } : null;
    if (kind === 'row') {
      if (p.kind !== 'tracks' || !el.dataset.list) return null;
      const r = el.getBoundingClientRect(), i = Number(el.dataset.index);
      return { type: 'row', listId: el.dataset.list, index: y < r.top + r.height / 2 ? i : i + 1 };
    }
    if (kind !== 'list') return null;
    const l = lib.store?.lists.get(id);
    if (!l) return null;
    if (p.kind === 'tracks') {
      if (l.kind === 'folder') { this.hoverFolder(l.id); return { type: 'folder', id }; }
      this.hoverFolder(null);
      return { type: 'playlist', id };
    }
    if (p.id === id) return null;
    const r = el.getBoundingClientRect(), f = (y - r.top) / r.height;
    if (l.kind === 'folder' && f > 0.25 && f < 0.75) { this.hoverFolder(l.id); return { type: 'list', id, at: 'into' }; }
    this.hoverFolder(null);
    return { type: 'list', id, at: f < 0.5 ? 'before' : 'after' };
  }
  private hoverFolder(id: string | null) {
    if (this.openFor === id) return;
    clearTimeout(this.openTimer); this.openFor = id;
    if (id) this.openTimer = window.setTimeout(() => this.onOpenFolder?.(id), 550);
  }

  private drop(p: Payload, t: Target) {
    if (p.kind === 'column') { if (t.type === 'col') columns.place(p.key, t.key, t.at); return; }
    if (p.kind === 'tracks') {
      if (t.type === 'home') { this.onHome?.(t.home, p.ids); return; }
      if (t.type === 'folder') {
        // A folder is also a playlist: the tracks go into it (ADR 0049).
        const l = lib.store?.lists.get(t.id), n = lib.addToList(t.id, p.ids);
        lib.notice = n ? 'Added ' + n + ' track' + (n === 1 ? '' : 's') + ' to ' + l?.name + '.' : 'Already in ' + l?.name + '.';
        return;
      }
      if (t.type === 'tag') {
        lib.tagTracks(p.ids, [t.name]);
        lib.notice = 'Tagged ' + (p.ids.length === 1 ? '1 track' : p.ids.length + ' tracks') + ' “' + t.name + '”.';
        return;
      }
      if (t.type === 'playlist') {
        const l = lib.store?.lists.get(t.id), n = lib.addToList(t.id, p.ids);
        lib.notice = n ? 'Added ' + n + ' track' + (n === 1 ? '' : 's') + ' to ' + l?.name + '.' : 'Already in ' + l?.name + '.';
      } else if (t.type === 'new') {
        const l = lib.createList('playlist', '', null, p.ids);
        if (l) view.editing = l.id;
      } else if (t.type === 'row') {
        const l = lib.store?.lists.get(t.listId);
        if (!l) return;
        if (p.ids.every(id => l.items.includes(id))) lib.moveInList(l.id, p.ids, t.index);
        else lib.addToList(l.id, p.ids, t.index);
      }
      return;
    }
    if (t.type === 'top') { lib.placeList(p.id, null, Infinity); return; }
    if (t.type !== 'list') return;
    const over = lib.store?.lists.get(t.id);
    if (!over) return;
    if (t.at === 'into') { lib.placeList(p.id, over.id, Infinity); this.onOpenFolder?.(over.id); return; }
    const sibs = lib.childLists(over.parentId).filter(x => x.id !== p.id);
    const i = sibs.findIndex(x => x.id === over.id);
    lib.placeList(p.id, over.parentId, t.at === 'before' ? i : i + 1);
  }
}

export const drag = new Drag();
