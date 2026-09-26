/* Engine DJ library (Engine Library/Database2/m.db, SQLite). Read-only, from a copy of the file.
   Schema per libdjinterop (2.x–3.x): Track, Playlist (linked by nextListId), PlaylistEntity (linked
   by nextEntityId). Key ints 0–23 in circle-of-fifths order: 0 C major, 1 A minor, 2 G major, …
   Engine DJ 3 keeps one playlist tree for all its libraries (the computer's and each drive's), and an
   entry names the library its song is in (databaseUuid): the libraries are a set. Tracks are
   "uuid/id", and entries are resolved across every library imported so far (resolveEngine). */
import type { Database, SqlJsStatic } from 'sql.js';
import { blankTrack, num, type ImportedLibrary, type ImportedList, type ImportedTrack } from './types';

export function isSqlite(b: Uint8Array) { return b.length > 16 && new TextDecoder().decode(b.subarray(0, 15)) === 'SQLite format 3'; }

/** Engine key int → Camelot (0 → 8B, 1 → 8A, 2 → 9B …). */
export function engineKey(k: number): string | null {
  if (!Number.isInteger(k) || k < 0 || k > 23) return null;
  return (((Math.floor(k / 2) + 7) % 12) + 1) + (k % 2 === 0 ? 'B' : 'A');
}

