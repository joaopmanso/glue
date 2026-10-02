import { describe, expect, it } from 'vitest';
import { certainty, concerns, copyScore, pairKey, sameVersion, similarLength } from '../src/core/library/duplicates';
import { versionOf } from '../src/core/library/names';
import type { AnalysisSummary, Track } from '../src/store/types';

const song = (title: string, duration: number | null = 240, album = '') => ({ title, album, duration });

describe('another version is never a duplicate (the user’s list, 2026-09-30; ADR 0117)', () => {
  it('reads version words from the brackets and after " - ", and "live" from the album', () => {
    expect(versionOf('Song (Instrumental)')).toBe('instrumental');
    expect(versionOf('Song [Inst.]')).toBe('instrumental');
    expect(versionOf('Song - Live at Wembley')).toBe('live');
    expect(versionOf('Song', 'Live in Berlin')).toBe('live');
    expect(versionOf('Song (Radio Edit)')).toBe('edit');
    expect(versionOf('Song (Extended Mix)')).toBe('extended');
    expect(versionOf('Song (Original Mix)')).toBe('');
    expect(versionOf('Clean Bandit')).toBe('');   // a name, not a version
    expect(versionOf('Song (Acappella)')).toBe(versionOf('Song [A Cappella]'));
  });
  it('an instrumental and the vocal, a studio and a live take, 4 and 7 minutes: not the same', () => {
    expect(sameVersion(song('Song'), song('Song (Instrumental)'))).toBe(false);
    expect(sameVersion(song('Song'), song('Song', 240, 'Live at the Roundhouse'))).toBe(false);
    expect(sameVersion(song('Song', 240), song('Song', 420))).toBe(false);
  });
  it('the same recording in two formats, or trimmed of its silence: the same', () => {
    expect(sameVersion(song('Song (Original Mix)', 400), song('Song', 402))).toBe(true);
    expect(sameVersion(song('Song', 600), song('Song', 630))).toBe(true);    // within 6 % on a long song
    expect(similarLength(null, 300)).toBe(true);
  });
  it('a pair is the same either way round', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
  });
  const copy = (title: string, duration = 240, fileName = title + '.flac', artist = 'Loxy') => ({ title, album: '', artist, duration, fileName });
  it('how sure: the user’s say-so 100; by sound from the similarity, less for other names or lengths; by name 50–60', () => {
    expect(certainty('same', null, true, [copy('A'), copy('A')])).toBe(100);
    expect(certainty('same', 0.95, false, [copy('A'), copy('A')])).toBe(100);
    expect(certainty('same', 0.4, false, [copy('A'), copy('A')])).toBe(60);
    expect(certainty('same', 0.95, false, [copy('A'), copy('B')])).toBe(90);
    expect(certainty('same', 0.95, false, [copy('A', 240), copy('A', 250)])).toBe(90);
    expect(certainty('probable', null, false, [copy('A', 240), copy('A', 240.5)])).toBe(60);
  });
  it('what to look at before a bulk removal: a version word in a title or a file name, lengths, artists', () => {
    expect(concerns([copy('Song'), copy('Song')])).toEqual([]);
    expect(concerns([copy('Song'), copy('Song', 240, 'Song (Instrumental).wav')])[0]).toMatch(/^versions differ/);
    expect(concerns([copy('Song', 240), copy('Song', 250)])).toEqual(['lengths differ by 10 s']);
    expect(concerns([copy('Song'), copy('Song', 240, 'Song.flac', 'Other')])).toEqual(['other artists']);
  });
  it('the best copy: lossless first, then the main folder’s, then resolution (ADR 0121)', () => {
    const ok = { grade: 'ok' } as AnalysisSummary, warn = { grade: 'warn' } as AnalysisSummary;
    const at = (rootId: string, lossless: boolean, sampleRate = 44100, bits = 16, bitrate = 320) => ({ rootId, format: { lossless, sampleRate, bits, bitrate } }) as unknown as Track;
    const main = 'coll';
    // Lossless elsewhere beats an MP3 in the main folder.
    expect(copyScore(at('other', true), ok, main)).toBeGreaterThan(copyScore(at(main, false), warn, main));
    // Two lossless copies: the main folder's, even at a lower resolution.
    expect(copyScore(at(main, true, 44100, 16), ok, main)).toBeGreaterThan(copyScore(at('other', true, 192000, 24), ok, main));
    // No main folder: the higher resolution.
    expect(copyScore(at('a', true, 44100, 16), ok)).toBeLessThan(copyScore(at('b', true, 192000, 24), ok));
  });
});
