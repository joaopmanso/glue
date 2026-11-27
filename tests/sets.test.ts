import { describe, expect, it } from 'vitest';
import { cubicAt, Isolator, Limiter, resample, Wsola } from '../src/core/sets/dsp';
import { TempoMap, knotsOf, tempoOf } from '../src/core/sets/tempo';
import { dropsOf, firstDown, planSet, type PlanSong } from '../src/core/sets/plan';
import { Mixer, type Pcm } from '../src/core/sets/mixer';
import { controlsAt } from '../src/core/sets/automation';
import { clock, timesOf, tracklist } from '../src/core/sets/tracklist';
import { MIX_RATE, type SetPlan } from '../src/core/sets/types';

const SR = MIX_RATE;
const tone = (hz: number, secs: number, sr = SR, amp = 0.5) => Float32Array.from({ length: Math.round(secs * sr) }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / sr));
/** Zero crossings upwards per second, over the middle of a signal. */
function pitch(x: Float32Array, sr: number) {
  const a = Math.floor(x.length * 0.2), b = Math.floor(x.length * 0.8);
  let n = 0;
  for (let i = a + 1; i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) n++;
  return n / ((b - a) / sr);
}
/** Where two signals first differ (-1: the same). */
const firstDiff = (a: Float32Array, b: Float32Array) => { if (a.length !== b.length) return 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i; return -1; };
const rms = (x: Float32Array, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };

describe('the set’s signal processing (ADR 0199)', () => {
  it('resamples to the mix rate: the same pitch, the right length', () => {
    const x = tone(1000, 2, 48000), y = resample(x, 48000, SR);
    expect(y.length).toBe(Math.floor(2 * SR));
    expect(pitch(y, SR)).toBeCloseTo(1000, -1);
    expect(rms(y, 1000, y.length - 1000)).toBeCloseTo(0.5 / Math.SQRT2, 2);
    expect(resample(x, 48000, 48000)).toBe(x);
  });
  it('reads between samples (cubic)', () => {
    const x = Float32Array.from({ length: 10 }, (_, i) => i);
    expect(cubicAt(x, 4.5)).toBeCloseTo(4.5, 6);
    expect(cubicAt(x, -3)).toBe(0);
  });
  it('key lock: a tone slowed or sped up keeps its pitch', () => {
    const src = tone(440, 6);
    for (const rate of [0.92, 1, 1.08]) {
      const w = new Wsola(), H = Wsola.H, hops = Math.floor(4 * SR / H), L = new Float32Array(hops * H), R = new Float32Array(hops * H);
      for (let k = 0; k < hops; k++) w.hop(src, src, SR * 0.5 + k * H * rate, L, R, k * H);
      expect(Math.abs(pitch(L, SR) - 440)).toBeLessThan(3);
      expect(rms(L, H * 2, L.length - H)).toBeGreaterThan(0.3);   // no gaps
    }
  });
  it('the isolator: all at full, the sound whole; a band killed, more than 40 dB down', () => {
    const run = (x: Float32Array, g: [number, number, number]) => { const iso = new Isolator(SR); return Float32Array.from(x, v => iso.run(v, ...g)); };
    const lo = tone(60, 2), mid = tone(1000, 2), hi = tone(8000, 2);
    expect(rms(run(mid, [1, 1, 1]), SR)).toBeCloseTo(rms(mid, SR), 2);
    expect(rms(run(lo, [0, 1, 1]), SR) / rms(lo, SR)).toBeLessThan(0.01);
    expect(rms(run(mid, [1, 0, 1]), SR) / rms(mid, SR)).toBeLessThan(0.05);
    expect(rms(run(hi, [1, 1, 0]), SR) / rms(hi, SR)).toBeLessThan(0.01);
  });
  it('the limiter never goes over its ceiling', () => {
    const L = tone(200, 1, SR, 2), R = tone(300, 1, SR, 1.5), lim = new Limiter(SR), n = Math.floor(L.length / 64) * 64;
    lim.run(L, R, 0, n);
    let pk = 0;
    for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    expect(pk).toBeLessThanOrEqual(0.966 + 1e-6);   // (0.966 as a float32)
    expect(pk).toBeGreaterThan(0.9);
  });
});