function rows(db: Database, sql: string): Record<string, unknown>[] {
  const res = db.exec(sql);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map(v => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
}
const cols = (db: Database, table: string) => new Set(rows(db, `PRAGMA table_info(${table})`).map(r => String(r.name)));

/** Order siblings stored as a linked list (each row points at the next one's id; 0 = end). */
function linkedOrder<T extends { id: number; next: number }>(items: T[]): T[] {
  const byId = new Map(items.map(i => [i.id, i])), pointed = new Set(items.map(i => i.next));
  const out: T[] = [], seen = new Set<number>();
  for (const head of items.filter(i => !pointed.has(i.id))) {
    for (let cur: T | undefined = head; cur && !seen.has(cur.id); cur = byId.get(cur.next)) { seen.add(cur.id); out.push(cur); }
  }
  for (const i of items) if (!seen.has(i.id)) out.push(i);   // broken chains: keep the rest in id order
  return out;
}

export function parseEngineDb(bytes: Uint8Array, SQL: SqlJsStatic, fileName = 'm.db'): ImportedLibrary {
  const db = new SQL.Database(bytes);
  try {
    const tables = new Set(rows(db, "SELECT name FROM sqlite_master WHERE type='table'").map(r => String(r.name)));
    if (!tables.has('Track')) throw new Error('This database has no Track table; it doesn’t look like an Engine DJ library.');
    const tc = cols(db, 'Track');
    const uuid = tables.has('Information') && cols(db, 'Information').has('uuid') ? String(rows(db, 'SELECT uuid FROM Information LIMIT 1')[0]?.uuid ?? '') : '';
    const ext = (id: unknown) => uuid ? uuid + '/' + String(id) : String(id);
    const pick = (c: string) => tc.has(c) ? c : 'NULL';
    const tracks = rows(db, `SELECT id, ${pick('path')} AS path, ${pick('filename')} AS filename, ${pick('title')} AS title, ${pick('artist')} AS artist,
      ${pick('album')} AS album, ${pick('genre')} AS genre, ${pick('comment')} AS comment, ${pick('label')} AS label, ${pick('year')} AS year,
      ${pick('bpmAnalyzed')} AS bpmAnalyzed, ${pick('bpm')} AS bpm, ${pick('key')} AS key, ${pick('rating')} AS rating, ${pick('length')} AS length,
      ${pick('dateAdded')} AS dateAdded, ${pick('fileBytes')} AS fileBytes FROM Track`).map(r => {
      const path = String(r.path ?? r.filename ?? '');
      const t = blankTrack(ext(r.id), path.replace(/\\/g, '/'));
      t.title = String(r.title ?? ''); t.artist = String(r.artist ?? ''); t.album = String(r.album ?? '');
      t.genre = String(r.genre ?? ''); t.comment = String(r.comment ?? ''); t.label = String(r.label ?? '');
      t.year = r.year ? String(r.year) : '';
      t.bpm = num(String(r.bpmAnalyzed ?? '')) || num(String(r.bpm ?? '')) || null;
      t.key = r.key == null ? null : engineKey(Number(r.key));
      const rating = num(String(r.rating ?? '')); t.rating = rating == null ? null : Math.round(rating / 20);
      t.duration = num(String(r.length ?? ''));
      const da = num(String(r.dateAdded ?? '')); t.dateAdded = da && da > 0 ? new Date(da * 1000).toISOString().slice(0, 10) : null;
      t.size = num(String(r.fileBytes ?? ''));
      return t;
    }).filter(t => t.path);
    const lists: ImportedList[] = [], entries = new Map<string, string[]>();
    if (tables.has('Playlist') && tables.has('PlaylistEntity')) {
      const pl = rows(db, 'SELECT id, title, parentListId AS parent, nextListId AS next FROM Playlist')
        .map(r => ({ id: Number(r.id), next: Number(r.next || 0), parent: Number(r.parent || 0), title: String(r.title ?? 'Playlist') }));
      // Each entry as "library/track": its own library when it names none.
      const ec = cols(db, 'PlaylistEntity');
      const ents = rows(db, `SELECT id, listId, trackId, nextEntityId AS next, ${ec.has('databaseUuid') ? 'databaseUuid' : 'NULL'} AS db FROM PlaylistEntity`)
        .map(r => ({ id: Number(r.id), next: Number(r.next || 0), list: Number(r.listId), key: r.db ? String(r.db) + '/' + String(r.trackId) : ext(r.trackId) }));
      const byList = new Map<number, typeof ents>();
      for (const e of ents) (byList.get(e.list) ?? byList.set(e.list, []).get(e.list)!).push(e);
      const byParent = new Map<number, typeof pl>();
      for (const p of pl) { const a = byParent.get(p.parent) || []; a.push(p); byParent.set(p.parent, a); }
      const emit = (parent: number) => {
        for (const p of linkedOrder(byParent.get(parent) || [])) {
          entries.set(String(p.id), linkedOrder(byList.get(p.id) ?? []).map(e => e.key));
          // Engine playlists can hold songs and other playlists at once; so can GLUE folders (ADR 0049).
          lists.push({ externalId: String(p.id), kind: byParent.has(p.id) ? 'folder' : 'playlist', name: p.title, parent: parent ? String(parent) : null, items: [] });
          emit(p.id);
        }
      };
      emit(0);
    }
    return resolveEngine({ app: 'engine', name: 'Engine DJ (' + fileName + ')', tracks, lists, engine: { uuids: uuid ? [uuid] : [], entries } }, []);
  } finally { db.close(); }
}

const libOf = (externalId: string) => { const i = externalId.indexOf('/'); return i > 0 ? externalId.slice(0, i) : ''; };

/** The playlists' songs, resolved across this library and `carried` tracks of the set's other
    libraries (imported before, or chosen together). Counts what couldn't be: entries of libraries not
    imported, and entries whose song is gone from its library. */
export function resolveEngine(lib: ImportedLibrary, carried: ImportedTrack[]): ImportedLibrary {
  const e = lib.engine;
  if (!e) return lib;
  const own = new Set(lib.tracks.map(t => t.externalId));
  const tracks = [...lib.tracks, ...carried.filter(t => !own.has(t.externalId))];
  const known = new Set(tracks.map(t => t.externalId));
  const libs = new Set([...e.uuids, ...tracks.map(t => libOf(t.externalId)).filter(Boolean)]);
  const missing = new Set<string>();
  const stats = { entries: 0, matched: 0, otherLibraries: 0, missingLibraries: 0, gone: 0, libraries: libs.size };
  const lists = lib.lists.map(l => {
    const items: string[] = [];
    for (const k of e.entries.get(l.externalId) ?? []) {
      stats.entries++;
      if (known.has(k)) { items.push(k); stats.matched++; continue; }
      const u = libOf(k);
      if (u && !libs.has(u)) { stats.otherLibraries++; missing.add(u); } else stats.gone++;
    }
    return { ...l, items };
  });
  stats.missingLibraries = missing.size;
  return { ...lib, tracks, lists, stats, engine: { uuids: [...libs], entries: e.entries } };
}

/** Several Engine libraries chosen together: one library, with the playlist tree of the one with the
    most songs (Engine keeps the same tree in each), entries resolved across all of them. */
export function combineEngine(libs: ImportedLibrary[]): ImportedLibrary {
  const main = [...libs].sort((a, b) => b.tracks.length - a.tracks.length)[0];
  const r = resolveEngine(main, libs.filter(l => l !== main).flatMap(l => l.tracks));
  return libs.length > 1 ? { ...r, name: 'Engine DJ (' + (r.stats?.libraries ?? libs.length) + ' libraries)' } : r;
}
