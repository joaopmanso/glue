/* The track table's columns: which are shown and in what order (a per-browser preference). */
import { readPref, writePref } from './prefs';
import type { FilterGroup, SortKey } from './view.svelte';

export type ColKey = 'wave' | 'cover' | 'title' | 'artist' | 'album' | 'genre' | 'tags' | 'device' | 'label' | 'year' | 'bpm' | 'key' | 'duration' | 'rating' | 'notes' | 'format' | 'quality' | 'added';
/** filter: the value filter its header opens (▾). */
export interface ColDef { label: string; width: string; sort: SortKey | null; mono?: boolean; fixed?: boolean; filter?: FilterGroup }

export const COLUMNS: Record<ColKey, ColDef> = {
  wave: { label: 'Overview', width: '150px', sort: null },
  cover: { label: 'Cover', width: '58px', sort: null },
  title: { label: 'Title', width: 'minmax(160px, 3fr)', sort: 'title', fixed: true },
  artist: { label: 'Artist', width: 'minmax(110px, 2fr)', sort: 'artist' },
  album: { label: 'Album', width: 'minmax(90px, 1.4fr)', sort: 'album' },
  genre: { label: 'Genre', width: 'minmax(70px, 1fr)', sort: 'genre', filter: 'genre' },
  tags: { label: 'Tags', width: 'minmax(90px, 1.3fr)', sort: null, filter: 'tag' },
  // Only shown while a merged collection has more than one device's songs (ADR 0042).
  device: { label: 'Device', width: 'minmax(96px, 1fr)', sort: 'device', filter: 'device' },
  label: { label: 'Label', width: 'minmax(70px, 1fr)', sort: 'label' },
  year: { label: 'Year', width: '46px', sort: 'year', mono: true },
  bpm: { label: 'BPM', width: '52px', sort: 'bpm', mono: true },
  key: { label: 'Key', width: '44px', sort: 'key', mono: true },
  duration: { label: 'Time', width: '50px', sort: 'duration', mono: true },
  rating: { label: 'Rating', width: '70px', sort: 'rating' },
  notes: { label: 'Notes', width: '42px', sort: null },
  format: { label: 'Format', width: '96px', sort: 'format', mono: true, filter: 'format' },
  quality: { label: 'Quality', width: '150px', sort: 'quality', filter: 'quality' },
  added: { label: 'Added', width: '84px', sort: 'added', mono: true },
};
const DEFAULT_ORDER: ColKey[] = ['wave', 'cover', 'title', 'artist', 'album', 'genre', 'tags', 'device', 'label', 'year', 'bpm', 'key', 'duration', 'rating', 'notes', 'format', 'quality', 'added'];
const DEFAULT_HIDDEN: ColKey[] = ['label', 'year', 'added'];

function load(): { order: ColKey[]; hidden: ColKey[]; widths: Partial<Record<ColKey, number>> } {
  try {
    const v = JSON.parse(readPref('columns', 'null')) as { order: ColKey[]; hidden: ColKey[]; widths?: Partial<Record<ColKey, number>> } | null;
    if (v && Array.isArray(v.order)) {
      const order = v.order.filter(k => k in COLUMNS);
      if (!order.includes('wave')) order.unshift('wave');   // the overview goes next to the play button
      // Columns added in later versions go after the column they follow by default.
      DEFAULT_ORDER.forEach((k, i) => { if (!order.includes(k)) { const j = i ? order.indexOf(DEFAULT_ORDER[i - 1]) : -1; order.splice(j + 1, 0, k); } });
      const widths = Object.fromEntries(Object.entries(v.widths ?? {}).filter(([k, w]) => k in COLUMNS && typeof w === 'number' && w >= 30)) as Partial<Record<ColKey, number>>;
      return { order, hidden: (v.hidden ?? []).filter(k => k in COLUMNS && !COLUMNS[k].fixed), widths };
    }
  } catch { /* fall back to the defaults */ }
  return { order: [...DEFAULT_ORDER], hidden: [...DEFAULT_HIDDEN], widths: {} };
}

class Columns {
  order = $state<ColKey[]>([]);
  hidden = $state<ColKey[]>([]);
  /** Widths the user set by dragging a header's edge or double-clicking it (px); the others as defined. */
  widths = $state<Partial<Record<ColKey, number>>>({});
  constructor() { const v = load(); this.order = v.order; this.hidden = v.hidden; this.widths = v.widths; }
  width(k: ColKey) { const w = this.widths[k]; return w ? w + 'px' : COLUMNS[k].width; }
  /** `save`: false while dragging (saved when it ends). */
  setWidth(k: ColKey, w: number, save = true) { this.widths = { ...this.widths, [k]: Math.max(40, Math.min(900, Math.round(w))) }; if (save) this.save(); }
  get visible(): ColKey[] { return this.order.filter(k => !this.hidden.includes(k)); }
  clearWidth(k: ColKey) { const w = { ...this.widths }; delete w[k]; this.widths = w; this.save(); }
  private save() { writePref('columns', JSON.stringify({ order: this.order, hidden: this.hidden, widths: this.widths })); }
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
  reset() { this.order = [...DEFAULT_ORDER]; this.hidden = [...DEFAULT_HIDDEN]; this.widths = {}; this.save(); }
}
export const columns = new Columns();

/** What the Overview column draws (the user's list, 2026-09-27): the mini spectrogram, or a mini
    waveform in one of the Prepare page's colour schemes. Right-click its header to switch. */
export type Overview = 'spectrogram' | 'waveform';
export type OverviewScheme = 'rgb' | 'blue' | 'bands' | 'mono';
class OverviewPrefs {
  kind = $state<Overview>(readPref('overview', 'spectrogram') === 'waveform' ? 'waveform' : 'spectrogram');
  scheme = $state<OverviewScheme>((['rgb', 'blue', 'bands', 'mono'] as const).find(x => x === readPref('overviewScheme', 'rgb')) ?? 'rgb');
  set(kind: Overview) { this.kind = kind; writePref('overview', kind); }
  setScheme(s: OverviewScheme) { this.scheme = s; writePref('overviewScheme', s); }
}
export const overview = new OverviewPrefs();
