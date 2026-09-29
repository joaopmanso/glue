/* What a sync costs on a big library (the user's: 13,000 songs), in bytes read and written in the GLUE
   folder. A push of a few analysed songs must cost about those songs' files, never the whole collection
   (the memory blow-up of GLUE Home 0.31). */
import { describe, expect, it } from 'vitest';
import { MemDir, MemFile, asDir } from './memfs';
import { writeJSON } from '../src/store/fsx';
import { syncShared, type Place } from '../src/store/shared/engine';
import { SharedCloudServer } from './sharedCloud';

const io = { read: 0, written: 0 };
const getFile = MemFile.prototype.getFile, createWritable = MemFile.prototype.createWritable;
MemFile.prototype.getFile = function (this: MemFile) { io.read += this.data.length; return getFile.call(this); };
MemFile.prototype.createWritable = async function (this: MemFile) {
  const w = await createWritable.call(this), self = this;
  return { ...w, async close() { await w.close(); io.written += self.data.length; } };
};
const measure = async (f: () => Promise<unknown>) => { io.read = 0; io.written = 0; await f(); return { ...io }; };

const hex = (n: number) => n.toString(16).padStart(2, '0');
const SONGS = 13_000, SHARDS = 256;
const song = (i: number, o: Record<string, unknown> = {}) => ({
  id: hex(i % SHARDS) + i.toString(16).padStart(6, '0'), title: 'Song number ' + i, artist: 'Some Artist ' + (i % 500), album: 'An Album ' + (i % 900),
  genre: 'Techno', label: 'A Label', comment: '', year: '2019', duration: 300 + (i % 60), addedAt: '2026-09-29T17:09:51.707Z',
  format: { container: 'AIFF', codec: 'PCM', lossless: true, sampleRate: 44100, bits: 16, bitrate: 1411, channels: 2 },
  copies: { desk: { status: 'linked', rootId: 'r1', relPath: 'Music/Some Artist/An Album/Song number ' + i + '.aiff', importPath: null, size: 52_906_812, mtime: 1587152030000, sources: [] } }, ...o,
});
const summary = (i: number) => ({ desk: { v: 9, verdict: 'ok', score: 0.9, bpm: 120 + (i % 20), key: '8A', lufs: -9.1, peak: -0.3, cutoff: 20500, notes: ['A summary of the song, some words'], at: '2026-09-29T17:10:00Z', size: 52_906_812, mtime: 1587152030000 } });

async function library(root: MemDir, pid: string, edit?: (i: number) => Record<string, unknown> | null) {
  const at = (p: string) => `profiles/${pid}/collections/c1/${p}`;
  await writeJSON(asDir(root), at('collection.json'), { id: 'c1', name: 'My collection', shared: true, rootsBy: { desk: [] }, members: { desk: { profile: pid, name: 'Desktop' } } });
  for (let s = 0; s < SHARDS; s++) {
    const items: Record<string, unknown> = {}, an: Record<string, unknown> = {};
    for (let i = s; i < SONGS; i += SHARDS) { const t = song(i, edit?.(i) ?? {}); items[t.id] = t; an[t.id] = summary(i); }
    await writeJSON(asDir(root), at(`tracks/${hex(s)}.json`), { schemaVersion: 1, items });
    await writeJSON(asDir(root), at(`analysis/${hex(s)}.json`), { schemaVersion: 1, items: an });
  }
}

describe('what a sync costs on a 13,000-song library', () => {
  it('a push of 25 changed songs reads and writes about their files, not the collection; so does taking it in elsewhere', async () => {
    const server = new SharedCloudServer(), root = new MemDir(), lapRoot = new MemDir();
    const p: Place = { root: asDir(root), pid: 'p1', cid: 'c1', me: 'desk', cloud: server.cloudFor('c1', 'desk') };
    const lap: Place = { root: asDir(lapRoot), pid: 'p1', cid: 'c1', me: 'lap', cloud: server.cloudFor('c1', 'lap') };
    await library(root, 'p1');
    await syncShared(p);
    await syncShared(lap, []);
    // 25 songs rated, in 25 shards: their files change.
    const rated = new Set(Array.from({ length: 25 }, (_, k) => k * 7));
    const touched: string[] = [];
    const at = (x: string) => `profiles/p1/collections/c1/${x}`;
    for (const sh of new Set([...rated].map(i => i % SHARDS))) {
      const items: Record<string, unknown> = {};
      for (let i = sh; i < SONGS; i += SHARDS) { const t = song(i, rated.has(i) ? { rating: 5 } : {}); items[t.id] = t; }
      await writeJSON(asDir(root), at(`tracks/${hex(sh)}.json`), { schemaVersion: 1, items });
      touched.push(`tracks/${hex(sh)}.json`);
    }
    const pushed = await measure(() => syncShared(p, touched));
    const taken = await measure(() => syncShared(lap, []));
    const full = await measure(() => syncShared(p));
    console.log('a push of 25 songs', pushed, 'taking it in', taken, 'a full look (nothing changed)', full);
    // Each shard file is ~26 kB here (the collection ~10 MB): 25 of them, and their agreed copies.
    for (const x of [pushed, taken]) { expect(x.read).toBeLessThan(2_000_000); expect(x.written).toBeLessThan(2_000_000); }
    // The full look (at start, and now and then) reads everything but writes nothing but the cursor.
    expect(full.written).toBeLessThan(1000);
    const one = JSON.parse(new TextDecoder().decode(((await (await (await (await (await lapRoot.getDirectoryHandle('profiles')).getDirectoryHandle('p1')).getDirectoryHandle('collections')).getDirectoryHandle('c1')).getDirectoryHandle('tracks')).children.get('07.json') as MemFile).data));
    expect(one.items[song(7).id].rating).toBe(5);
  }, 120_000);
});
