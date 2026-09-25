/* What the library view shows: the selected sidebar entry, search, sort and row selection. */
import { lib } from './library.svelte';
import { LOOSE } from '../store/merge';
import { dupes } from './dupes.svelte';
import type { AnalysisSummary, Track } from '../store/types';
import { keyLabel, type KeyNotation } from '../core/audio/keys';
import { hasTag, tagsOf } from '../core/library/tagging';

export type ViewSel = { kind: 'all' | 'recent' | 'pending' | 'attention' | 'unlinked' | 'dupes' } | { kind: 'list'; id: string } | { kind: 'source'; id: string } | { kind: 'root'; id: string } | { kind: 'tag'; name: string };
/** The table's value filters; each can also be opened from its column header. */
export type FilterGroup = 'quality' | 'format' | 'tag' | 'genre' | 'device';
export const FILTER_GROUPS: { g: FilterGroup; title: string }[] = [{ g: 'quality', title: 'Quality' }, { g: 'format', title: 'Format' }, { g: 'tag', title: 'Tags' }, { g: 'genre', title: 'Genre' }, { g: 'device', title: 'Device' }];
const NO_FILTERS = (): Record<FilterGroup, string[]> => ({ quality: [], format: [], tag: [], genre: [], device: [] });
export type SortKey = 'title' | 'artist' | 'album' | 'genre' | 'bpm' | 'key' | 'duration' | 'format' | 'quality' | 'rating' | 'added' | 'label' | 'year' | 'device' | 'order';

/** dj: what an imported DJ library said, shown when GLUE's own analysis has no value. */
export interface Row { t: Track; a: AnalysisSummary | null; n: number; dj: { bpm: number | null; key: string | null; rating: number | null } | null }

const QUALITY_RANK: Record<string, number> = { ok: 0, info: 1, warn: 2, bad: 3 };

class View {
  sel = $state<ViewSel>({ kind: 'all' });
  search = $state('');
  sort = $state<{ key: SortKey; dir: 1 | -1 }>({ key: 'order', dir: 1 });
  selected = $state.raw<Set<string>>(new Set());
  /** The playlist whose name is being edited in the sidebar. */
  editing = $state<string | null>(null);
  anchor: string | null = null;

  select(s: ViewSel) { this.sel = s; this.selected = new Set(); this.anchor = null; if (s.kind !== 'list' && this.sort.key === 'order') this.sort = { key: 'added', dir: -1 }; else if (s.kind === 'list') this.sort = { key: 'order', dir: 1 }; }
  /** "#" (playlist order) always sorts ascending: it's the order you arrange by dragging. */
  sortBy(k: SortKey) { this.sort = k === 'order' ? { key: k, dir: 1 } : this.sort.key === k ? { key: k, dir: this.sort.dir === 1 ? -1 : 1 } : { key: k, dir: k === 'added' ? -1 : 1 }; }
  /** The track whose note editor is open, and where. */
  noteFor = $state<{ id: string; x: number; y: number } | null>(null);
  /** The tag editor: for tracks or for a playlist, placed under (x, y). */
  tagFor = $state<{ ids: string[]; listId?: undefined; x: number; y: number } | { listId: string; ids?: undefined; x: number; y: number } | null>(null);
  /** Open the tag editor under an element (a second click on the same thing closes it). */
  editTags(el: Element, what: { ids: string[] } | { listId: string }) {
    const r = el.getBoundingClientRect(), cur = this.tagFor;
    const same = cur && ('listId' in what ? cur.listId === what.listId : cur.ids?.join() === what.ids.join());
    this.tagFor = same ? null : 'listId' in what ? { listId: what.listId, x: r.left, y: r.bottom } : { ids: what.ids, x: r.left, y: r.bottom };
  }

