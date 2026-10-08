//! Engine DJ's library (`Engine Library/Database2/m.db`, SQLite; `core/interop/engine.ts`), read from a copy in
//! memory. Tracks; playlists and their entries as linked lists (`nextListId`, `nextEntityId`). Engine DJ 3 keeps one
//! playlist tree for all its libraries (the computer's and each drive's), and an entry names the library its song is in
//! (`databaseUuid`): tracks are "uuid/id", and entries are resolved across every library imported so far.
use crate::types::*;
use indexmap::{IndexMap, IndexSet};
use rusqlite::types::ValueRef;
use rusqlite::{Connection, MAIN_DB};

/// A playlist or an entry: (id, next, (parent or list, title or key)).
type Row = (f64, f64, (f64, String));
type ByKey = IndexMap<u64, Vec<Row>>;

pub fn is_sqlite(b: &[u8]) -> bool { b.len() > 16 && &b[..15] == b"SQLite format 3" }

/// Engine's key number → Camelot (0 → 8B, 1 → 8A, 2 → 9B …).
pub fn engine_key(k: f64) -> Option<String> {
  if k.fract() != 0.0 || !(0.0..=23.0).contains(&k) { return None; }
  let k = k as i64;
  Some(format!("{}{}", ((k / 2 + 7) % 12) + 1, if k % 2 == 0 { "B" } else { "A" }))
}

/// A cell as sql.js hands it to JavaScript.
#[derive(Clone, Debug)]
enum Cell { Null, Num(f64), Text(String), Blob(Vec<u8>) }
impl Cell {
  fn of(v: ValueRef) -> Cell {
    match v {
      ValueRef::Null => Cell::Null, ValueRef::Integer(i) => Cell::Num(i as f64), ValueRef::Real(x) => Cell::Num(x),
      ValueRef::Text(t) => Cell::Text(String::from_utf8_lossy(t).into_owned()), ValueRef::Blob(b) => Cell::Blob(b.to_vec()),
    }
  }
  fn is_null(&self) -> bool { matches!(self, Cell::Null) }
  /// `String(v)`.
  fn string(&self) -> String {
    match self { Cell::Null => "null".into(), Cell::Num(x) => num_str(*x), Cell::Text(s) => s.clone(), Cell::Blob(b) => b.iter().map(u8::to_string).collect::<Vec<_>>().join(",") }
  }
  /// `String(v ?? or)`.
  fn or(&self, or: &str) -> String { if self.is_null() { or.into() } else { self.string() } }
  fn truthy(&self) -> bool { match self { Cell::Null => false, Cell::Num(x) => *x != 0.0 && !x.is_nan(), Cell::Text(s) => !s.is_empty(), Cell::Blob(_) => true } }
  /// `Number(v)`.
  fn number(&self) -> f64 {
    match self { Cell::Null => 0.0, Cell::Num(x) => *x, Cell::Text(s) => js_number(s), Cell::Blob(b) => if b.is_empty() { 0.0 } else if b.len() == 1 { b[0] as f64 } else { f64::NAN } }
  }
  /// `num(String(v ?? ''))`.
  fn num(&self) -> Option<f64> { num(Some(&self.or(""))) }
}

fn rows(db: &Connection, sql: &str) -> Result<Vec<IndexMap<String, Cell>>, String> {
  let mut st = db.prepare(sql).map_err(|e| e.to_string())?;
  let names: Vec<String> = st.column_names().iter().map(|s| s.to_string()).collect();
  let mut q = st.query([]).map_err(|e| e.to_string())?;
  let mut out = vec![];
  while let Some(r) = q.next().map_err(|e| e.to_string())? {
    let mut m = IndexMap::new();
    for (i, n) in names.iter().enumerate() { m.insert(n.clone(), Cell::of(r.get_ref(i).map_err(|e| e.to_string())?)); }
    out.push(m);
  }
  Ok(out)
}
fn cols(db: &Connection, table: &str) -> Result<IndexSet<String>, String> {
  Ok(rows(db, &format!("PRAGMA table_info({table})"))?.iter().map(|r| r["name"].string()).collect())
}

/// Siblings stored as a linked list (each points at the next one's id; 0 the end), in order (`linkedOrder`): from
/// each one nothing points at; the rest of a broken chain after, as they came.
fn linked_order<T: Clone>(items: &[(f64, f64, T)]) -> Vec<(f64, f64, T)> {
  let by_id: IndexMap<u64, usize> = items.iter().enumerate().map(|(i, x)| (x.0.to_bits(), i)).collect();
  let pointed: std::collections::HashSet<u64> = items.iter().map(|x| x.1.to_bits()).collect();
  let (mut out, mut seen) = (vec![], std::collections::HashSet::new());
  for head in items.iter().filter(|x| !pointed.contains(&x.0.to_bits())) {
    let mut cur = Some(head);
    while let Some(c) = cur { if !seen.insert(c.0.to_bits()) { break; } out.push(c.clone()); cur = by_id.get(&c.1.to_bits()).map(|&i| &items[i]); }
  }
  for x in items { if !seen.contains(&x.0.to_bits()) { out.push(x.clone()); } }
  out
}

