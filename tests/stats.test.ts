import { describe, expect, it } from 'vitest';
import { stats, type StatTrack } from '../src/core/library/stats';

const t = (o: Partial<StatTrack>): StatTrack => ({
  duration: 300, size: 10_000_000, artist: '', album: '', label: '', genre: '', year: '', format: 'MP3', lossless: false,
  grade: null, bpm: null, key: null, addedAt: '2026-09-01T10:00:00Z', rating: null, tags: [], linked: true, ...o,
});

describe('stats (the user\'s list, 2026-09-27)', () => {
  it('counts time, size, who and what', () => {
    const s = stats([
      t({ artist: 'Kloudmen', album: 'ENV012', label: 'Envision', genre: 'Techno', year: '2019-05-01' }),
      t({ artist: 'kloudmen', album: 'ENV012', label: 'Envision', genre: 'techno', year: '2019', duration: null }),
      t({ artist: 'Other', genre: 'House', year: '1998', size: null }),
    ]);
    expect(s.count).toBe(3);
    expect(s.total).toBe(600);
    expect(s.unknownLength).toBe(1);
    expect(s.size).toBe(20_000_000);
    expect(s.artists).toBe(2);   // "Kloudmen" and "kloudmen" are one
    expect(s.topArtists).toEqual([['Kloudmen', 2], ['Other', 1]]);
    expect(s.albums).toBe(1);
    expect(s.topGenres).toEqual([['Techno', 2], ['House', 1]]);
    expect(s.years).toEqual([['1998', 1], ['2019', 2]]);
    expect(s.decades).toEqual([['1990s', 1], ['2010s', 2]]);
  });

  it('formats, quality, tempo, keys, months, rated, tagged, without a file', () => {
    const s = stats([
      t({ format: 'FLAC', lossless: true, grade: 'ok', bpm: 124.2, key: '8A', addedAt: '2026-08-03T00:00:00Z', rating: 4, tags: ['Peak'] }),
      t({ format: 'MP3', grade: 'bad', bpm: 126, key: '8A', addedAt: '2026-09-01T00:00:00Z' }),
      t({ format: 'MP3', grade: 'warn', bpm: 138, key: '9A', addedAt: '2026-09-20T00:00:00Z', linked: false }),
      t({ format: 'WAV', lossless: true }),
    ]);
    expect(s.formats).toEqual([['MP3', 2], ['FLAC', 1], ['WAV', 1]]);
    expect(s.lossless).toBe(2);
    expect(s.grades).toEqual({ ok: 1, warn: 1, bad: 1, info: 0, none: 1 });
    expect(s.bpm).toEqual({ min: 124.2, max: 138, avg: (124.2 + 126 + 138) / 3, median: 126 });
    expect(s.bpmSteps).toEqual([{ from: 120, n: 1 }, { from: 125, n: 1 }, { from: 130, n: 0 }, { from: 135, n: 1 }]);
    expect(s.keys).toEqual([['8A', 2], ['9A', 1]]);
    expect(s.added).toEqual([['2026-08', 1], ['2026-09', 3]]);
    expect([s.rated, s.tagged, s.noFile]).toEqual([1, 1, 1]);
  });

  it('is empty for no songs', () => {
    const s = stats([]);
    expect(s.count).toBe(0);
    expect(s.bpm).toBeNull();
    expect(s.bpmSteps).toEqual([]);
  });
});
