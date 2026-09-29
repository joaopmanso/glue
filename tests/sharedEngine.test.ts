import { describe, expect, it } from 'vitest';
import { MemDir, asDir } from './memfs';
import { packText, pull, push, resolveClash, syncShared, unpackText, waitingClashes, type Place, type SharedCloud } from '../src/store/shared/engine';
import { mergeBoth, setAt } from '../src/core/shared/merge3';
import { readJSON, writeJSON } from '../src/store/fsx';
import { HomeStore } from '../src/store/home';
import { CollectionStore } from '../src/store/collection';
import { makeShared } from '../src/store/shared/seed';
import type { Track } from '../src/store/types';

/** GLUE Cloud's shared collection (cloud/src/shared.ts), in memory, with the same rules. */
function fakeCloud() {
  let seq = 0;
  const files = new Map<string, { rev: number; hash: string; data: string | null }>();
  const cloud: SharedCloud = {
    async changes(since) {
      const out = [...files].filter(([, f]) => f.rev > since).sort((a, b) => a[1].rev - b[1].rev).map(([path, f]) => ({ path, rev: f.rev, hash: f.hash, deleted: f.data === null }));
      return { seq, more: false, files: out };
    },
    async bundle(paths) { return paths.filter(p => files.get(p)?.data).map(p => [p, files.get(p)!.rev, files.get(p)!.hash, files.get(p)!.data].join('\t')).join('\n'); },
    async push(body) {
      const rev = ++seq, stored: string[] = [], stale: string[] = [];
      for (const line of body.split('\n').filter(Boolean)) {
        const [path, base, hash, , data] = line.split('\t');
        const cur = files.get(path);
        if ((cur?.rev ?? 0) !== Number(base) && !(cur?.data === null && Number(base) === 0)) { stale.push(path); continue; }
        files.set(path, { rev, hash, data: data === '-' ? null : data });
        stored.push(path);
      }
      return { rev: stored.length ? rev : null, stored, stale };
    },
  };
  return { cloud, files };
}

const trackShard = (items: Record<string, unknown>) => ({ schemaVersion: 1, items });
const song = (id: string, o: Record<string, unknown> = {}) => ({ id, title: 'Song ' + id, artist: 'A', copies: { desk: { status: 'linked', rootId: 'r1', relPath: id + '.mp3' } }, ...o });

async function device(me: string, cloud: SharedCloud) {
  const root = asDir(new MemDir());
  const p: Place = { root, pid: 'p-' + me, cid: 'c1', me, cloud };
  const at = (path: string) => `profiles/${p.pid}/collections/c1/${path}`;
  return { p, write: (path: string, v: unknown) => writeJSON(root, at(path), v), read: <T>(path: string) => readJSON<T>(root, at(path)) };
}

