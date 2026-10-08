/* The duplicates' matching, recorded for GLUE Home's (ADR 0164): synthetic fingerprints (copies at an offset, noisy
   copies near the threshold, a cropped one, unrelated songs, quiet frames) and what the website's matcher finds, all
   pairs and only the new songs'. `crates/glue-engine/tests/dupes_golden.rs` replays them byte for byte.
   GOLDEN=1 npx vitest run tests/dupes.golden.test.ts after changing src/core/library/duplicates.ts, then port it. */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findMatchesFor, findSameRecordings } from '../src/core/library/duplicates';
import { encodeFingerprint } from '../src/store/fingerprints';
import type { Fingerprint } from '../src/core/audio/fingerprint';

const OUT = join(__dirname, 'golden', 'dupes');

function rng(seed: number) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function songs(): { id: string; fp: Fingerprint }[] {
  const r = rng(20261008), word = () => (r() * 4294967296) >>> 0;
  const make = (n: number): Fingerprint => {
    const words = new Uint32Array(n), loud = new Uint8Array(n);
    for (let i = 0; i < n; i++) { words[i] = word(); loud[i] = r() < 0.06 ? Math.floor(r() * 60) : 120 + Math.floor(r() * 136); }
    return { words, loud };
  };
  // A copy: shifted by `shift` frames (frames dropped or added at the start), each bit flipped with `noise`, `from`..`to`.
  const copy = (src: Fingerprint, shift: number, noise: number, from = 0, to = src.words.length): Fingerprint => {
    const n = to - from + Math.max(0, shift), words = new Uint32Array(n), loud = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const s = from + i - Math.max(0, shift) + Math.max(0, -shift);
      if (s < 0 || s >= src.words.length) { words[i] = word(); loud[i] = 200; continue; }
      let w = src.words[s];
      for (let b = 0; b < 32; b++) if (r() < noise) w ^= 1 << b;
      words[i] = w >>> 0; loud[i] = src.loud[s];
    }
    return { words, loud };
  };
  const a = make(3000), b = make(2600), c = make(3200), d = make(1500);
  return [
    { id: 'a1', fp: a }, { id: 'a2', fp: copy(a, 7, 0.02) }, { id: 'a3', fp: copy(a, -12, 0.08) },
    { id: 'b1', fp: b }, { id: 'b2', fp: copy(b, 0, 0.27) }, { id: 'b3', fp: copy(b, 3, 0.33) },
    { id: 'c1', fp: c }, { id: 'c2', fp: copy(c, 40, 0.05, 800, 2400) },
    { id: 'd1', fp: d }, { id: 'd2', fp: copy(d, 2, 0.01, 0, 350) },   // too short in common
    { id: 'u1', fp: make(2800) }, { id: 'u2', fp: make(3100) }, { id: 'u3', fp: make(900) },
  ];
}

describe('the duplicates’ matching, recorded for GLUE Home’s', () => {
  it('records the matches (or matches the recording)', () => {
    const all = songs();
    const fresh = ['a3', 'b2', 'c2', 'u3'];
    const g = {
      songs: all.map(s => ({ id: s.id, fp: Buffer.from(encodeFingerprint(s.fp)).toString('base64') })),
      all: findSameRecordings(all),
      fresh, forFresh: findMatchesFor(all, new Set(fresh)),
    };
    expect(g.all.map(m => m.a + '+' + m.b)).toEqual(expect.arrayContaining(['a1+a2', 'a1+a3', 'a2+a3', 'b1+b2', 'c1+c2']));
    expect(g.all.some(m => m.a.startsWith('u') || m.b.startsWith('u') || m.a === 'b3' || m.b === 'b3' || m.b === 'd2')).toBe(false);
    mkdirSync(OUT, { recursive: true });
    const file = join(OUT, 'matches.json'), text = JSON.stringify(g, null, 1) + '\n';
    if (process.env.GOLDEN || !existsSync(file)) writeFileSync(file, text);
    else expect(text, 'GOLDEN=1 npx vitest run tests/dupes.golden.test.ts, then port the change to Rust').toBe(readFileSync(file, 'utf8'));
  });
});
