/* Edited song info into the songs' files (ADR 0071), for whoever writes them: the website in Home mode,
   or GLUE Home itself when no GLUE tab is open (ADR 0087). What's written is taken off `unwritten`;
   the song's new size and date go into the track and its analysis, so nothing is analysed again (the
   sound didn't change). */
import type { CollectionStore } from './collection';
import type { InfoField } from '../core/library/tags';
import type { Track } from './types';

export type WriteTags = (t: Track, tags: Record<string, string>) => Promise<{ size: number; mtime: number }>;

/** Each song with unwritten info, once; `stop()` true ends early (the store was closed). */
export async function writeUnwritten(s: CollectionStore, write: WriteTags, opts: {
  stop?: () => boolean;
  /** After a file changed: e.g. the browser's cached full analysis, stamped with the new size and date. */
  restamp?: (t: Track, was: { size: number | null; mtime: number | null }, now: { size: number; mtime: number }) => Promise<void>;
  /** An error that means "stop now" (GLUE Home went away): rethrown. */
  fatal?: (e: unknown) => boolean;
  /** Whether a song's music folder can be reached now, asked once per folder: a network folder may not be
      connected (a Mac on Wi-Fi, 2026-10-01). Its songs then wait, quietly (`away`: those folders). */
  reachable?: (t: Track) => Promise<boolean>;
} = {}): Promise<{ written: number; failed: number; why: string; away: string[] }> {
  const tried = new Set<string>(), reach = new Map<string, boolean>(), away = new Set<string>();
  let written = 0, failed = 0, why = '';
  for (;;) {
    if (opts.stop?.()) break;
    const t = [...s.tracks.values()].find(x => x.unwritten?.length && !tried.has(x.id));
    if (!t) break;
    tried.add(t.id);
    if (!t.rootId || !t.relPath || t.status !== 'linked') continue;
    if (opts.reachable) {
      let ok = reach.get(t.rootId);
      if (ok === undefined) { ok = await opts.reachable(t).catch(() => true); reach.set(t.rootId, ok); }
      if (!ok) { away.add(t.rootId); continue; }
    }
    const tags = Object.fromEntries(t.unwritten!.map(k => [k, t[k as InfoField] ?? '']));
    try {
      const r = await write(t, tags);
      const now = s.tracks.get(t.id);
      if (opts.stop?.() || !now) break;
      // Edited again meanwhile: still to write.
      const left = (now.unwritten ?? []).filter(k => !(k in tags) || (now[k as InfoField] ?? '') !== tags[k]);
      s.putTrack({ ...now, size: r.size, mtime: r.mtime, unwritten: left.length ? left : undefined });
      const a = s.analysis.get(t.id), was = { size: t.size, mtime: t.mtime };
      if (a && a.fileSize === was.size && a.fileMtime === was.mtime) s.putAnalysis(t.id, { ...a, fileSize: r.size, fileMtime: r.mtime });
      await opts.restamp?.(t, was, r).catch(() => {});
      written++;
    } catch (e) {
      if (opts.fatal?.(e)) throw e;
      failed++; why = String((e as Error)?.message || e);
    }
  }
  return { written, failed, why, away: [...away] };
}
