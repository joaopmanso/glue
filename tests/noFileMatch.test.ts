import { describe, expect, it } from 'vitest';
import { relinkMatches, relinkScore, type Songish } from '../src/core/library/relink';
import { HomeStore } from '../src/store/home';
import { CollectionStore } from '../src/store/collection';
import { applyImport, applyScan, linkRecords } from '../src/store/merge';
import { importLists } from '../src/store/linked';
import { blankTrack, type ImportedLibrary } from '../src/core/interop/types';
import { MemDir, asDir } from './memfs';

const song = (o: Partial<Songish> & { id: string }): Songish => ({ title: '', artist: '', album: '', duration: null, fileName: o.id + '.mp3', size: null, ...o });

describe('a song with no file, matched to the library’s (ADR 0124)', () => {
  const kept = song({ id: 'k', title: 'Night Drive', artist: 'Test Artist', duration: 301, fileName: 'Test Artist - Night Drive.flac' });
  it('the same title, artist and length is sure; a file name only goes a long way too', () => {
    expect(relinkScore(song({ id: 'o', title: 'Night Drive', artist: 'Test Artist', duration: 300.5, fileName: 'Night Drive (1).mp3' }), kept).sure).toBeGreaterThanOrEqual(90);
    // An import that only had the file name ("Artist - Title.ext"): the title is read from it.
    expect(relinkScore(song({ id: 'o', title: 'Test Artist - Night Drive.wav', fileName: 'Test Artist - Night Drive.wav', duration: 301 }), kept).sure).toBeGreaterThanOrEqual(80);
  });
  it('artists written differently are the same; an artist only in the title counts (the user’s library, 2026-10-01)', () => {
    const a = song({ id: 'a', title: 'Lucid Dreams', artist: 'Borai & Denham Audio', duration: 308, fileName: '03 Lucid Dreams.mp3' });
    expect(relinkScore(a, song({ id: 'b', title: 'Lucid Dreams', artist: 'Borai,Denham Audio', duration: 307.5, fileName: '02 Borai,Denham Audio - Lucid Dreams.aiff' })).why).toContain('same artist');
    const e = song({ id: 'e', title: 'Education', artist: 'Digital Mystikz', duration: 379, fileName: '1-01 Digital Mystikz - Education.mp3' });
    expect(relinkScore(e, song({ id: 'f', title: 'Digital Mystikz - Education', artist: '', duration: 379.3, fileName: 'Digital Mystikz - Education.flac' })).sure).toBe(100);
    const w = song({ id: 'w', title: 'Imanzi x Kontent - Fidget Dub VIP [MASTER].wav', artist: '', duration: 302, fileName: 'Imanzi x Kontent - Fidget Dub VIP [MASTER].wav' });
    expect(relinkScore(w, song({ id: 'v', title: 'Imanzi x Kontent - Fidget Dub VIP [MASTER]', artist: '', duration: 301.7, fileName: 'Imanzi x Kontent - Fidget Dub VIP [MASTER].wav' })).sure).toBe(100);
  });
  it('another version, another artist or another length is never sure', () => {
    expect(relinkScore(song({ id: 'o', title: 'Night Drive (Instrumental)', artist: 'Test Artist', duration: 301 }), kept).sure).toBeLessThanOrEqual(40);
    expect(relinkScore(song({ id: 'o', title: 'Night Drive', artist: 'Someone Else', duration: 301 }), kept).sure).toBeLessThan(80);
    expect(relinkScore(song({ id: 'o', title: 'Night Drive', artist: 'Test Artist', duration: 420 }), kept).sure).toBeLessThan(60);
  });
  it('the best matches first; two about as good make neither sure; a refused pair isn’t offered', () => {
    const pool = [kept, song({ id: 'x', title: 'Morning Drive', artist: 'Test Artist', duration: 200 }), song({ id: 'y', title: 'Unrelated', artist: 'Z' })];
    const o = song({ id: 'o', title: 'Night Drive', artist: 'Test Artist', duration: 301 });
    expect(relinkMatches([o], pool).get('o')![0]).toMatchObject({ id: 'k' });
    const twin = { ...kept, id: 'k2' };
    expect(relinkMatches([o], [kept, twin]).get('o')![0].sure).toBeLessThan(relinkScore(o, kept).sure);
    expect(relinkMatches([o], pool, { not: new Set(['o>k']) }).get('o')?.[0]?.id).not.toBe('k');
  });
});

