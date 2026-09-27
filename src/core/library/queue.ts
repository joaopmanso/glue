/* The player's queue (ADR 0068), as pure steps on a value, like a music app:
   - "Next up": songs the user queued (Play next, Add to queue, dragged onto the player), played first;
   - "Next from …": the rest of the list a song was started from, in play order (shuffled or not);
   - what played before, for Previous.
   Repeat one is the player's business (the same song again); repeat all starts the list over. */

export interface Queue {
  current: string | null;
  upNext: string[];
  later: string[];
  /** Where "later" comes from ("All tracks", a playlist's name), and all of it (for repeat and shuffle). */
  from: string;
  fromIds: string[];
  played: string[];
}
export type Repeat = 'off' | 'all' | 'one';
export type Rnd = () => number;

export const EMPTY_QUEUE: Queue = { current: null, upNext: [], later: [], from: '', fromIds: [], played: [] };
const HISTORY = 200;

export function shuffled<T>(xs: readonly T[], rnd: Rnd = Math.random): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const pushPlayed = (q: Queue) => q.current ? [...q.played, q.current].slice(-HISTORY) : q.played;

/** Play `id` from a list: the list's rest comes after it (all of the list, shuffled, when shuffling).
    What the user queued stays next. */
export function startFrom(q: Queue, id: string, ids: string[], from: string, shuffle: boolean, rnd: Rnd = Math.random): Queue {
  const upNext = q.upNext.filter(x => x !== id), queued = new Set(upNext);
  const i = ids.indexOf(id);
  const rest = shuffle ? shuffled(ids.filter(x => x !== id), rnd) : i >= 0 ? ids.slice(i + 1) : ids.filter(x => x !== id);
  return { current: id, upNext, later: rest.filter(x => !queued.has(x)), from, fromIds: ids, played: q.current === id ? q.played : pushPlayed(q) };
}

/** The next song: the first queued one, else the list's next; `ok` skips songs that can't play here.
    Null when there's nothing more (with repeat all, the list starts over once). */
export function advance(q: Queue, opts: { repeat: Repeat; shuffle: boolean; ok: (id: string) => boolean; rnd?: Rnd }): Queue | null {
  const upNext = [...q.upNext];
  let later = [...q.later], wrapped = false;
  for (;;) {
    const id = upNext.shift() ?? later.shift();
    if (id === undefined) {
      if (opts.repeat !== 'off' && q.fromIds.length && !wrapped) { wrapped = true; later = opts.shuffle ? shuffled(q.fromIds, opts.rnd) : [...q.fromIds]; continue; }
      return null;
    }
    if (opts.ok(id)) return { ...q, current: id, upNext, later, played: pushPlayed(q) };
  }
}

/** The song before (Previous); the current one goes back to the front of the list's rest. */
export function back(q: Queue): Queue | null {
  const id = q.played.at(-1);
  if (id === undefined) return null;
  return { ...q, current: id, played: q.played.slice(0, -1), later: q.current ? [q.current, ...q.later] : q.later };
}

/** Queue songs (Next up): first ('next'), last ('end') or at a place among the queued ones. Songs
    already queued or waiting in the list's rest move there instead of playing twice. */
export function enqueue(q: Queue, ids: string[], at: 'next' | 'end' | number): Queue {
  const add = [...new Set(ids)], moving = new Set(add);
  const upNext = q.upNext.filter(x => !moving.has(x));
  const pos = at === 'next' ? 0 : at === 'end' ? upNext.length : q.upNext.slice(0, at).filter(x => !moving.has(x)).length;
  upNext.splice(pos, 0, ...add);
  return { ...q, upNext, later: q.later.filter(x => !moving.has(x)) };
}

/** Reorder the list's rest: `ids` go to `index` in it (songs from Next up or elsewhere move in there). */
export function placeLater(q: Queue, ids: string[], index: number): Queue {
  const add = [...new Set(ids)], moving = new Set(add);
  const later = q.later.filter(x => !moving.has(x));
  later.splice(q.later.slice(0, index).filter(x => !moving.has(x)).length, 0, ...add);
  return { ...q, later, upNext: q.upNext.filter(x => !moving.has(x)) };
}

export function dequeue(q: Queue, which: 'upNext' | 'later', index: number): Queue {
  return which === 'upNext' ? { ...q, upNext: q.upNext.filter((_, i) => i !== index) } : { ...q, later: q.later.filter((_, i) => i !== index) };
}
export function clear(q: Queue, which: 'upNext' | 'later' | 'played'): Queue { return { ...q, [which]: [] }; }

/** Play a song from the queue now. From the list's rest, the songs before it are skipped. */
export function jump(q: Queue, which: 'upNext' | 'later', index: number): Queue | null {
  const id = q[which][index];
  if (id === undefined) return null;
  return which === 'upNext'
    ? { ...q, current: id, upNext: q.upNext.filter((_, i) => i !== index), played: pushPlayed(q) }
    : { ...q, current: id, later: q.later.slice(index + 1), played: pushPlayed(q) };
}

/** Shuffle on: the list's rest in a random order. Off: the list's order again, from the current song. */
export function reshuffle(q: Queue, on: boolean, rnd: Rnd = Math.random): Queue {
  if (on) return { ...q, later: shuffled(q.later, rnd) };
  const queued = new Set(q.upNext), i = q.current ? q.fromIds.indexOf(q.current) : -1, left = new Set(q.later);
  const later = i >= 0 ? q.fromIds.slice(i + 1) : q.fromIds.filter(x => left.has(x));
  return { ...q, later: later.filter(x => !queued.has(x) && x !== q.current) };
}

/** Songs that are gone from the collection leave the queue. */
export function prune(q: Queue, has: (id: string) => boolean): Queue {
  const f = (xs: string[]) => xs.every(has) ? xs : xs.filter(has);
  const upNext = f(q.upNext), later = f(q.later), played = f(q.played), fromIds = f(q.fromIds), current = q.current && has(q.current) ? q.current : null;
  return upNext === q.upNext && later === q.later && played === q.played && fromIds === q.fromIds && current === q.current ? q : { ...q, current, upNext, later, played, fromIds };
}
