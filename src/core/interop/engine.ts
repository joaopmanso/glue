/* Engine DJ library (Engine Library/Database2/m.db, SQLite). Read-only, from a copy of the file.
   Schema per libdjinterop (2.x–3.x): Track, Playlist (linked by nextListId), PlaylistEntity (linked
   by nextEntityId). Key ints 0–23 in circle-of-fifths order: 0 C major, 1 A minor, 2 G major, … */
import type { Database, SqlJsStatic } from 'sql.js';
import { blankTrack, num, type ImportedLibrary, type ImportedList } from './types';

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
    const pick = (c: string) => tc.has(c) ? c : 'NULL';
    const tracks = rows(db, `SELECT id, ${pick('path')} AS path, ${pick('filename')} AS filename, ${pick('title')} AS title, ${pick('artist')} AS artist,
      ${pick('album')} AS album, ${pick('genre')} AS genre, ${pick('comment')} AS comment, ${pick('label')} AS label, ${pick('year')} AS year,
      ${pick('bpmAnalyzed')} AS bpmAnalyzed, ${pick('bpm')} AS bpm, ${pick('key')} AS key, ${pick('rating')} AS rating, ${pick('length')} AS length,
      ${pick('dateAdded')} AS dateAdded, ${pick('fileBytes')} AS fileBytes FROM Track`).map(r => {
      const path = String(r.path ?? r.filename ?? '');
      const t = blankTrack(String(r.id), path.replace(/\\/g, '/'));
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
    const lists: ImportedList[] = [];
    if (tables.has('Playlist') && tables.has('PlaylistEntity')) {
      const pl = rows(db, 'SELECT id, title, parentListId AS parent, nextListId AS next FROM Playlist')
        .map(r => ({ id: Number(r.id), next: Number(r.next || 0), parent: Number(r.parent || 0), title: String(r.title ?? 'Playlist') }));
      const ents = rows(db, 'SELECT id, listId, trackId, nextEntityId AS next FROM PlaylistEntity')
        .map(r => ({ id: Number(r.id), next: Number(r.next || 0), list: Number(r.listId), track: String(r.trackId) }));
      const hasChildren = new Set(pl.map(p => p.parent));
      const byParent = new Map<number, typeof pl>();
      for (const p of pl) { const a = byParent.get(p.parent) || []; a.push(p); byParent.set(p.parent, a); }
      const emit = (parent: number) => {
        for (const p of linkedOrder(byParent.get(parent) || [])) {
          const items = linkedOrder(ents.filter(e => e.list === p.id)).map(e => e.track);
          const folder = hasChildren.has(p.id) && !items.length;
          lists.push({ externalId: String(p.id), kind: folder ? 'folder' : 'playlist', name: p.title, parent: parent ? String(parent) : null, items });
          emit(p.id);
        }
      };
      emit(0);
    }
    return { app: 'engine', name: 'Engine DJ (' + fileName + ')', tracks, lists };
  } finally { db.close(); }
}