pub fn parse_engine_db(bytes: &[u8], file_name: &str) -> Result<ImportedLibrary, String> {
  let mut db = Connection::open_in_memory().map_err(|e| e.to_string())?;
  db.deserialize_read_exact(MAIN_DB, bytes, bytes.len(), true).map_err(|e| e.to_string())?;
  let tables: IndexSet<String> = rows(&db, "SELECT name FROM sqlite_master WHERE type='table'")?.iter().map(|r| r["name"].string()).collect();
  if !tables.contains("Track") { return Err("This database has no Track table; it doesn’t look like an Engine DJ library.".into()); }
  let tc = cols(&db, "Track")?;
  let uuid = if tables.contains("Information") && cols(&db, "Information")?.contains("uuid") {
    rows(&db, "SELECT uuid FROM Information LIMIT 1")?.first().map_or(String::new(), |r| r["uuid"].or(""))
  } else { String::new() };
  let ext = |id: &Cell| if uuid.is_empty() { id.string() } else { format!("{uuid}/{}", id.string()) };
  let pick = |c: &str| if tc.contains(c) { c.to_string() } else { "NULL".into() };
  let sql = format!("SELECT id, {} AS path, {} AS filename, {} AS title, {} AS artist,
      {} AS album, {} AS genre, {} AS comment, {} AS label, {} AS year,
      {} AS bpmAnalyzed, {} AS bpm, {} AS key, {} AS rating, {} AS length,
      {} AS dateAdded, {} AS fileBytes FROM Track",
    pick("path"), pick("filename"), pick("title"), pick("artist"), pick("album"), pick("genre"), pick("comment"), pick("label"), pick("year"),
    pick("bpmAnalyzed"), pick("bpm"), pick("key"), pick("rating"), pick("length"), pick("dateAdded"), pick("fileBytes"));
  let mut tracks = vec![];
  for r in rows(&db, &sql)? {
    let path = if !r["path"].is_null() { r["path"].string() } else { r["filename"].or("") };
    let mut t = blank_track(ext(&r["id"]), path.replace('\\', "/"));
    t.title = r["title"].or(""); t.artist = r["artist"].or(""); t.album = r["album"].or("");
    t.genre = r["genre"].or(""); t.comment = r["comment"].or(""); t.label = r["label"].or("");
    t.year = if r["year"].truthy() { r["year"].string() } else { String::new() };
    t.bpm = r["bpmAnalyzed"].num().filter(|&b| b != 0.0).or(r["bpm"].num().filter(|&b| b != 0.0));
    t.key = if r["key"].is_null() { None } else { engine_key(r["key"].number()) };
    t.rating = r["rating"].num().map(|x| round(x / 20.0));
    t.duration = r["length"].num();
    t.date_added = match r["dateAdded"].num() { Some(d) if d > 0.0 => Some(iso_day(d)?), _ => None };
    t.size = r["fileBytes"].num();
    if !t.path.is_empty() { tracks.push(t); }
  }
  let mut lists = vec![];
  let mut entries: IndexMap<String, Vec<String>> = IndexMap::new();
  if tables.contains("Playlist") && tables.contains("PlaylistEntity") {
    let pl: Vec<Row> = rows(&db, "SELECT id, title, parentListId AS parent, nextListId AS next FROM Playlist")?.iter()
      .map(|r| (r["id"].number(), if r["next"].truthy() { r["next"].number() } else { 0.0 }, (if r["parent"].truthy() { r["parent"].number() } else { 0.0 }, r["title"].or("Playlist")))).collect();
    // Each entry as "library/track": its own library when it names none.
    let ec = cols(&db, "PlaylistEntity")?;
    let ents: Vec<Row> = rows(&db, &format!("SELECT id, listId, trackId, nextEntityId AS next, {} AS db FROM PlaylistEntity", if ec.contains("databaseUuid") { "databaseUuid" } else { "NULL" }))?.iter()
      .map(|r| (r["id"].number(), if r["next"].truthy() { r["next"].number() } else { 0.0 }, (r["listId"].number(), if r["db"].truthy() { format!("{}/{}", r["db"].string(), r["trackId"].string()) } else { ext(&r["trackId"]) }))).collect();
    let mut by_list: ByKey = IndexMap::new();
    for e in &ents { by_list.entry(e.2 .0.to_bits()).or_default().push(e.clone()); }
    let mut by_parent: ByKey = IndexMap::new();
    for p in &pl { by_parent.entry(p.2 .0.to_bits()).or_default().push(p.clone()); }
    fn emit(parent: f64, by_parent: &ByKey, by_list: &ByKey, lists: &mut Vec<ImportedList>, entries: &mut IndexMap<String, Vec<String>>) {
      let kids = by_parent.get(&parent.to_bits()).cloned().unwrap_or_default();
      for p in linked_order(&kids) {
        let id = num_str(p.0);
        entries.insert(id.clone(), linked_order(by_list.get(&p.0.to_bits()).map_or(&[][..], |v| v.as_slice())).into_iter().map(|e| e.2 .1).collect());
        // Engine playlists can hold songs and other playlists at once; so can GLUE folders (ADR 0049).
        lists.push(ImportedList { external_id: id, kind: if by_parent.contains_key(&p.0.to_bits()) { "folder" } else { "playlist" }, name: p.2 .1.clone(), parent: (parent != 0.0 && !parent.is_nan()).then(|| num_str(parent)), items: vec![] });
        emit(p.0, by_parent, by_list, lists, entries);
      }
    }
    emit(0.0, &by_parent, &by_list, &mut lists, &mut entries);
  }
  let lib = ImportedLibrary { app: "engine", name: format!("Engine DJ ({file_name})"), tracks, lists, stats: None, engine: Some(EngineSet { uuids: if uuid.is_empty() { vec![] } else { vec![uuid.clone()] }, entries }) };
  Ok(resolve_engine(lib, &[]))
}

