/* Dragging inside MCO (tracks onto playlists, playlists around the tree) with pointer events.
   The browser's own drag-and-drop is kept only for files coming from the desktop: it paints its
   own drag image, cancels a drag when the page re-renders under it, and can't be styled. */
import { lib } from './library.svelte';
import { view } from './view.svelte';

export type Payload = { kind: 'tracks'; ids: string[]; label: string } | { kind: 'list'; id: string; label: string };
/** Where a drop would land. */
export type Target =
  | { type: 'playlist'; id: string }                        // add the tracks to a playlist
  | { type: 'new' }                                         // "+ Playlist": a new playlist with them
  | { type: 'row'; listId: string; index: number }          // reorder / insert inside the open playlist
  | { type: 'list'; id: string; at: 'before' | 'after' | 'into' }
  | { type: 'top' };                                        // the end of the top level

const THRESHOLD = 5;   // px of movement before a press becomes a drag

class Drag {
  payload = $state.raw<Payload | null>(null);
  active = $state(false);
  x = $state(0);
  y = $state(0);
  target = $state.raw<Target | null>(null);
  private sx = 0; private sy = 0;
  private openTimer = 0; private openFor: string | null = null;
  /** True just after a drag, so the click that ends it doesn't also select a row. */
  suppressClick = false;
  /** Hovering a drag over a closed folder asks the sidebar to open it. */
  onOpenFolder: ((id: string) => void) | null = null;

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

  end() {
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('keydown', this.key);
    document.body.classList.remove('mco-dragging');
    clearTimeout(this.openTimer); this.openFor = null;
    this.payload = null; this.active = false; this.target = null;
  }

  /** What's under the pointer. Drop targets mark themselves with data-drop="…". */
  private resolve(x: number, y: number): Target | null {
    const p = this.payload!;
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]');
    if (!el) { this.hoverFolder(null); return null; }
    const kind = el.dataset.drop, id = el.dataset.id ?? '';
    if (kind === 'new') return p.kind === 'tracks' ? { type: 'new' } : null;
    if (kind === 'top') return p.kind === 'list' ? { type: 'top' } : null;
    if (kind === 'row') {
      if (p.kind !== 'tracks' || !el.dataset.list) return null;
      const r = el.getBoundingClientRect(), i = Number(el.dataset.index);
      return { type: 'row', listId: el.dataset.list, index: y < r.top + r.height / 2 ? i : i + 1 };
    }
    if (kind !== 'list') return null;
    const l = lib.store?.lists.get(id);
    if (!l) return null;
    if (p.kind === 'tracks') {
      if (l.kind === 'folder') { this.hoverFolder(l.id); return null; }
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
    if (p.kind === 'tracks') {
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
