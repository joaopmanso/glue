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
import type { Waveform } from '../../core/audio/waveform';
import type { SetPlan, SetStyle } from '../../core/sets/types';
import type { List, Track } from '../../store/types';

class Sets {
  listId = $state<string | null>(null);
  plan = $state.raw<SetPlan | null>(null);
  status = $state<'idle' | 'planning' | 'ready' | 'error'>('idle');
  /** What's happening while planning ("Placing beat grids 3 of 12"), or why it failed. */
  message = $state('');
  /** Each song's waveform, for the lanes (and the grids placed on it). */
  waves = $state.raw(new Map<string, Waveform>());

  list(): List | null { return this.listId ? lib.store?.lists.get(this.listId) ?? null : null; }

  /** Open a playlist's set: its plan as kept, or a new one (Continuous, 2 decks, each song's tempo, key lock). */
  async open(listId: string) {
    if (this.listId === listId && this.status !== 'idle') return;
    this.listId = listId; this.plan = null; this.waves = new Map(); this.status = 'planning'; this.message = '';
    const l = this.list();
    if (!l) { this.status = 'error'; this.message = 'This playlist isn’t here.'; return; }
    const kept = l.set && l.set.items.map(i => i.id).join() === l.items.filter(id => lib.store?.tracks.has(id)).join() ? l.set : null;
    try {
      await this.loadWaves(l.items);
      if (this.listId !== listId) return;
      this.plan = kept ?? this.make(l, { style: 'blend', decks: 2, tempo: { mode: 'songs' }, keyLock: true });
      if (!kept) this.save();
      this.status = 'ready';
    } catch (e) { if (this.listId === listId) { this.status = 'error'; this.message = (e as Error).message; } }
  }
  close() { this.listId = null; this.plan = null; this.status = 'idle'; this.waves = new Map(); }

  /** Plan it again in another way (style, decks, tempo, key lock); the playlist's order as it is now. */
  replan(o: Partial<{ style: SetStyle; decks: 2 | 3; tempo: SetPlan['tempo']; keyLock: boolean }>) {
    const l = this.list(), p = this.plan;
    if (!l || !p) return;
    this.plan = this.make(l, { style: o.style ?? p.style, decks: o.decks ?? p.decks, tempo: o.tempo ?? p.tempo, keyLock: o.keyLock ?? (p.items[0]?.keyLock ?? true) });
    this.save();
  }

  private make(l: List, o: Parameters<typeof planSet>[1]): SetPlan {
    const songs = l.items.map(id => lib.store?.tracks.get(id)).filter((t): t is Track => !!t).map(t => this.songOf(t)).filter((s): s is PlanSong => !!s);
    if (!songs.length) throw new Error('None of these songs has a tempo yet: they need their analysis first.');
    return planSet(songs, o);
  }

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

  /** The songs' waveforms: from the cache, else made (only for songs whose grid must be placed on it). */
  private async loadWaves(ids: string[]) {
    const s = lib.store, dir = await platform.cacheDir(), out = new Map(this.waves);
    const tracks = ids.map(id => s?.tracks.get(id)).filter((t): t is Track => !!t && t.status === 'linked');
    let i = 0;
    for (const t of tracks) {
      i++;
      const file = { size: t.size, mtime: t.mtime };
      let w = s && dir ? await loadWaveform(dir, s.meta.id, t.id, file).catch(() => null) : null;
      const needsGrid = t.prep?.beat0 == null && !mainOf(t.id)?.grid;
      if (!w && needsGrid) {
        this.message = 'Placing beat grids: ' + i + ' of ' + tracks.length;
        w = await waveformOf(jobOf(await lib.fileFor(t))).catch(() => null);
        if (w && s && dir) void writeWaveform(dir, s.meta.id, t.id, file, w).catch(() => {});
      }
      if (w) out.set(t.id, w);
    }
    this.waves = out;
    this.message = '';
  }

  save() {
    const l = this.list();
    if (l && this.plan) lib.store?.putList({ ...l, set: this.plan });
  }
}
export const sets = new Sets();
