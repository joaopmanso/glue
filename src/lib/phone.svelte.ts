/* The phone layout (the user's list, 2026-09-28; ADR 0078): on a narrow screen, or any touch device (a
   phone or a tablet, ADR 0079), the library is a touch app. Bottom tabs (Library, Browse, Playlists,
   Search, More); each tab a stack of screens; menus and questions as sheets; a mini player that opens
   the full player; songs picked several at a time; playlists edited by touch. The desktop layout is
   unchanged. */
import { view, type ViewSel } from './view.svelte';
import type { Facet } from '../core/library/browse';
import { menu, type MenuEntry } from './menu.svelte';

export type PhoneTab = 'library' | 'browse' | 'playlists' | 'search' | 'more';
/** A screen pushed on a tab: a list of songs (what view.sel shows), a field's values, a folder's lists. */
export type PhoneScreen = { kind: 'songs'; sel: ViewSel } | { kind: 'values'; by: Facet } | { kind: 'folder'; id: string };
/** A question in a sheet: a name to type (`input`), or yes / no. */
export type PhoneAsk = { title: string; text?: string; value?: string; placeholder?: string; ok: string; danger?: boolean; input: boolean; done: (v: string | null) => void };

/** Narrow enough for the touch layout (a phone held upright, a very narrow window), or a device with
    touch and no mouse at any width (a tablet, ADR 0079). */
export const PHONE_QUERY = '(max-width: 760px), (hover: none) and (pointer: coarse)';

class Phone {
  active = $state(false);
  tab = $state<PhoneTab>('library');
  private stacks = $state<Record<PhoneTab, PhoneScreen[]>>({ library: [], browse: [], playlists: [], search: [], more: [] });
  /** A menu shown as a sheet from the bottom (a song's, a playlist's). */
  sheet = $state.raw<{ title: string; build: () => MenuEntry[] } | null>(null);
  /** A question: a sheet instead of the browser's prompt and confirm. */
  ask = $state.raw<PhoneAsk | null>(null);
  /** The full-screen player. */
  full = $state(false);
  /** Picking songs in the list on screen, several at a time. */
  selecting = $state(false);
  picked = $state.raw<Set<string>>(new Set());
  /** The playlist whose songs are being reordered and removed. */
  editing = $state<string | null>(null);
  /** What was just done, with a way to undo it (shown for a few seconds). */
  undo = $state.raw<{ text: string; run: () => void } | null>(null);
  private undoTimer = 0;

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
  push(s: PhoneScreen) { this.calm(); this.stacks = { ...this.stacks, [this.tab]: [...this.stack, s] }; }
  back() {
    this.calm();
    const s = this.stack.slice(0, -1);
    this.stacks = { ...this.stacks, [this.tab]: s };
    // The list underneath shows its own songs again.
    const t = s[s.length - 1];
    if (t?.kind === 'songs') view.select(t.sel);
  }
  /** Another tab (tapping the one that's open goes back to its first screen). */
  go(tab: PhoneTab) {
    if (tab === this.tab) { this.calm(); this.stacks = { ...this.stacks, [tab]: [] }; return; }
    this.show(tab);
  }
  /** A tab as it was left (back from a song's page, the calendar). */
  show(tab: PhoneTab) {
    this.calm();
    this.tab = tab;
    const t = this.top;
    if (t?.kind === 'songs') view.select(t.sel);
    if (tab === 'search') view.select({ kind: 'all' });
    else if (view.search) view.search = '';
  }
  /** Leaving a screen ends picking and editing there. */
  private calm() { this.selecting = false; this.picked = new Set(); this.editing = null; }
  menu(title: string, build: () => MenuEntry[]) { this.sheet = { title, build }; }

  /** Pick songs: on, off, or all of `ids`. */
  pick(id: string) { const p = new Set(this.picked); if (!p.delete(id)) p.add(id); this.picked = p; }
  pickAll(ids: string[]) { this.picked = this.picked.size === ids.length ? new Set() : new Set(ids); }
  select(on: boolean) { this.selecting = on; this.picked = new Set(); if (on) this.editing = null; }

  /** A name, typed in a sheet (null: cancelled). */
  prompt(title: string, value = '', ok = 'Save', placeholder = ''): Promise<string | null> {
    return new Promise(done => { this.ask?.done(null); this.ask = { title, value, placeholder, ok, input: true, done: v => { this.ask = null; done(v); } }; });
  }
  /** Yes or no, in a sheet. */
  confirm(title: string, text: string, ok = 'Delete', danger = true): Promise<boolean> {
    return new Promise(done => { this.ask?.done(null); this.ask = { title, text, ok, danger, input: false, done: v => { this.ask = null; done(v != null); } }; });
  }
  /** Say what was done, with Undo for a few seconds. */
  undoable(text: string, run: () => void) {
    clearTimeout(this.undoTimer);
    this.undo = { text, run };
    this.undoTimer = window.setTimeout(() => (this.undo = null), 6000);
  }
}

export const phone = new Phone();
