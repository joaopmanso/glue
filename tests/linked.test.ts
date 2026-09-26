import { describe, expect, it } from 'vitest';
import { HomeStore } from '../src/store/home';
import { CollectionStore } from '../src/store/collection';
import { applyImport } from '../src/store/merge';
import { importLists } from '../src/store/linked';
import { blankTrack, type ImportedLibrary, type ImportedList } from '../src/core/interop/types';
import { MemDir, asDir } from './memfs';

async function fresh() {
  const mem = new MemDir(), home = await HomeStore.open(asDir(mem));
  const p = await home.createProfile('P'), c = await home.createCollection(p, 'C');
  return CollectionStore.load(asDir(mem), p.id, c.id);
}
const tracks = ['1', '2', '3', '4'].map(id => { const t = blankTrack(id, 'C:/Music/' + id + '.mp3'); t.title = 'T' + id; return t; });
const L = (externalId: string, name: string, parent: string | null, items: string[] = [], kind: ImportedList['kind'] = 'playlist'): ImportedList => ({ externalId, kind, name, parent, items });
const lib = (lists: ImportedList[]): ImportedLibrary => ({ app: 'engine', name: 'Engine DJ (m.db)', tracks, lists });
const names = (s: CollectionStore, ids: string[]) => ids.map(id => s.tracks.get(id)!.title);
const byName = (s: CollectionStore, n: string) => [...s.lists.values()].filter(l => l.name === n);

const base = () => [
  L('10', '2022', null, [], 'folder'), L('11', '140', '10', [], 'folder'), L('12', 'Heavy', '11', ['1', '2']), L('13', 'Roller', '11', ['3']),
  L('20', 'Chill', null, ['4']),
];

