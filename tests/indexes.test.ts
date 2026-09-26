import { describe, expect, it } from 'vitest';
import { djValues, listsByTrack } from '../src/core/library/indexes';
import { HomeStore } from '../src/store/home';
import { CollectionStore } from '../src/store/collection';
import { SCHEMA, type List, type Source, type SourceTrack, type Track } from '../src/store/types';
import { MemDir, asDir } from './memfs';

const st = (trackId: string, over: Partial<SourceTrack> = {}): SourceTrack => ({ externalId: trackId, trackId, bpm: null, key: null, rating: null, playCount: null, cues: 0, dateAdded: null, path: '/' + trackId, ...over });
const src = (id: string, tracks: SourceTrack[]): Source => ({ schemaVersion: SCHEMA, id, app: 'rekordbox', name: id, fileName: id, importedAt: '', tracks, lists: 0 });
const list = (id: string, items: string[]): List => ({ schemaVersion: SCHEMA, id, kind: 'playlist', name: id, parentId: null, position: 0, notes: '', items, origin: null, createdAt: '' });
const track = (id: string): Track => ({ id, status: 'linked', rootId: 'r', relPath: id, importPath: null, fileName: id, size: 1, mtime: 1, title: id, artist: '', album: '', genre: '', label: '', comment: '', year: '', duration: 1, format: null, addedAt: '', sources: [] });

describe('collection indexes (ADR 0059)', () => {
  it('DJ values: per field, the first import that has one (0 and empty count as none)', () => {
    const m = djValues([
      src('a', [st('t1', { bpm: 0, key: '8A', rating: 0 }), st('t2', { bpm: 128 })]),
      src('b', [st('t1', { bpm: 124, key: '9A', rating: 4 }), st('t3', { key: '' })]),
    ]);
    expect(m.get('t1')).toEqual({ bpm: 124, key: '8A', rating: 4 });
    expect(m.get('t2')).toEqual({ bpm: 128, key: null, rating: null });
    expect(m.get('t3')).toEqual({ bpm: null, key: null, rating: null });
    expect(m.has('t4')).toBe(false);
  });

  it('lists by track: in the lists’ order, each list once', () => {
    const a = list('a', ['t1', 't2', 't1']), b = list('b', ['t2']), c = list('c', []);
    const m = listsByTrack([a, b, c]);
    expect(m.get('t1')).toEqual([a]);
    expect(m.get('t2')).toEqual([a, b]);
    expect(m.has('t3')).toBe(false);
  });

  it('the store counts changes by kind, shown data included', async () => {
    const mem = new MemDir(), home = await HomeStore.open(asDir(mem));
    const p = await home.createProfile('P'), c = await home.createCollection(p, 'C');
    const s = await CollectionStore.load(asDir(mem), p.id, c.id);
    const before = { ...s.rev };
    s.putSource(src('s1', []));
    expect(s.rev.sources).toBe(before.sources + 1);
    s.putList(list('l1', []));
    s.deleteList('l1');
    expect(s.rev.lists).toBe(before.lists + 2);
    s.putTrack(track('t1'));
    expect(s.rev.tracks).toBe(before.tracks + 1);
    const r = { ...s.rev };
    s.putShown([track('x1')], [list('lx', ['x1'])]);
    expect(s.rev.tracks).toBeGreaterThan(r.tracks);
    expect(s.rev.lists).toBeGreaterThan(r.lists);
    expect(s.ephemeral.has('x1')).toBe(true);
    s.showItems('lx', ['x1', 't1']);
    expect(s.lists.get('lx')!.items).toEqual(['x1', 't1']);
    s.dropShown(['x1', 'lx']);
    expect(s.tracks.has('x1') || s.lists.has('lx') || s.ephemeral.has('x1')).toBe(false);
    // Shown data is never written.
    await s.flush();
    expect(mem.paths().some(x => x.includes('lx'))).toBe(false);
  });
});
