/* The library's data model. Everything here is plain JSON (ADR 0009, 0018). */
import type { Severity } from '../core/types';

export const SCHEMA = 1;             // bump + add a migration when a file format changes
export const ANALYSIS_VERSION = 3;
/** Bump when the verdict rules change: stored verdicts are re-checked from stored analyses, no decoding (2: gentle roll-offs, 3: quiet content above the fade, ADR 0033). */
export const VERDICT_VERSION = 3;   // bump to re-analyse every track after an algorithm change (2: full analysis stored, 3: fingerprints)

export interface ProfileRef { id: string; name: string; color: string }
export interface HomeIndex { schemaVersion: number; profiles: ProfileRef[]; lastProfile: string | null; appearance?: { theme: string; mode: 'dark' | 'light' | 'system' } }

export interface CollectionRef { id: string; name: string }
/** cloudSync: this device keeps a copy of the profile's data in GLUE Cloud (ADR 0040). Absent = on
    while signed in (ADR 0042); false = the user turned it off. */
export interface Profile { schemaVersion: number; id: string; name: string; color: string; createdAt: string; collections: CollectionRef[]; lastCollection: string | null; cloudSync?: boolean }

/** A music folder the user granted (handle lives in IndexedDB under `handleKey`). */
export interface Root { id: string; name: string; absPath: string | null; handleKey: string; addedAt: string }
/** tags: tags made in GLUE, kept even while no track uses them (ADR 0032). cloudMerged: it has been
    merged with other devices once (ADR 0042), so an unmerge is kept rather than merged again. */
export interface Collection { schemaVersion: number; id: string; name: string; createdAt: string; roots: Root[]; ignoredDupes?: string[]; autoAnalyse?: boolean; tags?: string[]; cloudMerged?: boolean }

export type TrackStatus = 'linked' | 'unlinked' | 'missing';
export interface TrackFormat { container: string; codec: string; lossless: boolean | null; sampleRate: number; bits: number; bitrate: number; channels: number }
export interface Track {
  id: string;
  status: TrackStatus;
  rootId: string | null;        // where the file is (linked tracks)
  relPath: string | null;       // path inside the root, '/'-separated
  /** A song added on its own: 'file:…' = its handle's key in IndexedDB, 'copy:<path>' = a copy in the
      GLUE folder (browsers without file handles). Absent for folder and imported tracks. */
  fileKey?: string | null;
  importPath: string | null;    // absolute path as an imported library saw it
  fileName: string;
  size: number | null;
  mtime: number | null;
  title: string; artist: string; album: string; genre: string; label: string; comment: string; year: string;
  duration: number | null;
  format: TrackFormat | null;
  addedAt: string;
  rating?: number | null;       // the user's own rating in GLUE: 0.5–5 in half stars
  notes?: string;               // the user's own notes about the track
  grouping?: string;            // the file's / DJ app's Grouping field
  tags?: string[];              // the user's tags; absent until edited, then the found ones (tagsOf) stand in
  onDevices?: string[];         // cloud views and merged collections: the devices that have this track (never saved)
  /** A track from another device of a merged collection, shown here from the cloud (ADR 0042; never saved). */
  remote?: { device: string; name: string };
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
  fp?: boolean;                           // an acoustic fingerprint is stored for this analysis
  vv?: number;                            // the VERDICT_VERSION the verdict came from (absent = 1)
}

export interface List {
  schemaVersion: number;
  id: string; kind: 'folder' | 'playlist'; name: string; parentId: string | null; position: number;
  notes: string; items: string[];                          // track ids, in order
  origin: { sourceId: string; externalId: string } | null; // imported playlist / crate
  color?: string | null;                                   // one of LIST_COLORS, or none
  auto?: Record<string, unknown>;                          // how an automatic playlist was made (options, seed, date)
  tags?: string[];                                         // the playlist's own tags
  createdAt: string;
}

/** What an imported library said about a track (kept read-only, per source). */
export interface SourceTrack { externalId: string; trackId: string; bpm: number | null; key: string | null; rating: number | null; playCount: number | null; cues: number; dateAdded: string | null; path: string; cueList?: import('../core/interop/types').CuePoint[] }
export type SourceApp = 'rekordbox' | 'engine' | 'serato' | 'traktor' | 'apple' | 'm3u';
/** Where a detected library was imported from (place: a music folder id, 'home', or a remembered place), for Update. */
export interface SourceOrigin { place: string; relPath: string; modified: number }
export interface Source { schemaVersion: number; id: string; app: SourceApp; name: string; fileName: string; importedAt: string; tracks: SourceTrack[]; lists: number; origin?: SourceOrigin }

export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
export const shardOf = (id: string) => id.slice(0, 2);
export const LIST_COLORS = ['#ff6b6b', '#ff9f5a', '#f2c14e', '#3ecf8e', '#4fd1c5', '#7cc7ff', '#a78bfa', '#f472b6'];
export const PROFILE_COLORS = ['#7cc7ff', '#f472b6', '#4fd1c5', '#ff9f5a', '#a78bfa', '#f2c14e', '#3ecf8e', '#ff6b6b'];
