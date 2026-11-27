import { describe, expect, it } from 'vitest';
import { curveOf, fromB64, soundProfile, toB64, TIMBRE_LEN } from '../src/core/audio/sound';

const SR = 44100;
function rnd(seed: number) { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296 * 2 - 1; }; }
/** `secs` seconds made by f(t, i). */
function make(secs: number, f: (t: number, i: number) => number) { const x = new Float32Array(SR * secs); for (let i = 0; i < x.length; i++) x[i] = f(i / SR, i); return x; }
const noise = (amp: number, seed = 1) => { const r = rnd(seed); return make(20, () => amp * r()); };
const sine = (amp: number, hz: number) => make(20, t => amp * Math.sin(2 * Math.PI * hz * t));
/** Clicks (short noise bursts) `rate` times a second. */
const clicks = (rate: number) => { const r = rnd(3), per = Math.round(SR / rate); return make(20, (_, i) => (i % per) < 200 ? 0.8 * r() : 0.001 * r()); };

describe('the sound profile (ADR 0197)', () => {
  it('base64 round-trips', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 200]) {
      const u = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
      expect(Array.from(fromB64(toB64(u)))).toEqual(Array.from(u));
    }
    expect(toB64(new Uint8Array([77, 97, 110]))).toBe('TWFu');
  });
  it('says nothing about a song too short or silent', () => {
    expect(soundProfile(new Float32Array(SR * 3), SR)).toBeNull();
    expect(soundProfile(new Float32Array(SR * 20), SR)).toBeNull();
  });
  it('measures loudness: twice the level is 6 dB louder, about −3 LUFS for a full-scale 1 kHz sine', () => {
    const a = soundProfile(sine(0.25, 1000), SR)!, b = soundProfile(sine(0.5, 1000), SR)!;
    expect(b.lufs - a.lufs).toBeCloseTo(6.02, 1);
    const full = soundProfile(sine(1, 1000), SR)!;
    expect(full.lufs).toBeGreaterThan(-5);
    expect(full.lufs).toBeLessThan(-1);
  });
  it('tells a bright noise from a low hum by the timbre', () => {
    const n = soundProfile(noise(0.3), SR)!, s = soundProfile(sine(0.3, 80), SR)!;
    expect(n.timbre).toHaveLength(TIMBRE_LEN);
    const [cen, flat, low, high] = n.timbre.slice(-4), [cen2, flat2, low2, high2] = s.timbre.slice(-4);
    expect(cen).toBeGreaterThan(cen2);
    expect(flat).toBeGreaterThan(flat2);
    expect(low2).toBeGreaterThan(0.9);
    expect(high).toBeGreaterThan(high2);
    expect(low).toBeLessThan(0.1);
  });
  it('counts onsets: more clicks, a higher rate', () => {
    const slow = soundProfile(clicks(2), SR)!, fast = soundProfile(clicks(6), SR)!;
    expect(slow.onsets).toBeGreaterThan(1.2);
    expect(slow.onsets).toBeLessThan(2.8);
    expect(fast.onsets).toBeGreaterThan(slow.onsets * 2);
  });
  it('draws the loudness over time: a quiet intro, then loud', () => {
    const r = rnd(9), x = make(40, t => (t < 10 ? 0.02 : 0.5) * r());
    const p = soundProfile(x, SR)!, c = curveOf(p);
    expect(p.step).toBeCloseTo(2, 1);
    expect(c.length).toBeGreaterThanOrEqual(19);
    expect(c[1]).toBeLessThan(c[c.length - 2] - 20);
  });
  it('works at 96 kHz the same as at 44.1 kHz (nothing above 24 kHz counts)', () => {
    const at = (sr: number) => { const x = new Float32Array(sr * 20); for (let i = 0; i < x.length; i++) x[i] = 0.3 * Math.sin(2 * Math.PI * 1000 * i / sr) + 0.1 * Math.sin(2 * Math.PI * 7000 * i / sr); return soundProfile(x, sr)!; };
    expect(Math.abs(at(96000).lufs - at(44100).lufs)).toBeLessThan(1);
  });
});
