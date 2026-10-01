import { describe, expect, it } from 'vitest';
import { HomeStore } from '../src/store/home';
import { CollectionStore } from '../src/store/collection';
import { applyScan } from '../src/store/merge';
import { scanFolder } from '../src/core/library/scan';
import { MemDir, asDir } from './memfs';

// A music folder with something in it that can't be read (ADR 0134). The user's report, 2026-10-01: on a Mac, a
// network folder's scan failed as a whole ("Can't scan Música: Bad Path") because one name in it couldn't be opened.
type Fake = { kind: 'file' | 'directory'; name: string; entries?: () => AsyncIterable<[string, Fake]> };
const file = (name: string): Fake => ({ kind: 'file', name });
const dir = (name: string, kids: Fake[] | 'unreadable'): Fake => ({
  kind: 'directory', name,
  entries: async function* () {
    if (kids === 'unreadable') throw new Error('bad path');
    for (const k of kids) yield [k.name, k] as [string, Fake];
  },
});
const scan = (d: Fake) => scanFolder(d as unknown as FileSystemDirectoryHandle);

describe('scanning past what can’t be read', () => {
  it('skips a folder inside that can’t be listed, says which, and keeps the rest', async () => {
    const r = await scan(dir('Música', [file('a.mp3'), dir('Remixes', 'unreadable'), dir('House', [file('b.flac'), dir('Odd', 'unreadable')])]));
    expect(r.files.map(f => f.relPath).sort()).toEqual(['House/b.flac', 'a.mp3']);
    expect(r.unreadable.sort()).toEqual(['House/Odd', 'Remixes']);
  });

  it('the folder itself unreadable still fails the scan (a network folder not connected)', async () => {
    await expect(scan(dir('Música', 'unreadable'))).rejects.toThrow('bad path');
  });

  it('songs it couldn’t read are left as they were, not marked missing', async () => {
    const mem = new MemDir(), home = await HomeStore.open(asDir(mem));
    const p = await home.createProfile('A'), c = await home.createCollection(p, 'C');
    const s = await CollectionStore.load(asDir(mem), p.id, c.id);
    s.meta.roots.push({ id: 'r1', name: 'Música', absPath: null, handleKey: 'k', addedAt: '' });
    applyScan(s, 'r1', ['a.mp3', 'Remixes/x.mp3', 'House/c.mp3', 'gone.mp3'].map(relPath => ({ relPath, size: 1, mtime: 1, fileName: relPath.split('/').pop()! })));
    const res = applyScan(s, 'r1', [{ relPath: 'a.mp3', size: 1, mtime: 1, fileName: 'a.mp3' }], { files: ['House/c.mp3'], folders: ['Remixes'] });
    expect(res.missing).toBe(1);
    const status = Object.fromEntries([...s.tracks.values()].map(t => [t.relPath, t.status]));
    expect(status).toEqual({ 'a.mp3': 'linked', 'Remixes/x.mp3': 'linked', 'House/c.mp3': 'linked', 'gone.mp3': 'missing' });
  });
});