describe('the tempo map', () => {
  it('is constant, ramps and jumps, and its time and beat are each other’s inverse', () => {
    const fixed = new TempoMap([{ beat: 0, bpm: 120 }]);
    expect(fixed.time(8)).toBe(4);
    const m = new TempoMap([{ beat: 0, bpm: 120 }, { beat: 64, bpm: 120 }, { beat: 128, bpm: 130 }, { beat: 128, bpm: 170 }, { beat: 200, bpm: 170 }]);
    for (const b of [0, 10, 64, 100, 127.9, 128, 150, 260]) expect(m.beat(m.time(b))).toBeCloseTo(b, 9);
    expect(m.bpmAt(96)).toBeCloseTo(125, 9);
    expect(m.bpmAt(129)).toBe(170);
    // 64 beats easing from 120 to 130 take between 64 beats at 120 and at 130.
    const d = m.time(128) - m.time(64);
    expect(d).toBeLessThan(32);
    expect(d).toBeGreaterThan(64 * 60 / 130);
  });
});

/** A song: a quiet 16 s intro, loud, drops at 60 s and 180 s, a quiet last 30 s. */
function song(id: string, bpm: number, duration = 300, beat0 = 0.12): PlanSong {
  const step = 2, curve = Array.from({ length: Math.ceil(duration / step) }, (_, i) => {
    const t = i * step;
    if (t < 16 || t >= duration - 30) return -30;
    if ((t >= 44 && t < 60) || (t >= 164 && t < 180)) return -22;   // the breakdowns before each drop
    return -9;
  });
  return { id, bpm, beat0, bar: 0, duration, curve, step, lufs: -9 - (id.charCodeAt(0) % 3) };
}
const opts = (style: SetPlan['style'], decks: 2 | 3 = 2): Parameters<typeof planSet>[1] => ({ style, decks, tempo: { mode: 'songs' }, keyLock: true });

describe('planning a set (ADR 0200)', () => {
  const songs = [song('a', 124), song('b', 125), song('c', 126), song('d', 124)];
  it('hands over on phrases, on the beat, at each style’s length', () => {
    for (const [style, bars] of [['single', 8], ['blend', 32]] as const) {
      const p = planSet(songs, opts(style));
      expect(p.items.map(i => i.id)).toEqual(['a', 'b', 'c', 'd']);
      for (let k = 0; k + 1 < p.items.length; k++) {
        const a = p.items[k], b = p.items[k + 1];
        expect(b.start % 4).toBe(0);
        expect((a.start + a.beats - b.start) / 4).toBe(bars);                  // the overlap
        expect(((b.start - a.start) / 4) % 16).toBe(0);                       // on a phrase of the outgoing song
        // The incoming song's in-point is its first downbeat.
        expect(b.in).toBeCloseTo(firstDown(songs[k + 1]), 9);
      }
    }
  });
  it('keeps hand-overs before the outro and inside the song', () => {
    const p = planSet(songs, opts('blend'));
    for (let k = 0; k + 1 < p.items.length; k++) {
      const it = p.items[k], end = it.in + it.beats * 60 / it.bpm;
      expect(end).toBeLessThanOrEqual(300 + 1e-6);
    }
  });
  it('lines up double drops', () => {
    const p = planSet(songs, opts('double'));
    const a = p.items[0], b = p.items[1];
    expect(a.fx?.style).toBe('double');
    const at = b.start + a.fx!.drop!;                                          // the mix beat of both drops
    const posA = a.in + (at - a.start) * 60 / a.bpm, posB = b.in + (at - b.start) * 60 / b.bpm;
    const nearest = (t: number, ds: number[]) => Math.min(...ds.map(d => Math.abs(d - t)));
    expect(nearest(posA, dropsOf(songs[0]))).toBeLessThan(0.01);
    expect(nearest(posB, dropsOf(songs[1]))).toBeLessThan(0.01);
  });
  it('alternates decks, and cuts between tempos far apart', () => {
    const p3 = planSet(songs, opts('blend', 3));
    expect(p3.items.map(i => i.deck)).toEqual([0, 1, 2, 0]);
    const p = planSet([song('a', 124), song('b', 174)], opts('blend'));
    expect(p.items[0].fx?.style).toBe('cut');
    expect(p.items[0].start + p.items[0].beats).toBe(p.items[1].start);
    expect(tempoOf(p).bpmAt(p.items[1].start + 1)).toBe(174);
  });
  it('trims each song towards the set’s middle loudness', () => {
    const p = planSet(songs, opts('blend'));
    const t = p.items.map(i => i.trim ?? 0);
    expect(Math.max(...t)).toBeLessThanOrEqual(6);
    expect(new Set(t).size).toBeGreaterThan(1);
  });
  it('holds the outgoing song’s tempo through a hand-over and eases between', () => {
    const p = planSet(songs, opts('blend')), m = tempoOf(p), [a, b, c] = p.items;
    expect(m.bpmAt(b.start + 4)).toBe(124);
    expect(m.bpmAt(c.start - 1)).toBeGreaterThan(124);
    expect(m.bpmAt(c.start + 4)).toBe(125);
    expect(knotsOf({ ...p, tempo: { mode: 'fixed', bpm: 128 } })).toEqual([{ beat: 0, bpm: 128 }]);
  });
});

