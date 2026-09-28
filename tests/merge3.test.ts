import { describe, expect, it } from 'vitest';
import { merge3, mergeSequence, mergeSets } from '../src/core/shared/merge3';

const T = (o: Record<string, unknown> = {}) => ({ id: 't1', title: 'Song', artist: 'A', rating: null, copies: { desk: { rootId: 'r1', relPath: 'a.mp3', status: 'linked' } }, ...o });
const shard = (items: Record<string, unknown>) => ({ schemaVersion: 1, items });

describe('three-way merge of a shared collection (ADR 0094)', () => {
  it('takes whichever side changed; the same change on both is fine', () => {
    const base = shard({ t1: T() });
    const local = shard({ t1: T({ rating: 4 }) }), remote = shard({ t1: T({ title: 'Song (Edit)' }) });
    const m = merge3('tracks/t1.json', base, local, remote, 'lap');
    expect(m.value).toEqual(shard({ t1: T({ rating: 4, title: 'Song (Edit)' }) }));
    expect(m.clashes).toEqual([]);
    expect(merge3('tracks/t1.json', base, local, local, 'lap')).toEqual({ value: local, clashes: [] });
  });
  it('a clash keeps the cloud’s value and says so', () => {
    const base = shard({ t1: T() });
    const m = merge3('tracks/t1.json', base, shard({ t1: T({ title: 'Mine' }) }), shard({ t1: T({ title: 'Theirs' }) }), 'lap');
    expect((m.value as ReturnType<typeof shard>).items.t1).toMatchObject({ title: 'Theirs' });
    expect(m.clashes).toEqual([{ file: 'tracks/t1.json', at: 'items.t1.title', local: 'Mine', remote: 'Theirs' }]);
  });
  it('each computer owns its copy of a song, never a clash', () => {
    const base = shard({ t1: T() });
    const local = shard({ t1: T({ copies: { desk: { rootId: 'r1', relPath: 'a.mp3', status: 'linked' }, lap: { rootId: 'r9', relPath: 'x/a.mp3', status: 'linked' } } }) });
    const remote = shard({ t1: T({ copies: { desk: { rootId: 'r1', relPath: 'moved/a.mp3', status: 'linked' } } }) });
    const m = merge3('tracks/t1.json', base, local, remote, 'lap');
    expect((m.value as ReturnType<typeof shard>).items.t1).toMatchObject({ copies: { desk: { relPath: 'moved/a.mp3' }, lap: { relPath: 'x/a.mp3' } } });
    expect(m.clashes).toEqual([]);
  });
  it('songs added on both sides are all kept; one deleted here and untouched there goes', () => {
    const base = shard({ t1: T(), t2: T({ id: 't2' }) });
    const local = shard({ t1: T(), t3: T({ id: 't3' }) }), remote = shard({ t1: T(), t2: T({ id: 't2' }), t4: T({ id: 't4' }) });
    expect(Object.keys((merge3('tracks/t.json', base, local, remote, 'lap').value as ReturnType<typeof shard>).items).sort()).toEqual(['t1', 't3', 't4']);
  });
  it('deleted on one side, changed on the other: a clash (the cloud’s side kept)', () => {
    const m = merge3('lists/l1.json', { name: 'Friday', items: ['a'] }, undefined, { name: 'Friday night', items: ['a'] }, 'lap');
    expect(m.value).toEqual({ name: 'Friday night', items: ['a'] });
    expect(m.clashes).toHaveLength(1);
  });
  it('sets of names merge as sets; a playlist’s songs merge three ways', () => {
    expect(mergeSets(['a', 'b'], ['a', 'b', 'c'], ['b', 'd'])).toEqual(['b', 'd', 'c']);
    expect(mergeSequence(['1', '2', '3'], ['1', '2', '3', '9'], ['0', '1', '3'])).toEqual({ value: ['0', '1', '3', '9'], clash: false });
    expect(mergeSequence(['1', '2', '3'], ['3', '2', '1'], ['2', '1', '3']).clash).toBe(true);
    const m = merge3('lists/l1.json', { name: 'F', items: ['1', '2'] }, { name: 'F', items: ['1', '2', '5'] }, { name: 'F', items: ['2'] }, 'lap');
    expect(m).toEqual({ value: { name: 'F', items: ['2', '5'] }, clashes: [] });
    const c = merge3('collection.json', { tags: ['x'] }, { tags: ['x', 'y'] }, { tags: [] }, 'lap');
    expect(c.value).toEqual({ tags: ['y'] });
  });
  it('analyses are per computer', () => {
    const m = merge3('analysis/t.json', shard({ t1: { desk: { bpm: 120 } } }), shard({ t1: { desk: { bpm: 120 }, lap: { bpm: 121 } } }), shard({ t1: { desk: { bpm: 124 } } }), 'lap');
    expect(m.value).toEqual(shard({ t1: { desk: { bpm: 124 }, lap: { bpm: 121 } } }));
    expect(m.clashes).toEqual([]);
  });
});
