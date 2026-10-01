import { describe, expect, it } from 'vitest';
import { speedOf, suggest, type Sample } from '../home/ui/speed';

// GLUE Home's speed and its suggestion (ADR 0136): the user tunes "Songs at a time" and "From each network folder at
// a time" by them, rather than GLUE Home deciding from one computer.
const at = (n: number, o: Partial<Sample> = {}): Sample => ({ at: 100_000 + n * 1000, bytes: 50e6, readMs: 400, analyseMs: 800, net: false, ...o });
describe('how fast GLUE Home analyses', () => {
  it('counts songs a minute and reads a second, apart for network folders', () => {
    const s = [...Array.from({ length: 6 }, (_, i) => at(i)), ...Array.from({ length: 4 }, (_, i) => at(6 + i, { net: true, readMs: 5000 }))];
    const sp = speedOf(s, 110_000)!;
    expect(sp.songs).toBe(10);
    expect(sp.netSongs).toBe(4);
    expect(sp.perMin).toBeGreaterThan(30);
    expect(sp.netReadMs).toBe(5000);
    expect(sp.localReadMs).toBe(400);
    expect(sp.netMBs).toBeGreaterThan(0);
    expect(speedOf(s, 110_000 + 10 * 60_000)).toBeNull();   // nothing in the last two minutes
  });
  it('suggests fewer from network folders when reading them takes most of the time', () => {
    const s = Array.from({ length: 6 }, (_, i) => at(i, { net: true, readMs: 6000 }));
    expect(suggest(speedOf(s, 110_000), { atOnce: 24, cores: 16, netCap: 0 })).toMatch(/network folders/);
    expect(suggest(speedOf(s, 110_000), { atOnce: 24, cores: 16, netCap: 4 })).toBe('');   // already few
  });
  it('suggests more at a time when the processor has room, fewer when there are more than it has', () => {
    const s = Array.from({ length: 6 }, (_, i) => at(i));
    expect(suggest(speedOf(s, 110_000), { atOnce: 4, cores: 16, netCap: 0 })).toMatch(/try 16 at a time/);
    expect(suggest(speedOf(s, 110_000), { atOnce: 32, cores: 16, netCap: 0 })).toMatch(/16 may be as fast/);
    expect(suggest(speedOf(s, 110_000), { atOnce: 16, cores: 16, netCap: 0 })).toBe('');
    expect(suggest(speedOf(s.slice(0, 3), 110_000), { atOnce: 4, cores: 16, netCap: 0 })).toBe('');   // too few to say
  });
});

describe('the ten-minute chart', () => {
  it('counts songs a minute in each half minute, oldest first', async () => {
    const { historyOf } = await import('../home/ui/speed');
    const now = 1_000_000;
    const h = historyOf([at(0, { at: now - 1000 }), at(0, { at: now - 2000 }), at(0, { at: now - 9.5 * 60_000 }), at(0, { at: now - 11 * 60_000 })], now);
    expect(h).toHaveLength(20);
    expect(h[19]).toBe(4);   // two songs in the last half minute: four a minute
    expect(h[0]).toBe(2);    // one, nine and a half minutes ago
    expect(h.reduce((a, x) => a + x, 0)).toBe(6);   // the one eleven minutes ago is out
  });
});