describe('the mixer', () => {
  /** Two 40 s songs at 120 BPM: a 440 Hz and a 660 Hz tone. */
  const plan: SetPlan = { v: 1, decks: 2, style: 'blend', tempo: { mode: 'songs' }, at: '', items: [
    { id: 'x', deck: 0, bpm: 120, beat0: 0, in: 0, start: 0, beats: 48, keyLock: true, fx: { style: 'blend' } },
    { id: 'y', deck: 1, bpm: 120, beat0: 0, in: 0, start: 32, beats: 40, keyLock: false },
  ] };
  const pcm: Record<string, Pcm> = { x: { l: tone(440, 40), r: tone(440, 40) }, y: { l: tone(660, 40), r: tone(660, 40) } };
  const src = { get: (id: string) => pcm[id] ?? null };
  it('renders the same samples in blocks of any size', () => {
    const m1 = new Mixer(plan, src), m2 = new Mixer(plan, src);
    expect(m1.length).toBe(Math.ceil(36 * SR));
    const a = { l: new Float32Array(m1.length), r: new Float32Array(m1.length) }, b = { l: new Float32Array(m1.length), r: new Float32Array(m1.length) };
    expect(m1.render(a.l, a.r, m1.length)).toBe(m1.length);
    let off = 0;
    for (const n of [1, 777, 4096, 31, 100_000]) { off += m2.render(b.l, b.r, Math.min(n, m1.length - off), off); }
    while (off < m1.length) off += m2.render(b.l, b.r, 9999, off);
    expect(firstDiff(a.l, b.l)).toBe(-1);
    expect(firstDiff(a.r, b.r)).toBe(-1);
    expect(m1.render(a.l, a.r, 10)).toBe(0);                                  // the end
  });
  it('plays the first song, then both over the hand-over, then the second', () => {
    const m = new Mixer(plan, src), L = new Float32Array(m.length), R = new Float32Array(m.length);
    m.render(L, R, m.length);
    const at = (s: number) => L.subarray(Math.round(s * SR), Math.round((s + 1) * SR));
    expect(pitch(at(5), SR)).toBeCloseTo(440, -1);
    expect(pitch(at(30), SR)).toBeCloseTo(660, -1);
    expect(rms(at(20))).toBeGreaterThan(0.2);                                  // the blend, equal power
    expect(controlsAt(plan.items, 0, 40).gain).toBeCloseTo(Math.SQRT1_2, 6);   // half way through beats 32–48
    expect(m.needed(0, SR * 5)).toEqual(['x']);
    expect(m.needed(SR * 17, SR * 18).sort()).toEqual(['x', 'y']);
  });
  it('seeks: from a frame on, the same as rendering all the way', () => {
    const all = new Mixer(plan, src), L = new Float32Array(all.length), R = new Float32Array(all.length);
    all.render(L, R, all.length);
    const m = new Mixer(plan, { get: (id: string) => id === 'y' ? pcm.y : null });   // the varispeed song only: no history
    const l2 = new Float32Array(all.length), r2 = new Float32Array(all.length);
    m.render(l2, r2, all.length);
    const s = new Mixer(plan, { get: (id: string) => id === 'y' ? pcm.y : null }), f = Math.round(25 * SR);
    s.seek(f);
    const l3 = new Float32Array(SR), r3 = new Float32Array(SR);
    s.render(l3, r3, SR);
    // The limiter starts afresh: the same once it has settled (the signal is under its ceiling: from the start).
    expect(firstDiff(l3.subarray(2000, 3000), l2.subarray(f + 2000, f + 3000))).toBe(-1);
  });
});

describe('the tracklist', () => {
  it('times each song where it comes in', () => {
    const p = planSet([song('a', 124), song('b', 125), song('c', 126)], opts('blend'));
    const t = timesOf(p);
    expect(t[0]).toBe(0);
    expect(t[1]).toBeGreaterThan(60);
    expect(clock(3723)).toBe('1:02:03');
    expect(clock(83)).toBe('1:23');
    const text = tracklist(p, id => ({ artist: 'Artist ' + id, title: 'Song ' + id }));
    expect(text.split('\n')[0]).toBe('0:00 Artist a – Song a');
    expect(text.split('\n')).toHaveLength(3);
  });
});
