/* Reminders of events that need music (ADR 0074): GLUE Home reads the events of this computer's GLUE
   folder (read only, as everything it reads there), and sends a desktop notification once a day for
   each one coming within its reminder days with no songs in its playlists. The rule is the website's
   (core/library/events), so the banner there and the notification here agree. */
import { bridge, notify, type HomeConfig } from './bridge';
import { describe } from './library';
import { dayKey, daysUntil, needsMusic, parseLocal, type GlueEvent } from '../../src/core/library/events';
import type { List } from '../../src/store/types';

const KEY = 'glue-home-reminded';

async function json<T>(rel: string): Promise<T | null> {
  try { return JSON.parse(await bridge.glueRead(rel)) as T; } catch { return null; }
}

/** Songs in an event's playlists: its folder (and the folders in it), and the playlists assigned to it. */
export function songsOf(e: Pick<GlueEvent, 'folderId' | 'lists'>, lists: Map<string, List>): number {
  const ids = new Set<string>(), seen = new Set<string>();
  const walk = (id: string) => {
    const l = lists.get(id);
    if (!l || seen.has(id)) return;
    seen.add(id);
    for (const i of l.items) ids.add(i);
    for (const c of lists.values()) if (c.parentId === id) walk(c.id);
  };
  if (e.folderId) walk(e.folderId);
  for (const id of e.lists) walk(id);
  return ids.size;
}

function message(e: GlueEvent, now: Date): { title: string; body: string } {
  const d = daysUntil(e, now), day = parseLocal(e.starts)?.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) ?? e.starts.slice(0, 10);
  const when = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : day + ', in ' + d + ' days';
  return { title: e.name + ' needs music', body: when + (e.venue ? ' at ' + e.venue : '') + '. Open GLUE › Calendar to make or assign a playlist for it.' };
}

export interface Reminded { coming: number; sent: string[] }

/** Look now; `again`: notify even the events already reminded of today (the settings' Check now). */
export async function checkReminders(cfg: HomeConfig | null, now = new Date(), again = false): Promise<Reminded> {
  const out: Reminded = { coming: 0, sent: [] };
  if (!cfg?.glue || cfg.reminders === false) return out;
  let done: Record<string, string> = {};
  try { done = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* start over */ }
  const today = dayKey(now);
  for (const p of (await describe())?.profiles ?? []) for (const c of p.collections) {
    const base = `profiles/${p.id}/collections/${c.id}`;
    const soon = Object.values((await json<{ items: Record<string, GlueEvent> }>(base + '/events.json'))?.items ?? {}).filter(e => needsMusic(e, 0, now));
    if (!soon.length) continue;
    // Only then its playlists, to count their songs.
    const lists = new Map<string, List>();
    for (const f of await bridge.glueList(base + '/lists').catch(() => [] as string[])) {
      if (!f.endsWith('.json')) continue;
      const l = await json<List>(base + '/lists/' + f);
      if (l) lists.set(l.id, l);
    }
    for (const e of soon) {
      if (!needsMusic(e, songsOf(e, lists), now)) continue;
      out.coming++;
      const k = c.id + '/' + e.id;
      if (done[k] === today && !again) continue;
      const m = message(e, now);
      if (await notify(m.title, m.body).catch(() => false)) { done[k] = today; out.sent.push(e.name); }
    }
  }
  // A week of memory is enough.
  const week = dayKey(new Date(+now - 7 * 864e5));
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(done).filter(([, d]) => d >= week)))); } catch { /* not kept */ }
  return out;
}