describe('syncing a shared collection (ADR 0094)', () => {
  it('the desktop puts it in; the laptop takes it in; each one’s changes reach the other, merged', async () => {
    const { cloud } = fakeCloud();
    const desk = await device('desk', cloud), lap = await device('lap', cloud);
    await desk.write('collection.json', { id: 'c1', name: 'My collection', shared: true, rootsBy: { desk: [] }, members: { desk: { profile: 'p-desk', name: 'Desktop' } } });
    await desk.write('tracks/aa.json', trackShard({ aa1: song('aa1'), aa2: song('aa2') }));
    await desk.write('lists/l1.json', { id: 'l1', name: 'Friday', items: ['aa1'] });
    expect((await syncShared(desk.p)).pushed).toBe(3);
    // The laptop: everything, as it is.
    const r = await syncShared(lap.p);
    expect(r.changed.sort()).toEqual(['collection.json', 'lists/l1.json', 'tracks/aa.json']);
    expect(await lap.read('lists/l1.json')).toEqual({ id: 'l1', name: 'Friday', items: ['aa1'] });
    // Both change the same shard (different songs) and the same playlist (both add a song).
    await desk.write('tracks/aa.json', trackShard({ aa1: song('aa1', { rating: 5 }), aa2: song('aa2') }));
    await desk.write('lists/l1.json', { id: 'l1', name: 'Friday', items: ['aa1', 'aa2'] });
    await lap.write('tracks/aa.json', trackShard({ aa1: song('aa1'), aa2: song('aa2', { genre: 'Techno' }) }));
    await lap.write('lists/l1.json', { id: 'l1', name: 'Friday', items: ['zz9', 'aa1'] });
    await syncShared(desk.p);
    const r2 = await syncShared(lap.p);             // stale on the laptop: pulled, merged, pushed again
    expect(r2.clashes).toEqual([]);
    await syncShared(desk.p);
    for (const d of [desk, lap]) {
      const t = await d.read<{ items: Record<string, { rating?: number; genre?: string }> }>('tracks/aa.json');
      expect(t!.items.aa1.rating).toBe(5);
      expect(t!.items.aa2.genre).toBe('Techno');
      expect((await d.read<{ items: string[] }>('lists/l1.json'))!.items).toEqual(['zz9', 'aa1', 'aa2']);
    }
  });
  it('the same thing changed differently on both: the cloud’s kept, the clash reported and remembered', async () => {
    const { cloud } = fakeCloud();
    const desk = await device('desk', cloud), lap = await device('lap', cloud);
    await desk.write('lists/l1.json', { id: 'l1', name: 'Friday', items: [] });
    await syncShared(desk.p); await syncShared(lap.p);
    await desk.write('lists/l1.json', { id: 'l1', name: 'Friday night', items: [] });
    await lap.write('lists/l1.json', { id: 'l1', name: 'Friday late', items: [] });
    await syncShared(desk.p);
    const r = await syncShared(lap.p);
    expect(r.clashes).toMatchObject([{ file: 'lists/l1.json', at: 'name', local: 'Friday late', remote: 'Friday night' }]);
    expect((await lap.read<{ name: string }>('lists/l1.json'))!.name).toBe('Friday night');
    const st = await readJSON<{ clashes: unknown[] }>(lap.p.root, 'cloud/shared/c1.json');
    expect(st!.clashes).toHaveLength(1);
  });
  it('a clash settled as this device’s: its value goes up and reaches the other device; settled as theirs: nothing changes', async () => {
    const { cloud } = fakeCloud();
    const desk = await device('desk', cloud), lap = await device('lap', cloud);
    await desk.write('lists/l1.json', { id: 'l1', name: 'Friday', color: 'red', items: [] });
    await syncShared(desk.p); await syncShared(lap.p);
    await desk.write('lists/l1.json', { id: 'l1', name: 'Friday night', color: 'blue', items: [] });
    await lap.write('lists/l1.json', { id: 'l1', name: 'Friday late', color: 'green', items: [] });
    await syncShared(desk.p);
    await syncShared(lap.p);
    const [name, color] = (await waitingClashes(lap.p)).sort((a, b) => a.at.localeCompare(b.at)).reverse();
    expect(name).toMatchObject({ at: 'name', local: 'Friday late', remote: 'Friday night' });
    await resolveClash(lap.p, name, name.local, false);
    await resolveClash(lap.p, color, undefined, true);
    expect(await waitingClashes(lap.p)).toEqual([]);
    expect((await syncShared(lap.p)).pushed).toBe(1);
    await syncShared(desk.p);
    for (const d of [desk, lap]) expect(await d.read('lists/l1.json')).toEqual({ id: 'l1', name: 'Friday late', color: 'blue', items: [] });
  });
  it('setAt and mergeBoth', () => {
    expect(setAt({ items: { a: { title: 'x' } } }, 'items.a.title', 'y')).toEqual({ items: { a: { title: 'y' } } });
    expect(setAt({ items: { a: { title: 'x', genre: 'g' } } }, 'items.a.genre', undefined)).toEqual({ items: { a: { title: 'x' } } });
    expect(mergeBoth(['a', 'b'], ['c', 'a'])).toEqual(['c', 'a', 'b']);
    expect(mergeBoth('one', 'two')).toBe('two / one');
    expect(mergeBoth(3, 4)).toBeUndefined();
  });
  it('a deletion reaches the other device; nothing is sent when nothing changed', async () => {
    const { cloud, files } = fakeCloud();
    const desk = await device('desk', cloud), lap = await device('lap', cloud);
    await desk.write('lists/l1.json', { id: 'l1', name: 'Old', items: [] });
    await desk.write('lists/l2.json', { id: 'l2', name: 'Keep', items: [] });
    await syncShared(desk.p); await syncShared(lap.p);
    const { removePath } = await import('../src/store/fsx');
    await removePath(desk.p.root, 'profiles/p-desk/collections/c1/lists/l1.json');
    await syncShared(desk.p);
    expect(files.get('lists/l1.json')!.data).toBeNull();
    await syncShared(lap.p);
    expect(await lap.read('lists/l1.json')).toBeNull();
    expect(await lap.read('lists/l2.json')).toEqual({ id: 'l2', name: 'Keep', items: [] });
    expect((await push(lap.p)).pushed).toBe(0);
    expect((await pull(lap.p)).changed).toEqual([]);
  });
  it('packs text as gzip base64 both ways', async () => {
    expect(await unpackText(await packText('{"a":"é"}'))).toBe('{"a":"é"}');
  });
});

