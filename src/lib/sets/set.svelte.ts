/* The set open at #/set/<id> (ADR 0199, 0200): a playlist laid out as a mix, planned from its songs' grids and sound
   profiles, kept on the playlist (`List.set`). */
import { lib } from '../library.svelte';
import { mainOf } from '../cues';
import { bpmOf } from '../bpm';
import { waveformOf } from '../analysis';
import { jobOf } from '../audioJob';
import { loadWaveform, writeWaveform } from '../../store/waveform';
import * as platform from '../../platform';
import { gridFor } from '../../core/sets/grid';
import { planSet, type PlanSong } from '../../core/sets/plan';
import { curveOf } from '../../core/audio/sound';
import { likeness } from '../../core/library/energy';
import { auto } from '../auto.svelte';
import type { Waveform } from '../../core/audio/waveform';
import type { SetPlan, SetStyle } from '../../core/sets/types';
import type { List, Track } from '../../store/types';

interface Snap { plan: SetPlan; order: string[] }

class Sets {
  listId = $state<string | null>(null);
  plan = $state.raw<SetPlan | null>(null);
  status = $state<'idle' | 'planning' | 'ready' | 'error'>('idle');
  /** What's happening while planning ("Placing beat grids 3 of 12"), or why it failed. */
  message = $state('');
  /** Each song's waveform, for the lanes (and the grids placed on it). */
  waves = $state.raw(new Map<string, Waveform>());
  /** Waveforms still being made, in the background ("3 of 12"), or ''. */
  drawing = $state('');
  /** Earlier and undone versions: the plan and the playlist's order with it. */
  private past = $state.raw<Snap[]>([]);
  private future = $state.raw<Snap[]>([]);
  /** The version before a drag, recorded when it ends. */
  private grabbed: Snap | null = null;
  private gen = 0;

  list(): List | null { return this.listId ? lib.store?.lists.get(this.listId) ?? null : null; }

  /** Open a playlist's set: its plan as kept, or a new one (Continuous, 2 decks, each song's tempo, key lock). */
  async open(listId: string) {
    if (this.listId === listId && this.status !== 'idle') return;
    this.listId = listId; this.plan = null; this.waves = new Map(); this.status = 'planning'; this.message = ''; this.past = []; this.future = []; this.grabbed = null;
    const g = ++this.gen;
    const l = this.list();
    if (!l) { this.status = 'error'; this.message = 'This playlist isn’t here.'; return; }
    try {
      await this.loadWaves(l.items, true);
      if (this.listId !== listId || g !== this.gen) return;
      // The plan kept on the playlist, while its songs are the ones it has, in its order (songs that can't be planned,
      // without a tempo or a length, are left out of either).
      const plannable = l.items.filter(id => { const t = lib.store?.tracks.get(id); return !!t && !!this.songOf(t); });
      // A length asked for leaves the last songs out: then its songs are the first ones.
      const ids = l.set?.items.map(i => i.id).join(), kept = l.set && ids === (l.set.length ? plannable.slice(0, l.set.items.length) : plannable).join() ? l.set : null;
      this.plan = kept ?? this.make(l, { style: 'blend', decks: 2, tempo: { mode: 'songs' }, keyLock: true });
      if (!kept) this.save();
      this.status = 'ready';
      void this.loadWaves(l.items, false, g);
    } catch (e) { if (this.listId === listId) { this.status = 'error'; this.message = (e as Error).message; } }
  }
  close() { this.gen++; this.listId = null; this.plan = null; this.status = 'idle'; this.waves = new Map(); this.drawing = ''; this.past = []; this.future = []; }

  /** Plan it again in another way (style, decks, tempo, key lock); the playlist's order as it is now. */
  replan(o: Partial<{ style: SetStyle; decks: 2 | 3; tempo: SetPlan['tempo']; keyLock: boolean; length: number | null }>) {
    const l = this.list(), p = this.plan;
    if (!l || !p) return;
    this.record();
    this.plan = this.make(l, { style: o.style ?? p.style, decks: o.decks ?? p.decks, tempo: o.tempo ?? p.tempo, keyLock: o.keyLock ?? (p.items[0]?.keyLock ?? true), length: o.length !== undefined ? o.length : p.length ?? null });
    this.save();
  }

  private make(l: List, o: Parameters<typeof planSet>[1]): SetPlan {
    const songs = l.items.map(id => lib.store?.tracks.get(id)).filter((t): t is Track => !!t).map(t => this.songOf(t)).filter((s): s is PlanSong => !!s);
    if (!songs.length) throw new Error('None of these songs has a tempo yet: they need their analysis first.');
    const sp = auto.sound();
    return planSet(songs, { ...o, like: (a, b) => likeness(sp.timbre.get(a), sp.timbre.get(b)) });
  }
  /** How alike two songs sound, 0 … 1 (null: not known). */
  like(a: string, b: string): number | null { const sp = auto.sound(); return likeness(sp.timbre.get(a), sp.timbre.get(b)); }

