/* The phone layout (the user's list, 2026-09-28; ADR 0078): on a narrow screen the library is a phone
   app. Bottom tabs (Library, Browse, Playlists, Search, More); each tab a stack of screens; menus as
   bottom sheets; a mini player that opens the full player. The desktop layout is unchanged. */
import { view, type ViewSel } from './view.svelte';
import type { Facet } from '../core/library/browse';
import { menu, type MenuEntry } from './menu.svelte';

export type PhoneTab = 'library' | 'browse' | 'playlists' | 'search' | 'more';
/** A screen pushed on a tab: a list of songs (what view.sel shows), a field's values, a folder's lists. */
export type PhoneScreen = { kind: 'songs'; sel: ViewSel } | { kind: 'values'; by: Facet } | { kind: 'folder'; id: string };

/** Narrow enough for the phone layout (a phone held upright, or a very narrow window). */
export const PHONE_QUERY = '(max-width: 760px)';

class Phone {
  active = $state(false);
  tab = $state<PhoneTab>('library');
  private stacks = $state<Record<PhoneTab, PhoneScreen[]>>({ library: [], browse: [], playlists: [], search: [], more: [] });
  /** A menu shown as a sheet from the bottom (a song's, a playlist's). */
  sheet = $state.raw<{ title: string; build: () => MenuEntry[] } | null>(null);
  /** The full-screen player. */
  full = $state(false);

  constructor() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(PHONE_QUERY);
    const set = (on: boolean) => { this.active = on; menu.sheet = on ? (title, build) => this.menu(title, build) : null; if (on) menu.close(); else this.sheet = null; };
    set(mq.matches);
    mq.addEventListener('change', e => set(e.matches));
  }

  get stack(): PhoneScreen[] { return this.stacks[this.tab]; }
  get top(): PhoneScreen | null { const s = this.stack; return s.length ? s[s.length - 1] : null; }

  /** Open a list of songs on the current tab. */
  songs(sel: ViewSel) { view.select(sel); this.push({ kind: 'songs', sel }); }
  push(s: PhoneScreen) { this.stacks = { ...this.stacks, [this.tab]: [...this.stack, s] }; }
  back() {
    const s = this.stack.slice(0, -1);
    this.stacks = { ...this.stacks, [this.tab]: s };
    // The list underneath shows its own songs again.
    const t = s[s.length - 1];
    if (t?.kind === 'songs') view.select(t.sel);
  }
  /** Another tab (tapping the one that's open goes back to its first screen). */
  go(tab: PhoneTab) {
    if (tab === this.tab) { this.stacks = { ...this.stacks, [tab]: [] }; return; }
    this.show(tab);
  }
  /** A tab as it was left (back from a song's page, the calendar). */
  show(tab: PhoneTab) {
    this.tab = tab;
    const t = this.top;
    if (t?.kind === 'songs') view.select(t.sel);
    if (tab === 'search') view.select({ kind: 'all' });
    else if (view.search) view.search = '';
  }
  menu(title: string, build: () => MenuEntry[]) { this.sheet = { title, build }; }
}

export const phone = new Phone();