describe('a title written with or without a space', () => {
  it('"Ruff House" is "Ruffhouse (feat. Rod Azlan)": offered, though not sure (the user’s Engine DJ record, 2026-10-09)', () => {
    const o = song({ id: 'o', title: 'Ruff House', artist: 'J:Kenzo', duration: 337, fileName: '09 Ruff House.aiff', size: 59441388 });
    const c = song({ id: 'c', title: 'Ruffhouse (feat. Rod Azlan)', artist: 'J:Kenzo, Rod Azlan', duration: 333.17, fileName: '05 Ruffhouse (feat. Rod Azlan).aiff', size: 58806588 });
    const m = relinkScore(o, c);
    expect(m.why).toContain('same title');
    expect(m.sure).toBeGreaterThanOrEqual(50);
    expect(m.sure).toBeLessThan(80);
    // Found among other songs, though they share no title word.
    const found = relinkMatches([o], [c, song({ id: 'x', title: 'House Arrest', artist: 'Someone', duration: 300 })]);
    expect(found.get('o')?.[0].id).toBe('c');
  });
});

describe('linking a song with no file (ADR 0124)', () => {
  it('its playlist places go to the song, and the next read of the DJ library takes its record for that song', async () => {
    const mem = new MemDir(), home = await HomeStore.open(asDir(mem));
    const p = await home.createProfile('A'), c = await home.createCollection(p, 'C');
    const s = await CollectionStore.load(asDir(mem), p.id, c.id);
    s.meta.roots.push({ id: 'r1', name: 'Music', absPath: null, handleKey: 'k', addedAt: '' });
    // The library has the song (its file in a music folder); Engine DJ's playlist names a removed duplicate.
    applyScan(s, 'r1', [{ relPath: 'House/Night Drive.flac', size: 900, mtime: 1, fileName: 'Night Drive.flac' }]);
    // Its own record from another DJ app already (so only `aka` can name the removed duplicate’s).
    const kept = { ...[...s.tracks.values()][0], importPath: 'C:/Music/House/Night Drive.flac' };
    s.putTrack(kept);
    const lib = (): ImportedLibrary => ({
      app: 'engine', name: 'Engine DJ', tracks: [Object.assign(blankTrack('7', 'D:/Old/Night Drive (1).mp3'), { title: 'Night Drive', artist: 'Test Artist', size: 400, rating: 5 })],
      lists: [{ externalId: 'p', kind: 'playlist', name: 'Friday', parent: null, items: ['7'] }],
    });
    const r = applyImport(s, lib(), 'm.db');
    importLists(s, s.sources.get(r.sourceId)!, ['']);
    const orphan = [...s.tracks.values()].find(t => t.status === 'unlinked')!;
    const friday = () => [...s.lists.values()].find(l => l.name === 'Friday')!;
    expect(friday().items).toEqual([orphan.id]);

    expect(linkRecords(s, new Map([[orphan.id, kept.id]]))).toBe(1);
    expect(s.tracks.has(orphan.id)).toBe(false);
    expect(friday().items).toEqual([kept.id]);
    expect(s.tracks.get(kept.id)).toMatchObject({ rating: 5, status: 'linked' });
    expect(s.tracks.get(kept.id)!.aka).toContain('D:/Old/Night Drive (1).mp3');

    // Engine DJ is read again (followed live): no song with no file comes back, and the playlist keeps the song.
    applyImport(s, lib(), 'm.db');
    expect([...s.tracks.values()].filter(t => t.status === 'unlinked')).toEqual([]);
    expect(friday().items).toEqual([kept.id]);
    expect(s.sources.get(r.sourceId)!.tracks[0].trackId).toBe(kept.id);
  });
});
