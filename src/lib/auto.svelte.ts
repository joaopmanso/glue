/* The "build a playlist" dialog's state: options, the candidate pool from the collection, results. */
import { lib } from './library.svelte';
import { view } from './view.svelte';
import { dupes } from './dupes.svelte';
import { generate, replaceSlot, type AutoOptions, type Candidate, type Harmonic, type Slot } from '../core/library/autoplaylist';
import type { Track } from '../store/types';
import { tagsOf, uniqTags } from '../core/library/tagging';

export interface AutoForm {
  seedId: string | null; include: string[]; avoidLists: string[];
  count: number; startBpm: number | null; endBpm: number | null; tolerancePct: number; halfDouble: boolean;
  harmonic: Harmonic; useRatings: boolean; minRating: number; sameGenre: boolean; randomness: number; unanalysed: boolean;
  /** Tags (ADR 0032): tags null = the starting and included tracks' own; 'only' keeps just tracks with one of them. */
  useTags: boolean; tags: string[] | null; tagMode: 'prefer' | 'only'; avoidTags: string[];
}

class Auto {
  open = $state(false);
  form = $state<AutoForm>(this.defaults(null));
  slots = $state.raw<Slot[]>([]);
  relaxed = $state.raw<string[]>([]);
  pool = $state(0);
  /** Set when a run found nothing: why. */
  empty = $state('');
  name = $state('');
  private seed = Math.floor(Math.random() * 1e9);

  private ratingOf(t: Track): number | null {
    if (t.rating != null) return t.rating;
    for (const s of lib.store?.sources.values() ?? []) { const st = s.tracks.find(x => x.trackId === t.id); if (st?.rating) return st.rating; }
    return null;
  }
  private bpmOf(t: Track): number | null {
    const a = lib.store?.analysis.get(t.id);
    if (a?.bpm) return a.bpm;
    for (const s of lib.store?.sources.values() ?? []) { const st = s.tracks.find(x => x.trackId === t.id); if (st?.bpm) return st.bpm; }
    return null;
  }
  defaults(seedId: string | null): AutoForm {
    const t = seedId ? lib.store?.tracks.get(seedId) : null, bpm = t ? this.bpmOf(t) : null;
    return {
      seedId, include: [], avoidLists: [], count: 20,
      startBpm: bpm ? Math.round(bpm) : null, endBpm: bpm ? Math.round(bpm) : null, tolerancePct: 4, halfDouble: true,
      harmonic: 'prefer', useRatings: true, minRating: 0, sameGenre: false, randomness: 0.35, unanalysed: false,
      useTags: true, tags: null, tagMode: 'prefer', avoidTags: [],
    };
  }

  /** Open the dialog; `include`: more selected tracks, which must all be in the playlist. */
  show(seedId: string | null, include: string[] = []) {
    this.form = { ...this.defaults(seedId), include: include.filter(id => id !== seedId) };
    this.slots = []; this.relaxed = [];
    const t = seedId ? lib.store?.tracks.get(seedId) : null;
    this.name = t ? 'Auto · ' + (t.title || t.fileName) : 'Auto playlist';
    this.open = true;
    this.form.count = Math.max(1 + this.form.include.length, Math.min(20, this.candidates().length || 20));
  }
  close() { this.open = false; }

  /** The tags the playlist leans towards: chosen ones, or those of the starting and included tracks. */
  wantedTags(): string[] {
    const f = this.form;
    if (!f.useTags) return [];
    if (f.tags) return f.tags;
    const s = lib.store;
    return uniqTags([f.seedId, ...f.include].flatMap(id => { const t = id ? s?.tracks.get(id) : null; return t ? tagsOf(t) : []; }));
  }

