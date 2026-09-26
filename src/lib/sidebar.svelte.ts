/* The library sidebar's sections: each can be collapsed, and one "maximized" (the others collapse and
   it gets the full height). Remembered per browser. */
import { readPref, writePref } from './prefs';

export type SideKey = 'library' | 'playlists' | 'tags' | 'music' | 'dj';

class Sidebar {
  collapsed = $state<Set<SideKey>>(new Set(JSON.parse(readPref('sideCollapsed', '[]') || '[]') as SideKey[]));
  focus = $state<SideKey | null>((readPref('sideFocus', '') || null) as SideKey | null);

  /** Its list shows (not collapsed; while one is maximized, only that one). */
  open(k: SideKey) { return this.focus ? this.focus === k : !this.collapsed.has(k); }
  toggle(k: SideKey) {
    if (this.focus) { this.focus = this.focus === k ? null : k; this.save(); return; }
    const c = new Set(this.collapsed);
    if (c.has(k)) c.delete(k); else c.add(k);
    this.collapsed = c; this.save();
  }
  maximize(k: SideKey) { this.focus = this.focus === k ? null : k; this.save(); }
  private save() { writePref('sideCollapsed', JSON.stringify([...this.collapsed])); writePref('sideFocus', this.focus ?? ''); }
}

export const sidebar = new Sidebar();
