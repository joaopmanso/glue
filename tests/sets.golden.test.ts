/* The set's mixer as recorded for its Rust port (ADR 0204, crates/glue-sets): fixed plans over synthetic songs built
   from exact arithmetic only (an integer random walk, sawtooths, decays), so Rust makes the same songs bit for bit.
   Each case's mix is kept as every EVERY-th frame (f32, L R interleaved) plus its length, energy and peak.
   `GOLDEN=1 npx vitest run tests/sets.golden.test.ts` records; otherwise the recording must be current. */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Mixer, type Pcm } from '../src/core/sets/mixer';
import { resample } from '../src/core/sets/dsp';
import { MIX_RATE, type SetItem, type SetPlan } from '../src/core/sets/types';

const DIR = 'tests/golden/sets', EVERY = 256;

/** A song: kicks on its beat, a sawtooth bass and chord, hats of noise (integer random walk). Exact arithmetic only. */
export function synth(seed: number, secs: number, bpm: number, sr = MIX_RATE): Pcm {
  const n = Math.round(secs * sr), l = new Float32Array(n), r = new Float32Array(n);
  let a = seed >>> 0;
  const rnd = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296 - 0.5; };
  const P = Math.round(sr * 60 / bpm), f1 = 55 + (seed % 7) * 5, f2 = 220 + (seed % 5) * 20;
  for (let i = 0; i < n; i++) {
    const k = i % P, env = 1 - k / P, kick = env * env * env * env;
    const p1 = (i * f1) % sr / sr, p2 = (i * f2) % sr / sr, p3 = (i * (f2 + 3)) % sr / sr;
    const hat = (k > P / 2 && k < P / 2 + 600 ? 1 - (k - P / 2) / 600 : 0) * rnd();
    l[i] = 0.5 * kick * (p1 - 0.5) * 2 + 0.12 * (p2 - 0.5) + 0.15 * hat;
    r[i] = 0.5 * kick * (p1 - 0.5) * 2 + 0.12 * (p3 - 0.5) + 0.15 * hat;
  }
  return { l, r };
}

interface Song { id: string; seed: number; secs: number; bpm: number }
interface Case { name: string; songs: Song[]; plan: Pick<SetPlan, 'items' | 'tempo'> }
const item = (id: string, deck: number, bpm: number, start: number, beats: number, x: Partial<SetItem> = {}): SetItem =>
  ({ id, deck, bpm, beat0: 0, in: 0.5, start, beats, keyLock: true, ...x });

const CASES: Case[] = [
  { name: 'blend-keylock', songs: [{ id: 'a', seed: 11, secs: 40, bpm: 124 }, { id: 'b', seed: 23, secs: 40, bpm: 126 }, { id: 'c', seed: 37, secs: 40, bpm: 122 }],
    plan: { tempo: { mode: 'songs' }, items: [
      item('a', 0, 124, 0, 64, { trim: -1.5, fx: { style: 'blend' } }), item('b', 1, 126, 48, 64, { trim: 2, fx: { style: 'bassSwap' } }), item('c', 0, 122, 96, 60)] } },
  { name: 'filter-echo-varispeed', songs: [{ id: 'a', seed: 5, secs: 40, bpm: 128 }, { id: 'b', seed: 8, secs: 40, bpm: 125 }, { id: 'c', seed: 13, secs: 40, bpm: 127 }],
    plan: { tempo: { mode: 'songs' }, items: [
      item('a', 0, 128, 0, 64, { keyLock: false, fx: { style: 'filter' } }), item('b', 1, 125, 48, 64, { keyLock: false, fx: { style: 'echo' } }), item('c', 0, 127, 104, 56, { keyLock: false })] } },
  { name: 'cut-fixed', songs: [{ id: 'a', seed: 3, secs: 40, bpm: 120 }, { id: 'b', seed: 9, secs: 40, bpm: 140 }],
    plan: { tempo: { mode: 'fixed', bpm: 126 }, items: [item('a', 0, 120, 0, 64, { fx: { style: 'cut' } }), item('b', 1, 140, 64, 64)] } },
  { name: 'cut-jump', songs: [{ id: 'a', seed: 4, secs: 40, bpm: 120 }, { id: 'b', seed: 6, secs: 40, bpm: 140 }],
    plan: { tempo: { mode: 'songs' }, items: [item('a', 0, 120, 0, 64, { fx: { style: 'cut' } }), item('b', 1, 140, 64, 64)] } },
  { name: 'layer-double-bass', songs: [{ id: 'a', seed: 17, secs: 60, bpm: 124 }, { id: 'b', seed: 19, secs: 60, bpm: 124.5 }, { id: 'c', seed: 29, secs: 60, bpm: 125 }, { id: 'd', seed: 31, secs: 60, bpm: 124 }],
    plan: { tempo: { mode: 'songs' }, items: [
      item('a', 0, 124, 0, 112, { fx: { style: 'layer' } }), item('b', 1, 124.5, 32, 112, { fx: { style: 'double', drop: 32, bass: 'both' } }),
      item('c', 2, 125, 96, 100, { fx: { style: 'bassSwap', swap: 8 }, lows: [{ from: 32, to: 48, on: false }] }), item('d', 0, 124, 160, 80, { trim: -3, lows: [{ from: 0, to: 8, on: true }] })] } },
  { name: 'layer-swap-lows', songs: [{ id: 'a', seed: 43, secs: 60, bpm: 124 }, { id: 'b', seed: 47, secs: 60, bpm: 124 }],
    plan: { tempo: { mode: 'songs' }, items: [
      item('a', 0, 124, 0, 112, { fx: { style: 'layer', swap: 36 }, lows: [{ from: 8, to: 16, on: false }] }), item('b', 1, 124, 48, 96, { lows: [{ from: 4, to: 12, on: true }] })] } },
];

