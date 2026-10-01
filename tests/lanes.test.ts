import { describe, expect, it } from 'vitest';
import { isNetwork, pickNext } from '../home/ui/lanes';

const NET_AT_ONCE = 4;   // a value the user might set (ADR 0136)

// Which song GLUE Home analyses next (ADR 0135): a network folder's songs take turns, so the processor isn't left
// waiting on the network (the user's NAS: 12 MB/s for one file, 24 MB/s for eight, 2026-10-01).
describe('what GLUE Home analyses next', () => {
  const nas = String.raw`\\homenas\Music HR`;
  it('knows a network folder', () => {
    expect(isNetwork(nas)).toBe(true);
    expect(isNetwork('//homenas/music')).toBe(true);
    expect(isNetwork(String.raw`F:\Music`)).toBe(false);
    expect(isNetwork('/Users/dj/Music')).toBe(false);
    expect(isNetwork(null)).toBe(false);
  });
  it('takes songs in order while their network folder has room', () => {
    expect(pickNext([{ net: nas }, {}], new Map(), NET_AT_ONCE)).toBe(0);
    expect(pickNext([{ net: nas }, {}], new Map([[nas, NET_AT_ONCE - 1]]), NET_AT_ONCE)).toBe(0);
  });
  it('skips a network folder that has its share running, for a song on this computer’s drives', () => {
    expect(pickNext([{ net: nas }, { net: nas }, {}], new Map([[nas, NET_AT_ONCE]]), NET_AT_ONCE)).toBe(2);
    // No limit (the default): in order, whatever runs.
    expect(pickNext([{ net: nas }, {}], new Map([[nas, 99]]), 0)).toBe(0);
  });
  it('none may start when only a full network folder’s songs are left', () => {
    expect(pickNext([{ net: nas }], new Map([[nas, NET_AT_ONCE]]), NET_AT_ONCE)).toBe(-1);
    expect(pickNext([], new Map(), NET_AT_ONCE)).toBe(-1);
  });
  it('two network folders each take their own turns', () => {
    const other = String.raw`\\homenas\SACD`;
    expect(pickNext([{ net: nas }, { net: other }], new Map([[nas, NET_AT_ONCE]]), NET_AT_ONCE)).toBe(1);
  });
});
