import { describe, expect, it } from 'vitest';
import { analysisHere, analysisShared, collectionHere, collectionShared, toLocal, toShared, type SharedTrack } from '../src/core/shared/project';
import type { Track } from '../src/store/types';

const here = (me: string) => ({ me, collection: 'c1', members: { desk: { profile: 'pdesk', name: 'Desktop' }, lap: { profile: 'plap', name: 'Laptop' } } });
const shared: SharedTrack = {
  id: 't1', fileName: 'a.mp3', title: 'Song', artist: 'A', album: '', genre: 'House', label: '', comment: '', year: '', duration: 300, format: null, addedAt: '2026-01-01', rating: 4,
  copies: { desk: { status: 'linked', rootId: 'r1', relPath: 'Sets/a.mp3', importPath: null, size: 10, mtime: 1, sources: ['s1'] } },
} as SharedTrack;

describe('a shared collection as this computer sees it (ADR 0094)', () => {
  it('its own copy becomes the song’s usual fields', () => {
    const t = toLocal(shared, here('desk'));
    expect(t).toMatchObject({ id: 't1', rootId: 'r1', relPath: 'Sets/a.mp3', status: 'linked', sources: ['s1'], rating: 4 });
    expect(t.remote).toBeUndefined();
  });
  it('another computer’s song is a remote row pointing at it, with its profile', () => {
    const t = toLocal(shared, here('lap'));
    expect(t).toMatchObject({ rootId: null, relPath: null, status: 'linked', onDevices: ['Desktop'], remote: { device: 'desk', name: 'Desktop', profile: 'pdesk', collection: 'c1', id: 't1' } });
  });
  it('back to the shared record: this computer’s copy from the song, the others’ kept; another’s song adds no copy', () => {
    const lapTrack: Track = { ...toLocal(shared, here('desk')), rootId: 'r9', relPath: 'x/a.mp3' };
    const s = toShared(lapTrack, here('lap'), shared);
    expect(Object.keys(s.copies).sort()).toEqual(['desk', 'lap']);
    expect(s.copies.lap).toMatchObject({ rootId: 'r9', relPath: 'x/a.mp3' });
    expect(s.copies.desk).toEqual(shared.copies.desk);
    expect((s as unknown as Track).rootId).toBeUndefined();
    const edited = { ...toLocal(shared, here('lap')), rating: 5 };
    const s2 = toShared(edited, here('lap'), shared);
    expect(s2.copies).toEqual(shared.copies);
    expect(s2.rating).toBe(5);
    expect((s2 as unknown as Track).remote).toBeUndefined();
  });
  it('analyses and music folders per computer', () => {
    const a = { v: 3, bpm: 120 } as never, b = { v: 3, bpm: 121 } as never;
    expect(analysisHere({ desk: a }, 'lap')).toBe(a);
    expect(analysisHere({ desk: a, lap: b }, 'lap')).toBe(b);
    expect(analysisShared(b, 'lap', { desk: a })).toEqual({ desk: a, lap: b });
    const c = collectionShared({ schemaVersion: 1, id: 'c1', name: 'My collection', createdAt: '', roots: [{ id: 'r1' } as never] }, 'desk', undefined, { profile: 'pdesk', name: 'Desktop' });
    expect(collectionHere(c, 'desk').roots).toEqual([{ id: 'r1' }]);
    expect(collectionHere(c, 'lap').roots).toEqual([]);
    expect(collectionShared(collectionHere(c, 'lap'), 'lap', c, { profile: 'plap', name: 'Laptop' }).rootsBy).toEqual({ desk: [{ id: 'r1' }], lap: [] });
  });
});
