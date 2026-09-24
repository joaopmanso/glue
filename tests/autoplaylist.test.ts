import { describe, expect, it } from 'vitest';
import { bpmFit, generate, keyFit, replaceSlot, type AutoOptions, type Candidate } from '../src/core/library/autoplaylist';
import type { Key } from '../src/core/types';

const K = (tonic: number, mode: 'major' | 'minor'): Key => ({ tonic, mode });
const Am = K(9, 'minor'), Em = K(4, 'minor'), Dm = K(2, 'minor'), C = K(0, 'major'), Fsm = K(6, 'minor');   // 8A 9A 7A 8B 11A
const opts = (o: Partial<AutoOptions> = {}): AutoOptions => ({ count: 20, startBpm: 120, endBpm: 128, bpmTolerance: 0.04, halfDouble: true, harmonic: 'prefer', useRatings: true, minRating: 0, sameGenre: null, randomness: 0.35, seed: 1, ...o });

/** 200 tracks: tempos 100–140, keys all round the wheel, ratings 0–5. */
function collection(): Candidate[] {
  let s = 42; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  return Array.from({ length: 200 }, (_, i) => ({ id: 't' + i, bpm: Math.round((100 + r() * 40) * 10) / 10, key: K(Math.floor(r() * 12), r() < 0.5 ? 'major' : 'minor'), rating: Math.floor(r() * 6), genre: r() < 0.5 ? 'House' : 'Techno', duration: 300 }));
}

describe('automatic playlists (ADR 0029)', () => {
  it('scores harmonic transitions on the Camelot wheel', () => {
    expect(keyFit(Am, Am)).toBe(1);
    expect(keyFit(Am, Em)).toBe(0.9);    // 8A → 9A
    expect(keyFit(Am, Dm)).toBe(0.9);    // 8A → 7A
    expect(keyFit(Am, C)).toBe(0.85);    // 8A → 8B (relative major)
    expect(keyFit(Am, K(11, 'minor'))).toBe(0.5);   // 8A → 10A, energy boost
    expect(keyFit(Am, Fsm)).toBe(0);     // 8A → 11A clashes
  });
  it('matches tempo, with half and double time when allowed', () => {
    expect(bpmFit(124, 124, 0.04, false)).toBe(1);
    expect(bpmFit(62, 124, 0.04, false)!).toBeLessThan(0);
    expect(bpmFit(62, 124, 0.04, true)).toBe(1);
  });
  it('follows the BPM ramp, starts with the seed, includes the must-haves, never repeats', () => {
    const pool = collection();
    pool[0] = { ...pool[0], bpm: 120, key: Am, rating: 3 };
    pool[1] = { ...pool[1], bpm: 127, key: Em, rating: 1 };
    const res = generate(pool, 't0', ['t1'], opts());
    const ids = res.slots.map(s => s.id);
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe('t0');
    expect(ids).toContain('t1');
    expect(ids.indexOf('t1')).toBeGreaterThan(12);          // 127 BPM belongs near the end of 120 → 128
    expect(new Set(ids).size).toBe(20);
    for (const s of res.slots) if (s.bpmFit != null) expect(s.bpmFit).toBeGreaterThanOrEqual(0);
  });
  it('prefers highly rated tracks unless told not to', () => {
    const pool = collection();
    const avg = (o: AutoOptions) => { const r = generate(pool, null, [], o); return r.slots.reduce((n, s) => n + (pool.find(c => c.id === s.id)!.rating ?? 0), 0) / r.slots.length; };
    const rated = avg(opts({ startBpm: null, endBpm: null, harmonic: 'off' }));
    const unrated = avg(opts({ startBpm: null, endBpm: null, harmonic: 'off', useRatings: false }));
    expect(rated).toBeGreaterThan(4.5);
    expect(unrated).toBeLessThan(rated);
  });
  it('strict harmonic mixing only makes compatible transitions', () => {
    const res = generate(collection(), null, [], opts({ harmonic: 'strict', count: 12, startBpm: 110, endBpm: 130, bpmTolerance: 0.08 }));
    for (const s of res.slots.slice(1)) expect(s.keyFit ?? 0).toBeGreaterThanOrEqual(0.5);
  });
  it('is random but repeatable: a new seed gives a different playlist, the same seed the same one', () => {
    const pool = collection();
    const a = generate(pool, null, [], opts({ seed: 1 })).slots.map(s => s.id);
    const b = generate(pool, null, [], opts({ seed: 2 })).slots.map(s => s.id);
    const a2 = generate(pool, null, [], opts({ seed: 1 })).slots.map(s => s.id);
    expect(a2).toEqual(a);
    expect(b).not.toEqual(a);
  });
  it('respects filters and says when it had to relax the rules', () => {
    const pool = collection();
    const res = generate(pool, null, [], opts({ minRating: 4, sameGenre: 'house', count: 10 }));
    for (const s of res.slots) { const c = pool.find(x => x.id === s.id)!; expect(c.rating).toBeGreaterThanOrEqual(4); expect(c.genre).toBe('House'); }
    const tiny = generate(pool.slice(0, 5), null, [], opts({ count: 20 }));
    expect(tiny.slots.length).toBe(5);
    expect(tiny.relaxed.join(' ')).toContain('only 5');
  });
  it('re-rolls a single slot without repeating a track', () => {
    const pool = collection(), res = generate(pool, null, [], opts({ count: 10 })), ids = res.slots.map(s => s.id);
    const alt = replaceSlot(pool, ids, 4, opts({ count: 10 }), res.slots[4].bpmTarget);
    expect(alt).not.toBeNull();
    expect(ids).not.toContain(alt);
  });
});
