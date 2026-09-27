/* Events (ADR 0074): gigs and sessions in a calendar, each with its playlists. Pure rules shared by
   the website and GLUE Home's reminders: dates, the set's length, and whether an event needs music.
   Times are the event's local time, 'YYYY-MM-DDTHH:mm' (or a date alone), with no time zone: where
   the gig is, as the user typed it. */

export type EventStatus = 'planned' | 'played' | 'cancelled';
export interface LineupEntry { name: string; me?: boolean }
export interface GlueEvent {
  id: string;
  name: string;
  /** When it starts and ends ('YYYY-MM-DDTHH:mm', or 'YYYY-MM-DD' for the day). */
  starts: string; ends: string | null;
  /** The user's own set, same form; null until known. */
  setStart: string | null; setEnd: string | null;
  venue: string; address: string; city: string;
  lineup: LineupEntry[];
  /** The flyer's file in the collection's events folder, or null. */
  flyer: string | null;
  url: string; notes: string;
  status: EventStatus;
  /** Remind this many days before, while it has no music (0: never). */
  remindDays: number;
  /** Its folder in Playlists (versions of playlists made for it go there). */
  folderId: string | null;
  /** Playlists elsewhere assigned to it. */
  lists: string[];
  createdAt: string;
}

export const REMIND_DAYS = 7;

/** A local date-time (or date) as a Date in this computer's time zone; null if unreadable. */
export function parseLocal(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s ?? '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  return isNaN(+d) ? null : d;
}
/** 'YYYY-MM-DD' of a date, locally. */
export const dayKey = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
/** 'YYYY-MM-DD' of an event's day. */
export const eventDay = (e: Pick<GlueEvent, 'starts'>) => e.starts.slice(0, 10);

/** Whole days from today to the event's day: 0 today, 1 tomorrow, below 0 past. */
export function daysUntil(e: Pick<GlueEvent, 'starts'>, now: Date): number {
  const d = parseLocal(eventDay(e));
  if (!d) return NaN;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((+d - +today) / 864e5);
}

/** Over (its end, or its day, has passed). */
export function isPast(e: Pick<GlueEvent, 'starts' | 'ends'>, now: Date): boolean {
  const end = parseLocal(e.ends) ?? parseLocal(e.starts);
  if (!end) return false;
  // A date alone lasts the whole day; an end before the start is after midnight.
  const start = parseLocal(e.starts);
  let until = e.ends ? end : new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  if (e.ends && start && +until < +start) until = new Date(+until + 864e5);
  return +until <= +now;
}

/** The set's length in seconds (an end before the start is after midnight); null if not both known. */
export function setSeconds(e: Pick<GlueEvent, 'setStart' | 'setEnd' | 'starts'>): number | null {
  const at = (s: string | null) => s && /^\d{2}:\d{2}$/.test(s) ? parseLocal(eventDay(e) + 'T' + s) : parseLocal(s);
  const a = at(e.setStart), b = at(e.setEnd);
  if (!a || !b) return null;
  let s = (+b - +a) / 1000;
  if (s <= 0) s += 86400;
  return s;
}

/** It needs music: planned, coming within its reminder days (today included), and no songs in its
    playlists yet. */
export function needsMusic(e: Pick<GlueEvent, 'starts' | 'status' | 'remindDays'>, songs: number, now: Date): boolean {
  if (e.status !== 'planned' || songs > 0 || !(e.remindDays > 0)) return false;
  const d = daysUntil(e, now);
  return d >= 0 && d <= e.remindDays;
}

/** How its folder is named in Playlists: '2026-10-03 · Lux'. */
export const folderName = (e: Pick<GlueEvent, 'starts' | 'name'>) => eventDay(e) + ' · ' + (e.name.trim() || 'Event');

/** A month as weeks of days, Monday first, with the days of the months around it to fill the weeks. */
export function monthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1), lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead), weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i));
    if (w > 3 && week[0].getMonth() !== month) break;
    weeks.push(week);
  }
  return weeks;
}

export function blankEvent(id: string, day: string, now = new Date()): GlueEvent {
  return {
    id, name: '', starts: day + 'T22:00', ends: null, setStart: null, setEnd: null, venue: '', address: '', city: '',
    lineup: [], flyer: null, url: '', notes: '', status: 'planned', remindDays: REMIND_DAYS, folderId: null, lists: [], createdAt: now.toISOString(),
  };
}
