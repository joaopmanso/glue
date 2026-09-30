/* The library sidebar's sections: each can be collapsed, and one "maximized" (the others collapse and
   it gets the full height). Library's entries (Recently added, Needs attention…) can be hidden
   (right-click, ADR 0067). Remembered per browser. */
import { readPref, writePref } from './prefs';

export type SideKey = 'library' | 'playlists' | 'tags' | 'music' | 'dj';
/** Library's entries that can be hidden (All tracks always shows). */
export type LibView = 'recent' | 'attention' | 'pending' | 'failed' | 'unlinked' | 'dupes';

const readSet = <T>(key: string) => { try { return new Set(JSON.parse(readPref(key, '[]') || '[]') as T[]); } catch { return new Set<T>(); } };

class Sidebar {
  collapsed = $state<Set<SideKey>>(readSet<SideKey>('sideCollapsed'));
  focus = $state<SideKey | null>((readPref('sideFocus', '') || null) as SideKey | null);
  hidden = $state<Set<LibView>>(readSet<LibView>('sideHidden'));

  /** Its list shows (not collapsed; while one is maximized, only that one). */
  open(k: SideKey) { return this.focus ? this.focus === k : !this.collapsed.has(k); }
  toggle(k: SideKey) {
    if (this.focus) { this.focus = this.focus === k ? null : k; this.save(); return; }
    const c = new Set(this.collapsed);
    if (c.has(k)) c.delete(k); else c.add(k);
    this.collapsed = c; this.save();
  }
  maximize(k: SideKey) { this.focus = this.focus === k ? null : k; this.save(); }
  hide(v: LibView) { this.hidden = new Set([...this.hidden, v]); this.save(); }
  /** Show one again, or all of them. */
  show(v?: LibView) { const h = new Set(this.hidden); if (v) h.delete(v); else h.clear(); this.hidden = h; this.save(); }
  private save() {
    writePref('sideCollapsed', JSON.stringify([...this.collapsed])); writePref('sideFocus', this.focus ?? '');
    writePref('sideHidden', JSON.stringify([...this.hidden]));
  }
}

export const sidebar = new Sidebar();
