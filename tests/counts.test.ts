import { describe, expect, it } from 'vitest';
import { countsOf, sendCounts } from '../src/core/shared/counts';

describe('a collection’s numbers for GLUE Cloud (ADR 0112)', () => {
  it('counts the collection’s songs and this computer’s', () => {
    expect(countsOf([{ status: 'linked' }, { status: 'missing' }, { status: 'unlinked' }, { status: 'linked', remote: { device: 'lap', name: 'Laptop' } }] as never)).toEqual({ tracks: 4, songs: 2 });
  });
  it('sends them when they changed, and once a day anyway', () => {
    const last = new Map<string, { key: string; at: number }>();
    expect(sendCounts(last, 'c1', { tracks: 2, songs: 1 }, 0)).toBe(true);
    expect(sendCounts(last, 'c1', { tracks: 2, songs: 1 }, 1000)).toBe(false);
    expect(sendCounts(last, 'c2', { tracks: 2, songs: 1 }, 1000)).toBe(true);
    expect(sendCounts(last, 'c1', { tracks: 3, songs: 1 }, 2000)).toBe(true);
    expect(sendCounts(last, 'c1', { tracks: 3, songs: 1 }, 2000 + 864e5)).toBe(true);
  });
});