  /** The rows for the current selection (depends on lib.version). */
  /** Quality and format filters: any of the chosen within a group, all groups together. */
  filters = $state<Record<FilterGroup, string[]>>(NO_FILTERS());
  get filtering() { return FILTER_GROUPS.some(({ g }) => this.filters[g].length > 0); }
  get filterValues() { return FILTER_GROUPS.flatMap(({ g }) => this.filters[g]); }
  toggleFilter(group: FilterGroup, value: string) {
    const cur = this.filters[group];
    this.filters = { ...this.filters, [group]: cur.includes(value) ? cur.filter(x => x !== value) : [...cur, value] };
  }
  setFilter(group: FilterGroup, values: string[]) { this.filters = { ...this.filters, [group]: values }; }
  clearFilters(group?: FilterGroup) { this.filters = group ? { ...this.filters, [group]: [] } : NO_FILTERS(); }

  /** `unfiltered`: without the value filters; `except`: without one group's (to count its options). */
  rows(notation: KeyNotation, opts: { unfiltered?: boolean; except?: FilterGroup } = {}): Row[] {
    void lib.version;
    const s = lib.store;
    if (!s) return [];
    let tracks: Track[];
    const sel = this.sel;
    if (sel.kind === 'list') {
      const l = s.lists.get(sel.id);
      if (!l) return [];
      if (l.kind === 'folder') {
        // A folder is also a playlist (as in Engine DJ, ADR 0049): its own songs first, then its playlists'.
        const ids = new Set<string>(l.items), walk = (pid: string) => { for (const c of s.lists.values()) if (c.parentId === pid) { c.items.forEach(i => ids.add(i)); walk(c.id); } };
        walk(l.id);
        tracks = [...ids].map(i => s.tracks.get(i)).filter((t): t is Track => !!t);
      } else tracks = l.items.map(i => s.tracks.get(i)).filter((t): t is Track => !!t);
    } else if (sel.kind === 'source') tracks = [...s.tracks.values()].filter(t => t.sources.includes(sel.id));
    else if (sel.kind === 'tag') tracks = [...s.tracks.values()].filter(t => hasTag(tagsOf(t), sel.name));
    else if (sel.kind === 'root') tracks = [...s.tracks.values()].filter(t => sel.id === LOOSE ? !!t.fileKey : t.rootId === sel.id);
    else {
      tracks = [...s.tracks.values()];
      if (sel.kind === 'dupes') tracks = dupes.groups.flatMap(g => g.ids).map(id => s.tracks.get(id)).filter((t): t is Track => !!t);
      else if (sel.kind === 'pending') tracks = tracks.filter(t => lib.needsAnalysis(t));
      else if (sel.kind === 'unlinked') tracks = tracks.filter(t => t.status !== 'linked');
      else if (sel.kind === 'attention') tracks = tracks.filter(t => { const a = s.analysis.get(t.id); return a && (a.grade === 'bad' || a.grade === 'warn'); });
      else if (sel.kind === 'recent') { const cut = Date.now() - 30 * 864e5; tracks = tracks.filter(t => Date.parse(t.addedAt) >= cut); }
    }
    const dj = new Map<string, { bpm: number | null; key: string | null; rating: number | null }>();
    for (const src of s.sources.values()) for (const st of src.tracks) {
      const cur = dj.get(st.trackId);
      if (!cur) dj.set(st.trackId, { bpm: st.bpm, key: st.key, rating: st.rating || null });
      else { cur.bpm ??= st.bpm; cur.key ??= st.key; cur.rating ??= st.rating || null; }
    }
    let rows: Row[] = tracks.map((t, n) => ({ t, a: s.analysis.get(t.id) ?? null, n, dj: dj.get(t.id) ?? null }));
    if (!opts.unfiltered && this.filtering) {
      const active = FILTER_GROUPS.filter(({ g }) => g !== opts.except && this.filters[g].length);
      rows = rows.filter(r => active.every(({ g }) => { const want = this.filters[g]; return valuesOf(g, r).some(v => want.includes(v)); }));
    }
    const q = this.search.trim().toLowerCase();
    if (q) {
      const words = q.split(/\s+/);
      rows = rows.filter(({ t }) => { const hay = (t.title + ' ' + t.artist + ' ' + t.album + ' ' + t.genre + ' ' + t.label + ' ' + t.fileName + ' ' + tagsOf(t).join(' ')).toLowerCase(); return words.every(w => hay.includes(w)); });
    }
    const { key, dir } = this.sort;
    const val = (r: Row): string | number => {
      switch (key) {
        case 'order': return r.n;
        case 'bpm': return r.a?.bpm ?? r.dj?.bpm ?? Infinity;
        case 'key': return r.a?.key ? keyLabel(r.a.key, notation === 'musical' ? 'camelot' : notation).padStart(3, '0') : r.dj?.key ? '~' + r.dj.key : '~~';
        case 'duration': return r.t.duration ?? Infinity;
        case 'format': return r.t.format ? (r.t.format.lossless ? 0 : 1) * 1e7 - r.t.format.sampleRate * 10 - r.t.format.bits : Infinity;
        case 'quality': return r.a ? QUALITY_RANK[r.a.grade] * 100 + r.a.label.length : 999;
        case 'rating': return -(r.t.rating ?? r.dj?.rating ?? 0);
        case 'added': return r.t.addedAt;
        case 'device': return devicesOf(r.t).join(', ').toLowerCase();
        default: return (r.t[key] || '￿').toLowerCase();
      }
    };
    return rows.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : a.n - b.n) * dir; });
  }

  click(id: string, e: MouseEvent, order: string[]) {
    const next = new Set(e.ctrlKey || e.metaKey ? this.selected : []);
    if (e.shiftKey && this.anchor) {
      const a = order.indexOf(this.anchor), b = order.indexOf(id);
      if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(order[i]);
    } else if ((e.ctrlKey || e.metaKey) && next.has(id)) next.delete(id);
    else { next.add(id); this.anchor = id; }
    this.selected = next;
  }
}
export const view = new View();

