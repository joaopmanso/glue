import { describe, expect, it } from 'vitest';
import { BUILD_DEFAULTS, buildDiscogs, replaceOne, type BuildOptions, type DgCandidate } from '../src/core/library/discogsBuild';

// 40 records of 3 tracks: styles Techno / Dubstep / House in turn, labels A–D, years 2000–2019, every 7th a compilation,
// every 5th 12" (else LP), the first track of every 4th record also digital.
const pool: DgCandidate[] = [];
const STYLES = ['Techno', 'Dubstep', 'House'];
for (let r = 1; r <= 40; r++) for (let t = 0; t < 3; t++) pool.push({
  id: r % 4 === 0 && t === 0 ? 's' + r : 'dg:' + r + ':' + 'ABC'[t], record: r,
  artists: [r % 7 === 0 ? 'Guest ' + t : 'Artist ' + (r % 10)], labels: ['Label ' + 'ABCD'[r % 4]], year: 2000 + (r % 20),
  genres: ['Electronic'], styles: [STYLES[r % 3]], formats: ['Vinyl', r % 5 === 0 ? '12"' : 'LP'],
  compilation: r % 7 === 0, digital: r % 4 === 0 && t === 0, bpm: r % 4 === 0 && t === 0 ? 130 : null, duration: 300,
});
const opt = (o: Partial<BuildOptions> = {}): BuildOptions => ({ ...BUILD_DEFAULTS, seed: 1, count: 10, ...o });
const rec = (id: string) => pool.find(c => c.id === id)!;

describe('the Discogs playlist builder (ADR 0190)', () => {
  it('the seeds first, then like them (their style above all), no repeats, the count', () => {
    const r = buildDiscogs(pool, ['dg:3:A'], opt());   // record 3: Techno
    expect(r.ids[0]).toBe('dg:3:A');
    expect(r.ids).toHaveLength(10);
    expect(new Set(r.ids).size).toBe(10);
    expect(r.ids.filter(id => rec(id).styles[0] === 'Techno').length).toBeGreaterThanOrEqual(8);
  });
  it('one track per record, or two', () => {
    const one = buildDiscogs(pool, ['dg:3:A'], opt({ count: 12 })).ids.map(id => rec(id).record);
    expect(new Set(one).size).toBe(one.length);
    const two = buildDiscogs(pool, ['dg:3:A'], opt({ count: 12, perRecord: 2, randomness: 0 })).ids.map(id => rec(id).record);
    expect(Math.max(...[...new Set(two)].map(x => two.filter(y => y === x).length))).toBe(2);
  });
  it('compilations left out when asked', () => {
    expect(buildDiscogs(pool, ['dg:3:A'], opt({ compilations: false, count: 30 })).ids.some(id => rec(id).compilation)).toBe(false);
  });
  it('artists only, or preferred', () => {
    expect(buildDiscogs(pool, ['dg:3:A'], opt({ artists: ['Artist 3'], artistsOnly: true, perRecord: 0 })).ids.every(id => rec(id).artists[0] === 'Artist 3')).toBe(true);
    const pref = buildDiscogs(pool, ['dg:1:A'], opt({ artists: ['Artist 3'], randomness: 0 })).ids;
    expect(rec(pref[1]).artists[0]).toBe('Artist 3');
  });
  it('styles only, labels, formats and years', () => {
    expect(buildDiscogs(pool, ['dg:1:A'], opt({ styles: ['dubstep'], stylesOnly: true, count: 10 })).ids.slice(1).every(id => rec(id).styles[0] === 'Dubstep')).toBe(true);
    expect(buildDiscogs(pool, ['dg:2:A'], opt({ labels: ['Label C'] })).ids.slice(1).every(id => rec(id).labels[0] === 'Label C')).toBe(true);
    expect(buildDiscogs(pool, ['dg:5:A'], opt({ formats: ['12"'] })).ids.slice(1).every(id => rec(id).formats.includes('12"'))).toBe(true);
    expect(buildDiscogs(pool, ['dg:3:A'], opt({ years: [2010, 2014] })).ids.slice(1).every(id => rec(id).year! >= 2010 && rec(id).year! <= 2014)).toBe(true);
  });
  it('vinyl only, digital only', () => {
    expect(buildDiscogs(pool, ['dg:3:A'], opt({ have: 'vinyl' })).ids.every(id => !rec(id).digital)).toBe(true);
    expect(buildDiscogs(pool, ['s4'], opt({ have: 'digital' })).ids.every(id => rec(id).digital)).toBe(true);
  });
  it('tracks already in playlists avoided (a seed never)', () => {
    const avoid = pool.filter(c => c.styles[0] === 'Techno').map(c => c.id);
    const r = buildDiscogs(pool, ['dg:3:A'], opt({ avoid }));
    expect(r.ids[0]).toBe('dg:3:A');
    expect(r.ids.slice(1).some(id => avoid.includes(id))).toBe(false);
  });
  it('short of tracks: the rules relaxed, and said', () => {
    const r = buildDiscogs(pool, ['dg:3:A'], opt({ years: [2003, 2003], count: 4 }));
    expect(r.relaxed).toContain('other years too');
    expect(r.ids).toHaveLength(4);
    const tiny = buildDiscogs(pool, ['dg:3:A'], opt({ labels: ['Nope'], count: 4 }));
    expect(tiny.relaxed.some(x => x.startsWith('only'))).toBe(true);
  });
  it('the same seed, the same list; another seed, another', () => {
    const a = buildDiscogs(pool, ['dg:3:A'], opt({ randomness: 0.8 })).ids, b = buildDiscogs(pool, ['dg:3:A'], opt({ randomness: 0.8 })).ids;
    expect(a).toEqual(b);
    expect(buildDiscogs(pool, ['dg:3:A'], opt({ randomness: 0.8, seed: 99 })).ids).not.toEqual(a);
  });
  it('another for one place: unused, within the rules', () => {
    const cur = buildDiscogs(pool, ['dg:3:A'], opt({ count: 5 })).ids;
    const x = replaceOne(pool, cur, 2, ['dg:3:A'], opt());
    expect(x).not.toBeNull();
    expect(cur).not.toContain(x);
  });
});
