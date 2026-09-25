import { describe, expect, it } from 'vitest';
import { analyzeMusic } from '../src/core/audio/analyze';
import { camelotNum, fifthsPos, harmonicNeighbours, keyLabel } from '../src/core/audio/keys';
import { synthMusic } from './helpers';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const tr = (prog: number[][], s: number) => prog.map(c => c.map(n => n + s));
const minorProg = [[45, 57, 60, 64], [50, 57, 62, 65], [45, 57, 60, 64], [40, 56, 59, 64]];   // i iv i V
const majorProg = [[48, 60, 64, 67], [53, 60, 65, 69], [43, 59, 62, 67], [48, 60, 64, 67]];   // I IV V I

describe('tempo and key (ADR 0006)', () => {
  const cases: [number, number[][], string][] = [
    [124, tr(minorProg, 0), 'A minor'], [124, tr(minorProg, -3), 'F# minor'], [174, tr(minorProg, 5), 'D minor'],
    [126, tr(majorProg, 0), 'C major'], [93.5, tr(majorProg, 3), 'D# major'], [140, tr(majorProg, -5), 'G major'],
  ];
  for (const [bpm, prog, name] of cases) {
    it(`${bpm} BPM, ${name}`, () => {
      const r = analyzeMusic(synthMusic(bpm, 44100, 30, prog), 44100, () => {});
      expect(r.bpm).not.toBeNull();
      expect(Math.abs(r.bpm! - bpm)).toBeLessThan(0.1);
      expect(NAMES[r.key!.tonic] + ' ' + r.key!.mode).toBe(name);
    }, 30_000);   // 30 s of synthesised audio: slow when the whole suite runs in parallel
  }
});

describe('key notation', () => {
  it('maps to Camelot and Open Key', () => {
    expect(keyLabel({ tonic: 0, mode: 'major' }, 'camelot')).toBe('8B');
    expect(keyLabel({ tonic: 9, mode: 'minor' }, 'camelot')).toBe('8A');
    expect(keyLabel({ tonic: 5, mode: 'minor' }, 'camelot')).toBe('4A');   // F minor
    expect(keyLabel({ tonic: 5, mode: 'minor' }, 'open')).toBe('9m');
    expect(keyLabel({ tonic: 0, mode: 'major' }, 'open')).toBe('1d');
    expect(camelotNum(fifthsPos({ tonic: 7, mode: 'major' }))).toBe(9);    // G major = 9B
  });
  it('lists the harmonic neighbours', () => {
    const n = harmonicNeighbours({ tonic: 5, mode: 'minor' }).map(k => keyLabel(k, 'camelot'));
    expect(n).toEqual(['3A', '5A', '4B']);
  });
});
