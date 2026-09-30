import { describe, expect, it } from 'vitest';
import { describeRemoval, orphans, removalImpact } from '../src/core/library/removal';
import type { List, Track } from '../src/store/types';

const t = (id: string, over: Partial<Track> = {}): Track => ({ id, status: 'linked', rootId: 'r1', relPath: id + '.wav', importPath: null, fileName: id + '.wav', size: 1, mtime: 1, title: id, artist: '', album: '', genre: '', label: '', comment: '', year: '', duration: 1, format: null, addedAt: '', sources: [], ...over } as Track);
const list = (id: string, items: string[], over: Partial<List> = {}): List => ({ schemaVersion: 1, id, kind: 'playlist', name: id, parentId: null, position: 0, notes: '', items, origin: null, createdAt: '', ...over } as List);

describe('removing songs says what goes with them (ADR 0111)', () => {
  it('counts ratings, notes, cues and playlist places; songs another computer has stay', () => {
    const ts = [t('a', { rating: 4 }), t('b', { notes: 'warm-up' }), t('c', { prep: { cues: [{ at: 1 } as never] } }), t('d', { onDevices: ['Desktop', 'Laptop'] })];
    const r = removalImpact(ts, [list('p1', ['a', 'b', 'x']), list('p2', ['a']), list('dj', ['c'], { origin: { sourceId: 's', externalId: 'e' } as never })]);
    expect(r).toEqual({ songs: 3, rated: 1, noted: 1, prepared: 1, inPlaylists: 2, playlists: 2, elsewhere: 1 });
    expect(describeRemoval(r)).toBe('3 songs, 1 rated, 1 with notes, 1 prepared (cues, grid), 2 in 2 playlists');
  });
  it('orphans: this computer’s songs with no folder, library, own file or other computer', () => {
    const ts = [
      t('orphan', { status: 'unlinked', rootId: null, relPath: null }),
      t('imported', { status: 'unlinked', rootId: null, relPath: null, importPath: 'C:/x.wav', sources: ['s1'] }),
      t('own', { status: 'unlinked', rootId: null, relPath: null, fileKey: 'copy:x' }),
      t('theirs', { status: 'unlinked', rootId: null, relPath: null, remote: { device: 'lap', name: 'Laptop' } }),
      t('linked'),
    ];
    expect(orphans(ts).map(x => x.id)).toEqual(['orphan']);
  });
});