  /** Tracks that may appear: playable, analysed (unless allowed), one copy per duplicate group, not in avoided lists. */
  candidates(): Candidate[] {
    const s = lib.store;
    if (!s) return [];
    const f = this.form, avoid = new Set<string>();
    for (const id of f.avoidLists) for (const x of s.lists.get(id)?.items ?? []) avoid.add(x);
    const keep = new Set([f.seedId, ...f.include].filter((x): x is string => !!x));
    const want = this.wantedTags().map(t => t.toLowerCase()), avoidTags = f.useTags ? f.avoidTags.map(t => t.toLowerCase()) : [];
    const only = f.useTags && f.tagMode === 'only' && want.length > 0;
    const out: Candidate[] = [];
    for (const t of s.tracks.values()) {
      if (!keep.has(t.id)) {
        if (t.status !== 'linked' || avoid.has(t.id)) continue;
        const g = dupes.groupOf.get(t.id);
        if (g?.kind === 'same' && g.best !== t.id) continue;          // the best copy stands for its duplicates
      }
      const a = s.analysis.get(t.id);
      if (!f.unanalysed && !keep.has(t.id) && (!a || a.error)) continue;
      const tags = tagsOf(t).map(x => x.toLowerCase());
      if (!keep.has(t.id) && (avoidTags.some(x => tags.includes(x)) || (only && !want.some(x => tags.includes(x))))) continue;
      out.push({ id: t.id, bpm: this.bpmOf(t), key: a?.key ? { tonic: a.key.tonic, mode: a.key.mode } : null, rating: this.ratingOf(t), genre: t.genre, duration: t.duration, tags });
    }
    return out;
  }
  options(): AutoOptions {
    const f = this.form, seedGenre = f.seedId ? lib.store?.tracks.get(f.seedId)?.genre ?? '' : '';
    return {
      count: Math.max(1, Math.min(500, Math.round(f.count))), startBpm: f.startBpm || null, endBpm: f.endBpm || f.startBpm || null,
      bpmTolerance: f.tolerancePct / 100, halfDouble: f.halfDouble, harmonic: f.harmonic, useRatings: f.useRatings,
      minRating: f.minRating, sameGenre: f.sameGenre && seedGenre ? seedGenre : null, randomness: f.randomness, seed: this.seed,
      tags: this.wantedTags().map(t => t.toLowerCase()),
    };
  }
  run() {
    const pool = this.candidates(), r = generate(pool, this.form.seedId, this.form.include, this.options());
    this.slots = r.slots; this.relaxed = r.relaxed; this.pool = r.pool;
    this.empty = r.slots.length ? '' : pool.length ? 'No track fits these settings. Try a wider tempo range, harmonic mixing “Prefer”, or a lower minimum rating.' : this.form.useTags && (this.form.tagMode === 'only' || this.form.avoidTags.length) ? 'No tracks have these tags (or all have a tag to avoid). Try “Prefer” instead of “Only”, or fewer tags to avoid.' : 'No tracks can be used yet: they need a file and an analysis. Wait for the analysis, turn it on, or allow tracks not analysed yet.';
  }
  /** A different playlist with the same options. */
  again() { this.seed = (this.seed + 0x9e3779b9) >>> 0; this.run(); }
  reroll(i: number) {
    const pool = this.candidates(), ids = this.slots.map(s => s.id);
    this.seed = (this.seed + 7) >>> 0;
    const alt = replaceSlot(pool, ids, i, this.options(), this.slots[i].bpmTarget);
    if (!alt) { lib.notice = 'No other track fits this spot.'; return; }
    const copy = [...this.slots];
    copy[i] = { ...copy[i], id: alt, fixed: false };
    this.slots = copy;
  }
  remove(i: number) { this.slots = this.slots.filter((_, j) => j !== i); }
  save() {
    const ids = this.slots.map(s => s.id);
    if (!ids.length) return;
    const l = lib.createList('playlist', this.name.trim() || 'Auto playlist', null, ids);
    if (!l) return;
    // Keep how it was made, for "generate again" and for avoiding repeats later (shows and sessions).
    const tags = this.wantedTags();
    lib.store?.putList({ ...l, auto: { ...this.form, seed: this.seed, at: new Date().toISOString() }, ...(tags.length ? { tags } : {}) });
    view.select({ kind: 'list', id: l.id });
    lib.notice = 'Saved “' + l.name + '” with ' + ids.length + ' tracks.';
    this.open = false;
  }
}
export const auto = new Auto();
