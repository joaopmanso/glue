import { describe, expect, it } from 'vitest';
import { bare, fold, songName } from '../src/core/library/names';
import { nameGroups } from '../src/core/library/duplicates';
import { relinkMatches, type Songish } from '../src/core/library/relink';
import { trackKey } from '../src/core/shared/match';

describe('one rule for the same name (2026-10-02)', () => {
  it('letters and digits of any script, without accents, "&" or "and"', () => {
    expect(fold('Beyoncé')).toBe('beyonce');
    expect(fold('Frankie & Johnny')).toBe(fold('Frankie And Johnny'));
    expect(fold('Paul Simon & Art Garfunkel')).toBe(fold('Paul Simon, Art Garfunkel'));
    // Another script is a name too: before, both were "" and every such song looked alike.
    expect(fold('坂本龍一')).not.toBe('');
    expect(fold('Кино')).not.toBe(fold('Ария'));
    expect(trackKey({ artist: 'Кино', title: 'Звезда', fileName: 'a.mp3', size: 1 })).not.toBe(trackKey({ artist: 'Ария', title: 'Беспечный ангел', fileName: 'b.mp3', size: 2 }));
  });
  it('a song’s name leaves out what only says the release or the version', () => {
    for (const t of ['Song (Album Version)', 'Song (Remastered 2009)', 'Song (Single Version / Mono)', 'Song (Extended Mix)', 'Song (feat. X)', 'Song ft. X', 'Song [Defected]', 'Song (Live)', "Song ('Live') (Live)"]) expect(songName(t)).toBe('song');
    expect(songName('The Ballad of Danny Bailey (1909-34)')).toBe(songName('The Ballad of Danny Bailey (1909-1934)'));
  });
  it('and keeps what names another recording, or the song itself', () => {
    for (const t of ['Song (Live at Hyde Park)', 'Song (BBC Session)', 'Song (Remixed by Marshall Arts)', 'Song (English Version)']) expect(songName(t)).not.toBe('song');
    expect(songName('Song ft. The Pharcyde (Remixed by Marshall Arts)')).toBe('song remixed by marshall arts');
    expect(songName('Feather')).toBe('feather');   // not a "feat." credit
    expect(songName('(Exchange)')).toBe('exchange');
    expect(songName('Lapo & Ago (Numa Crew)')).toBe(songName('Lapo,Ago,Numa Crew'));
  });
  it('a cover’s album leaves out every bracket', () => {
    expect(bare('Album (Deluxe Edition) [Remastered]')).toBe('album');
    expect(bare('(Exchange)')).toBe('exchange');
  });
});

describe('probable duplicates by name', () => {
  const t = (id: string, title: string, duration: number | null, artist = 'Daft Punk') => ({ id, title, artist, album: '', duration });
  const ids = (gs: { id: string }[][]) => gs.map(g => g.map(x => x.id).sort().join('+')).sort();
  it('a title’s remix, a cappella and original are three groups, not one', () => {
    const songs = [t('a', 'Revolution 909', 335), t('b', 'Revolution 909', 335), t('c', 'Revolution 909 (Roger Sanchez Remix)', 536), t('d', 'Revolution 909 (Roger Sanchez Remix)', 536), t('e', 'Revolution 909 (Acapella)', 65), t('f', 'Revolution 909 (Acapella)', 65)];
    expect(ids(nameGroups(songs))).toEqual(['a+b', 'c+d', 'e+f']);
  });
  it('the album version and the plain title are one; lengths apart are not', () => {
    expect(ids(nameGroups([t('a', 'Visions (Album Version)', 323), t('b', 'Visions', 323), t('c', 'Visions', 360)]))).toEqual(['a+b']);
  });
  it('pairs the user kept apart stay apart', () => {
    expect(nameGroups([t('a', 'Song', 200), t('b', 'Song', 200)], (x, y) => x.id + y.id === 'ab' || x.id + y.id === 'ba')).toEqual([]);
  });
});

describe('No file linked', () => {
  const s = (id: string, title: string, fileName: string, artist = '', duration = 321): Songish => ({ id, title, artist, album: '', duration, fileName, size: null });
  it('a word no other song has doesn’t leave a song with nothing to compare', () => {
    const found = relinkMatches([s('o', 'INGOT_HM.mp3', 'INGOT_HM.mp3')], [s('c', 'Ingot [Home Master]', '404 Not Found ft Xtanki - Ingot [Home Master].wav', 'Not Found ft Xtanki')]);
    expect(found.get('o')?.[0]?.id).toBe('c');
  });
});
