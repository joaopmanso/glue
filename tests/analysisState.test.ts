import { describe, expect, it } from 'vitest';
import { analysisState, isTransient, needsAnalysis } from '../src/core/library/analysed';
import { failed } from '../src/core/library/summary';
import { stats, type StatTrack } from '../src/core/library/stats';
import { ANALYSIS_VERSION, type AnalysisSummary } from '../src/store/types';

const t = { status: 'linked', remote: undefined, size: 10, mtime: 1 } as const;
const ok = { v: ANALYSIS_VERSION, fileSize: 10, fileMtime: 1, grade: 'ok' } as unknown as AnalysisSummary;

describe('one meaning of "not analysed" (ADR 0109)', () => {
  it('a song’s state: done, failed, waiting, elsewhere, no file', () => {
    expect(analysisState(t, ok, ANALYSIS_VERSION)).toBe('done');
    expect(analysisState(t, undefined, ANALYSIS_VERSION)).toBe('waiting');
    expect(analysisState({ ...t, mtime: 2 }, ok, ANALYSIS_VERSION)).toBe('waiting');                 // the file changed
    expect(analysisState(t, failed('It couldn’t be decoded.', { size: 10, mtime: 1 }), ANALYSIS_VERSION)).toBe('failed');
    // Out of time or memory: tried again (295 of the user's songs, from the timer bug fixed in 0.33).
    expect(analysisState(t, failed('the analysis took too long', { size: 10, mtime: 1 }), ANALYSIS_VERSION)).toBe('waiting');
    expect(analysisState(t, failed('Array buffer allocation failed', { size: 10, mtime: 1 }), ANALYSIS_VERSION)).toBe('waiting');
    expect(analysisState({ ...t, remote: { device: 'lap', name: 'Laptop' } }, undefined, ANALYSIS_VERSION)).toBe('elsewhere');
    // Failed for good on the computer that has it: failed on every device (a phone showed them in the library).
    expect(analysisState({ ...t, remote: { device: 'desk', name: 'Desktop' } }, failed('It couldn’t be decoded.', { size: 10, mtime: 1 }), ANALYSIS_VERSION)).toBe('failed');
    expect(analysisState({ ...t, remote: { device: 'desk', name: 'Desktop' } }, failed('the analysis took too long', { size: 10, mtime: 1 }), ANALYSIS_VERSION)).toBe('elsewhere');
    expect(analysisState({ ...t, status: 'unlinked' }, undefined, ANALYSIS_VERSION)).toBe('nofile');
    expect(needsAnalysis(t, failed('the analysis took too long', { size: 10, mtime: 1 }), ANALYSIS_VERSION)).toBe(true);
    expect(needsAnalysis(t, failed('It couldn’t be decoded.', { size: 10, mtime: 1 }), ANALYSIS_VERSION)).toBe(false);
    expect(isTransient('The analysis worker stopped')).toBe(true);
    expect(isTransient('It couldn’t be decoded.')).toBe(false);
  });
  it('Stats counts the songs with no grade by the same buckets', () => {
    const base = { duration: 1, size: 1, artist: '', album: '', label: '', genre: '', year: '', format: 'MP3', lossless: false, bpm: null, key: null, addedAt: '2026-09-01', rating: null, tags: [], linked: true } as Omit<StatTrack, 'grade' | 'state'>;
    const s = stats([
      { ...base, grade: 'ok', state: 'done' }, { ...base, grade: null, state: 'waiting' }, { ...base, grade: null, state: 'failed' },
      { ...base, grade: null, state: 'nofile', linked: false }, { ...base, grade: null, state: 'elsewhere' },
    ] as StatTrack[]);
    expect(s.grades.none).toBe(4);
    expect(s.ungraded).toEqual({ waiting: 1, failed: 1, nofile: 1, elsewhere: 1 });
  });
});
