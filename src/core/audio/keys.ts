/* Musical key notation and harmonic mixing. Pure. */
import type { Key } from '../types';

export type KeyNotation = 'camelot' | 'open' | 'musical';

export const MAJOR_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const MINOR_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];

/** Position on the circle of fifths: 0 = C major / A minor at the top, clockwise by fifths. */
export function fifthsPos(key: Key): number {
  const t = key.mode === 'major' ? key.tonic : (key.tonic + 3) % 12;
  return (t * 7) % 12;
}
/** Camelot number for a fifths position (C major = 8B). */
export function camelotNum(pos: number): number { return ((pos + 7) % 12) + 1; }

export function keyLabel(key: Key, notation: KeyNotation): string {
  const pos = fifthsPos(key), major = key.mode === 'major';
  if (notation === 'camelot') return camelotNum(pos) + (major ? 'B' : 'A');
  if (notation === 'open') return (pos + 1) + (major ? 'd' : 'm');   // C major = 1d
  return (major ? MAJOR_NAMES : MINOR_NAMES)[key.tonic] + (major ? ' major' : ' minor');
}

/** Inverse of fifthsPos. */
export function keyAt(pos: number, mode: Key['mode']): Key {
  const relMajor = (pos * 7) % 12;
  return mode === 'major' ? { tonic: relMajor, mode } : { tonic: (relMajor + 9) % 12, mode };
}

export function shortMusical(key: Key): string {
  return (key.mode === 'major' ? MAJOR_NAMES : MINOR_NAMES)[key.tonic] + (key.mode === 'minor' ? 'm' : '');
}

/** Keys that mix cleanly: one step either way round the wheel, and the relative major/minor. */
export function harmonicNeighbours(key: Key): Key[] {
  const pos = fifthsPos(key);
  return [keyAt((pos + 11) % 12, key.mode), keyAt((pos + 1) % 12, key.mode), keyAt(pos, key.mode === 'major' ? 'minor' : 'major')];
}
