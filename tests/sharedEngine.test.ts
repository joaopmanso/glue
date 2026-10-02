import { describe, expect, it } from 'vitest';
import { MemDir, asDir } from './memfs';
import { applyChange, diffFile, packText, pull, push, resolveClash, syncShared, unpackText, waitingClashes, type Place } from '../src/store/shared/engine';
import { SharedCloudServer } from './sharedCloud';
import { COMPACT_AFTER } from '../cloud/src/shared';
import { mergeBoth, setAt } from '../src/core/shared/merge3';
import { readJSON, writeJSON } from '../src/store/fsx';
import { HomeStore } from '../src/store/home';
import { CollectionStore } from '../src/store/collection';
import { makeShared } from '../src/store/shared/seed';
import type { Track } from '../src/store/types';

const trackShard = (items: Record<string, unknown>) => ({ schemaVersion: 1, items });
const song = (id: string, o: Record<string, unknown> = {}) => ({ id, title: 'Song ' + id, artist: 'A', copies: { desk: { status: 'linked', rootId: 'r1', relPath: id + '.mp3' } }, ...o });

async function device(me: string, server: SharedCloudServer) {
  const root = asDir(new MemDir());
  const p: Place = { root, pid: 'p-' + me, cid: 'c1', me, cloud: server.cloudFor('c1', me) };
  const at = (path: string) => `profiles/${p.pid}/collections/c1/${path}`;
  return { p, write: (path: string, v: unknown) => writeJSON(root, at(path), v), read: <T>(path: string) => readJSON<T>(root, at(path)) };
}

