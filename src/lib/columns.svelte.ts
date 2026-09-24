/* The track table's columns: which are shown and in what order (a per-browser preference). */
import { readPref, writePref } from './prefs';
import type { SortKey } from './view.svelte';

export type ColKey = 'wave' | 'title' | 'artist' | 'album' | 'genre' | 'label' | 'year' | 'bpm' | 'key' | 'duration' | 'rating' | 'notes' | 'format' | 'quality' | 'added';
export interface ColDef { label: string; width: string; sort: SortKey | null; mono?: boolean; fixed?: boolean }

export const COLUMNS: Record<ColKey, ColDef> = {
  wave: { label: 'Overview', width: '150px', sort: null },
  title: { label: 'Title', width: 'minmax(160px, 3fr)', sort: 'title', fixed: true },
  artist: { label: 'Artist', width: 'minmax(110px, 2fr)', sort: 'artist' },
  album: { label: 'Album', width: 'minmax(90px, 1.4fr)', sort: 'album' },
  genre: { label: 'Genre', width: 'minmax(70px, 1fr)', sort: 'genre' },
  label: { label: 'Label', width: 'minmax(70px, 1fr)', sort: 'label' },
  year: { label: 'Year', width: '46px', sort: 'year', mono: true },
  bpm: { label: 'BPM', width: '52px', sort: 'bpm', mono: true },
  key: { label: 'Key', width: '44px', sort: 'key', mono: true },
  duration: { label: 'Time', width: '50px', sort: 'duration', mono: true },
  rating: { label: 'Rating', width: '70px', sort: 'rating' },
  notes: { label: 'Notes', width: '42px', sort: null },
  format: { label: 'Format', width: '96px', sort: 'format', mono: true },
  quality: { label: 'Quality', width: '150px', sort: 'quality' },
  added: { label: 'Added', width: '84px', sort: 'added', mono: true },
};
const DEFAULT_ORDER: ColKey[] = ['wave', 'title', 'artist', 'album', 'genre', 'label', 'year', 'bpm', 'key', 'duration', 'rating', 'notes', 'format', 'quality', 'added'];
const DEFAULT_HIDDEN: ColKey[] = ['label', 'year', 'added'];

function load(): { order: ColKey[]; hidden: ColKey[] } {
  try {
    const v = JSON.parse(readPref('columns', 'null')) as { order: ColKey[]; hidden: ColKey[] } | null;
    if (v && Array.isArray(v.order)) {
      const order = v.order.filter(k => k in COLUMNS);
      if (!order.includes('wave')) order.unshift('wave');   // the overview goes next to the play button
      for (const k of DEFAULT_ORDER) if (!order.includes(k)) order.push(k);   // columns added in later versions
      return { order, hidden: (v.hidden ?? []).filter(k => k in COLUMNS && !COLUMNS[k].fixed) };
    }
  } catch { /* fall back to the defaults */ }
  return { order: [...DEFAULT_ORDER], hidden: [...DEFAULT_HIDDEN] };
}

class Columns {
  order = $state<ColKey[]>([]);
  hidden = $state<ColKey[]>([]);
  constructor() { const v = load(); this.order = v.order; this.hidden = v.hidden; }
  get visible(): ColKey[] { return this.order.filter(k => !this.hidden.includes(k)); }
  private save() { writePref('columns', JSON.stringify({ order: this.order, hidden: this.hidden })); }
  toggle(k: ColKey) {
    if (COLUMNS[k].fixed) return;
    this.hidden = this.hidden.includes(k) ? this.hidden.filter(x => x !== k) : [...this.hidden, k];
    this.save();
  }
  /** Put `k` before or after `other`. */
  place(k: ColKey, other: ColKey, at: 'before' | 'after') {
    if (k === other) return;
    const o = this.order.filter(x => x !== k);
    o.splice(o.indexOf(other) + (at === 'after' ? 1 : 0), 0, k);
    this.order = o; this.save();
  }
  nudge(k: ColKey, dir: -1 | 1) {
    const o = [...this.order], i = o.indexOf(k), j = i + dir;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    this.order = o; this.save();
  }
  reset() { this.order = [...DEFAULT_ORDER]; this.hidden = [...DEFAULT_HIDDEN]; this.save(); }
}
export const columns = new Columns();
