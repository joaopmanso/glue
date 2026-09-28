import { describe, expect, it } from 'vitest';
import { adopt, type OwnParts, type SharedParts } from '../src/core/shared/adopt';
import { MemDir, asDir } from './memfs';
import { readJSON, writeJSON } from '../src/store/fsx';
import { moveInto } from '../src/store/shared/seed';
import type { List, Track } from '../src/store/types';

const list = (id: string, name: string, items: string[], o: Partial<List> = {}): List => ({ schemaVersion: 1, id, kind: 'playlist', name, parentId: null, position: 0, notes: '', items, origin: null, createdAt: '2026-01-01', ...o });
const track = (id: string, o: Partial<Track> = {}): Track => ({ id, status: 'linked', rootId: 'lr', relPath: id + '.mp3', importPath: null, fileName: id + '.mp3', size: 10, mtime: 1, title: 'Song ' + id, artist: 'A', album: '', genre: '', label: '', comment: '', year: '', duration: 300, format: null, addedAt: '2026-01-01', sources: [], ...o });

function desk(): SharedParts {
  return {
    meta: { schemaVersion: 1, id: 'c-desk', name: 'Main', createdAt: '2026-01-01', shared: true, rootsBy: { desk: [] }, members: { desk: { profile: 'pd', name: 'Desktop' } }, tags: ['Peak'] },
    tracks: [
      { id: 'aa1', title: 'One', artist: 'A', album: '', genre: '', label: '', comment: '', year: '', duration: 300, format: null, addedAt: '2026-01-01', fileName: 'one.flac', rating: null, copies: { desk: { status: 'linked', rootId: 'dr', relPath: 'one.flac', fileKey: null, importPath: null, size: 99, mtime: 1, sources: [] } } } as never,
    ],
    analysis: { aa1: { desk: { v: 3, bpm: 124 } as never } },
    lists: [list('fold', 'Sets', [], { kind: 'folder' }), list('fri', 'Friday', ['aa1'], { parentId: 'fold' })],
    sources: [],
  };
}
function laptop(): OwnParts {
  return {
    meta: { schemaVersion: 1, id: 'c-lap', name: 'Main', createdAt: '2026-01-02', roots: [{ id: 'lr', name: 'Music' } as never], tags: ['Warm'] },
    tracks: [track('x1', { title: 'One', duration: 301, rating: 3, tags: ['Warm'] }), track('x2', { title: 'Two' }), track('aa1', { title: 'Three' })],
    analysis: { x1: { v: 3, bpm: 125 } as never, x2: { v: 3, bpm: 128 } as never },
    lists: [list('s', 'Sets', [], { kind: 'folder' }), list('f', 'Friday', ['x2', 'x1'], { parentId: 's' }), list('lo', 'Laptop only', ['aa1'], { origin: { sourceId: 'rb', externalId: '9' } })],
    sources: [{ schemaVersion: 1, id: 'rb', app: 'rekordbox', name: 'rekordbox', fileName: 'x.xml', importedAt: '', lists: 1, tracks: [{ externalId: '9', trackId: 'x1', bpm: 125, key: null, rating: null, playCount: null, cues: 0, dateAdded: null, path: '' }] }],
  };
}

describe('moving a computer’s collection into the shared one (ADR 0096)', () => {
  it('the same songs get this computer’s copy; the rest come in; playlists with the same place join', () => {
    const r = adopt(desk(), laptop(), 'lap', { profile: 'pl', name: 'Laptop' });
    expect(r.stats).toEqual({ matched: 1, added: 2, listsJoined: 2, listsAdded: 1 });
    const one = r.tracks.find(t => t.id === 'aa1')!;
    expect(Object.keys(one.copies).sort()).toEqual(['desk', 'lap']);
    expect(one.copies.lap).toMatchObject({ rootId: 'lr', relPath: 'x1.mp3' });
    expect(one.copies.desk.relPath).toBe('one.flac');           // the desktop's own, untouched
    expect(one.rating).toBe(3);                                  // empty there, set here: comes along
    expect(one.tags).toEqual(['Warm']);
    // "Three" had the id aa1 here: it comes in under another.
    const three = r.tracks.find(t => t.title === 'Three')!;
    expect(three.id).not.toBe('aa1');
    expect(r.trackIds.get('aa1')).toBe(three.id);
    expect(r.analysis.aa1).toEqual({ desk: { v: 3, bpm: 124 }, lap: { v: 3, bpm: 125 } });
    const fri = r.lists.find(l => l.id === 'fri')!;
    expect(fri.items).toEqual(['aa1', r.trackIds.get('x2')]);
    expect(fri.parentId).toBe('fold');
    const lo = r.lists.find(l => l.name === 'Laptop only')!;
    expect(lo.items).toEqual([three.id]);
    expect(r.sources[0].tracks[0].trackId).toBe('aa1');
    expect(r.meta.rootsBy).toEqual({ desk: [], lap: [{ id: 'lr', name: 'Music' }] });
    expect(Object.keys(r.meta.members).sort()).toEqual(['desk', 'lap']);
    expect(r.meta.id).toBe('c-desk');
    expect(r.meta.tags).toEqual(['Peak', 'Warm']);
  });
  it('twice is the same as once', () => {
    const once = adopt(desk(), laptop(), 'lap', { profile: 'pl', name: 'Laptop' });
    const twice = adopt(once, laptop(), 'lap', { profile: 'pl', name: 'Laptop' });
    expect(twice.tracks.length).toBe(once.tracks.length);
    expect(twice.lists.length).toBe(once.lists.length + 0);
  });
  it('in the GLUE folder: the shared collection gets it all; the old one is kept, marked moved', async () => {
    const root = asDir(new MemDir()), d = desk(), l = laptop();
    const sb = 'profiles/pl/collections/c-desk', ob = 'profiles/pl/collections/c-lap';
    await writeJSON(root, sb + '/collection.json', d.meta);
    await writeJSON(root, sb + '/tracks/aa.json', { schemaVersion: 1, items: { aa1: d.tracks[0] } });
    for (const x of d.lists) await writeJSON(root, `${sb}/lists/${x.id}.json`, x);
    await writeJSON(root, ob + '/collection.json', l.meta);
    await writeJSON(root, ob + '/tracks/x.json', { schemaVersion: 1, items: Object.fromEntries(l.tracks.filter(t => t.id.startsWith('x')).map(t => [t.id, t])) });
    await writeJSON(root, ob + '/tracks/aa.json', { schemaVersion: 1, items: { aa1: l.tracks[2] } });
    for (const x of l.lists) await writeJSON(root, `${ob}/lists/${x.id}.json`, x);
    const st = await moveInto(root, 'pl', 'c-lap', 'c-desk', 'lap', { profile: 'pl', name: 'Laptop' });
    expect(st.matched).toBe(1);
    expect((await readJSON<{ movedTo: string }>(root, ob + '/collection.json'))!.movedTo).toBe('c-desk');
    const meta = await readJSON<{ members: Record<string, unknown> }>(root, sb + '/collection.json');
    expect(Object.keys(meta!.members).sort()).toEqual(['desk', 'lap']);
    const aa = await readJSON<{ items: Record<string, { copies: Record<string, unknown> }> }>(root, sb + '/tracks/aa.json');
    expect(Object.keys(aa!.items.aa1.copies).sort()).toEqual(['desk', 'lap']);
    await expect(moveInto(root, 'pl', 'c-desk', 'c-desk', 'lap', { profile: 'pl', name: 'Laptop' })).rejects.toThrow();
  });
});
