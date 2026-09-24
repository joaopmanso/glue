/* What the library view shows: the selected sidebar entry, search, sort and row selection. */
import { lib } from './library.svelte';
import type { AnalysisSummary, Track } from '../store/types';
import { keyLabel, type KeyNotation } from '../core/audio/keys';

export type ViewSel = { kind: 'all' | 'recent' | 'pending' | 'attention' | 'unlinked' } | { kind: 'list'; id: string } | { kind: 'source'; id: string } | { kind: 'root'; id: string };
export type SortKey = 'title' | 'artist' | 'album' | 'genre' | 'bpm' | 'key' | 'duration' | 'format' | 'quality' | 'added' | 'order';

/** dj: what an imported DJ library said, shown when MCO's own analysis has no value. */
export interface Row { t: Track; a: AnalysisSummary | null; n: number; dj: { bpm: number | null; key: string | null } | null }

const QUALITY_RANK: Record<string, number> = { ok: 0, info: 1, warn: 2, bad: 3 };

class View {
  sel = $state<ViewSel>({ kind: 'all' });
  search = $state('');
  sort = $state<{ key: SortKey; dir: 1 | -1 }>({ key: 'order', dir: 1 });
  selected = $state.raw<Set<string>>(new Set());
  anchor: string | null = null;

  select(s: ViewSel) { this.sel = s; this.selected = new Set(); this.anchor = null; if (s.kind !== 'list' && this.sort.key === 'order') this.sort = { key: 'added', dir: -1 }; else if (s.kind === 'list') this.sort = { key: 'order', dir: 1 }; }
  sortBy(k: SortKey) { this.sort = this.sort.key === k ? { key: k, dir: this.sort.dir === 1 ? -1 : 1 } : { key: k, dir: k === 'added' ? -1 : 1 }; }

  /** The rows for the current selection (depends on lib.version). */
  rows(notation: KeyNotation): Row[] {
    void lib.version;
    const s = lib.store;
    if (!s) return [];
    let tracks: Track[];
    const sel = this.sel;
    if (sel.kind === 'list') {
      const l = s.lists.get(sel.id);
      if (!l) return [];
      if (l.kind === 'folder') {
        const ids = new Set<string>(), walk = (pid: string) => { for (const c of s.lists.values()) if (c.parentId === pid) { c.items.forEach(i => ids.add(i)); walk(c.id); } };
        walk(l.id);
        tracks = [...ids].map(i => s.tracks.get(i)).filter((t): t is Track => !!t);
      } else tracks = l.items.map(i => s.tracks.get(i)).filter((t): t is Track => !!t);
    } else if (sel.kind === 'source') tracks = [...s.tracks.values()].filter(t => t.sources.includes(sel.id));
    else if (sel.kind === 'root') tracks = [...s.tracks.values()].filter(t => t.rootId === sel.id);
    else {
      tracks = [...s.tracks.values()];
      if (sel.kind === 'pending') tracks = tracks.filter(t => lib.needsAnalysis(t));
      else if (sel.kind === 'unlinked') tracks = tracks.filter(t => t.status !== 'linked');
      else if (sel.kind === 'attention') tracks = tracks.filter(t => { const a = s.analysis.get(t.id); return a && (a.grade === 'bad' || a.grade === 'warn'); });
      else if (sel.kind === 'recent') { const cut = Date.now() - 30 * 864e5; tracks = tracks.filter(t => Date.parse(t.addedAt) >= cut); }
    }
    const dj = new Map<string, { bpm: number | null; key: string | null }>();
    for (const src of s.sources.values()) for (const st of src.tracks) {
      const cur = dj.get(st.trackId);
      if (!cur) dj.set(st.trackId, { bpm: st.bpm, key: st.key });
      else { cur.bpm ??= st.bpm; cur.key ??= st.key; }
    }
    let rows: Row[] = tracks.map((t, n) => ({ t, a: s.analysis.get(t.id) ?? null, n, dj: dj.get(t.id) ?? null }));
    const q = this.search.trim().toLowerCase();
    if (q) {
      const words = q.split(/\s+/);
      rows = rows.filter(({ t }) => { const hay = (t.title + ' ' + t.artist + ' ' + t.album + ' ' + t.genre + ' ' + t.label + ' ' + t.fileName).toLowerCase(); return words.every(w => hay.includes(w)); });
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
        case 'added': return r.t.addedAt;
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
