import { describe, expect, it } from 'vitest';
import { HomeStore } from '../src/store/home';
import { CollectionStore } from '../src/store/collection';
import { readJSON } from '../src/store/fsx';
import { autoBackup } from '../src/store/backup';
import { newId, SCHEMA, shardOf, type Track } from '../src/store/types';
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

describe('the bin (ADR 0090)', () => {
  it('keeps a deleted folder with everything in it, and puts it back where it was', async () => {
    const mem = new MemDir(), home = await HomeStore.open(asDir(mem));
    const p = await home.createProfile('DJ'), c = await home.createCollection(p, 'Club');
    const s = await CollectionStore.load(asDir(mem), p.id, c.id);
    const t = track(); s.putTracks([t]);
    const L = (id: string, kind: 'folder' | 'playlist', parentId: string | null, items: string[] = []) => ({ schemaVersion: SCHEMA, id, kind, name: id, parentId, position: 0, notes: '', items, origin: null, createdAt: '' });
    s.putList(L('top', 'folder', null)); s.putList(L('gigs', 'folder', 'top')); s.putList(L('friday', 'playlist', 'gigs', [t.id]));
    await s.flush();
    s.deleteList('gigs');
    await s.flush();
    expect(mem.paths().filter(x => x.includes('/lists/')).length).toBe(1);   // only "top" is left
    const bin = await s.binEntries();
    expect(bin).toHaveLength(1);
    expect(bin[0].lists.map(l => l.id)).toEqual(['gigs', 'friday']);
    expect(await s.restoreFromBin(bin[0].name)).toBe(2);
    const re = await CollectionStore.load(asDir(mem), p.id, c.id);
    expect(re.lists.get('gigs')).toMatchObject({ parentId: 'top' });
    expect(re.lists.get('friday')).toMatchObject({ parentId: 'gigs', items: [t.id] });
    expect(await re.binEntries()).toEqual([]);
  });
});

describe('daily backups (ADR 0090)', () => {
  it('one a day per profile, the last 14 kept, without the songs', async () => {
    const mem = new MemDir(), home = await HomeStore.open(asDir(mem));
    const p = await home.createProfile('DJ');
    await home.createCollection(p, 'Club');
    const prof = await home.loadProfile(p.id);
    expect(await autoBackup(asDir(mem), prof, '2026-09-01')).toBe(true);
    expect(await autoBackup(asDir(mem), prof, '2026-09-01')).toBe(false);
    for (let d = 2; d <= 16; d++) await autoBackup(asDir(mem), prof, '2026-09-' + String(d).padStart(2, '0'));
    const kept = mem.paths().filter(x => x.startsWith('backups/auto/')).sort();
    expect(kept).toHaveLength(14);
    expect(kept[0]).toBe(`backups/auto/2026-09-03-${p.id}.zip`);
  });
});