export const NO_TAGS = 'No tags', NO_GENRE = 'No genre';
/** The values a row has for a filter group (tracks can have several tags). */
export function valuesOf(g: FilterGroup, r: Row): string[] {
  if (g === 'quality') return [qualityOf(r)];
  if (g === 'format') return [formatOf(r.t)];
  if (g === 'genre') return [r.t.genre.trim() || NO_GENRE];
  if (g === 'device') return devicesOf(r.t);
  const tags = tagsOf(r.t);
  return tags.length ? tags : [NO_TAGS];
}
/** The devices that have a track (a merged collection shows several; ADR 0042). */
export function devicesOf(t: Track): string[] {
  return t.onDevices?.length ? t.onDevices : [lib.devicesShown[0] ?? 'This computer'];
}
/** More than one device's songs on screen: the Device column and filter mean something. */
export function manyDevices(): boolean {
  // TO BE SORTED (lib/incoming) always says which computer a song waits on.
  return lib.devicesShown.length > 1 || lib.cloud?.kind === 'group' || (view.sel.kind === 'list' && view.sel.id === 'tobesorted');
}
/** What the Quality filter groups by: GLUE's verdict, or why there's none. */
export function qualityOf(r: Row): string {
  if (r.t.status === 'unlinked') return 'No file';
  if (r.t.status === 'missing') return 'Missing';
  if (!r.a) return 'Not analysed';
  return r.a.error ? 'Couldn’t analyse' : r.a.label;
}
/** What the Format filter groups by: the codec, e.g. MP3, FLAC, WAV, AIFF, AAC. */
export function formatOf(t: Track): string {
  const f = t.format;
  if (!f || f.codec === 'Unknown') return (t.fileName.split('.').pop() ?? '?').toUpperCase();
  if (/^PCM/i.test(f.codec)) return /AIFF/i.test(f.container) ? 'AIFF' : /WAV|RIFF|W64/i.test(f.container) ? 'WAV' : f.container.replace(/ .*/, '');
  return f.codec.replace(/-LC$|\s.*$/i, '').replace(/^MPEG.*Layer ?3$/i, 'MP3');
}
