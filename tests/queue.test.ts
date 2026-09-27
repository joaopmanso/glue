import { describe, expect, it } from 'vitest';
import { EMPTY_QUEUE, advance, back, clear, dequeue, enqueue, jump, prune, reshuffle, startFrom, type Queue } from '../src/core/library/queue';

const LIST = ['a', 'b', 'c', 'd', 'e'];
const ok = () => true;
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
const next = (q: Queue, o: Partial<Parameters<typeof advance>[1]> = {}) => advance(q, { repeat: 'off', shuffle: false, ok, ...o });

describe('the player’s queue (ADR 0068)', () => {
  it('starting a song plays the rest of its list after it', () => {
    const q = startFrom(EMPTY_QUEUE, 'c', LIST, 'All tracks', false);
    expect(q).toMatchObject({ current: 'c', later: ['d', 'e'], from: 'All tracks', played: [] });
    const q2 = next(q)!;
    expect(q2).toMatchObject({ current: 'd', later: ['e'], played: ['c'] });
    expect(next(next(q2)!)).toBeNull();
  });

  it('queued songs play first, in their order; Play next goes before them', () => {
    let q = startFrom(EMPTY_QUEUE, 'a', LIST, 'List', false);
    q = enqueue(q, ['x', 'y'], 'end');
    q = enqueue(q, ['z'], 'next');
    expect(q.upNext).toEqual(['z', 'x', 'y']);
    const order: string[] = [];
    for (let s: Queue | null = next(q); s; s = next(s)) order.push(s.current!);
    expect(order).toEqual(['z', 'x', 'y', 'b', 'c', 'd', 'e']);
  });

  it('a queued song that was waiting in the list moves, it doesn’t play twice; reordering by position', () => {
    let q = startFrom(EMPTY_QUEUE, 'a', LIST, 'List', false);
    q = enqueue(q, ['d'], 'end');
    expect(q.later).toEqual(['b', 'c', 'e']);
    q = enqueue(q, ['x', 'y'], 'end');
    q = enqueue(q, ['y'], 0);                     // dragged to the top
    expect(q.upNext).toEqual(['y', 'd', 'x']);
    q = enqueue(q, ['y'], 3);                     // and to the bottom (index past it)
    expect(q.upNext).toEqual(['d', 'x', 'y']);
  });

  it('starting another list keeps what was queued, and the history', () => {
    let q = enqueue(startFrom(EMPTY_QUEUE, 'a', LIST, 'List', false), ['x'], 'end');
    q = startFrom(q, 'p', ['o', 'p', 'q'], 'Other', false);
    expect(q).toMatchObject({ current: 'p', upNext: ['x'], later: ['q'], from: 'Other', played: ['a'] });
  });

  it('Previous walks back; the song it leaves comes next again', () => {
    const q = next(next(startFrom(EMPTY_QUEUE, 'a', LIST, 'List', false))!)!;
    expect(q.current).toBe('c');
    const b = back(q)!;
    expect(b).toMatchObject({ current: 'b', played: ['a'], later: ['c', 'd', 'e'] });
    expect(back(startFrom(EMPTY_QUEUE, 'a', LIST, 'List', false))).toBeNull();
  });

  it('songs that can’t play here are skipped', () => {
    const q = startFrom(EMPTY_QUEUE, 'a', LIST, 'List', false);
    expect(next(q, { ok: id => id !== 'b' && id !== 'c' })!.current).toBe('d');
  });

  it('repeat all starts the list over once it ends (Next does too with repeat one)', () => {
    const q = startFrom(EMPTY_QUEUE, 'e', LIST, 'List', false);
    expect(next(q)).toBeNull();
    expect(next(q, { repeat: 'all' })).toMatchObject({ current: 'a', later: ['b', 'c', 'd', 'e'] });
    expect(next(q, { repeat: 'one' })!.current).toBe('a');
    expect(next(q, { repeat: 'all', ok: () => false })).toBeNull();   // never loops for ever
  });

  it('shuffle: the whole list but the song, in a random order; off again: the list’s order from the song', () => {
    const q = startFrom(EMPTY_QUEUE, 'c', LIST, 'List', true, seq(0, 0, 0, 0));
    expect([...q.later].sort()).toEqual(['a', 'b', 'd', 'e']);
    expect(q.later).not.toEqual(['a', 'b', 'd', 'e']);
    expect(reshuffle(q, false).later).toEqual(['d', 'e']);
    const on = reshuffle(startFrom(EMPTY_QUEUE, 'a', LIST, 'List', false), true, seq(0.1));
    expect([...on.later].sort()).toEqual(['b', 'c', 'd', 'e']);
  });

  it('jumping to a queued song, or to one further down the list (the ones before it are skipped)', () => {
    let q = enqueue(startFrom(EMPTY_QUEUE, 'a', LIST, 'List', false), ['x', 'y'], 'end');
    expect(jump(q, 'upNext', 1)).toMatchObject({ current: 'y', upNext: ['x'], played: ['a'] });
    q = jump(q, 'later', 2)!;
    expect(q).toMatchObject({ current: 'd', later: ['e'], upNext: ['x', 'y'] });
    expect(dequeue(q, 'upNext', 0).upNext).toEqual(['y']);
    expect(clear(q, 'upNext').upNext).toEqual([]);
  });

  it('songs removed from the collection leave the queue', () => {
    const q = enqueue(startFrom(EMPTY_QUEUE, 'a', LIST, 'List', false), ['x'], 'end');
    const p = prune(q, id => id !== 'x' && id !== 'c');
    expect(p).toMatchObject({ upNext: [], later: ['b', 'd', 'e'], fromIds: ['a', 'b', 'd', 'e'] });
    expect(prune(p, () => true)).toBe(p);
  });
});
