import { describe, expect, it } from 'vitest';
import { afterAnalysis, needsAnalysis, type Analysed } from '../src/core/library/analysed';
import type { Track } from '../src/store/types';

const t = (o: Partial<Track> = {}): Track => ({ id: 'a1', status: 'linked', rootId: 'r', relPath: 'a.mp3', importPath: null, fileName: 'a.mp3', size: 10, mtime: 5, title: '', artist: 'Kept', album: '', genre: '', label: '', comment: '', year: '', duration: null, format: null, addedAt: '', sources: [], ...o });

describe('an analysis as data (ADR 0103)', () => {
  it('the song takes the file’s facts, and tags only where it has none', () => {
    const a: Analysed = { summary: { v: 3 } as never, size: 11, mtime: 6, format: { container: 'MP3', codec: 'MP3', lossless: false, sampleRate: 44100, bits: 0, bitrate: 128, channels: 2 }, duration: 240, fields: { title: 'From tags', artist: 'Tag artist' } as never, art: 'h1' };
    const u = afterAnalysis(t(), a);
    expect(u).toMatchObject({ size: 11, mtime: 6, duration: 240, title: 'From tags', artist: 'Kept', art: 'h1' });
    expect(u.format?.codec).toBe('MP3');
  });
  it('needs one when there’s none, it’s older, or the file changed; never for another computer’s song', () => {
    const cur = { v: 3, fileSize: 10, fileMtime: 5 } as never;
    expect(needsAnalysis(t(), undefined, 3)).toBe(true);
    expect(needsAnalysis(t(), cur, 3)).toBe(false);
    expect(needsAnalysis(t(), cur, 4)).toBe(true);
    expect(needsAnalysis(t({ size: 12 }), cur, 3)).toBe(true);
    expect(needsAnalysis(t({ remote: { device: 'd', name: 'D' } }), undefined, 3)).toBe(false);
    expect(needsAnalysis(t({ status: 'missing' }), undefined, 3)).toBe(false);
  });
});
