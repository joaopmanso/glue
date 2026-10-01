/* Who may open a session with GLUE Home (ADR 0133). Pure: the service page keeps the sessions and the refusals.
   - One session per device's tab: the same tab connecting again replaces its own (it reconnected).
   - At most `max`: a new one when full is refused, with why; nobody connected is dropped for it.
   - A tab disconnected in the settings is refused until its time is up (it would only connect again).
   - This computer's own browser (`own`) is always let in and never counted: the limit is for other devices (the
     user, 2026-10-01). It normally uses the direct link on 127.0.0.1 anyway. */

export type Admit = { ok: true; replaces: boolean } | { ok: false; why: 'full' | 'refused' };

/** `open`: the sessions there are (`size`: other devices' only, the ones the limit counts). */
export function admit(key: string, open: { has(k: string): boolean; readonly size: number }, max: number, refusedUntil: number | undefined, now: number, own = false): Admit {
  if ((refusedUntil ?? 0) > now) return { ok: false, why: 'refused' };
  if (open.has(key)) return { ok: true, replaces: true };
  if (!own && open.size >= max) return { ok: false, why: 'full' };
  return { ok: true, replaces: false };
}

/** A session's key: its device and its tab. An older website sends no tab: each of its connections is its own. */
export const sessionKey = (from: string, tab: string | undefined, id: string) => from + '/' + (tab || id);

/** The most at once, from the settings: 5 unless set, 1 to 50. */
export const maxOf = (set: number | undefined) => Math.max(1, Math.min(50, Math.round(set || 5)));
