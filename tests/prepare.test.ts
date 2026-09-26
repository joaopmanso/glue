import { describe, expect, it } from 'vitest';
import { beatGrid, beatsBetween, computeWaveform } from '../src/core/audio/waveform';
import { bpmInUse, fmtBpm, shownBpm } from '../src/core/library/bpm';
import type { AnalysisSummary, Track } from '../src/store/types';

/** Clicks (short decaying noise bursts over a quiet pad) at a tempo, from an offset; every fourth one,
    starting at beat `accent`, louder: a stand-in for a kick on a four-to-the-floor track. */
function clicks(bpm: number, offset: number, seconds: number, accent: number, sr = 44100) {
  const x = new Float32Array(sr * seconds), p = 60 / bpm;
  let s = 12345;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
  for (let i = 0; i < x.length; i++) x[i] = 0.02 * Math.sin(2 * Math.PI * 220 * i / sr);
  for (let k = 0, t = offset; t < seconds - 0.1; k++, t += p) {
    const a = Math.round(t * sr), g = k % 4 === accent ? 0.9 : 0.45;
    for (let i = 0; i < 0.03 * sr; i++) x[a + i] += g * rnd() * Math.exp(-i / (0.006 * sr));
  }
  return x;
}

describe('Prepare: waveform and beat grid (ADR 0052)', () => {
  it('places the grid on the beats, to a few milliseconds, and finds the bar', () => {
    for (const [bpm, offset, accent] of [[124, 0.137, 1], [174, 0.05, 0], [90, 0.41, 3]] as const) {
      const w = computeWaveform(clicks(bpm, offset, 40, accent), 44100);
      const g = beatGrid(w.env, w.envRate, w.envT0, bpm, { data: w.peak, rate: w.rate });
      expect(Math.abs(g.beat0 - offset)).toBeLessThan(0.002);
      expect(g.bar).toBe(accent);
    }
  });

  it('makes three bands and a peak at 150 points a second', () => {
    const w = computeWaveform(clicks(128, 0.1, 10, 0), 44100);
    expect(w.rate).toBe(150);
    expect(w.low.length).toBe(1500);
    expect(Math.max(...w.peak)).toBe(255);
    expect(w.duration).toBeCloseTo(10, 5);
  });

  it('lists the beats in a stretch of time', () => {
    const b = beatsBetween(0.5, 120, 1, 2.6);
    expect(b.map(x => x.t)).toEqual([1, 1.5, 2, 2.5]);
    expect(b.map(x => x.n)).toEqual([1, 2, 3, 4]);
  });
});

describe('BPM in use and shown (ADR 0052)', () => {
  const t = (prep?: Track['prep']) => ({ prep } as Track), a = { bpm: 140 } as AnalysisSummary;
  it('uses the correction, else the analysis, else the DJ app', () => {
    expect(bpmInUse(t({ bpm: 139.5 }), a)).toBe(139.5);
    expect(bpmInUse(t(), a)).toBe(140);
    expect(bpmInUse(t(), null, 128)).toBe(128);
    expect(bpmInUse(t(), null)).toBe(null);
  });
  it('folds into the profile range, and flips one track', () => {
    expect(shownBpm(140, undefined)).toBe(140);
    expect(shownBpm(140, 'half')).toBe(70);
    expect(shownBpm(174, 'half')).toBe(87);
    expect(shownBpm(70, 'full')).toBe(140);
    expect(shownBpm(124, 'full')).toBe(124);
    expect(shownBpm(140, 'half', true)).toBe(140);
    expect(shownBpm(70, undefined, true)).toBe(140);
    expect(fmtBpm(127.96)).toBe('128');
    expect(fmtBpm(87.5)).toBe('87.5');
  });
});

import { anchorAt, downbeat, nudge, retempo, tapBpm } from '../src/core/library/grid';
describe('Editing the grid (ADR 0052)', () => {
  const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);
  it('puts beat 1 where asked, numbering from the first beat after 0', () => {
    const g = anchorAt(10.25, 120);          // beats every 0.5 s: 0.25, 0.75 … 10.25 is beat 20
    close(g.beat0, 0.25); expect(g.bar).toBe(0);
    const h = anchorAt(10.75, 120);          // beat 21
    close(h.beat0, 0.25); expect(h.bar).toBe(1);
    close(downbeat(h), 0.75);
  });
  it('nudges past a whole beat without moving the bars off', () => {
    const g = { bpm: 120, beat0: 0.1, bar: 2 };   // bars at 1.1, 3.1 …
    const n = nudge(g, -0.2);                 // bars at 0.9, 2.9 …
    close(downbeat(n) % 2, 0.9);
    close(n.beat0, 0.4); expect(n.bar).toBe(1);
  });
  it('halves and doubles the tempo keeping the first bar line', () => {
    const g = { bpm: 140, beat0: 0.2, bar: 1 }, d = downbeat(g);
    close(downbeat(retempo(g, 70)) % (4 * 60 / 70), d % (4 * 60 / 70));
    close(downbeat(retempo(g, 280)), d % (4 * 60 / 280) + 0);
  });
  it('taps a tempo', () => {
    expect(tapBpm([0, 500, 1000])).toBe(null);
    expect(tapBpm([0, 500, 1000, 1500, 2000])).toBe(120);
  });
});

import { addMemory, autoLoop, hotCue, importable, removeCue, setHotCue, snap } from '../src/core/library/cueEdit';
describe('Cue points and loops (ADR 0052, step 2)', () => {
  const g = { bpm: 120, beat0: 0.25, bar: 0 };   // beats every 0.5 s from 0.25
  it('quantizes to the nearest beat', () => {
    expect(snap(10.1, g)).toBeCloseTo(10.25, 9);
    expect(snap(10.4, g)).toBeCloseTo(10.25, 9);
    expect(snap(10.6, g)).toBeCloseTo(10.75, 9);
    expect(snap(3.3, null)).toBe(3.3);
  });
  it('sets a hot cue per pad, replacing that pad only, in time order', () => {
    let c = setHotCue([], 0, 20);
    c = setHotCue(c, 1, 5);
    c = setHotCue(c, 0, 30);
    expect(c.map(x => [x.num, x.t])).toEqual([[1, 5], [0, 30]]);
    expect(hotCue(c, 0)!.color).toBe('#28e214');
    expect(removeCue(c, hotCue(c, 1)!).map(x => x.num)).toEqual([0]);
  });
  it('adds memory cues and saved loops, not twice at the same place', () => {
    let c = addMemory([], 12.5);
    c = addMemory(c, 12.5);
    c = addMemory(c, 12.5, 14.5);
    expect(c.map(x => [x.kind, x.num, x.end])).toEqual([['cue', null, null], ['loop', null, 14.5]]);
  });
  it('makes a loop of whole beats from the beat at the playhead', () => {
    const l = autoLoop(10.4, 4, g);
    expect(l.a).toBeCloseTo(10.25, 9);
    expect(l.b).toBeCloseTo(12.25, 9);
  });
  it('takes cues and loops from an import, not load / fade markers', () => {
    const c = importable([{ t: 1, kind: 'load', num: null, name: '', color: null, end: null }, { t: 8, kind: 'cue', num: 2, name: 'Drop', color: null, end: null }]);
    expect(c.map(x => [x.t, x.num, x.color])).toEqual([[8, 2, '#1566f6']]);
  });
});
