import { describe, expect, it } from 'vitest';
import { HomeStore } from '../src/store/home';
import { CollectionStore } from '../src/store/collection';
import { applyImport, applyScan } from '../src/store/merge';
import { blankTrack, type ImportedLibrary } from '../src/core/interop/types';
import { MemDir, asDir } from './memfs';

async function fresh() {
  const mem = new MemDir(), home = await HomeStore.open(asDir(mem));
  const p = await home.createProfile('A'), c = await home.createCollection(p, 'C');
  const s = await CollectionStore.load(asDir(mem), p.id, c.id);
  s.meta.roots.push({ id: 'r1', name: 'Music', absPath: null, handleKey: 'k', addedAt: '' });
  return { mem, s, pid: p.id, cid: c.id };
}
function library(): ImportedLibrary {
  const a = Object.assign(blankTrack('1', 'C:/Users/j/Music/House/a.flac'), { title: 'A', artist: 'X', bpm: 124, key: '8A', size: 100, rating: 4 });
  const b = Object.assign(blankTrack('2', 'C:/Users/j/Music/Techno/b.mp3'), { title: 'B', size: 50 });
  return {
    app: 'rekordbox', name: 'rekordbox (rekordbox.xml)', tracks: [a, b],
    lists: [{ externalId: 'f', kind: 'folder', name: 'Gigs', parent: null, items: [] }, { externalId: 'p', kind: 'playlist', name: 'Fri', parent: 'f', items: ['2', '1'] }],
  };
}

describe('bringing libraries and folders into a collection (ADR 0020)', () => {
  it('imports first, then links tracks when their folder is scanned', async () => {
    const { s } = await fresh();
    const r = applyImport(s, library(), 'rekordbox.xml');
    expect(r).toMatchObject({ tracks: 2, lists: 2, linked: 0 });
    expect([...s.tracks.values()].every(t => t.status === 'unlinked')).toBe(true);
    const lists = [...s.lists.values()];
    const top = lists.find(l => !l.parentId)!, gigs = lists.find(l => l.name === 'Gigs')!, fri = lists.find(l => l.name === 'Fri')!;
    expect(top.name).toBe('rekordbox');
    expect(gigs.parentId).toBe(top.id);
    expect(fri.parentId).toBe(gigs.id);
    expect(fri.items.map(id => s.tracks.get(id)!.title)).toEqual(['B', 'A']);
    expect(s.tracks.get(fri.items[1])!.rating).toBe(4);   // the DJ app's rating becomes the track's own

    const scan = applyScan(s, 'r1', [
      { relPath: 'House/a.flac', size: 100, mtime: 5, fileName: 'a.flac' },
      { relPath: 'Techno/b.mp3', size: 50, mtime: 5, fileName: 'b.mp3' },
      { relPath: 'New/c.wav', size: 9, mtime: 5, fileName: 'c.wav' },
    ]);
    expect(scan.linked).toBe(2);
    expect(scan.added.map(t => t.fileName)).toEqual(['c.wav']);
    expect(s.tracks.size).toBe(3);
    expect(s.tracks.get(fri.items[1])).toMatchObject({ status: 'linked', rootId: 'r1', relPath: 'House/a.flac' });
    expect(s.meta.roots[0].absPath).toBe('C:\\Users\\j\\Music');
  });

  it('re-importing refreshes playlists without duplicating tracks; scanning first then importing merges', async () => {
    const { s } = await fresh();
    applyScan(s, 'r1', [{ relPath: 'House/a.flac', size: 100, mtime: 5, fileName: 'a.flac' }]);
    const r1 = applyImport(s, library(), 'rekordbox.xml');
    expect(r1.linked).toBe(1);
    expect(s.tracks.size).toBe(2);
    const r2 = applyImport(s, library(), 'rekordbox.xml');
    expect(r2.sourceId).toBe(r1.sourceId);
    expect(r2.matched).toBe(2);
    expect(s.tracks.size).toBe(2);
    expect([...s.lists.values()].filter(l => l.name === 'Fri')).toHaveLength(1);
    expect(s.sources.size).toBe(1);
  });

  it('flags files that disappeared and persists everything', async () => {
    const { mem, s, pid, cid } = await fresh();
    applyScan(s, 'r1', [{ relPath: 'a.flac', size: 1, mtime: 1, fileName: 'a.flac' }]);
    const res = applyScan(s, 'r1', []);
    expect(res.missing).toBe(1);
    s.saveMeta();
    await s.flush();
    const again = await CollectionStore.load(asDir(mem), pid, cid);
    expect([...again.tracks.values()][0].status).toBe('missing');
    expect(again.meta.roots).toHaveLength(1);
  });
});

describe('the same song in a folder GLUE doesn’t read (a second copy)', () => {
  /** Engine-like: record 1 in "Music Collection" (a music folder here), record 2 a copy in
      "preparation" (not a music folder) with the same name and size; the playlist uses the copy. */
  function withCopy(): ImportedLibrary {
    const inFolder = Object.assign(blankTrack('1', '../Music Collection/01-song.mp3'), { title: 'Song', size: 12057962 });
    const copy = Object.assign(blankTrack('2', '../preparation/SOULSEEK/Album/01-song.mp3'), { title: 'Song', size: 12057962 });
    return { app: 'engine', name: 'Engine DJ', tracks: [inFolder, copy], lists: [{ externalId: 'p', kind: 'playlist', name: 'DNB', parent: null, items: ['2'] }] };
  }
  it('is the track that has its file: one row, and the playlist plays it', async () => {
    const { s } = await fresh();
    applyScan(s, 'r1', [{ relPath: '01-song.mp3', size: 12057962, mtime: 5, fileName: '01-song.mp3' }]);
    applyImport(s, withCopy(), 'm.db');
    expect([...s.tracks.values()].map(t => t.status)).toEqual(['linked']);
    const dnb = [...s.lists.values()].find(l => l.name === 'DNB')!, t = s.tracks.get(dnb.items[0])!;
    expect(t.relPath).toBe('01-song.mp3');
  });
  it('a re-import folds a copy an earlier import left unlinked into it, keeping what the user set', async () => {
    const { s } = await fresh();
    applyScan(s, 'r1', [{ relPath: '01-song.mp3', size: 12057962, mtime: 5, fileName: '01-song.mp3' }]);
    // As an earlier import left it: the copy as its own unlinked track, in a playlist of the user's.
    const before = withCopy();
    before.tracks[1].size = null;          // (it didn't know the size, so it stayed apart)
    applyImport(s, before, 'm.db');
    const stray = [...s.tracks.values()].find(t => t.status === 'unlinked')!;
    s.putTrack({ ...stray, notes: 'big tune' });
    s.putList({ schemaVersion: 1, id: 'mine', kind: 'playlist', name: 'Mine', parentId: null, position: 0, notes: '', items: [stray.id], origin: null, createdAt: '' });
    applyImport(s, withCopy(), 'm.db');   // "Update"
    const tracks = [...s.tracks.values()];
    expect(tracks.length).toBe(1);
    expect(tracks[0].notes).toBe('big tune');
    expect(s.lists.get('mine')!.items).toEqual([tracks[0].id]);
  });
});
