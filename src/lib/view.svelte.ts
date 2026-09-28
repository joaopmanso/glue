/* What the library view shows: the selected sidebar entry, search, sort and row selection. */
import { asShown } from '../core/library/summary';
import { lib } from './library.svelte';
import type { InfoField } from '../core/library/tags';
import { time } from '../core/perf';
import { bpmShown } from './bpm';
import { LOOSE } from '../store/merge';
import { dupes } from './dupes.svelte';
import type { AnalysisSummary, Source, Track } from '../store/types';
import { keyLabel, type KeyNotation } from '../core/audio/keys';
import { hasTag, tagsOf } from '../core/library/tagging';
import { readPref, writePref } from './prefs';

export type ViewSel = { kind: 'all' | 'recent' | 'pending' | 'attention' | 'unlinked' | 'dupes' } | { kind: 'list'; id: string } | { kind: 'source'; id: string } | { kind: 'dj'; sourceId: string; id: string } | { kind: 'root'; id: string } | { kind: 'tag'; name: string };
/** The table's value filters; each can also be opened from its column header. */
export type FilterGroup = 'quality' | 'format' | 'tag' | 'genre' | 'device';
export const FILTER_GROUPS: { g: FilterGroup; title: string }[] = [{ g: 'quality', title: 'Quality' }, { g: 'format', title: 'Format' }, { g: 'tag', title: 'Tags' }, { g: 'genre', title: 'Genre' }, { g: 'device', title: 'Device' }];
const NO_FILTERS = (): Record<FilterGroup, string[]> => ({ quality: [], format: [], tag: [], genre: [], device: [] });
export type SortKey = 'title' | 'artist' | 'album' | 'genre' | 'bpm' | 'key' | 'duration' | 'format' | 'quality' | 'rating' | 'added' | 'label' | 'year' | 'device' | 'order';

/** dj: what an imported DJ library said, shown when GLUE's own analysis has no value. */
export interface Row { t: Track; a: AnalysisSummary | null; n: number; dj: { bpm: number | null; key: string | null; rating: number | null } | null }

const QUALITY_RANK: Record<string, number> = { ok: 0, info: 1, warn: 2, bad: 3 };

/** A DJ library's list as GLUE tracks, in order, each once. */
export function djTracks(src: Source | undefined, id: string): string[] {
  if (!src?.tree) return [];
  const trackOf = new Map(src.tracks.map(st => [st.externalId, st.trackId])), kids = new Map<string, string[]>();
  const byExt = new Map(src.tree.map(l => [l.externalId, l]));
  for (const l of src.tree) if (l.parent) (kids.get(l.parent) ?? kids.set(l.parent, []).get(l.parent)!).push(l.externalId);
  const out = new Set<string>();
  const walk = (ext: string) => { for (const x of byExt.get(ext)?.items ?? []) { const t = trackOf.get(x); if (t) out.add(t); } for (const k of kids.get(ext) ?? []) walk(k); };
  walk(id);
  return [...out];
}

class View {
  sel = $state<ViewSel>({ kind: 'all' });
  search = $state('');
  sort = $state<{ key: SortKey; dir: 1 | -1 }>({ key: 'order', dir: 1 });
  selected = $state.raw<Set<string>>(new Set());
  /** The playlist whose name is being edited in the sidebar. */
  editing = $state<string | null>(null);
  /** Duplicates opened from a track's "2×": that track, to scroll to and highlight. */
  focusDupe = $state<string | null>(null);
  /** Scroll the table to this track (the mini player's "show in list"). */
  reveal = $state<string | null>(null);
  anchor: string | null = null;

  select(s: ViewSel) { this.sel = s; this.selected = new Set(); this.anchor = null; const ordered = s.kind === 'list' || s.kind === 'dj'; if (!ordered && this.sort.key === 'order') this.sort = { key: 'added', dir: -1 }; else if (ordered) this.sort = { key: 'order', dir: 1 }; }
  /** "#" (playlist order) always sorts ascending: it's the order you arrange by dragging. */
  sortBy(k: SortKey) { this.sort = k === 'order' ? { key: k, dir: 1 } : this.sort.key === k ? { key: k, dir: this.sort.dir === 1 ? -1 : 1 } : { key: k, dir: k === 'added' ? -1 : 1 }; }
  /** The track whose note editor is open, and where. */
  noteFor = $state<{ id: string; x: number; y: number } | null>(null);
  /** The Stats dialog: a sidebar entry's songs, or these songs. */
  statsFor = $state<{ title: string; sel?: ViewSel; ids?: string[] } | null>(null);
  /** The song info editor (ADR 0071): for these tracks, starting in a field. */
  infoFor = $state<{ ids: string[]; field?: InfoField } | null>(null);
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
  /** Groups taken out of the Filter menu (right-click › Hide; ADR 0067), remembered in this browser.
      Hiding one stops filtering by it: a filter that can't be seen mustn't hide songs. */
  hiddenFilters = $state<FilterGroup[]>(((): FilterGroup[] => { try { const v = JSON.parse(readPref('hiddenFilters', '[]')); return Array.isArray(v) ? v.filter(g => FILTER_GROUPS.some(x => x.g === g)) : []; } catch { return []; } })());
  hideFilter(g: FilterGroup) { if (!this.hiddenFilters.includes(g)) this.hiddenFilters = [...this.hiddenFilters, g]; this.clearFilters(g); writePref('hiddenFilters', JSON.stringify(this.hiddenFilters)); }
  showFilter(g?: FilterGroup) { this.hiddenFilters = g ? this.hiddenFilters.filter(x => x !== g) : []; writePref('hiddenFilters', JSON.stringify(this.hiddenFilters)); }

