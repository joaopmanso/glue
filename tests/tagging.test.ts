import { describe, expect, it } from 'vitest';
import { addTags, cleanTag, foundTags, hasTag, removeTags, tagCounts, tagsOf, uniqTags, venn } from '../src/core/library/tagging';
import { insights, tagOverlap } from '../src/core/library/insights';
import { generate, tagFit, type AutoOptions, type Candidate } from '../src/core/library/autoplaylist';

describe('tags (ADR 0032)', () => {
  it('tidies and dedupes tags without case', () => {
    expect(cleanTag('  #Peak   time ')).toBe('Peak time');
    expect(uniqTags(['Warm up', 'warm UP', '', 'Vocal'])).toEqual(['Warm up', 'Vocal']);
    expect(addTags(['A'], ['a', 'B'])).toEqual(['A', 'B']);
    expect(removeTags(['A', 'B'], ['b'])).toEqual(['A']);
    expect(hasTag(['Peak'], 'PEAK')).toBe(true);
  });
  it('finds tags already in files: Grouping, rekordbox My Tag comments, hashtags', () => {
    expect(foundTags({ grouping: 'Peak; Vocal / Dark', comment: '' })).toEqual(['Peak', 'Vocal', 'Dark']);
    expect(foundTags({ comment: '/* Warm up / Deep */ nice #opener and #b2b-set, not a#hash' })).toEqual(['Warm up', 'Deep', 'opener', 'b2b-set']);
    // The user's own list wins once it exists (even empty).
    expect(tagsOf({ tags: [], grouping: 'Peak' })).toEqual([]);
    expect(tagsOf({ grouping: 'Peak' })).toEqual(['Peak']);
  });
  it('counts Venn regions and tag use', () => {
    const tt = [['A'], ['A', 'B'], ['B', 'C'], ['a', 'b', 'c'], []];
    expect(venn(tt, ['A', 'B', 'C'])).toEqual([1, 1, 0, 1, 0, 0, 1, 1]);   // none, A, B, AB, C, AC, BC, ABC
    expect(tagCounts(tt)[0]).toEqual(['A', 3]);
  });
});

describe('playlist insights', () => {
  it('sums length, tempo, harmonic mixes, quality and tag overlap', () => {
    const Am = { tonic: 9, mode: 'minor' as const }, Em = { tonic: 4, mode: 'minor' as const }, Gm = { tonic: 7, mode: 'minor' as const };
    const ts = [
      { duration: 300, bpm: 120, key: Am, tags: ['Peak'], grade: 'ok' as const },
      { duration: 360, bpm: 124, key: Em, tags: ['Peak', 'Vocal'], grade: 'warn' as const },
      { duration: null, bpm: null, key: Gm, tags: [], grade: null },
    ];
    const i = insights(ts, k => String(k.tonic));
    expect(i.total).toBe(660);
    expect(i.unknownLength).toBe(1);
    expect(i.bpm).toEqual({ min: 120, max: 124, avg: 122 });
    expect(i.flow).toEqual([120, 124, null]);
    expect(i.mixes).toEqual({ good: 1, ok: 0, clash: 1, unknown: 0 });   // 8A→9A good, 9A→6A clash
    expect(i.grades).toMatchObject({ ok: 1, warn: 1, none: 1 });
    expect(i.untagged).toBe(1);
    expect(tagOverlap(ts, ['Peak', 'Vocal'])).toEqual({ regions: [1, 1, 0, 1], totals: [2, 1] });
  });
});

describe('automatic playlists look at tags', () => {
  const opts = (o: Partial<AutoOptions> = {}): AutoOptions => ({ count: 10, startBpm: null, endBpm: null, bpmTolerance: 0.04, halfDouble: true, harmonic: 'off', useRatings: false, minRating: 0, sameGenre: null, randomness: 0, seed: 3, ...o });
  const pool: Candidate[] = Array.from({ length: 40 }, (_, i) => ({ id: 't' + i, bpm: 124, key: null, rating: null, genre: '', duration: 300, tags: i % 4 === 0 ? ['peak'] : i % 4 === 1 ? ['chill'] : [] }));
  it('scores shared tags', () => {
    expect(tagFit(['peak', 'vocal'], ['peak', 'vocal', 'dark'])).toBe(1);
    expect(tagFit(['peak'], ['peak', 'vocal'])).toBe(0.5);
    expect(tagFit(['x'], [])).toBe(0);
  });
  it('prefers tracks with the wanted tags', () => {
    const r = generate(pool, null, [], opts({ tags: ['peak'] }));
    expect(r.slots.map(s => s.id).every(id => pool.find(c => c.id === id)!.tags!.includes('peak'))).toBe(true);
    const r2 = generate(pool, null, [], opts());
    expect(r2.slots.length).toBe(10);
  });
});
