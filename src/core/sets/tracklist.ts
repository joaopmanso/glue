/* A set's tracklist with times (ADR 0199): when each song comes in, through the tempo map. Pure. */
import { tempoOf } from './tempo';
import type { SetPlan } from './types';

/** "1:02:03" or "2:03". */
export function clock(s: number): string {
  const t = Math.max(0, Math.round(s)), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, x = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}

/** Each song's time in the mix (s): where it comes in (the first at 0). */
export function timesOf(plan: Pick<SetPlan, 'items' | 'tempo'>): number[] {
  const tm = tempoOf(plan);
  return plan.items.map(it => Math.max(0, tm.time(it.start)));
}

/** "0:00 Artist – Title" lines; `name` gives a song's. */
export function tracklist(plan: Pick<SetPlan, 'items' | 'tempo'>, name: (id: string) => { artist: string; title: string }): string {
  const t = timesOf(plan), long = t.length && t[t.length - 1] >= 3600;
  return plan.items.map((it, i) => {
    const n = name(it.id), c = clock(t[i]);
    return (long && c.split(':').length === 2 ? '0:' + c.padStart(5, '0') : c) + ' ' + (n.artist ? n.artist + ' – ' : '') + n.title;
  }).join('\n');
}