  /** `unfiltered`: without the value filters; `except`: without one group's (to count its options). */
  rows(notation: KeyNotation, opts: { unfiltered?: boolean; except?: FilterGroup } = {}): Row[] { return time('rows', () => this.rowsNow(notation, opts)); }
  private rowsNow(notation: KeyNotation, opts: { unfiltered?: boolean; except?: FilterGroup }): Row[] {
    void lib.version;
    const s = lib.store;
    if (!s) return [];
    const tracks = tracksFor(this.sel);
    const dj = lib.djIndex();
    let rows: Row[] = tracks.map((t, n) => ({ t, a: asShown(t, s.analysis.get(t.id)), n, dj: dj.get(t.id) ?? null }));
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
        case 'bpm': return bpmShown(r.t, r.a, r.dj?.bpm) ?? Infinity;
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

export const APP_NAMES: Record<string, string> = { rekordbox: 'rekordbox', engine: 'Engine DJ', serato: 'Serato', traktor: 'Traktor', apple: 'Apple Music', m3u: 'M3U' };
/** What a view is called (its heading; the player says it's playing from there). */
/** The songs a sidebar entry shows, in its order (before filters and search). */
export function tracksFor(sel: ViewSel): Track[] {
  const s = lib.store;
  if (!s) return [];
  const byIds = (ids: Iterable<string>) => [...ids].map(i => s.tracks.get(i)).filter((t): t is Track => !!t);
  if (sel.kind === 'list') {
    const l = s.lists.get(sel.id);
    if (!l) return [];
    if (l.kind !== 'folder') return byIds(l.items);
    // A folder is also a playlist (as in Engine DJ, ADR 0049): its own songs first, then its playlists'.
    const ids = new Set<string>(l.items), walk = (pid: string) => { for (const c of s.lists.values()) if (c.parentId === pid) { c.items.forEach(i => ids.add(i)); walk(c.id); } };
    walk(l.id);
    return byIds(ids);
  }
  if (sel.kind === 'source') return [...s.tracks.values()].filter(t => t.sources.includes(sel.id));
  // A DJ library's playlist, browsed where it is (ADR 0063): its songs in its order; a folder's own, then
  // those of the lists inside it.
  if (sel.kind === 'dj') return byIds(djTracks(s.sources.get(sel.sourceId), sel.id));
  if (sel.kind === 'tag') return [...s.tracks.values()].filter(t => hasTag(tagsOf(t), sel.name));
  if (sel.kind === 'root') return [...s.tracks.values()].filter(t => sel.id === LOOSE ? !!t.fileKey : t.rootId === sel.id);
  const all = [...s.tracks.values()];
  if (sel.kind === 'dupes') return byIds(dupes.groups.flatMap(g => g.ids));
  if (sel.kind === 'pending') return all.filter(t => lib.needsAnalysis(t));
  if (sel.kind === 'unlinked') return all.filter(t => t.status !== 'linked');
  if (sel.kind === 'attention') return all.filter(t => { const a = asShown(t, s.analysis.get(t.id)); return a && (a.grade === 'bad' || a.grade === 'warn'); });
  if (sel.kind === 'recent') { const cut = Date.now() - 30 * 864e5; return all.filter(t => Date.parse(t.addedAt) >= cut); }
  return all;
}

export function viewTitle(s: ViewSel): string {
  const st = lib.store;
  switch (s.kind) {
    case 'all': return 'All tracks';
    case 'recent': return 'Recently added';
    case 'pending': return 'Not analysed yet';
    case 'attention': return 'Needs attention';
    case 'unlinked': return 'No file linked';
    case 'dupes': return 'Duplicates';
    case 'list': { const l = st?.lists.get(s.id); return l ? lib.listPath(l) : 'Playlist'; }
    case 'source': { const x = st?.sources.get(s.id); return x ? (APP_NAMES[x.app] ?? x.app) + ' import' : 'Import'; }
    case 'dj': { const x = st?.sources.get(s.sourceId), l = x?.tree?.find(y => y.externalId === s.id); return (l?.name ?? 'Playlist') + ' · ' + (x ? APP_NAMES[x.app] ?? x.app : ''); }
    case 'tag': return 'Tagged “' + s.name + '”';
    case 'root': return s.id === LOOSE ? 'Added songs' : lib.rootState(s.id)?.root.name ?? 'Folder';
  }
}

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