describe('a collection made shared, as each computer sees it (ADR 0094)', () => {
  it('the desktop shares its collection; the laptop joins it and sees the songs as the desktop’s; a rating there reaches the desktop, whose files stay its own', async () => {
    const { cloud } = fakeCloud();
    // The desktop: a collection of its own with a song and its analysis.
    const deskRoot = asDir(new MemDir()), dh = await HomeStore.open(deskRoot);
    const dp = await dh.createProfile('DJ'), dc = await dh.createCollection(dp, 'My collection');
    let ds = await CollectionStore.load(deskRoot, dp.id, dc.id);
    const song: Track = { id: 'aa01', status: 'linked', rootId: 'r1', relPath: 'Sets/a.mp3', importPath: null, fileName: 'a.mp3', size: 10, mtime: 1, title: 'Song', artist: 'A', album: '', genre: '', label: '', comment: '', year: '', duration: 300, format: null, addedAt: '2026-01-01', sources: [] };
    ds.putTracks([song]); ds.putAnalysis('aa01', { v: 3, bpm: 124 } as never); await ds.flush();
    // Made shared, then up.
    expect(await makeShared(deskRoot, dp.id, dc.id, 'desk', { profile: dp.id, name: 'Desktop' })).toBe(true);
    const deskPlace: Place = { root: deskRoot, pid: dp.id, cid: dc.id, me: 'desk', cloud };
    await syncShared(deskPlace);
    ds = await CollectionStore.load(deskRoot, dp.id, dc.id, { me: 'desk' });
    expect(ds.shared).not.toBeNull();
    expect(ds.tracks.get('aa01')).toMatchObject({ rootId: 'r1', relPath: 'Sets/a.mp3' });
    // A library read here is this computer's; another computer's isn't read here (ADR 0099).
    ds.putSource({ schemaVersion: 1, id: 'rb', app: 'rekordbox', name: 'rekordbox', fileName: 'x.xml', importedAt: '', lists: 0, tracks: [] });
    expect(ds.sources.get('rb')!.computer).toBe('desk');
    expect(ds.ownSource(ds.sources.get('rb')!)).toBe(true);
    expect(ds.ownSource({ ...ds.sources.get('rb')!, computer: 'lap' })).toBe(false);
    // The laptop joins: its own profile, the same collection id.
    const lapRoot = asDir(new MemDir()), lh = await HomeStore.open(lapRoot);
    const lp = await lh.createProfile('DJ');
    await lh.joinCollection(lp, dc.id, 'My collection');
    const lapPlace: Place = { root: lapRoot, pid: lp.id, cid: dc.id, me: 'lap', cloud };
    await syncShared(lapPlace);
    const ls = await CollectionStore.load(lapRoot, lp.id, dc.id, { me: 'lap', name: 'Laptop' });
    const t = ls.tracks.get('aa01')!;
    expect(t).toMatchObject({ rootId: null, remote: { device: 'desk', name: 'Desktop', profile: dp.id, collection: dc.id, id: 'aa01' } });
    expect(ls.analysis.get('aa01')).toMatchObject({ bpm: 124 });   // the desktop's analysis, shown here
    // The laptop rates it; saved, sent, taken in on the desktop.
    ls.putTracks([{ ...t, rating: 4 }]); await ls.flush();
    await syncShared(lapPlace);
    const r = await syncShared(deskPlace);
    expect(r.changed).toContain('tracks/aa.json');
    await ds.reloadFiles(r.changed);
    expect(ds.tracks.get('aa01')).toMatchObject({ rating: 4, rootId: 'r1', relPath: 'Sets/a.mp3' });
    expect(ds.tracks.get('aa01')!.remote).toBeUndefined();
    // The laptop is a member now; its analysis of nothing wasn't written as its own.
    const meta = await readJSON<{ members: Record<string, unknown> }>(deskRoot, `profiles/${dp.id}/collections/${dc.id}/collection.json`);
    expect(Object.keys(meta!.members).sort()).toEqual(['desk', 'lap']);
    const an = await readJSON<{ items: Record<string, Record<string, unknown>> }>(deskRoot, `profiles/${dp.id}/collections/${dc.id}/analysis/aa.json`);
    expect(Object.keys(an!.items.aa01)).toEqual(['desk']);
  });
});

