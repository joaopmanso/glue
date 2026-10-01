import { describe, expect, it } from 'vitest';
import { admit, maxOf, sessionKey } from '../home/ui/sessions';

// Sessions with GLUE Home (ADR 0133): one per device's tab, at most the settings' number, refusals said.
describe('who may open a session with GLUE Home', () => {
  const open = (...keys: string[]) => new Set(keys);
  it('takes a new tab while there is room', () => {
    expect(admit('ph/t1', open('lap/a'), 5, undefined, 0)).toEqual({ ok: true, replaces: false });
  });
  it('the same tab connecting again replaces its own session, even when full', () => {
    expect(admit('ph/t1', open('ph/t1', 'lap/a'), 2, undefined, 0)).toEqual({ ok: true, replaces: true });
  });
  it('refuses a new one when full, and one disconnected in the settings until its hour is up', () => {
    expect(admit('ph/t2', open('ph/t1', 'lap/a'), 2, undefined, 0)).toEqual({ ok: false, why: 'full' });
    expect(admit('ph/t1', open(), 5, 1000, 999)).toEqual({ ok: false, why: 'refused' });
    expect(admit('ph/t1', open(), 5, 1000, 1001)).toEqual({ ok: true, replaces: false });
  });
  it('this computer’s own browser is always let in, and the limit counts only the others (ADR 0137)', () => {
    expect(admit('desk/t9', open('ph/t1', 'lap/a'), 2, undefined, 0, true)).toEqual({ ok: true, replaces: false });
    expect(admit('desk/t9', open('ph/t1', 'lap/a'), 2, undefined, 0, false)).toEqual({ ok: false, why: 'full' });
  });
  it('keys a session by device and tab; an older website’s connections each their own', () => {
    expect(sessionKey('ph', 'tab1', 'h1')).toBe('ph/tab1');
    expect(sessionKey('ph', undefined, 'h1')).toBe('ph/h1');
  });
  it('the most at once: 5 unless set, 1 to 50', () => {
    expect(maxOf(undefined)).toBe(5);
    expect(maxOf(0)).toBe(5);
    expect(maxOf(1)).toBe(1);
    expect(maxOf(500)).toBe(50);
  });
});