fn lib_of(external_id: &str) -> &str { match external_id.find('/') { Some(i) if i > 0 => &external_id[..i], _ => "" } }

/// The playlists' songs, resolved across this library and `carried` tracks of the set's other libraries (imported
/// before, or chosen together) (`resolveEngine`). Counts what couldn't be: entries of libraries not imported, and
/// entries whose song is gone from its library.
pub fn resolve_engine(mut lib: ImportedLibrary, carried: &[ImportedTrack]) -> ImportedLibrary {
  let Some(e) = lib.engine.take() else { return lib };
  let own: std::collections::HashSet<String> = lib.tracks.iter().map(|t| t.external_id.clone()).collect();
  lib.tracks.extend(carried.iter().filter(|t| !own.contains(&t.external_id)).cloned());
  let known: std::collections::HashSet<&str> = lib.tracks.iter().map(|t| t.external_id.as_str()).collect();
  let mut libs: IndexSet<String> = e.uuids.iter().cloned().collect();
  for t in &lib.tracks { let u = lib_of(&t.external_id); if !u.is_empty() { libs.insert(u.to_string()); } }
  let mut missing = IndexSet::new();
  let mut st = Stats { libraries: libs.len(), ..Default::default() };
  for l in &mut lib.lists {
    let mut items = vec![];
    for k in e.entries.get(&l.external_id).map_or(&[][..], |v| v.as_slice()) {
      st.entries += 1;
      if known.contains(k.as_str()) { items.push(k.clone()); st.matched += 1; continue; }
      let u = lib_of(k);
      if !u.is_empty() && !libs.contains(u) { st.other_libraries += 1; missing.insert(u.to_string()); } else { st.gone += 1; }
    }
    l.items = items;
  }
  st.missing_libraries = missing.len();
  lib.stats = Some(st);
  lib.engine = Some(EngineSet { uuids: libs.into_iter().collect(), entries: e.entries });
  lib
}

/// Several Engine libraries chosen together: one, with the playlist tree of the one with the most songs (Engine
/// keeps the same tree in each), its entries resolved across all of them (`combineEngine`).
pub fn combine_engine(libs: Vec<ImportedLibrary>) -> ImportedLibrary {
  let count = libs.len();
  let mut order: Vec<usize> = (0..count).collect();
  order.sort_by(|&a, &b| libs[b].tracks.len().cmp(&libs[a].tracks.len()));
  let main = order[0];
  let carried: Vec<ImportedTrack> = libs.iter().enumerate().filter(|(i, _)| *i != main).flat_map(|(_, l)| l.tracks.iter().cloned()).collect();
  let mut r = resolve_engine(libs.into_iter().nth(main).unwrap(), &carried);
  if count > 1 { r.name = format!("Engine DJ ({} libraries)", r.stats.as_ref().map_or(count, |s| s.libraries)); }
  r
}
