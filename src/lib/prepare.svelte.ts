/* The Prepare tab (ADR 0052): the open track's waveform (from the browser's cache, else made from its
   audio in the worker), the grid in use (the user's, else placed on the audio for the BPM in use), and
   the edits, saved on the track (lib.setPrep). */
import { lib } from './library.svelte';
import { dupes } from './dupes.svelte';
import { waveformOf, decodeAudio } from './analysis';
import { beatGrid, type Waveform } from '../core/audio/waveform';
import { bpmInUse } from '../core/library/bpm';
import { anchorAt, nudge, retempo, tapBpm, type Grid } from '../core/library/grid';
import { blankInfo, parseContainer } from '../core/formats/parse';
import { loadWaveform, writeWaveform } from '../store/waveform';
import * as platform from '../platform';
import type { AnalysisJob } from '../core/types';
import type { Track } from '../store/types';

/** A file's audio as a worker job: raw PCM when GLUE reads the format itself, else the browser decodes it. */
async function jobOf(file: File): Promise<Exclude<AnalysisJob, { type: 'demo' }>> {
  const buf = await file.arrayBuffer();
  let info = blankInfo();
  try { info = parseContainer(new Uint8Array(buf)); } catch { /* the browser decodes it */ }
  if (info.pcm) return { type: 'pcm', buffer: buf, pcm: info.pcm, sr: info.sampleRate };
  const ab = await decodeAudio(buf, info.decodeRate || info.sampleRate || 48000);
  const channels: Float32Array[] = [];
  for (let c = 0; c < ab.numberOfChannels; c++) channels.push(new Float32Array(ab.getChannelData(c)));
  return { type: 'float', channels, sr: ab.sampleRate, bits: 0 };
}

class Prepare {
  trackId = $state<string | null>(null);
  wave = $state.raw<Waveform | null>(null);
  status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  error = $state('');
  private placed = new Map<number, { beat0: number; bar: number }>();
  private taps: number[] = [];

  /** The track's waveform: from the cache, else made now (and kept). */
  async open(t: Track) {
    if (this.trackId === t.id && (this.status === 'ready' || this.status === 'loading')) return;
    this.trackId = t.id; this.wave = null; this.placed.clear(); this.status = 'loading'; this.error = '';
    const s = lib.store, dir = await platform.cacheDir(), file = { size: t.size, mtime: t.mtime };
    try {
      let w = s && dir ? await loadWaveform(dir, s.meta.id, t.id, file) : null;
      if (!w) {
        w = await waveformOf(await jobOf(await lib.fileFor(t)));
        if (s && dir) void writeWaveform(dir, s.meta.id, t.id, file, w).catch(e => console.warn('Couldn’t keep the waveform', e));
      }
      if (this.trackId !== t.id) return;
      this.wave = w; this.status = 'ready';
    } catch (e) {
      if (this.trackId !== t.id) return;
      this.status = 'error'; this.error = (e as Error).message || String(e);
    }
  }
  close() { this.trackId = null; this.wave = null; this.status = 'idle'; this.placed.clear(); this.taps = []; }

  /** The grid in use: the user's (Prepare), else placed on the audio for the BPM in use. */
  grid(t: Track | null | undefined): Grid | null {
    if (!t) return null;
    const bpm = bpmInUse(t, lib.store?.analysis.get(t.id));
    if (!bpm) return null;
    const p = t.prep;
    if (p?.beat0 != null) return { bpm, beat0: p.beat0, bar: p.bar ?? 0 };
    const w = this.wave;
    if (!w || this.trackId !== t.id) return { bpm, beat0: 0, bar: 0 };
    const key = Math.round(bpm * 1000);
    let g = this.placed.get(key);
    if (!g) { g = beatGrid(w.env, w.envRate, w.envT0, bpm, { data: w.peak, rate: w.rate }); this.placed.set(key, g); }
    return { bpm, ...g };
  }

  /** The other copies of the same recording (Duplicates, by sound) in this collection: a correction
      applies to them too, so the song has one BPM wherever it's shown. */
  copies(t: Track): Track[] {
    const g = dupes.groupOf.get(t.id);
    if (!g || g.kind !== 'same') return [];
    return g.ids.filter(id => id !== t.id).map(id => lib.store?.tracks.get(id)).filter((x): x is Track => !!x && !x.remote);
  }
  /** Set on the track and its copies; the grid only on copies of the same length (the same start). */
  private apply(t: Track, patch: Partial<NonNullable<Track['prep']>>) {
    lib.setPrep(t.id, patch);
    const grid = 'beat0' in patch || 'bar' in patch;
    for (const c of this.copies(t)) {
      const sameStart = t.duration != null && c.duration != null && Math.abs(t.duration - c.duration) < 0.01;
      const p = { ...patch };
      if (grid && !sameStart) { delete p.beat0; delete p.bar; }
      lib.setPrep(c.id, p);
    }
  }

  // ─── Edits (saved on the track; they override the analysis) ────────────────
  private save(t: Track, g: Grid) { this.apply(t, { bpm: Math.round(g.bpm * 1000) / 1000, beat0: Math.round(g.beat0 * 100000) / 100000, bar: g.bar }); }
  setBpm(t: Track, bpm: number) { const g = this.grid(t); if (g && bpm >= 30 && bpm <= 300) this.save(t, retempo(g, bpm)); }
  nudge(t: Track, dt: number) { const g = this.grid(t); if (g) this.save(t, nudge(g, dt)); }
  beatHere(t: Track, at: number) { const g = this.grid(t); if (g) this.save(t, anchorAt(at, g.bpm)); }
  /** A tap (tap tempo); \`rate\`: the playback speed, so the taps are the track's own tempo. */
  tap(t: Track, rate: number) {
    const now = performance.now();
    if (this.taps.length && now - this.taps[this.taps.length - 1] > 2000) this.taps = [];
    this.taps = [...this.taps.slice(-7), now];
    const b = tapBpm(this.taps);
    if (b) this.setBpm(t, Math.round(b / rate * 100) / 100);
    return this.taps.length;
  }
  /** Place the grid on the audio again for the BPM in use (keeps a corrected BPM). */
  replace(t: Track) { this.apply(t, { beat0: undefined, bar: undefined }); }
  /** Back to the analysis: BPM and grid (cues stay). */
  reset(t: Track) { this.apply(t, { bpm: undefined, beat0: undefined, bar: undefined }); }
  flip(t: Track) { this.apply(t, { flip: t.prep?.flip ? undefined : true }); }
}

export const prepare = new Prepare();
