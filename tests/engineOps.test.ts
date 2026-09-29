import { describe, expect, it } from 'vitest';
import { MemDir, asDir } from './memfs';
import { readJSON, writeJSON, listNames } from '../src/store/fsx';
import { CollectionStore, type StoreOp } from '../src/store/collection';
import type { List, Track } from '../src/store/types';

const song = (id: string, o: Partial<Track> = {}): Track => ({ id, status: 'linked', rootId: 'r', relPath: id + '.mp3', importPath: null, fileName: id + '.mp3', size: 1, mtime: 1, title: 'Song ' + id, artist: 'A', album: '', genre: '', label: '', comment: '', year: '', duration: 60, format: null, addedAt: '', sources: [], ...o });
const list = (id: string, items: string[], o: Partial<List> = {}): List => ({ schemaVersion: 1, id, kind: 'playlist', name: id, parentId: null, position: 0, notes: '', items, origin: null, createdAt: '', ...o });

async function folder() {
  const root = asDir(new MemDir()), base = 'profiles/p/collections/c';
  await writeJSON(root, base + '/collection.json', { schemaVersion: 1, id: 'c', name: 'Main', createdAt: '', roots: [] });
  await writeJSON(root, base + '/tracks/aa.json', { schemaVersion: 1, items: { aa1: song('aa1'), aa2: song('aa2') } });
  await writeJSON(root, base + '/lists/l1.json', list('l1', ['aa1', 'aa2']));
  return { root, base };
}
async function files(root: ReturnType<typeof asDir>, base: string) {
  const out: Record<string, unknown> = {};
  for (const d of ['tracks', 'lists', 'analysis']) for (const n of await listNames(root, base + '/' + d, 'file').catch(() => [] as string[])) out[d + '/' + n] = await readJSON(root, `${base}/${d}/${n}`);
  out['collection.json'] = await readJSON(root, base + '/collection.json');
  return out;
}

describe('GLUE Home’s engine takes a tab’s changes as ops (ADR 0104)', () => {
  it('the same changes, made here or sent as ops and applied there, give the same files; the tab writes nothing', async () => {
    const edits = (s: CollectionStore) => {
      s.putTracks([{ ...s.tracks.get('aa1')!, rating: 4 }, song('aa3')]);
      s.putList(list('l2', ['aa3'], { name: 'Friday' }));
      s.removeTrack('aa2');
      s.putAnalysis('aa1', { v: 3, bpm: 124 } as never);
      s.meta.tags = ['Peak']; s.saveMeta();
      s.deleteList('l1');
    };
    // Made directly.
    const a = await folder(), sa = await CollectionStore.load(a.root, 'p', 'c');
    edits(sa); await sa.flush();
    // Made on a client copy, sent as ops, applied by the engine's store on the other folder.
    const b = await folder(), client = await CollectionStore.load(b.root, 'p', 'c'), engine = await CollectionStore.load(b.root, 'p', 'c');
    const ops: StoreOp[] = [];
    client.sink = op => ops.push(op);
    const wrote: string[] = [];
    engine.onWrote = paths => wrote.push(...paths);
    edits(client);
    expect(client.hasPending).toBe(false);
    await client.flush();                                   // nothing written by the client
    expect(await files(b.root, b.base)).toEqual(await files((await folder()).root, b.base));
    for (const op of JSON.parse(JSON.stringify(ops)) as StoreOp[]) engine.apply(op);   // as they travel
    await engine.flush();
    expect(await files(b.root, b.base)).toEqual(await files(a.root, a.base));
    expect(wrote).toEqual(expect.arrayContaining(['tracks/aa.json', 'lists/l2.json', 'lists/l1.json', 'collection.json']));
    // The client's copy shows the same as the files.
    expect([...client.tracks.keys()].sort()).toEqual(['aa1', 'aa3']);
    expect(client.lists.has('l1')).toBe(false);
  });
});
