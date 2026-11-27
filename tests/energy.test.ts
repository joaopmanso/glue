import { describe, expect, it } from 'vitest';
import { centroid, likeness, mikEnergy, soundSpace } from '../src/core/library/energy';
import type { SoundProfile } from '../src/core/types';

const prof = (lufs: number, onsets: number, high: number, shape = 0): SoundProfile => ({ lufs, onsets, timbre: [...Array(16).fill(0).map((_, i) => i === 0 ? shape : 0), 9, 0.1, 0.2, high], curve: '', step: 2 });

describe('energy and likeness (ADR 0197)', () => {
  it('reads Mixed In Key’s energy from a comment or grouping', () => {
    expect(mikEnergy('8A - Energy 6')).toBe(6);
    expect(mikEnergy(null, 'energy: 10')).toBe(10);
    expect(mikEnergy('Energetic stuff', '')).toBeNull();
    expect(mikEnergy('Energy 12')).toBeNull();
  });
  it('spreads energy 1–10 over the collection: louder, busier, brighter, faster is higher', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: 's' + i, sound: prof(-20 + i * 0.3, 1 + i * 0.1, 0.01 + i * 0.001), bpm: 120 + i / 2 }));
    const { energy } = soundSpace(items);
    expect(energy.get('s0')!).toBeLessThan(1.5);
    expect(energy.get('s49')!).toBeGreaterThan(9.5);
    expect(energy.get('s25')!).toBeGreaterThan(energy.get('s10')!);
  });
  it('keeps Mixed In Key’s energy over its own, and leaves out songs with no profile', () => {
    const { energy, timbre } = soundSpace([{ id: 'a', sound: prof(-8, 5, 0.05), bpm: 128, mik: 3 }, { id: 'b', sound: null, bpm: 128 }, { id: 'c', sound: prof(-12, 2, 0.02), bpm: 128 }]);
    expect(energy.get('a')).toBe(3);
    expect(energy.has('b')).toBe(false);
    expect(timbre.has('b')).toBe(false);
  });
  it('likeness is 1 for the same sound, lower for a different one', () => {
    const { timbre } = soundSpace([{ id: 'a', sound: prof(-10, 2, 0.02, 5), bpm: 120 }, { id: 'b', sound: prof(-10, 2, 0.02, 5), bpm: 120 }, { id: 'c', sound: prof(-10, 2, 0.08, -5), bpm: 120 }]);
    expect(likeness(timbre.get('a'), timbre.get('b'))).toBeCloseTo(1, 5);
    expect(likeness(timbre.get('a'), timbre.get('c'))!).toBeLessThan(0.3);
    expect(likeness(timbre.get('a'), null)).toBeNull();
    expect(Array.from(centroid([timbre.get('a'), timbre.get('b')])!)).toEqual(Array.from(timbre.get('a')!));
  });
});
