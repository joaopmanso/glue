/* One context menu for the whole page (ADR 0067): right-click (or the keyboard's menu key) on songs,
   playlists, tags, folders, filters, columns…, or a ⋯ button. Whoever opens it says what it offers;
   ui/ContextMenu.svelte shows it, with submenus, a find field for long ones, and the keyboard. */

export interface MenuAction {
  label: string;
  /** Chosen: the menu closes, then this runs. */
  run?: () => void;
  /** A submenu (built when it opens; it can take a moment). */
  sub?: () => MenuEntry[] | Promise<MenuEntry[]>;
  /** The submenu has a find field once it's long (more than 8); this is its placeholder. */
  find?: string;
  /** On the right: a shortcut or a count. */
  hint?: string;
  /** Shown while finding: where it is (a playlist's path). */
  detail?: string;
  /** Indent, for a tree (the playlists). */
  depth?: number;
  checked?: boolean;
  /** A colour dot (a playlist's, a tag's). */
  color?: string | null;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  /** id and data-* attributes (tests, and what other code looks for). */
  attrs?: Record<string, string>;
  /** Stays open after running (ticking several things); the menu is built again. */
  stay?: boolean;
}
export interface MenuSep { sep: true }
export interface MenuHead { head: string }
export interface MenuColors { colors: readonly string[]; value: string | null; pick: (c: string | null) => void }
export interface MenuStars { stars: number | null; dim?: boolean; pick: (v: number | null) => void }
export type MenuEntry = MenuAction | MenuSep | MenuHead | MenuColors | MenuStars;
export const isAction = (e: MenuEntry): e is MenuAction => 'label' in e;
export const SEP: MenuSep = { sep: true };

/** Drop separators at the ends and doubled ones (entries left out by conditions leave them behind). */
export function tidy(es: (MenuEntry | false | null | undefined)[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const e of es) {
    if (!e) continue;
    if ('sep' in e && (!out.length || 'sep' in out[out.length - 1])) continue;
    out.push(e);
  }
  while (out.length && 'sep' in out[out.length - 1]) out.pop();
  return out;
}

export interface MenuAt { x: number; y: number; below: DOMRect | null; build: () => MenuEntry[]; opener: Element | null; label: string; n: number }

class Menu {
  at = $state.raw<MenuAt | null>(null);
  /** Where the last menu opened: what an entry opens next goes there (the tag editor, a note). */
  point = { x: 0, y: 0 };
  private n = 0;

  show(x: number, y: number, build: () => MenuEntry[], opts: { below?: DOMRect | null; opener?: Element | null; label?: string } = {}) {
    this.point = { x, y };
    this.at = { x, y, below: opts.below ?? null, build, opener: opts.opener ?? null, label: opts.label ?? 'Menu', n: ++this.n };
  }
  /** A contextmenu event: the menu at the pointer (or under the element, from the keyboard). With Shift,
      the browser's own menu instead. Returns whether it opened. */
  context(e: MouseEvent, build: () => MenuEntry[], label = 'Menu', el: Element | null = null): boolean {
    if (e.shiftKey) return false;
    e.preventDefault(); e.stopPropagation();
    const at = el ?? (e.currentTarget instanceof Element ? e.currentTarget : null);
    if (e.button !== 2 && at) {
      // From the keyboard: under a row, or inside the top of something big (the table).
      const r = at.getBoundingClientRect();
      if (r.height > 80) this.show(r.left + 16, r.top + 16, build, { label }); else this.show(r.left + 16, r.bottom, build, { below: r, label });
    }
    else this.show(e.clientX, e.clientY, build, { label });
    return true;
  }
  /** From a ⋯ button: under it; clicking it again closes. */
  from(el: Element, build: () => MenuEntry[], label = 'Menu') {
    if (this.at?.opener === el) { this.close(); return; }
    const r = el.getBoundingClientRect();
    this.show(r.left, r.bottom + 2, build, { below: r, opener: el, label });
  }
  close() { this.at = null; }
}

export const menu = new Menu();
