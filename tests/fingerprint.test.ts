import { describe, expect, it } from 'vitest';
import { ber, fingerprint, FP_FRAME_SEC, popcount } from '../src/core/audio/fingerprint';
import { findSameRecordings, groupMatches } from '../src/core/library/duplicates';

/** A seeded, non-repeating "track": random notes with decaying partials plus noise hits. */
function track(seed: number, sr: number, secs: number): Float32Array {
  let s = seed >>> 0;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const x = new Float32Array(Math.floor(sr * secs)), step = 0.25;
  for (let t0 = 0; t0 < secs; t0 += step) {
    const f = 110 * Math.pow(2, Math.floor(r() * 36) / 12), amp = 0.1 + r() * 0.25, hit = r() < 0.4;
    const a = Math.floor(t0 * sr), b = Math.min(x.length, a + Math.floor(sr * 0.6));
    for (let i = a; i < b; i++) {
      const t = (i - a) / sr, env = Math.exp(-t * 6);
      x[i] += amp * env * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t));
      if (hit && t < 0.05) x[i] += 0.2 * (r() - 0.5) * Math.exp(-t * 60);
    }
  }
  return x;
}
/** What a different rip does: leading silence, level change, noise, coarse quantisation, another sample rate. */
function rip(x: Float32Array, sr: number, newSr: number, lead: number): Float32Array {
  let s = 7;
  const noise = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296 - 0.5; };
  const n = Math.floor((x.length / sr + lead) * newSr), out = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const t = k / newSr - lead, p = t * sr, i = Math.floor(p), f = p - i;
    const v = i >= 0 && i + 1 < x.length ? x[i] * (1 - f) + x[i + 1] * f : 0;
    out[k] = Math.round((0.6 * v + 0.01 * noise()) * 128) / 128;   // −4.4 dB, noise, 8-bit steps
  }
  return out;
}

describe('acoustic fingerprints (ADR 0025)', () => {
  const A = track(1, 44100, 70), B = rip(A, 44100, 48000, 1.3), C = track(2, 44100, 70);
  const fa = fingerprint(A, 44100), fb = fingerprint(B, 48000), fc = fingerprint(C, 44100);

  it('counts bits exactly', () => {
    expect(popcount(0)).toBe(0); expect(popcount(0xffffffff)).toBe(32); expect(popcount(0x80000001)).toBe(2);
  });
  it('makes about 21.5 words a second', () => {
    expect(fa.words.length).toBeGreaterThan(70 / FP_FRAME_SEC - 30);
    expect(fa.words.length).toBeLessThan(70 / FP_FRAME_SEC + 2);
  });
  it('matches a different rip of the same audio, not a different track', () => {
    const found = findSameRecordings([{ id: 'a', fp: fa }, { id: 'b', fp: fb }, { id: 'c', fp: fc }]);
    expect(found.map(m => [m.a, m.b].sort().join('+'))).toEqual(['a+b']);
    expect(found[0].ber).toBeLessThan(0.2);
    expect(found[0].overlapSec).toBeGreaterThan(40);
    expect(groupMatches(found)).toEqual([['a', 'b']]);
    // Unrelated audio sits near 50 % at any alignment.
    let lo = 1;
    for (let off = -200; off <= 200; off += 7) lo = Math.min(lo, ber(fa, fc, off).ber);
    expect(lo).toBeGreaterThan(0.4);
  });
});
