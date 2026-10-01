import { describe, expect, it } from 'vitest';
import { writeUnwritten } from '../src/store/writeInfo';
import { isTransient } from '../src/core/library/analysed';
import type { CollectionStore } from '../src/store/collection';
import type { Track } from '../src/store/types';

const t = (id: string, rootId: string): Track => ({ id, status: 'linked', rootId, relPath: id + '.mp3', importPath: null, fileName: id + '.mp3', size: 10, mtime: 5, title: 'New ' + id, artist: '', album: '', genre: '', label: '', comment: '', year: '', duration: null, format: null, addedAt: '', sources: [], unwritten: ['title'] });
/** The parts of a store writeUnwritten uses. */
const store = (tracks: Track[]) => {
  const m = new Map(tracks.map(x => [x.id, x]));
  return { tracks: m, analysis: new Map(), putTrack: (x: Track) => m.set(x.id, x), putAnalysis: () => {} } as unknown as CollectionStore & { tracks: Map<string, Track> };
};

describe('song info into files, with a music folder that comes and goes (a network folder, 2026-10-01)', () => {
  it('a folder that can’t be reached is asked about once, and its songs wait: not failures, still unwritten', async () => {
    const s = store([t('a', 'nas'), t('b', 'nas'), t('c', 'local')]);
    const asked: string[] = [], wrote: string[] = [];
    const r = await writeUnwritten(s, async x => { wrote.push(x.id); return { size: 11, mtime: 6 }; }, { reachable: async x => { asked.push(x.rootId!); return x.rootId !== 'nas'; } });
    expect(r).toMatchObject({ written: 1, failed: 0, away: ['nas'] });
    expect(asked.sort()).toEqual(['local', 'nas']);
    expect(wrote).toEqual(['c']);
    expect(s.tracks.get('a')!.unwritten).toEqual(['title']);
    expect(s.tracks.get('c')!.unwritten).toBeUndefined();
  });
  it('a file that couldn’t be read just then is tried again, never kept as the song’s failure', () => {
    expect(isTransient('NotReadableError: The requested file could not be read, typically due to permission problems')).toBe(true);
    expect(isTransient('GLUE Home read only part of a.mp3 (100 of 200 bytes): its folder isn’t reachable right now')).toBe(true);
    expect(isTransient('The browser couldn’t decode it.')).toBe(false);
  });
});