describe('DJ libraries: browsed, imported on demand, kept in step (ADR 0063)', () => {
  it('an import brings no playlists; the library keeps its tree', async () => {
    const s = await fresh();
    const r = applyImport(s, lib(base()), 'm.db');
    expect(s.lists.size).toBe(0);
    expect(s.sources.get(r.sourceId)!.tree!.map(l => l.name)).toEqual(['2022', '140', 'Heavy', 'Roller', 'Chill']);
  });

  it('importing one playlist brings it under the library’s folder, with its folders as holders', async () => {
    const s = await fresh();
    const r = applyImport(s, lib(base()), 'm.db'), src = s.sources.get(r.sourceId)!;
    expect(importLists(s, src, ['12'])).toBe(3);
    const top = byName(s, 'Engine DJ')[0], y = byName(s, '2022')[0], bpm = byName(s, '140')[0], heavy = byName(s, 'Heavy')[0];
    expect([top.parentId, y.parentId, bpm.parentId, heavy.parentId]).toEqual([null, top.id, y.id, bpm.id]);
    expect([top.origin?.chain, y.origin?.chain, bpm.origin?.chain, heavy.origin?.chain]).toEqual([true, true, true, undefined]);
    expect(names(s, heavy.items)).toEqual(['T1', 'T2']);
    expect(byName(s, 'Roller')).toEqual([]);   // a holder doesn't take the rest of its folder
  });

  it('copies follow the library in place: renamed, new songs, gone; the user’s own edits to others stay', async () => {
    const s = await fresh();
    const r = applyImport(s, lib(base()), 'm.db');
    importLists(s, s.sources.get(r.sourceId)!, ['']);
    const heavy = byName(s, 'Heavy')[0], chill = byName(s, 'Chill')[0], roller = byName(s, 'Roller')[0];
    s.putList({ ...chill, items: [...chill.items, heavy.items[0]] });   // the user adds a song in GLUE
    s.putList({ schemaVersion: 1, id: 'mine', kind: 'playlist', name: 'Mine', parentId: roller.parentId, position: 9, notes: '', items: [], origin: null, createdAt: '' });
    const next = base();
    next[2] = L('12', 'Heavy stuff', '11', ['2', '1', '3']);             // renamed, reordered, a song more
    next.splice(3, 1);                                                   // Roller deleted in the DJ app
    next.push(L('14', 'Bassy', '11', ['4']));                            // a new playlist in a folder GLUE has whole
    const r2 = applyImport(s, lib(next), 'm.db');
    expect(r2.linkedLists).toEqual({ updated: 1, added: 1, removed: 1 });
    const h = s.lists.get(heavy.id)!;
    expect(h.name).toBe('Heavy stuff');
    expect(names(s, h.items)).toEqual(['T2', 'T1', 'T3']);
    expect(s.lists.has(roller.id)).toBe(false);
    expect(names(s, s.lists.get(chill.id)!.items)).toEqual(['T4', 'T1']);   // unchanged in the library: the user's edit stays
    expect(byName(s, 'Bassy')[0].parentId).toBe(h.parentId);
    expect(s.lists.get('mine')!.parentId).toBe(h.parentId);                 // the user's own list stays
  });

  it('a library that moved a playlist moves its copy; one the user moved elsewhere stays', async () => {
    const s = await fresh();
    const r = applyImport(s, lib(base()), 'm.db');
    importLists(s, s.sources.get(r.sourceId)!, ['']);
    const roller = byName(s, 'Roller')[0], chill = byName(s, 'Chill')[0];
    s.putList({ schemaVersion: 1, id: 'own', kind: 'folder', name: 'Own', parentId: null, position: 0, notes: '', items: [], origin: null, createdAt: '' });
    s.putList({ ...chill, parentId: 'own' });
    const next = base();
    next[3] = L('13', 'Roller', '10', ['3']);    // moved up to 2022
    next[4] = L('20', 'Chill', '10', ['4']);     // moved too, but the user keeps it in Own
    applyImport(s, lib(next), 'm.db');
    expect(s.lists.get(roller.id)!.parentId).toBe(byName(s, '2022')[0].id);
    expect(s.lists.get(chill.id)!.parentId).toBe('own');
  });

  it('copies made with reading-order ids are found again by their path', async () => {
    const s = await fresh();
    const old = base().map(l => ({ ...l, externalId: 'n' + l.externalId, parent: l.parent ? 'n' + l.parent : null }));
    const r = applyImport(s, lib(old), 'm.db');
    importLists(s, s.sources.get(r.sourceId)!, ['']);
    const heavy = byName(s, 'Heavy')[0];
    applyImport(s, lib(base()), 'm.db');            // now with path ids
    expect(s.lists.get(heavy.id)?.origin?.externalId).toBe('12');
    expect(byName(s, 'Heavy')).toHaveLength(1);
  });
});

describe('renames where ids come from names (rekordbox XML)', () => {
  const X = (lists: ImportedList[]): ImportedLibrary => ({ app: 'rekordbox', name: 'rekordbox (rekordbox.xml)', tracks, lists });
  const P = (name: string, parent: string | null, items: string[], kind: ImportedList['kind'] = 'playlist'): ImportedList => ({ externalId: (parent ?? '') + '/' + name, kind, name, parent, items });
  it('a renamed playlist, and a renamed folder with its lists, keep their copies', async () => {
    const s = await fresh();
    const r = applyImport(s, X([P('Gigs', null, [], 'folder'), P('Fri', '/Gigs', ['1', '2']), P('Sat', '/Gigs', ['3'])]), 'rekordbox.xml');
    importLists(s, s.sources.get(r.sourceId)!, ['']);
    const fri = byName(s, 'Fri')[0], gigs = byName(s, 'Gigs')[0];
    applyImport(s, X([P('Shows', null, [], 'folder'), P('Friday', '/Shows', ['1', '2']), P('Sat', '/Shows', ['3'])]), 'rekordbox.xml');
    expect(s.lists.get(fri.id)?.name).toBe('Friday');
    expect(s.lists.get(gigs.id)?.name).toBe('Shows');
    expect(s.lists.get(fri.id)?.parentId).toBe(gigs.id);
    expect(byName(s, 'Sat')).toHaveLength(1);
  });
});
