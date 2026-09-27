import { describe, expect, it } from 'vitest';
import { blankEvent, daysUntil, folderName, isPast, monthGrid, needsMusic, parseLocal, setSeconds } from '../src/core/library/events';

const at = (s: string) => parseLocal(s)!;

describe('events (ADR 0074)', () => {
  it('reads local dates and counts days to the event', () => {
    expect(at('2026-10-03T22:30').getHours()).toBe(22);
    expect(parseLocal('nope')).toBeNull();
    const e = { starts: '2026-10-03T22:00' };
    expect(daysUntil(e, at('2026-10-03T23:59'))).toBe(0);
    expect(daysUntil(e, at('2026-09-26T09:00'))).toBe(7);
    expect(daysUntil(e, at('2026-10-05T09:00'))).toBe(-2);
  });

  it('is past once it ends; a date alone lasts the day; an end before the start is after midnight', () => {
    expect(isPast({ starts: '2026-10-03', ends: null }, at('2026-10-03T23:00'))).toBe(false);
    expect(isPast({ starts: '2026-10-03', ends: null }, at('2026-10-04T00:01'))).toBe(true);
    expect(isPast({ starts: '2026-10-03T22:00', ends: '2026-10-03T04:00' }, at('2026-10-04T03:00'))).toBe(false);
    expect(isPast({ starts: '2026-10-03T22:00', ends: '2026-10-03T04:00' }, at('2026-10-04T05:00'))).toBe(true);
  });

  it('knows the set\'s length, across midnight too', () => {
    expect(setSeconds({ starts: '2026-10-03T22:00', setStart: '23:30', setEnd: '01:00' })).toBe(5400);
    expect(setSeconds({ starts: '2026-10-03T22:00', setStart: '2026-10-03T22:00', setEnd: '2026-10-03T23:00' })).toBe(3600);
    expect(setSeconds({ starts: '2026-10-03T22:00', setStart: null, setEnd: '01:00' })).toBeNull();
  });

  it('needs music: planned, within its reminder days, no songs', () => {
    const e = { ...blankEvent('e1', '2026-10-03'), name: 'Lux' };
    expect(needsMusic(e, 0, at('2026-09-26T10:00'))).toBe(true);     // 7 days before
    expect(needsMusic(e, 0, at('2026-09-25T10:00'))).toBe(false);    // 8 days before
    expect(needsMusic(e, 12, at('2026-09-30T10:00'))).toBe(false);   // it has songs
    expect(needsMusic({ ...e, status: 'cancelled' }, 0, at('2026-09-30T10:00'))).toBe(false);
    expect(needsMusic({ ...e, remindDays: 0 }, 0, at('2026-10-03T10:00'))).toBe(false);
    expect(needsMusic(e, 0, at('2026-10-04T10:00'))).toBe(false);    // over
    expect(folderName(e)).toBe('2026-10-03 · Lux');
  });

  it('lays out a month Monday first', () => {
    const g = monthGrid(2026, 9);   // October 2026 starts on a Thursday
    expect(g[0][0].getDate()).toBe(28);   // Monday 28 September
    expect(g[0][3].getDate()).toBe(1);
    expect(g.every(w => w.length === 7)).toBe(true);
    expect(g[g.length - 1].some(d => d.getMonth() === 9 && d.getDate() === 31)).toBe(true);
  });
});
