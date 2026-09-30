/* What an analysis says about a song's file, as data (ADR 0103): the summary, and the file's facts its
   song takes on (size, date, format, length, tags where the song has none, the cover). Made where the
   file was analysed (a GLUE tab, or GLUE Home), taken in by whoever writes the collection. Pure. */
import type { AnalysisSummary, Track, TrackFormat } from '../../store/types';
import { fillInfo, formatOf, tagFields, type TagFields } from './tags';
import type { FileInfo } from '../types';

export interface Analysed { summary: AnalysisSummary; size: number; mtime: number; format: TrackFormat | null; duration: number | null; fields: TagFields; art?: string }

export function analysed(r: { summary: AnalysisSummary; info: FileInfo; duration: number; art?: { hash: string } | null }, size: number, mtime: number): Analysed {
  return { summary: r.summary, size, mtime, format: formatOf(r.info), duration: r.duration || null, fields: tagFields(r.info.tags), ...(r.art !== undefined ? { art: r.art?.hash ?? '' } : {}) };
}

/** The song after its file's analysis. */
export function afterAnalysis(cur: Track, a: Analysed): Track {
  const upd: Track = { ...cur, size: a.size, mtime: a.mtime, format: a.format, duration: a.duration || cur.duration };
  fillInfo(upd, a.fields);
  if (a.art !== undefined) upd.art = a.art;
  return upd;
}

/** A failure worth trying again (ADR 0109): the analysis ran out of time or memory, or its worker was stopped;
    the file itself may be fine (295 songs "took too long" in one night, from a timer bug fixed in 0.33). */
export const isTransient = (msg: string | null | undefined) => !!msg && /took too long|allocation failed|out of memory|worker stopped/i.test(msg);

/** Where a song's analysis stands, one meaning everywhere (the sidebar, the list, Stats, GLUE Home, ADR 0109):
    - done: analysed, this file as it is;
    - failed: its file couldn't be analysed (it doesn't decode): shown as "Couldn't analyse", tried again only
      when asked or when the file changes;
    - waiting: never analysed, the file changed, an older version, or a failure worth trying again;
    - elsewhere: another computer's song (analysed there);
    - nofile: no file linked here. */
export type AnalysisState = 'done' | 'failed' | 'waiting' | 'elsewhere' | 'nofile';
export function analysisState(t: Pick<Track, 'status' | 'remote' | 'size' | 'mtime'>, a: AnalysisSummary | undefined, version: number): AnalysisState {
  if (t.remote) return 'elsewhere';
  if (t.status !== 'linked') return 'nofile';
  if (!a || a.v < version || a.fileSize !== t.size || a.fileMtime !== t.mtime) return 'waiting';
  if (a.error) return isTransient(a.error) ? 'waiting' : 'failed';
  return 'done';
}
/** Does this song need (another) analysis? `a`: its analysis on this computer. */
export function needsAnalysis(t: Pick<Track, 'status' | 'remote' | 'size' | 'mtime'>, a: AnalysisSummary | undefined, version: number): boolean {
  return analysisState(t, a, version) === 'waiting';
}
