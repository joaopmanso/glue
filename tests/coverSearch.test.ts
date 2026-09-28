import { describe, expect, it } from 'vitest';
import { lookupKey, norm, pick, same, searchUrl } from '../src/core/library/coverSearch';

const q = { artist: 'Kloudmen', album: 'Genorale EP', title: 'Genorale' };

describe('finding covers on public services (ADR 0086)', () => {
  it('compares names loosely, but not too loosely', () => {
    expect(norm('Beyoncé (Deluxe Edition)')).toBe('beyonce');
    expect(norm('The Prodigy')).toBe('prodigy');
    expect(same('Genorale EP', 'Genorale')).toBe(true);
    expect(same('Genorale', 'Genorale (Remixes) [2019]')).toBe(true);
    expect(same('Low', 'Lowlife')).toBe(false);          // too short to count as "contains"
    expect(same('', 'x')).toBe(false);
  });
  it('searches by album, else by song; an album’s songs share a key', () => {
    expect(searchUrl('deezer', q)).toContain('search/album');
    expect(searchUrl('deezer', { ...q, album: '' })).toContain('track%3A');
    expect(searchUrl('itunes', q)).toContain('entity=album');
    expect(searchUrl('musicbrainz', { ...q, album: '' })).toContain('/recording/');
    expect(searchUrl('deezer', { artist: '', album: 'x', title: 'y' })).toBeNull();
    expect(lookupKey(q)).toBe(lookupKey({ ...q, title: 'Another song' }));
  });
  it('takes a cover only when the artist and the album match', () => {
    const deezer = { data: [
      { title: 'Genorale', artist: { name: 'Somebody Else' }, cover_xl: 'https://e-cdns-images.dzcdn.net/wrong.jpg' },
      { title: 'Genorale EP', artist: { name: 'Kloudmen' }, cover_xl: 'https://e-cdns-images.dzcdn.net/right.jpg' },
    ] };
    expect(pick('deezer', q, deezer)).toBe('https://e-cdns-images.dzcdn.net/right.jpg');
    expect(pick('deezer', q, { data: [deezer.data[0]] })).toBeNull();
    const itunes = { results: [{ artistName: 'Kloudmen & Friend', collectionName: 'Genorale - EP', artworkUrl100: 'https://is1-ssl.mzstatic.com/x/100x100bb.jpg' }] };
    expect(pick('itunes', q, itunes)).toBe('https://is1-ssl.mzstatic.com/x/600x600bb.jpg');
    const mb = { releases: [{ id: 'abc-123', title: 'Genorale EP', 'artist-credit': [{ name: 'Kloudmen' }] }] };
    expect(pick('musicbrainz', q, mb)).toBe('https://coverartarchive.org/release/abc-123/front-500');
    const song = { recordings: [{ title: 'Genorale', 'artist-credit': [{ name: 'Kloudmen' }], releases: [{ id: 'r9' }] }] };
    expect(pick('musicbrainz', { ...q, album: '' }, song)).toBe('https://coverartarchive.org/release/r9/front-500');
    expect(pick('itunes', q, null)).toBeNull();
  });
});
