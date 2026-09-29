import { describe, expect, it } from 'vitest';
import { newlyFound } from '../home/ui/library';

describe('GLUE Home’s music folders (the lost folder, 2026-09-29)', () => {
  it('a search keeps what it found anew, never a folder picked meanwhile', () => {
    const before = { r1: 'C:\old\Music', r2: 'D:\Sets' };
    // The search found r1 where it already was, r2 moved, r3 new; meanwhile the user picked r1 again.
    const found = { r1: 'C:\old\Music', r2: 'E:\Sets', r3: 'F:\More' };
    const cur = { r1: 'C:\new\Music', r2: 'D:\Sets' };
    expect(newlyFound(before, found, cur)).toEqual({ r1: 'C:\new\Music', r2: 'E:\Sets', r3: 'F:\More' });
    // A folder changed meanwhile isn't touched even when the search found it elsewhere.
    expect(newlyFound(before, { r2: 'E:\Sets' }, { ...cur, r2: 'G:\Picked' })).toBeNull();
    // Nothing new: nothing to save.
    expect(newlyFound(before, { r1: 'C:\old\Music' }, before)).toBeNull();
  });
});