describe('a shared collection’s computer (ADR 0108)', () => {
  // Shaped like the user's collection on 2026-09-30: the desktop's entry claimed by another browser's folder
  // (pedge), a stand-in written by the desktop's own folder (b2df), the laptop untouched.
  const copy = (rootId: string, relPath: string) => ({ status: 'linked', rootId, relPath, importPath: null, size: 10, mtime: 1, sources: [] });
  const song = (id: string, added: string, copies: Record<string, unknown>) => ({ id, fileName: id + '.wav', title: id, artist: '', album: '', genre: '', label: '', comment: '', year: '', duration: 1, format: null, addedAt: added, copies });
  async function folder() {
    const mem = new MemDir(), root = asDir(mem), base = 'profiles/b2df/collections/bf92';
    const { writeJSON } = await import('../src/store/fsx');
    await writeJSON(root, base + '/collection.json', {
      schemaVersion: SCHEMA, id: 'bf92', name: 'My collection', createdAt: '', shared: true,
      members: { lap: { profile: 'plap', name: 'INW Laptop' }, mmJiL: { profile: 'pedge', name: 'Desktop' }, 'this-computer': { profile: 'b2df', name: 'This computer' } },
      rootsBy: { lap: [], mmJiL: [{ id: 'incoming', name: 'TO BE SORTED', hidden: true }, { id: 'music', name: 'Music' }], 'this-computer': [{ id: 'incoming', name: 'TO BE SORTED', hidden: true }] },
    });
    const items = { a: song('a', '2026-09-01', { mmJiL: copy('music', 'a.wav'), 'this-computer': copy('music', 'a.wav') }), b: song('b', '2026-09-01', { mmJiL: copy('incoming', 'b.wav') }), b2: song('b2', '2026-09-30', { 'this-computer': copy('incoming', 'b.wav') }), l: song('l', '2026-09-01', { lap: copy('lr', 'l.wav') }) };
    const byShard: Record<string, Record<string, unknown>> = {};
    for (const [id, t] of Object.entries(items)) (byShard[shardOf(id)] ??= {})[id] = t;
    for (const [sh, its] of Object.entries(byShard)) await writeJSON(root, `${base}/tracks/${sh}.json`, { schemaVersion: SCHEMA, items: its });
    await writeJSON(root, `${base}/lists/p1.json`, { schemaVersion: SCHEMA, id: 'p1', kind: 'playlist', name: 'Set', parentId: null, position: 0, notes: '', items: ['b2', 'a'], origin: null, createdAt: '' });
    return { mem, root, base };
  }
  const allText = (mem: MemDir) => mem.paths().map(p => p).join('\n');

  it('a store that isn’t this computer’s folder, or doesn’t know its computer, writes none of its parts', async () => {
    const { root, base } = await folder();
    const s = await CollectionStore.load(root, 'b2df', 'bf92', { me: 'mmJiL' });   // the entry names another folder
    expect(s.shared!.own).toBe(false);
    s.putTrack({ ...s.tracks.get('a')!, rating: 5, relPath: 'elsewhere.wav' });
    await s.flush();
    const a = (await readJSON<{ items: Record<string, { rating?: number; copies: Record<string, { relPath: string }> }> }>(root, base + '/tracks/' + shardOf('a') + '.json'))!.items.a;
    expect(a.rating).toBe(5);                                  // the song's own facts are anyone's to change
    expect(a.copies.mmJiL.relPath).toBe('a.wav');              // the computer's copy isn't
    const n = await CollectionStore.load(root, 'b2df', 'bf92', { me: 'this-computer' });
    expect(n.shared!.here.me).not.toBe('this-computer');
  });

  it('GLUE Home, knowing its computer, folds the stand-in back and takes the entry; the twin row folds into the older one', async () => {
    const { mem, root, base } = await folder();
    const s = await CollectionStore.load(root, 'b2df', 'bf92', { me: 'mmJiL' });
    const r = s.foldComputer('mmJiL')!;
    expect(r.twins).toEqual([['b2', 'b']]);
    const { absorbTracks } = await import('../src/store/merge');
    absorbTracks(s, new Map(r.twins.map(([from, into]) => [from, s.tracks.get(into)!])));
    await s.flush();
    const meta = (await readJSON<{ members: Record<string, { profile: string }>; rootsBy: Record<string, unknown> }>(root, base + '/collection.json'))!;
    expect(Object.keys(meta.members).sort()).toEqual(['lap', 'mmJiL']);
    expect(meta.members.mmJiL.profile).toBe('b2df');
    expect(Object.keys(meta.rootsBy).sort()).toEqual(['lap', 'mmJiL']);
    const again = await CollectionStore.load(root, 'b2df', 'bf92', { me: 'mmJiL' });
    expect(again.shared!.own).toBe(true);
    expect([...again.tracks.keys()].sort()).toEqual(['a', 'b', 'l']);
    expect(again.lists.get('p1')!.items).toEqual(['b', 'a']);
    for (const p of mem.paths()) if (p.endsWith('.json')) expect(JSON.stringify(await readJSON(root, p)), p).not.toContain('this-computer');
    expect(allText(mem)).not.toContain('this-computer');
    // Nothing more to do the next time.
    expect(again.foldComputer('mmJiL')).toBeNull();
  });
});
