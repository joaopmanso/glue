/* The library's data model. Everything here is plain JSON (ADR 0009, 0018). */
import type { Severity } from '../core/types';

export const SCHEMA = 1;             // bump + add a migration when a file format changes
export const ANALYSIS_VERSION = 1;   // bump to re-analyse every track after an algorithm change

export interface ProfileRef { id: string; name: string; color: string }
export interface HomeIndex { schemaVersion: number; profiles: ProfileRef[]; lastProfile: string | null }

export interface CollectionRef { id: string; name: string }
export interface Profile { schemaVersion: number; id: string; name: string; color: string; createdAt: string; collections: CollectionRef[]; lastCollection: string | null }

/** A music folder the user granted (handle lives in IndexedDB under `handleKey`). */
export interface Root { id: string; name: string; absPath: string | null; handleKey: string; addedAt: string }
export interface Collection { schemaVersion: number; id: string; name: string; createdAt: string; roots: Root[] }

export type TrackStatus = 'linked' | 'unlinked' | 'missing';
export interface TrackFormat { container: string; codec: string; lossless: boolean | null; sampleRate: number; bits: number; bitrate: number; channels: number }
export interface Track {
  id: string;
  status: TrackStatus;
  rootId: string | null;        // where the file is (linked tracks)
  relPath: string | null;       // path inside the root, '/'-separated
  /** A song added on its own: 'file:…' = its handle's key in IndexedDB, 'copy:<path>' = a copy in the
      MCO folder (browsers without file handles). Absent for folder and imported tracks. */
  fileKey?: string | null;
  importPath: string | null;    // absolute path as an imported library saw it
  fileName: string;
  size: number | null;
  mtime: number | null;
  title: string; artist: string; album: string; genre: string; label: string; comment: string; year: string;
  duration: number | null;
  format: TrackFormat | null;
  addedAt: string;
  rating?: number | null;       // the user's own rating in MCO: 0.5–5 in half stars
  notes?: string;               // the user's own notes about the track
  sources: string[];            // ids of imported sources that contain this track
}

export interface AnalysisSummary {
  v: number; at: string;
  grade: 'ok' | 'warn' | 'bad' | 'info'; label: string; headline: string;
  fc: number; wall: boolean; full: boolean; effBits: number | null; declaredBits: number;
  origin: string;
  bpm: number | null;
  key: { tonic: number; mode: 'major' | 'minor'; margin: number; tuning: number } | null;
  findings: { sev: Severity; title: string }[];
  fileSize: number; fileMtime: number;   // to notice when the file changes
  error?: string;
}

export interface List {
  schemaVersion: number;
  id: string; kind: 'folder' | 'playlist'; name: string; parentId: string | null; position: number;
  notes: string; items: string[];                          // track ids, in order
  origin: { sourceId: string; externalId: string } | null; // imported playlist / crate
  color?: string | null;                                   // one of LIST_COLORS, or none
  createdAt: string;
}

/** What an imported library said about a track (kept read-only, per source). */
export interface SourceTrack { externalId: string; trackId: string; bpm: number | null; key: string | null; rating: number | null; playCount: number | null; cues: number; dateAdded: string | null; path: string }
export type SourceApp = 'rekordbox' | 'engine' | 'serato' | 'traktor' | 'apple' | 'm3u';
export interface Source { schemaVersion: number; id: string; app: SourceApp; name: string; fileName: string; importedAt: string; tracks: SourceTrack[]; lists: number }

export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
export const shardOf = (id: string) => id.slice(0, 2);
export const LIST_COLORS = ['#ff6b6b', '#ff9f5a', '#f2c14e', '#3ecf8e', '#4fd1c5', '#7cc7ff', '#a78bfa', '#f472b6'];
export const PROFILE_COLORS = ['#7cc7ff', '#f472b6', '#4fd1c5', '#ff9f5a', '#a78bfa', '#f2c14e', '#3ecf8e', '#ff6b6b'];
