import { describe, expect, it } from 'vitest';
import { cubicAt, Isolator, Limiter, resample, Wsola } from '../src/core/sets/dsp';
import { TempoMap, knotsOf, tempoOf } from '../src/core/sets/tempo';
import { bassBars, dropsOf, firstDown, introOf, planSet, type PlanSong } from '../src/core/sets/plan';
import { Mixer, type Pcm } from '../src/core/sets/mixer';
import { bassSwapAt, controlsAt } from '../src/core/sets/automation';
import { clock, timesOf, tracklist } from '../src/core/sets/tracklist';
import { MIX_RATE, type SetPlan } from '../src/core/sets/types';
import { clearLows, moveEnd, moveSong, moveSongs, setLows, trimIn, valid } from '../src/core/sets/edit';

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
  it('the limiter turns a steady loud tone down without distorting it (no steps in its gain)', () => {
    const x = tone(100, 1, SR, 2), L = x.slice(), R = x.slice(), lim = new Limiter(SR);
    lim.run(L, R, 0, L.length);
    // Once it has settled, the tone comes out whole: the input scaled, LOOK samples late.
    let err = 0;
    for (let i = SR / 2; i < L.length; i++) err = Math.max(err, Math.abs(L[i] - x[i - Limiter.LOOK] * 0.966 / 2));
    expect(err).toBeLessThan(2e-3);
    // And a sudden loud burst is turned down ahead of it, gliding: no jump between two samples beyond the signal's own.
    const y = new Float32Array(SR / 2), z = new Float32Array(SR / 2);
    for (let i = 0; i < y.length; i++) y[i] = z[i] = (i < SR / 4 ? 0.3 : 3) * Math.sin(2 * Math.PI * 50 * i / SR);
    const ly = y.slice(), lz = z.slice();
    new Limiter(SR).run(ly, lz, 0, ly.length);
    let jump = 0;
    for (let i = 1; i < ly.length; i++) jump = Math.max(jump, Math.abs(ly[i] - ly[i - 1]));
    expect(jump).toBeLessThan(0.966 * 2 * Math.PI * 50 / SR * 2);   // a step in gain here would jump by ~0.2
  });
  it('key lock at the song’s own tempo gives the song back unchanged', () => {
    const src = Float32Array.from({ length: SR * 3 }, (_, i) => Math.sin(i * 0.031) * 0.4 + Math.sin(i * 0.0173) * 0.3 + (((i * 7919) % 1000) / 1000 - 0.5) * 0.1);
    const w = new Wsola(), H = Wsola.H, hops = 100, L = new Float32Array(hops * H), R = new Float32Array(hops * H);
    for (let k = 0; k < hops; k++) w.hop(src, src, 5000.3 + k * H, L, R, k * H);
    let err = 0;
    for (let i = H; i < hops * H; i++) err = Math.max(err, Math.abs(L[i] - src[5000 + i]));
    expect(err).toBeLessThan(1e-5);
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

describe('shaping a set by hand (ADR 0201)', () => {
  const songs = [song('a', 124), song('b', 125), song('c', 126), song('d', 124)];
  const len = (id: string) => songs.find(s => s.id === id)?.duration;
  for (const [style, decks] of [['single', 2], ['blend', 2], ['double', 2], ['blend', 3]] as const) {
    it(`a ${style} plan on ${decks} decks holds together`, () => expect(valid(planSet(songs, opts(style, decks)).items, len)).toBe(true));
  }
  it('moves a song and the ones after it by whole bars; the one before plays on', () => {
    const p = planSet(songs, opts('blend')), r = moveSong(p.items, 1, -17, len);
    expect(r.d).toBe(-16);
    expect(r.items[0]).toEqual(p.items[0]);
    for (let j = 1; j < 4; j++) expect(r.items[j].start).toBe(p.items[j].start - 16);
    expect(r.items[1].in).toBe(p.items[1].in);
    expect(valid(r.items, len)).toBe(true);
  });
  it('clamps a move to what fits: no silence between songs, nothing on one deck twice', () => {
    const p = planSet(songs, opts('blend')), r = moveSong(p.items, 1, 4000, len);
    expect(r.items[1].start).toBeLessThanOrEqual(p.items[0].start + p.items[0].beats);   // still in while the first plays
    expect(valid(r.items, len)).toBe(true);
    const back = moveSong(p.items, 2, -4000, len);
    expect(back.items[2].start).toBeGreaterThanOrEqual(p.items[0].start + p.items[0].beats);   // deck 1 free again
    expect(moveSong(p.items, 0, 8, len).d).toBe(0);
  });
  it('trims a song’s in-point (later in the mix and in its file, its end kept) and moves its end', () => {
    const p = planSet(songs, opts('blend')), a = p.items[1], r = trimIn(p.items, 1, 8, len), b = r.items[1];
    expect(r.d).toBe(8);
    expect([b.start, b.beats, b.start + b.beats]).toEqual([a.start + 8, a.beats - 8, a.start + a.beats]);
    expect(b.in).toBeCloseTo(a.in + 8 * 60 / a.bpm, 9);
    expect(trimIn(p.items, 1, -4000, len).items[1].in).toBeGreaterThanOrEqual(0);
    const e = moveEnd(p.items, 0, 16, len);
    expect(e.items[0].beats).toBe(p.items[0].beats + 16);
    const last = moveEnd(p.items, 3, 4000, len).items[3];
    expect(last.in + last.beats * 60 / last.bpm).toBeLessThanOrEqual(300.05);
  });
});

describe('a set’s length and 3-deck layering (ADR 0202)', () => {
  const songs = [song('a', 124), song('b', 125), song('c', 126), song('d', 124), song('e', 125)];
  const len = (id: string) => songs.find(s => s.id === id)?.duration;
  const lengthOf = (p: SetPlan) => { const l = p.items[p.items.length - 1]; return tempoOf(p).time(l.start + l.beats); };
  it('fits a length asked for: every song shorter first, then songs off the end', () => {
    const full = planSet(songs, opts('blend')), whole = lengthOf(full);
    const shorter = planSet(songs, { ...opts('blend'), length: whole * 0.8 });
    expect(shorter.items).toHaveLength(5);
    expect(lengthOf(shorter)).toBeLessThanOrEqual(whole * 0.8);
    expect(lengthOf(shorter)).toBeGreaterThan(whole * 0.6);
    expect(shorter.length).toBe(whole * 0.8);
    expect(valid(shorter.items, len)).toBe(true);
    const few = planSet(songs, { ...opts('blend'), length: whole * 0.35 });
    expect(few.items.length).toBeLessThan(5);
    expect(few.items.map(i => i.id)).toEqual(songs.slice(0, few.items.length).map(s => s.id));   // off the end
    expect(lengthOf(few)).toBeLessThanOrEqual(whole * 0.35);
    expect(planSet(songs, { ...opts('blend'), length: whole * 2 })).toMatchObject({ items: full.items });
  });
  it('layers songs that sound alike on 3 decks: two along, then a third in before the first goes', () => {
    const p = planSet(songs, { ...opts('blend', 3), like: () => 0.9 }), it = p.items;
    expect(valid(it, len)).toBe(true);
    expect(it[0].fx?.style).toBe('layer');
    expect(it[0].start + it[0].beats - it[1].start).toBeGreaterThanOrEqual(192);          // along for 48 bars
    expect(it[2].start).toBeLessThanOrEqual(it[0].start + it[0].beats - 64);              // three at once
    // One song's bass at a time, all through.
    const last = it[it.length - 1];
    for (let b = 0; b < last.start + last.beats; b += 1) {
      const bass = it.map((_, i) => controlsAt(it, i, b)).filter(c => c.gain > 0.01 && c.low > 0.5).length;
      expect(bass, 'beat ' + b).toBeLessThanOrEqual(1);
    }
    // Not alike: not layered.
    expect(planSet(songs, { ...opts('blend', 3), like: () => 0.3 }).items.some(i => i.fx?.style === 'layer')).toBe(false);
  });
});

describe('whose bass plays (ADR 0203)', () => {
  const songs = [song('a', 124), song('b', 125)];
  const base = planSet(songs, opts('blend'));
  const at = (fx: Partial<NonNullable<SetPlan['items'][0]['fx']>>) => {
    const items = base.items.map((it, i) => i === 0 ? { ...it, fx: { ...it.fx!, ...fx } } : it);
    const s = items[1].start, e = items[0].start + items[0].beats;
    return (b: number) => [controlsAt(items, 0, s + b).low, controlsAt(items, 1, s + b).low, e - s] as const;
  };
  it('the style’s by default: the outgoing song’s, then the incoming one’s on the middle bar', () => {
    const f = at({ swap: undefined }), len = f(0)[2];
    expect(f(1).slice(0, 2)).toEqual([1, 0]);
    expect(f(len - 1).slice(0, 2)).toEqual([0, 1]);
    expect(bassSwapAt({ style: 'bassSwap' }, len)).toBe(Math.round(len / 8) * 4);
  });
  it('the outgoing song’s, the incoming one’s, or both all through', () => {
    for (const [bass, want] of [['out', [1, 0]], ['in', [0, 1]], ['both', [1, 1]]] as const) {
      const f = at({ bass }), len = f(0)[2];
      for (const b of [1, len / 2, len - 1]) expect(f(b).slice(0, 2), bass + ' at ' + b).toEqual(want);
      expect(bassSwapAt({ style: 'bassSwap', bass }, len)).toBeNull();
    }
  });
  it('changes hands where it was moved, in any style', () => {
    const f = at({ style: 'blend', swap: 8 });
    expect(f(4).slice(0, 2)).toEqual([1, 0]);
    expect(f(12).slice(0, 2)).toEqual([0, 1]);
    expect(bassSwapAt({ style: 'blend', swap: 8 }, 64)).toBe(8);
    expect(bassSwapAt({ style: 'blend' }, 64)).toBeNull();
  });
});

/** A song whose lows are a kick alone (falling away between the beats) for `intro` bars, then a bassline that holds,
    with a breakdown (no lows at all) of 8 bars at bar `brk`; the Prepare waveform's lows at 150 points a second. */
function bassy(id: string, bpm: number, intro: number, brk = 64, duration = 300): PlanSong {
  const rate = 150, beat = 60 / bpm, data = new Uint8Array(Math.floor(duration * rate)), beat0 = 0.1;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate - beat0, bar = Math.floor(t / (4 * beat)), ph = (t / beat) % 1;
    if (t < 0 || (bar >= brk && bar < brk + 8)) continue;
    const kick = ph < 0.2 ? 1 : 0.02, line = bar >= intro ? 0.7 : 0;
    data[i] = Math.round(255 * Math.pow(Math.max(kick, line), 0.75));
  }
  const step = 2, curve = Array.from({ length: Math.ceil(duration / step) }, (_, i) => i * step >= duration - 30 ? -30 : -9);
  return { id, bpm, beat0, bar: 0, duration, curve, step, lufs: -9, low: { data, rate } };
}

describe('drops from the lows (ADR 0205)', () => {
  it('finds where the bassline comes in, and where it comes back after a breakdown', () => {
    const s = bassy('a', 124, 32);
    expect(bassBars(s)!.slice(30, 34).map(x => x > 0.45)).toEqual([false, false, true, true]);
    expect(introOf(s)).toBe(32);
    expect(introOf(bassy('b', 124, 0))).toBe(0);
    const bar = 240 / 124;
    expect(dropsOf(s).map(t => Math.round((t - firstDown(s)) / bar))).toEqual([32, 72]);
  });
  it('brings the incoming song in so its drop lands where the bass changes hands', () => {
    for (const intro of [32, 8]) {
      const songs = [bassy('a', 124, 16), bassy('b', 124, intro), bassy('c', 125, 16)];
      const p = planSet(songs, opts('blend'));
      for (let k = 0; k + 1 < p.items.length; k++) {
        const a = p.items[k], b = p.items[k + 1], B = songs.find(x => x.id === b.id)!;
        const swap = a.fx!.swap!, dropBeat = b.start + (barOfTest(B, introOf(B)!) - b.in) * b.bpm / 60;
        expect(b.start + swap, intro + ': the bass changes hands on the drop').toBeCloseTo(dropBeat, 6);
        // The outgoing song's bass is never cut while the incoming one is in its intro.
        for (let x = b.start; x < a.start + a.beats; x += 4) {
          const out = controlsAt(p.items, k, x).low, inn = controlsAt(p.items, k + 1, x).low;
          if (out < 0.5) expect(inn, 'someone has the bass at ' + x).toBe(1);
          if (x < dropBeat) expect(inn).toBe(0);
        }
      }
      // A long intro: it comes in 16 bars before its drop, the middle of a 32-bar swap; a short one from its start.
      expect(p.items[1].in).toBeCloseTo(intro === 32 ? barOfTest(songs[1], 16) : firstDown(songs[1]), 6);
    }
  });
});
const barOfTest = (s: PlanSong, n: number) => firstDown(s) + n * 240 / s.bpm;

describe('the bass by hand over parts of a song (ADR 0205)', () => {
  const songs = [song('a', 124), song('b', 125), song('c', 126)], len = (id: string) => songs.find(s => s.id === id)?.duration;
  const base = planSet(songs, opts('blend'));
  it('cuts and opens it over whole bars, over what the hand-overs do', () => {
    let items = setLows(base.items, 1, 30, 63, false);
    expect(items[1].lows).toEqual([{ from: 32, to: 64, on: false }]);
    const b1 = items[1].start;
    expect(controlsAt(items, 1, b1 + 40).low).toBe(0);
    expect(controlsAt(items, 1, b1 + 70).low).toBe(1);
    // Opened inside it: split in three; then the same again joins up.
    items = setLows(items, 1, 40, 48, true);
    expect(items[1].lows).toEqual([{ from: 32, to: 40, on: false }, { from: 40, to: 48, on: true }, { from: 48, to: 64, on: false }]);
    expect(setLows(items, 1, 40, 48, false)[1].lows).toEqual([{ from: 32, to: 64, on: false }]);
    // Opened in the incoming hand-over, where the style holds it back.
    const s = base.items[1].start, opened = setLows(base.items, 1, 0, 8, true);
    expect(controlsAt(base.items, 1, s + 2).low).toBe(0);
    expect(controlsAt(opened, 1, s + 2).low).toBe(1);
    expect(clearLows(items, 1, 1)[1].lows).toHaveLength(2);
    expect(clearLows(items, 1)[1].lows).toBeUndefined();
  });
  it('stays where it plays when the song is trimmed, and so does where the bass changes hands', () => {
    const items = setLows(base.items, 1, 64, 96, false), r = trimIn(items, 1, 16, len);
    expect(r.d).toBe(16);
    expect(r.items[1].lows).toEqual([{ from: 48, to: 80, on: false }]);
    expect(r.items[0].start + 0 + r.items[1].start - r.items[0].start + r.items[0].fx!.swap!).toBe(items[1].start + items[0].fx!.swap!);
  });
  it('moves several songs together, the others where they are', () => {
    const r = moveSongs(base.items, [1, 2], 16, len);
    expect(r.d).toBe(16);
    expect(r.items.map(i => i.start)).toEqual([base.items[0].start, base.items[1].start + 16, base.items[2].start + 16]);
    const one = moveSongs(base.items, [1], -16, len);
    expect(one.items[2].start).toBe(base.items[2].start);
    expect(valid(one.items, len)).toBe(true);
  });
});