  /** What planning needs of a song: its tempo and grid, length, loudness over time, key. */
  songOf(t: Track): PlanSong | null {
    const a = lib.store?.analysis.get(t.id), main = mainOf(t.id)?.grid ?? null;
    const bpm = bpmOf(t, a, lib.djOf(t.id)?.bpm ?? null), g = gridFor(t.prep, bpm, main, this.waves.get(t.id) ?? null);
    if (!g || !t.duration) return null;
    return {
      id: t.id, bpm: g.bpm, beat0: g.beat0, bar: g.bar, duration: t.duration, guessed: g.guessed,
      curve: a?.sound ? curveOf(a.sound) : null, step: a?.sound?.step, lufs: a?.sound?.lufs ?? null, key: a?.key ? { tonic: a.key.tonic, mode: a.key.mode } : null,
    };
  }

  /** The songs' waveforms. `needed`: only those whose grid must be placed on one (made now, planning waits for
      them); else every song's, from the cache or made, in the background, each shown as it comes. */
  private async loadWaves(ids: string[], needed: boolean, g = this.gen) {
    const s = lib.store, dir = await platform.cacheDir();
    const tracks = ids.map(id => s?.tracks.get(id)).filter((t): t is Track => !!t && t.status === 'linked' && !this.waves.has(t.id));
    const want = needed ? tracks.filter(t => t.prep?.beat0 == null && !mainOf(t.id)?.grid) : tracks;
    const put = (id: string, w: Waveform) => { if (g === this.gen) { const m = new Map(this.waves); m.set(id, w); this.waves = m; } };
    // The cached ones first (quick), then the rest made one by one.
    const make: Track[] = [];
    for (const t of tracks) {
      const w = s && dir ? await loadWaveform(dir, s.meta.id, t.id, { size: t.size, mtime: t.mtime }).catch(() => null) : null;
      if (g !== this.gen) return;
      if (w) put(t.id, w); else if (want.includes(t)) make.push(t);
    }
    let i = 0;
    for (const t of make) {
      if (g !== this.gen) return;
      i++;
      if (needed) this.message = 'Placing beat grids: ' + i + ' of ' + make.length; else this.drawing = i + ' of ' + make.length;
      // A file the tab can't read (GLUE Home has it): no waveform, the song drawn as a line.
      const w = await lib.fileFor(t).then(f => waveformOf(jobOf(f))).catch(() => null);
      if (w) { put(t.id, w); if (s && dir) void writeWaveform(dir, s.meta.id, t.id, { size: t.size, mtime: t.mtime }, w).catch(() => {}); }
    }
    if (g === this.gen) { if (needed) this.message = ''; else this.drawing = ''; }
  }

  // ---- shaping it by hand, with undo ----

  private snap(): Snap | null { const l = this.list(); return this.plan && l ? { plan: this.plan, order: [...l.items] } : null; }
  private record() { const x = this.snap(); if (x) { this.past = [...this.past.slice(-99), x]; this.future = []; } }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  /** A new version of the plan (a style chosen, a song moved): recorded for undo, kept on the playlist. */
  apply(plan: SetPlan) { this.record(); this.plan = plan; this.save(); }
  /** A drag: `grab` before it, `drag` as it goes (shown, not kept), `drop` at the end (recorded and kept). */
  grab() { this.grabbed = this.snap(); }
  drag(plan: SetPlan) { this.plan = plan; }
  drop() {
    const was = this.grabbed; this.grabbed = null;
    if (!was || was.plan === this.plan) return;
    this.past = [...this.past.slice(-99), was]; this.future = [];
    this.save();
  }
  undo() { this.step(this.past, this.future, x => { this.past = x.from; this.future = x.to; }); }
  redo() { this.step(this.future, this.past, x => { this.future = x.from; this.past = x.to; }); }
  private step(from: Snap[], to: Snap[], set: (x: { from: Snap[]; to: Snap[] }) => void) {
    const now = this.snap(), x = from[from.length - 1], l = this.list();
    if (!now || !x || !l) return;
    set({ from: from.slice(0, -1), to: [...to, now] });
    this.plan = x.plan;
    lib.store?.putList({ ...l, items: x.order, set: x.plan });
  }

  /** The playlist's songs in another order (song `from` put at `to`): the set planned again in that order. */
  reorder(from: number, to: number) {
    const l = this.list(), p = this.plan;
    if (!l || !p || from === to) return;
    const ids = p.items.map(i => i.id), [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    // The playlist's other songs (left out of the set) keep their places after these.
    const rest = l.items.filter(id => !ids.includes(id)), order = [...ids, ...rest];
    this.record();
    const next = { ...l, items: order };
    this.plan = this.make(next, { style: p.style, decks: p.decks, tempo: p.tempo, keyLock: p.items[0]?.keyLock ?? true, length: p.length ?? null });
    lib.store?.putList({ ...next, set: this.plan });
  }

  save() {
    const l = this.list();
    if (l && this.plan) lib.store?.putList({ ...l, set: this.plan });
  }
}
export const sets = new Sets();
