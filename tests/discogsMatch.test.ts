import { describe, expect, it } from 'vitest';
import { discogsMatcher, type DiscogsRecord, type Songish } from '../src/core/library/discogsMatch';

const rec = (o: Partial<DiscogsRecord>): DiscogsRecord => ({ id: 1, title: '', artists: [], labels: [], year: null, formats: ['Vinyl'], genres: [], styles: [], added: '', rating: 0, cover: '', art: '', ...o });
const song = (id: string, o: Partial<Songish>): Songish => ({ id, title: '', artist: '', album: '', label: '', ...o });

describe('which songs a Discogs record is (ADR 0187)', () => {
  const songs = [
    song('a1', { title: 'Inner Space', artist: 'Pangaea', album: 'Inner Space EP', label: 'Hessle Audio' }),
    song('a2', { title: 'Release', artist: 'Pangaea', album: 'Inner Space EP' }),
    song('b1', { title: 'Iron Lung', artist: 'Someone Else', album: 'Iron Lung' }),
    song('c1', { title: 'Track One', artist: 'X', album: 'Fabric Presents Ben UFO', label: 'fabric' }),
    song('c2', { title: 'Track Two', artist: 'Y', album: 'Fabric Presents Ben UFO', label: '' }),
    song('d1', { title: 'Rhythm Dance', artist: 'Aphex Twin', album: '' }),
    song('e1', { title: 'Hit', artist: 'Z', album: 'Greatest Hits' }),
  ];
  const match = discogsMatcher(songs);
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
