import { describe, expect, it } from 'vitest';
import { HomeStore } from '../src/store/home';
import { CollectionStore } from '../src/store/collection';
import { readJSON } from '../src/store/fsx';
import { newId, SCHEMA, type Track } from '../src/store/types';
import { MemDir, asDir } from './memfs';

const track = (over: Partial<Track> = {}): Track => ({
  id: newId(), status: 'linked', rootId: 'r1', relPath: 'a/b.flac', importPath: null, fileName: 'b.flac', size: 10, mtime: 1,
  title: 'T', artist: 'A', album: '', genre: '', label: '', comment: '', year: '', duration: 200, format: null,
  addedAt: '2026-09-24', sources: [], ...over,
});

describe('MCO folder store (ADR 0009 / 0018)', () => {
  it('creates profiles and collections as JSON files', async () => {
    const mem = new MemDir(), home = await HomeStore.open(asDir(mem));
    const p = await home.createProfile('João'), c = await home.createCollection(p, 'Club');
    expect(mem.paths()).toEqual([
      'mco.json',
      `profiles/${p.id}/collections/${c.id}/collection.json`,
      `profiles/${p.id}/profile.json`,
    ]);
    const again = await HomeStore.open(asDir(mem));
    expect(again.index.profiles.map(x => x.name)).toEqual(['João']);
    expect(again.index.lastProfile).toBe(p.id);
    expect((await again.loadProfile(p.id)).collections.map(x => x.name)).toEqual(['Club']);
  });

  it('writes only the shards that changed, and reloads identically', async () => {
    const mem = new MemDir(), home = await HomeStore.open(asDir(mem));
    const p = await home.createProfile('A'), c = await home.createCollection(p, 'C');
    const s = await CollectionStore.load(asDir(mem), p.id, c.id);
    const ts = Array.from({ length: 50 }, () => track());
    s.putTracks(ts);
    s.putList({ schemaVersion: SCHEMA, id: 'l1', kind: 'playlist', name: 'Warm-up', parentId: null, position: 0, notes: '', items: ts.slice(0, 3).map(t => t.id), origin: null, createdAt: '' });
    await s.flush();
    const before = mem.paths();
    const shardFiles = before.filter(x => x.includes('/tracks/'));
    expect(shardFiles.length).toBe(new Set(ts.map(t => t.id.slice(0, 2))).size);

    // Change one track: only its shard is rewritten (every other file keeps the same bytes object).
    const t0 = ts[0], shard = `tracks/${t0.id.slice(0, 2)}.json`, basePath = `profiles/${p.id}/collections/${c.id}/`;
    const fileData = async (path: string) => {
      const parts = path.split('/'); let d = mem;
      for (const x of parts.slice(0, -1)) d = await d.getDirectoryHandle(x);
      return (await d.getFileHandle(parts[parts.length - 1])).data;
    };
    const snapshot = new Map<string, Uint8Array>();
    for (const pth of before) snapshot.set(pth, await fileData(pth));
    s.putTrack({ ...t0, title: 'Renamed' });
    await s.flush();
    const rewritten: string[] = [];
    for (const pth of before) if ((await fileData(pth)) !== snapshot.get(pth)) rewritten.push(pth);
    expect(rewritten).toEqual([basePath + shard]);
    const shardData = await readJSON<{ items: Record<string, Track> }>(asDir(mem), basePath + shard);
    expect(shardData!.items[t0.id].title).toBe('Renamed');

    const re = await CollectionStore.load(asDir(mem), p.id, c.id);
    expect(re.tracks.size).toBe(50);
    expect(re.tracks.get(t0.id)!.title).toBe('Renamed');
    expect(re.lists.get('l1')!.items).toEqual(ts.slice(0, 3).map(t => t.id));
  });

  it('deleting a folder list deletes its children and their files', async () => {
    const mem = new MemDir(), home = await HomeStore.open(asDir(mem));
    const p = await home.createProfile('A'), c = await home.createCollection(p, 'C');
    const s = await CollectionStore.load(asDir(mem), p.id, c.id);
    const base = { schemaVersion: SCHEMA, notes: '', items: [], origin: null, createdAt: '', position: 0 };
    s.putList({ ...base, id: 'f', kind: 'folder', name: 'Gigs', parentId: null });
    s.putList({ ...base, id: 'p', kind: 'playlist', name: 'Friday', parentId: 'f' });
    await s.flush();
    s.deleteList('f');
    await s.flush();
    expect(mem.paths().filter(x => x.includes('/lists/'))).toEqual([]);
  });

  it('refuses files written by a newer MCO', async () => {
    const mem = new MemDir();
    await mem.put('mco.json', JSON.stringify({ schemaVersion: SCHEMA + 1, profiles: [], lastProfile: null }));
    await expect(HomeStore.open(asDir(mem))).rejects.toThrow(/newer version/);
  });
});

describe('surviving interrupted writes', () => {
  it('treats an empty file as missing and sets a damaged one aside', async () => {
    const mem = new MemDir(), home = await HomeStore.open(asDir(mem));
    const p = await home.createProfile('A'), c = await home.createCollection(p, 'C');
    const s = await CollectionStore.load(asDir(mem), p.id, c.id);
    const good = track({ id: 'aa00000000000000' });
    s.putTrack(good);
    await s.flush();
    const base = `profiles/${p.id}/collections/${c.id}`;
    await mem.put(`${base}/tracks/bb.json`, '');                 // crash during the first write of a new file
    await mem.put(`${base}/tracks/cc.json`, '{"schemaVersion":1,"it');
    const again = await CollectionStore.load(asDir(mem), p.id, c.id);
    expect([...again.tracks.keys()]).toEqual(['aa00000000000000']);
    expect(again.damaged).toEqual(['tracks/cc.json']);
    expect(mem.paths()).toContain(`${base}/tracks/cc.damaged`);
  });
});

describe('deleting while a save is running (10k-track libraries hit this constantly)', () => {
  it('a list or import deleted mid-save is removed, not written, and other changes still save', async () => {
    const mem = new MemDir(), home = await HomeStore.open(asDir(mem));
    const p = await home.createProfile('A'), c = await home.createCollection(p, 'C');
    const s = await CollectionStore.load(asDir(mem), p.id, c.id);
    const base = `profiles/${p.id}/collections/${c.id}`;
    s.putList({ schemaVersion: SCHEMA, id: 'l1', kind: 'playlist', name: 'Doomed', parentId: null, position: 0, notes: '', items: [], origin: null, createdAt: '' });
    s.putSource({ schemaVersion: SCHEMA, id: 's1', app: 'rekordbox', name: 'r', fileName: 'r.xml', importedAt: '', tracks: [], lists: 0 });
    s.putTrack(track({ id: 'ab00000000000000' }));
    const saving = s.flush();          // the save has taken its list of files…
    s.deleteList('l1'); s.deleteSource('s1');   // …and these go before it writes them
    await expect(saving).resolves.toBeUndefined();
    await expect(s.flush()).resolves.toBeUndefined();
    expect(mem.paths().filter(x => x.includes('/lists/') || x.includes('/sources/'))).toEqual([]);
    expect(mem.paths()).toContain(`${base}/tracks/ab.json`);
    expect(s.hasPending).toBe(false);
  });
});
