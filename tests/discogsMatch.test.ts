import { describe, expect, it } from 'vitest';
import { discogsMatcher, type DiscogsRecord, type Songish } from '../src/core/library/discogsMatch';

const rec = (o: Partial<DiscogsRecord>): DiscogsRecord => ({ id: 1, title: '', artists: [], labels: [], year: null, formats: ['Vinyl'], genres: [], styles: [], added: '', rating: 0, cover: '', art: '', ...o });
const song = (id: string, o: Partial<Songish>): Songish => ({ id, title: '', artist: '', album: '', label: '', duration: null, ...o });
const tr = (title: string, d: number | null = null, artists: string[] = []) => ({ p: '', title, artists, d });

describe('which songs a Discogs record is, by its title (no tracklist yet) (ADR 0187)', () => {
  const songs = [
    song('a1', { title: 'Inner Space', artist: 'Pangaea', album: 'Inner Space EP', label: 'Hessle Audio' }),
    song('a2', { title: 'Release', artist: 'Pangaea', album: 'Inner Space EP' }),
    song('b1', { title: 'Iron Lung', artist: 'Someone Else', album: 'Iron Lung' }),
    song('c1', { title: 'Track One', artist: 'X', album: 'Fabric Presents Ben UFO', label: 'fabric' }),
    song('c2', { title: 'Track Two', artist: 'Y', album: 'Fabric Presents Ben UFO', label: '' }),
    song('d1', { title: 'Rhythm Dance', artist: 'Aphex Twin', album: '' }),
    song('e1', { title: 'Hit', artist: 'Z', album: 'Greatest Hits' }),
  ];
  const match = (r: DiscogsRecord) => discogsMatcher(songs)(r).songs;
  it('an album: its songs by one of its artists, "(2)" and extra words aside', () => {
    expect(match(rec({ title: 'Inner Space', artists: ['Pangaea (2)'] }))).toEqual(['a1', 'a2']);
  });
  it('the same title by another artist isn’t it', () => {
    expect(match(rec({ title: 'Iron Lung', artists: ['Ploy'] }))).toEqual([]);
  });
  it('a compilation: on its label, or a long title exactly the album’s', () => {
    expect(match(rec({ title: 'Fabric Presents Ben UFO', artists: ['Various'], labels: [{ name: 'Fabric', catno: 'FABRIC 001' }] }))).toEqual(['c1', 'c2']);
    expect(match(rec({ title: 'Greatest Hits', artists: ['Various'] }))).toEqual(['e1']);
    expect(match(rec({ title: 'Hits', artists: ['Various'] }))).toEqual([]);
  });
  it('a single: its title as the song’s', () => {
    expect(match(rec({ title: 'Rhythm Dance', artists: ['Aphex Twin'] }))).toEqual(['d1']);
    expect(match(rec({ title: 'Rhythm Dance', artists: ['Somebody'] }))).toEqual([]);
  });
});

describe('track by track, from its tracklist (ADR 0188)', () => {
  const songs = [
    song('s1', { title: 'Midnight', artist: 'Ploy', album: 'Something Else Entirely', duration: 362 }),
    song('s2', { title: 'Midnight (Remix)', artist: 'Ploy', duration: 300 }),
    song('s3', { title: 'Dayglo', artist: 'Ploy', duration: 400 }),
    song('s4', { title: 'Comp Track', artist: 'Guest', duration: 200 }),
    song('s5', { title: 'Midnight', artist: 'Ploy', duration: 120 }),
  ];
  it('each track a song by title, version, artist and length, whatever the album is called', () => {
    const m = discogsMatcher(songs)(rec({ title: 'Midnight EP', artists: ['Ploy'], tracks: [tr('Midnight', 360), tr('Dayglo'), tr('Absent')] }));
    expect(m.songs.sort()).toEqual(['s1', 's3']);
    expect([m.found, m.tracks]).toEqual([2, 3]);
  });
  it('a remix is its own track', () => {
    expect(discogsMatcher(songs)(rec({ artists: ['Ploy'], tracks: [tr('Midnight (Remix)')] })).songs).toEqual(['s2']);
  });
  it('a compilation’s tracks by their own artists', () => {
    expect(discogsMatcher(songs)(rec({ artists: ['Various'], tracks: [tr('Comp Track', 201, ['Guest'])] })).songs).toEqual(['s4']);
  });
  it('the user’s say comes first: chosen songs are its, ones taken off never are', () => {
    const own = [song('m1', { title: 'Whatever', artist: 'Nobody', discogs: 7 }), song('x1', { title: 'Dayglo', artist: 'Ploy', discogsNo: [7] }), song('x2', { title: 'Dayglo', artist: 'Ploy', discogs: 9 })];
    const m = discogsMatcher(own)(rec({ id: 7, artists: ['Ploy'], tracks: [tr('Dayglo')] }));
    expect(m.songs).toEqual(['m1']);
    expect(m.chosen).toEqual(['m1']);
    expect(m.found).toBe(0);
  });
});