describe('removing a song in a shared collection (ADR 0100)', () => {
  it('another computer has it too: only this computer’s copy and analysis go; with no copy left, the song goes', async () => {
    const root = asDir(new MemDir()), base = 'profiles/pl/collections/c1';
    const members = { desk: { profile: 'pd', name: 'Desktop' }, lap: { profile: 'pl', name: 'Laptop' } };
    await writeJSON(root, base + '/collection.json', { schemaVersion: 1, id: 'c1', name: 'Main', createdAt: '', shared: true, rootsBy: { desk: [], lap: [] }, members });
    const copy = (rel: string) => ({ status: 'linked', rootId: 'r', relPath: rel, importPath: null, size: 1, mtime: 1, sources: [] });
    await writeJSON(root, base + '/tracks/aa.json', { schemaVersion: 1, items: {
      aa1: { id: 'aa1', title: 'Both', artist: 'A', fileName: 'b.mp3', copies: { desk: copy('b.mp3'), lap: copy('b.mp3') } },
      aa2: { id: 'aa2', title: 'Mine', artist: 'A', fileName: 'm.mp3', copies: { lap: copy('m.mp3') } },
    } });
    await writeJSON(root, base + '/analysis/aa.json', { schemaVersion: 1, items: { aa1: { desk: { v: 3, bpm: 120 }, lap: { v: 3, bpm: 121 } }, aa2: { lap: { v: 3, bpm: 90 } } } });
    await writeJSON(root, base + '/lists/l1.json', { schemaVersion: 1, id: 'l1', kind: 'playlist', name: 'Set', parentId: null, position: 0, notes: '', items: ['aa1', 'aa2'], origin: null, createdAt: '' });
    const s = await CollectionStore.load(root, 'pl', 'c1', { me: 'lap' });
    s.removeTrack('aa1'); s.removeTrack('aa2'); await s.flush();
    const t = await readJSON<{ items: Record<string, { copies: Record<string, unknown> }> }>(root, base + '/tracks/aa.json');
    expect(Object.keys(t!.items)).toEqual(['aa1']);
    expect(Object.keys(t!.items.aa1.copies)).toEqual(['desk']);
    const a = await readJSON<{ items: Record<string, Record<string, unknown>> }>(root, base + '/analysis/aa.json');
    expect(a!.items.aa1).toEqual({ desk: { v: 3, bpm: 120 } });
    expect(s.tracks.get('aa1')!.remote).toMatchObject({ device: 'desk' });   // shown as the desktop's now
    expect(s.analysis.get('aa1')).toMatchObject({ bpm: 120 });
    expect(s.lists.get('l1')!.items).toEqual(['aa1']);
  });
});
