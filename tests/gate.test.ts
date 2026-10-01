import { describe, expect, it } from 'vitest';
import { Gate } from '../src/lib/gate';

// At most `max` background requests to GLUE Home at a time, the user's first (ADR 0138): a browser's 6 connections to
// 127.0.0.1 were all taken by them, and a song clicked waited (2026-10-01).
const later = () => { let go!: () => void; const p = new Promise<void>(r => (go = r)); return { p, go }; };
const tick = () => new Promise(r => setTimeout(r, 0));

describe('the gate', () => {
  it('runs at most max at a time, the rest when one finishes', async () => {
    const g = new Gate(2), started: number[] = [], done = [later(), later(), later()];
    const runs = done.map((d, i) => g.run(async () => { started.push(i); await d.p; return i; }));
    await tick();
    expect(started).toEqual([0, 1]);
    expect(g.waiting).toBe(1);
    done[0].go(); await tick(); await tick();
    expect(started).toEqual([0, 1, 2]);
    done[1].go(); done[2].go();
    expect(await Promise.all(runs)).toEqual([0, 1, 2]);
  });
  it('the user’s goes ahead of the background waiting', async () => {
    const g = new Gate(1), order: string[] = [], first = later();
    const a = g.run(async () => { order.push('busy'); await first.p; });
    const b = g.run(async () => { order.push('row'); });
    const c = g.run(async () => { order.push('song page'); }, true);
    await tick();
    first.go();
    await Promise.all([a, b, c]);
    expect(order).toEqual(['busy', 'song page', 'row']);
  });
  it('a failure frees its place', async () => {
    const g = new Gate(1);
    await expect(g.run(async () => { throw new Error('no'); })).rejects.toThrow('no');
    expect(await g.run(async () => 'next')).toBe('next');
  });
});