function render(c: Case) {
  const src = new Map(c.songs.map(s => [s.id, synth(s.seed, s.secs, s.bpm)]));
  const m = new Mixer(c.plan, { get: id => src.get(id) ?? null });
  const B = 3000, L = new Float32Array(B), R = new Float32Array(B), keep: number[] = [];
  let f = 0, sl = 0, sr = 0, peak = 0;
  for (;;) {
    const n = m.render(L, R, B);
    if (!n) break;
    for (let i = 0; i < n; i++) {
      sl += L[i] * L[i]; sr += R[i] * R[i]; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      if ((f + i) % EVERY === 0) keep.push(L[i], R[i]);
    }
    f += n;
  }
  return { frames: f, length: m.length, sumsq: [sl, sr], peak, samples: new Float32Array(keep) };
}

describe('the set’s mixer, recorded for its Rust port (ADR 0204)', () => {
  it('renders each case as recorded', { timeout: 60_000 }, () => {
    const out: unknown[] = [];
    for (const c of CASES) {
      const r = render(c), bin = Buffer.from(r.samples.buffer);
      out.push({ name: c.name, songs: c.songs, plan: c.plan, every: EVERY, frames: r.frames, length: r.length, sumsq: r.sumsq, peak: r.peak });
      const f = `${DIR}/${c.name}.bin`;
      if (process.env.GOLDEN || !existsSync(f)) { mkdirSync(DIR, { recursive: true }); writeFileSync(f, bin); }
      else expect(Buffer.compare(readFileSync(f), bin), c.name).toBe(0);
      expect(r.frames).toBe(r.length);
      expect(r.peak).toBeGreaterThan(0.05);
    }
    // The resampler on its own: 48 kHz to the mix rate.
    const x = synth(41, 2, 126, 48000).l, y = resample(x, 48000, MIX_RATE);
    const ys = Float32Array.from({ length: Math.floor(y.length / 7) }, (_, i) => y[i * 7]);
    const json = JSON.stringify({ cases: out, resample: { seed: 41, secs: 2, bpm: 126, from: 48000, every: 7, length: y.length } }, null, 1);
    const bin = Buffer.from(ys.buffer);
    if (process.env.GOLDEN || !existsSync(`${DIR}/cases.json`)) { writeFileSync(`${DIR}/cases.json`, json); writeFileSync(`${DIR}/resample.bin`, bin); }
    else { expect(readFileSync(`${DIR}/cases.json`, 'utf8')).toBe(json); expect(Buffer.compare(readFileSync(`${DIR}/resample.bin`), bin)).toBe(0); }
  });
});
