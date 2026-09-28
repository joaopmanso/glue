import { describe, expect, it } from 'vitest';
import { facetItems, facetValue, inFacet, sortFacet } from '../src/core/library/browse';

const t = (o: Partial<{ artist: string; album: string; genre: string; label: string; year: string; duration: number | null }>) =>
  ({ artist: '', album: '', genre: '', label: '', year: '', duration: 300, ...o });

describe('browse by artist, album, genre, label, year (the user\'s list, 2026-09-28)', () => {
  const ts = [
    t({ artist: 'Kloudmen', album: 'ENV012', genre: 'Techno', year: '2019-05-01' }),
    t({ artist: 'kloudmen ', album: 'env012', genre: 'Techno', year: '2019' }),
    t({ artist: 'Other', album: 'Mix', year: '1998' }),
    t({ artist: 'Third', album: 'Mix' }),
    t({ artist: '', album: '' }),
  ];
  it('groups a value in any case and spelling, counts songs and time', () => {
    const artists = facetItems(ts, 'artist');
    const k = artists.find(a => a.key === 'kloudmen')!;
    expect(k.tracks).toBe(2);
    expect(k.seconds).toBe(600);
    expect(artists.find(a => a.key === '')?.tracks).toBe(1);
  });
  it('albums say their artist, or Various artists', () => {
    const albums = facetItems(ts, 'album');
    expect(albums.find(a => a.key === 'env012')?.sub).toBe('Kloudmen');
    expect(albums.find(a => a.key === 'mix')?.sub).toBe('Various artists');
  });
  it('years are the 4 digits; sorted newest first, songs without a value last', () => {
    expect(facetValue(ts[0], 'year')).toBe('2019');
    const years = sortFacet(facetItems(ts, 'year'), 'year', 'name');
    expect(years.map(y => y.value)).toEqual(['2019', '1998', '']);
    expect(sortFacet(facetItems(ts, 'artist'), 'artist', 'tracks')[0].key).toBe('kloudmen');
  });
  it('a song is in a value whatever its case', () => {
    expect(inFacet(ts[1], 'artist', 'kloudmen')).toBe(true);
    expect(inFacet(ts[2], 'artist', 'kloudmen')).toBe(false);
  });
});
