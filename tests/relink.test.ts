import { describe, expect, it } from 'vitest';
import { matchTracks } from '../src/core/library/match';
import { parseTraktorNml } from '../src/core/interop/traktor';
import { HomeStore } from '../src/store/home';
import { CollectionStore } from '../src/store/collection';
import { applyImport, applyScan, tidyTracks } from '../src/store/merge';
import { blankTrack, type ImportedLibrary } from '../src/core/interop/types';
import { SCHEMA, type Track } from '../src/store/types';
import { MemDir, asDir } from './memfs';

const SIZE = 15464345, NAME = '02-pen_dub-sosban_fach-mkd.mp3';

async function withTwoCopies() {
  const mem = new MemDir(), home = await HomeStore.open(asDir(mem));
  const p = await home.createProfile('P'), c = await home.createCollection(p, 'C');
  const s = await CollectionStore.load(asDir(mem), p.id, c.id);
  s.meta.roots.push({ id: 'mc', name: 'Music Collection', absPath: 'F:\\Music Collection', handleKey: 'k1', addedAt: '' }, { id: 'prep', name: 'preparation', absPath: 'F:\\preparation', handleKey: 'k2', addedAt: '' });
  applyScan(s, 'mc', [{ relPath: NAME, size: SIZE, mtime: 1, fileName: NAME }]);
  applyScan(s, 'prep', [{ relPath: 'mp3/' + NAME, size: SIZE, mtime: 1, fileName: NAME }]);
  return s;
}
const engine = (paths: string[]): ImportedLibrary => ({ app: 'engine', name: 'Engine DJ (m.db)', tracks: paths.map((path, i) => { const t = blankTrack(String(i + 1), path); t.size = SIZE; t.title = 'T' + i; return t; }), lists: [] });
const trackIn = (s: CollectionStore, root: string) => [...s.tracks.values()].find(t => t.rootId === root)!;

describe('imported tracks find their files (the user’s report, 2026-09-26)', () => {
  it('a relative path names the music folder: "../Music Collection/x" is the x in Music Collection', () => {
    const files = [
      { rootId: 'mc', relPath: NAME, size: SIZE, mtime: 1, under: 'F:\\Music Collection' },
      { rootId: 'prep', relPath: 'mp3/' + NAME, size: SIZE, mtime: 1, under: 'F:\\preparation' },
    ];
    const { links, rootPaths } = matchTracks([{ id: 'a', importPath: '../Music Collection/' + NAME, fileName: NAME, size: SIZE }], files);
    expect(links.get('a')?.rootId).toBe('mc');
    expect(rootPaths.size).toBe(0);   // a relative path says nothing about where the folder is
  });

  it('an import links it to the right copy', async () => {
    const s = await withTwoCopies();
    applyImport(s, engine(['../Music Collection/' + NAME]), 'm.db');
    expect([...s.tracks.values()].filter(t => t.status === 'unlinked')).toEqual([]);
    expect(trackIn(s, 'mc').sources).toHaveLength(1);
  });

  it('a record an earlier import left without its file folds into it on the next read, with what the user set', async () => {
    const s = await withTwoCopies();
    const r = applyImport(s, engine([]), 'm.db');
    const stray: Track = { ...trackIn(s, 'mc'), id: 'stray', status: 'unlinked', rootId: null, relPath: null, importPath: '../Music Collection/' + NAME, rating: 4, sources: [r.sourceId] };
    s.putTrack(stray);
    s.putList({ schemaVersion: SCHEMA, id: 'mine', kind: 'playlist', name: 'Mine', parentId: null, position: 0, notes: '', items: ['stray'], origin: null, createdAt: '' });
    applyImport(s, engine(['../Music Collection/' + NAME]), 'm.db');
    expect(s.tracks.has('stray')).toBe(false);
    const mc = trackIn(s, 'mc');
    expect(mc.rating).toBe(4);
    expect(s.lists.get('mine')!.items).toEqual([mc.id]);
  });

  it('what a library no longer has goes: its records without a file; tracks with a file only stop naming it', async () => {
    const s = await withTwoCopies();
    const r = applyImport(s, engine(['../Music Collection/' + NAME, 'D:/gone/other.mp3']), 'm.db');
    expect([...s.tracks.values()].filter(t => t.status === 'unlinked')).toHaveLength(1);
    const again = applyImport(s, engine([]), 'm.db');
    expect(again.dropped).toBe(1);
    expect([...s.tracks.values()].filter(t => t.status === 'unlinked')).toEqual([]);
    expect(trackIn(s, 'mc').sources).not.toContain(r.sourceId);
  });

  it('opening tidies: names of removed imports go, their leftovers go, strays find their file', async () => {
    const s = await withTwoCopies();
    const r = applyImport(s, engine([]), 'm.db');
    const base = trackIn(s, 'mc');
    s.putTrack({ ...base, id: 'left', status: 'unlinked', rootId: null, relPath: null, importPath: 'C:/x.mp3', fileName: 'x.mp3', sources: ['removed'] });
    s.putTrack({ ...base, id: 'stray', status: 'unlinked', rootId: null, relPath: null, importPath: '../Music Collection/' + NAME, sources: [r.sourceId, 'removed'] });
    expect(tidyTracks(s)).toEqual({ unlinked: 2, dropped: 1, relinked: 1 });
    expect(s.tracks.has('left') || s.tracks.has('stray')).toBe(false);
    expect(trackIn(s, 'mc').sources).toEqual([r.sourceId]);
  });

  it('Traktor’s own factory sounds aren’t imported', () => {
    const nml = `<?xml version="1.0"?><NML VERSION="19"><COLLECTION ENTRIES="2">
<ENTRY TITLE="ClosedHH DMX V1" ARTIST="Native Instruments"><LOCATION DIR="/:ProgramData/:Native Instruments/:Traktor Pro 3/:Factory Sounds/:" FILE="ClosedHH DMX V1.flac" VOLUME="C:"/></ENTRY>
<ENTRY TITLE="Song" ARTIST="Me"><LOCATION DIR="/:Music Collection/:" FILE="song.mp3" VOLUME="F:"/></ENTRY>
</COLLECTION><PLAYLISTS/></NML>`;
    expect(parseTraktorNml(nml).tracks.map(t => t.title)).toEqual(['Song']);
  });
});