describe('syncing a shared collection (ADR 0094)', () => {
  it('the desktop puts it in; the laptop takes it in; each one’s changes reach the other, merged', async () => {
    const server = new SharedCloudServer();
    const desk = await device('desk', server), lap = await device('lap', server);
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
  // The user, 2026-10-02: the laptop lacked the desktop's 9,807 new songs until the collection was opened again. A sync
  // that fails after its pull has written the files, and moved its cursor past them: the next one reports none.
  it('a sync that fails partway still says which files it wrote (ADR 0143)', async () => {
    const server = new SharedCloudServer();
    const desk = await device('desk', server), lap = await device('lap', server);
    await desk.write('tracks/aa.json', trackShard({ aa1: song('aa1') }));
    await syncShared(desk.p); await syncShared(lap.p);
    await desk.write('tracks/bb.json', trackShard({ bb1: song('bb1'), bb2: song('bb2') }));
    await syncShared(desk.p);
    // The laptop has a change of its own; sending it fails (the network, GLUE Cloud).
    await lap.write('lists/l9.json', { id: 'l9', name: 'Mine', items: [] });
    const failing = { ...lap.p, cloud: { ...lap.p.cloud, append: async () => { throw new Error('offline'); } } };
    const got: string[] = [];
    await expect(syncShared(failing, undefined, got)).rejects.toThrow('offline');
    expect(got).toContain('tracks/bb.json');
    expect((await lap.read<{ items: Record<string, unknown> }>('tracks/bb.json'))!.items.bb2).toBeTruthy();
    // Why it matters: the next sync has nothing new to say about it.
    expect((await syncShared(lap.p)).changed).not.toContain('tracks/bb.json');
  });

  it('the same thing changed differently on both: the cloud’s kept, the clash reported and remembered', async () => {
    const server = new SharedCloudServer();
    const desk = await device('desk', server), lap = await device('lap', server);
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
    const server = new SharedCloudServer();
    const desk = await device('desk', server), lap = await device('lap', server);
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
    const server = new SharedCloudServer();
    const desk = await device('desk', server), lap = await device('lap', server);
    await desk.write('lists/l1.json', { id: 'l1', name: 'Old', items: [] });
    await desk.write('lists/l2.json', { id: 'l2', name: 'Keep', items: [] });
    await syncShared(desk.p); await syncShared(lap.p);
    const { removePath } = await import('../src/store/fsx');
    await removePath(desk.p.root, 'profiles/p-desk/collections/c1/lists/l1.json');
    await syncShared(desk.p);
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
    const server = new SharedCloudServer();
    // The desktop: a collection of its own with a song and its analysis.
    const deskRoot = asDir(new MemDir()), dh = await HomeStore.open(deskRoot);
    const dp = await dh.createProfile('DJ'), dc = await dh.createCollection(dp, 'My collection');
    let ds = await CollectionStore.load(deskRoot, dp.id, dc.id);
    const song: Track = { id: 'aa01', status: 'linked', rootId: 'r1', relPath: 'Sets/a.mp3', importPath: null, fileName: 'a.mp3', size: 10, mtime: 1, title: 'Song', artist: 'A', album: '', genre: '', label: '', comment: '', year: '', duration: 300, format: null, addedAt: '2026-01-01', sources: [] };
    ds.putTracks([song]); ds.putAnalysis('aa01', { v: 3, bpm: 124 } as never); await ds.flush();
    // Made shared, then up.
    expect(await makeShared(deskRoot, dp.id, dc.id, 'desk', { profile: dp.id, name: 'Desktop' })).toBe(true);
    const deskPlace: Place = { root: deskRoot, pid: dp.id, cid: dc.id, me: 'desk', cloud: server.cloudFor(dc.id, 'desk') };
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
    const lapPlace: Place = { root: lapRoot, pid: lp.id, cid: dc.id, me: 'lap', cloud: server.cloudFor(dc.id, 'lap') };
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
    // The laptop, with no music folder, isn't a member (a computer holding copies); nothing of it was
    // written as its own analysis either.
    const meta = await readJSON<{ members: Record<string, unknown> }>(deskRoot, `profiles/${dp.id}/collections/${dc.id}/collection.json`);
    expect(Object.keys(meta!.members).sort()).toEqual(['desk']);
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

describe('GLUE Cloud’s copy as a snapshot and a log (ADR 0106)', () => {
  const shard = (n: number, o: (i: number) => Record<string, unknown> = () => ({})) => trackShard(Object.fromEntries(Array.from({ length: n }, (_, i) => ['s' + i, song('s' + i, o(i))])));
  it('a file of songs changes by its songs: only those are sent, and the other side rebuilds the file', () => {
    const was = JSON.stringify(shard(3)), now = JSON.stringify(shard(3, i => i === 1 ? { rating: 4 } : {}));
    const c = diffFile(was, now)!;
    expect(c).toEqual({ o: { schemaVersion: 1 }, i: { s1: song('s1', { rating: 4 }) } });
    expect(JSON.parse(applyChange(was, c)!)).toEqual(JSON.parse(now));
    const gone = diffFile(was, JSON.stringify(trackShard({ s0: song('s0'), s2: song('s2') })))!;
    expect(gone).toEqual({ o: { schemaVersion: 1 }, i: { s1: null } });
    expect(diffFile(was, was)).toBeNull();
    expect(diffFile('{"a":1}', '{"a":2}')).toEqual({ t: '{"a":2}' });
    expect(diffFile('{"a":1}', null)).toEqual({ d: 1 });
    expect(applyChange('{"a":1}', { d: 1 })).toBeUndefined();
  });
  it('one push is one entry, however many files and songs; a rating sends that song only', async () => {
    const server = new SharedCloudServer();
    const desk = await device('desk', server), lap = await device('lap', server);
    for (let f = 0; f < 20; f++) await desk.write(`tracks/${f.toString(16).padStart(2, '0')}.json`, shard(50));
    await desk.write('lists/l1.json', { id: 'l1', name: 'Friday', items: [] });
    expect((await syncShared(desk.p)).pushed).toBe(21);
    expect(await server.counts('c1')).toMatchObject({ log: 1, seq: 1 });
    await syncShared(lap.p);
    expect(await lap.read('tracks/13.json')).toEqual(shard(50));
    await desk.write('tracks/07.json', shard(50, i => i === 9 ? { rating: 5 } : {}));
    await syncShared(desk.p);
    expect(await server.counts('c1')).toMatchObject({ log: 2, seq: 2 });
    const { entries } = await server.cloudFor('c1', 'lap').log(1);
    expect(JSON.parse(await unpackText(entries[0].data)).f).toEqual({ 'tracks/07.json': { o: { schemaVersion: 1 }, i: { s9: song('s9', { rating: 5 }) } } });
    await syncShared(lap.p);
    expect((await lap.read<{ items: Record<string, { rating?: number }> }>('tracks/07.json'))!.items.s9.rating).toBe(5);
  });
  it('a long log is folded into the snapshot; a new device, and one far behind, read the snapshot then the log', async () => {
    const server = new SharedCloudServer();
    const desk = await device('desk', server), lap = await device('lap', server);
    await desk.write('lists/l1.json', { id: 'l1', name: 'Friday', items: [] });
    await desk.write('tracks/aa.json', trackShard({ aa1: song('aa1') }));
    await syncShared(desk.p); await syncShared(lap.p);
    for (let n = 1; n < COMPACT_AFTER; n++) { await desk.write('tracks/aa.json', trackShard({ aa1: song('aa1', { playCount: n }) })); await syncShared(desk.p); }
    const c = await server.counts('c1');
    expect(c.floor).toBe(COMPACT_AFTER);
    expect(c.log).toBe(0);
    await desk.write('lists/l1.json', { id: 'l1', name: 'Friday night', items: [] });
    await syncShared(desk.p);
    for (const d of [lap, await device('phone', server)]) {
      await syncShared(d.p);
      expect((await d.read<{ items: Record<string, { playCount?: number }> }>('tracks/aa.json'))!.items.aa1.playCount).toBe(COMPACT_AFTER - 1);
      expect((await d.read<{ name: string }>('lists/l1.json'))!.name).toBe('Friday night');
    }
  }, 60_000);
  it('what’s there from before the log is its snapshot: a device takes it, and its own sync state from before still works', async () => {
    const server = new SharedCloudServer();
    const list = JSON.stringify({ id: 'l1', name: 'Old', items: [] }), tracks = JSON.stringify(trackShard({ aa1: song('aa1') }));
    await server.seed('c1', 'My collection', { 'lists/l1.json': list, 'tracks/aa.json': tracks }, 'desk', 7);
    const desk = await device('desk', server), lap = await device('lap', server);
    // The desktop synced it before the log: its state has the old shape, at revision 7.
    await desk.write('tracks/aa.json', JSON.parse(tracks));
    await writeJSON(desk.p.root, 'cloud/shared/c1.json', { cursor: 7, files: { 'lists/l1.json': { rev: 7, hash: 'x', text: list }, 'tracks/aa.json': { rev: 7, hash: 'y', text: tracks } } });
    await desk.write('lists/l1.json', { id: 'l1', name: 'New', items: [] });
    expect((await syncShared(desk.p)).pushed).toBe(1);
    const r = await syncShared(lap.p);
    expect(r.changed.sort()).toEqual(['lists/l1.json', 'tracks/aa.json']);
    expect((await lap.read<{ name: string }>('lists/l1.json'))!.name).toBe('New');
  });
  it('a GLUE from before the log can’t push around it', async () => {
    const server = new SharedCloudServer();
    await server.seed('c1', 'x', {});
    const r = await server.answer('POST', new URL('https://x/v1/shared/c1/push'), 'lists/a.json\t0\t' + 'a'.repeat(64) + '\t1\tAAAA', 'old');
    expect(r?.status).toBe(410);
  });
});
