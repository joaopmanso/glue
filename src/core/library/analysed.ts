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

/** Does this song need (another) analysis? `a`: its analysis on this computer. */
export function needsAnalysis(t: Pick<Track, 'status' | 'remote' | 'size' | 'mtime'>, a: AnalysisSummary | undefined, version: number): boolean {
  if (t.status !== 'linked' || t.remote) return false;
  return !a || a.v < version || a.fileSize !== t.size || a.fileMtime !== t.mtime;
}
