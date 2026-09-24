/* What every library importer produces; the app turns it into tracks, playlists and a source. */
import type { SourceApp } from '../../store/types';

/** A cue point or loop from a DJ app (seconds). num: hot cue slot 0–7 (A–H), null for a memory cue. */
export interface CuePoint { t: number; kind: 'cue' | 'loop' | 'load' | 'fade'; num: number | null; name: string; color: string | null; end: number | null }

export interface ImportedTrack {
  externalId: string;
  path: string;              // absolute (or library-relative) path, '/'-separated
  title: string; artist: string; album: string; genre: string; label: string; comment: string; year: string;
  duration: number | null;   // seconds
  bpm: number | null;
  key: string | null;        // as the app shows it (e.g. "8A", "Am", "10m")
  rating: number | null;     // 0–5
  playCount: number | null;
  dateAdded: string | null;  // ISO date when known
  cues: number;              // cue / hot cue / loop markers (count)
  cueList: CuePoint[];       // the markers themselves, where the format has them
  size: number | null;
}
export interface ImportedList {
  externalId: string;
  kind: 'folder' | 'playlist';
  name: string;
  parent: string | null;     // externalId of the parent folder
  items: string[];           // track externalIds, in order
}
export interface ImportedLibrary { app: SourceApp; name: string; tracks: ImportedTrack[]; lists: ImportedList[] }

export const blankTrack = (externalId: string, path: string): ImportedTrack => ({
  externalId, path, title: '', artist: '', album: '', genre: '', label: '', comment: '', year: '',
  duration: null, bpm: null, key: null, rating: null, playCount: null, dateAdded: null, cues: 0, cueList: [], size: null,
});

/** file://localhost/C:/Users/x/a%20b.mp3 → C:/Users/x/a b.mp3 ; file:///Users/x → /Users/x */
export function fileUrlToPath(url: string): string {
  let s = url.trim();
  s = s.replace(/^file:\/\/localhost\//i, '/').replace(/^file:\/\/\//i, '/').replace(/^file:\/\//i, '/');
  try { s = decodeURIComponent(s); } catch { /* leave as is */ }
  if (/^\/[A-Za-z]:\//.test(s)) s = s.slice(1);   // /C:/… → C:/…
  return s;
}
export const normPath = (p: string) => p.replace(/\\/g, '/');
export const baseName = (p: string) => normPath(p).split('/').pop() || p;
export const num = (s: string | undefined | null): number | null => { if (s == null || s === '') return null; const v = Number(s); return Number.isFinite(v) ? v : null; };
