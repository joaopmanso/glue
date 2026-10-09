//! Engine DJ's playlists and songs written as Engine DJ writes them (ADR 0171; its schema in
//! tests/fixtures/engine-schema.sql): a playlist is a row of `Playlist`, its siblings a linked list (`nextListId`, 0 the
//! last), its songs a linked list of `PlaylistEntity` (`nextEntityId`); Engine DJ's own triggers re-link siblings on
//! an insert and a delete; a title is unique among its siblings, a song once per playlist.
use rusqlite::{params, Connection, OptionalExtension};

/// A playlist of Engine DJ's: its title, parent (0: the top), and its songs in order ("uuid/trackId").
#[derive(Clone, Debug, PartialEq)]
pub struct EList { pub id: i64, pub title: String, pub parent: i64, pub items: Vec<String>, pub next: i64 }

type R<T> = Result<T, String>;
fn e(x: rusqlite::Error) -> String { x.to_string() }
/// A table's columns (older libraries lack some of Engine DJ 4's).
fn has(db: &Connection, table: &str, col: &str) -> bool {
  db.prepare(&format!("PRAGMA table_info({table})")).and_then(|mut q| q.query_map([], |r| r.get::<_, String>(1))?.collect::<Result<Vec<_>, _>>()).is_ok_and(|c| c.iter().any(|x| x == col))
}
/// "Playlist.lastEditTime = now", where the library has it.
fn touched(db: &Connection) -> &'static str { if has(db, "Playlist", "lastEditTime") { ", lastEditTime = strftime('%Y-%m-%d %H:%M:%S', 'now')" } else { "" } }

/// Every playlist, with its songs in order (an entry naming no library is this database's, `own`).
pub fn read_lists(db: &Connection, own: &str) -> R<Vec<EList>> {
  let mut lists: Vec<EList> = db.prepare("SELECT id, title, parentListId, nextListId FROM Playlist ORDER BY id").map_err(e)?
    .query_map([], |r| Ok(EList { id: r.get(0)?, title: r.get::<_, Option<String>>(1)?.unwrap_or_default(), parent: r.get::<_, Option<i64>>(2)?.unwrap_or(0), items: vec![], next: r.get::<_, Option<i64>>(3)?.unwrap_or(0) })).map_err(e)?
    .collect::<Result<_, _>>().map_err(e)?;
  let mut ents: std::collections::HashMap<i64, Vec<(i64, i64, String)>> = std::collections::HashMap::new();
  let mut q = db.prepare("SELECT id, listId, trackId, databaseUuid, nextEntityId FROM PlaylistEntity").map_err(e)?;
  let rows = q.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, Option<i64>>(4)?.unwrap_or(0)))).map_err(e)?;
  for row in rows {
    let (id, list, track, uuid, next) = row.map_err(e)?;
    let u = uuid.filter(|u| !u.is_empty()).unwrap_or_else(|| own.to_string());
    ents.entry(list).or_default().push((id, next, format!("{u}/{track}")));
  }
  for l in &mut lists {
    let Some(es) = ents.get(&l.id) else { continue };
    // In order: from the one nothing points at; the rest of a broken chain after.
    let pointed: std::collections::HashSet<i64> = es.iter().map(|x| x.1).collect();
    let by_id: std::collections::HashMap<i64, &(i64, i64, String)> = es.iter().map(|x| (x.0, x)).collect();
    let mut seen = std::collections::HashSet::new();
    for head in es.iter().filter(|x| !pointed.contains(&x.0)) {
      let mut cur = Some(head);
      while let Some(c) = cur { if !seen.insert(c.0) { break; } l.items.push(c.2.clone()); cur = by_id.get(&c.1).copied(); }
    }
    for x in es { if !seen.contains(&x.0) { l.items.push(x.2.clone()); } }
  }
  Ok(lists)
}

/// A parent's playlists in Engine DJ's order (from the one nothing points at; a broken chain's rest after, by id).
pub fn order_of(lists: &[EList], parent: i64) -> Vec<i64> {
  let kids: Vec<&EList> = lists.iter().filter(|l| l.parent == parent).collect();
  let pointed: std::collections::HashSet<i64> = kids.iter().map(|l| l.next).collect();
  let mut out = vec![];
  let mut seen = std::collections::HashSet::new();
  for head in kids.iter().filter(|l| !pointed.contains(&l.id)) {
    let mut cur = Some(*head);
    while let Some(c) = cur { if !seen.insert(c.id) { break; } out.push(c.id); cur = kids.iter().find(|x| x.id == c.next).copied(); }
  }
  for l in &kids { if !seen.contains(&l.id) { out.push(l.id); } }
  out
}
/// A parent's playlists put in this order (each links to the next, the last to 0; others of it after, as they were).
pub fn set_order(db: &Connection, parent: i64, ids: &[i64]) -> R<()> {
  // Each link is unique among siblings: first a value no row has, then the order.
  db.execute("UPDATE Playlist SET nextListId = -1000000000000 - id WHERE parentListId = ?1", [parent]).map_err(e)?;
  for (i, id) in ids.iter().enumerate() { db.execute("UPDATE Playlist SET nextListId = ?1 WHERE id = ?2 AND parentListId = ?3", params![ids.get(i + 1).copied().unwrap_or(0), id, parent]).map_err(e)?; }
  Ok(())
}
/// A title free among a parent's playlists: as it is, else "Title (2)", "(3)"…
fn free_title(db: &Connection, parent: i64, title: &str, but: i64) -> R<String> {
  let taken = |t: &str| -> R<bool> { db.query_row("SELECT 1 FROM Playlist WHERE parentListId = ?1 AND title = ?2 AND id <> ?3", params![parent, t, but], |_| Ok(())).optional().map(|x| x.is_some()).map_err(e) };
  if !taken(title)? { return Ok(title.to_string()); }
  let mut k = 2;
  loop { let t = format!("{title} ({k})"); if !taken(&t)? { return Ok(t); } k += 1; }
}

/// A new playlist, the last of its parent's (Engine DJ's triggers link it). Its id.
pub fn create_list(db: &Connection, title: &str, parent: i64) -> R<i64> {
  let t = free_title(db, parent, title, 0)?;
  // Engine DJ 4's own: persisted, exported, edited now (an older library without them, without).
  let (mut cols, mut vals) = ("title, parentListId, nextListId".to_string(), "?1, ?2, 0".to_string());
  for (c, v) in [("isPersisted", "1"), ("lastEditTime", "strftime('%Y-%m-%d %H:%M:%S', 'now')"), ("isExplicitlyExported", "1")] { if has(db, "Playlist", c) { cols += &format!(", {c}"); vals += &format!(", {v}"); } }
  db.execute(&format!("INSERT INTO Playlist ({cols}) VALUES ({vals})"), params![t, parent]).map_err(e)?;
  Ok(db.last_insert_rowid())
}
pub fn rename_list(db: &Connection, id: i64, title: &str) -> R<()> {
  let parent: i64 = db.query_row("SELECT parentListId FROM Playlist WHERE id = ?1", [id], |r| r.get(0)).map_err(e)?;
  let t = free_title(db, parent, title, id)?;
  db.execute(&format!("UPDATE Playlist SET title = ?1{} WHERE id = ?2", touched(db)), params![t, id]).map_err(e)?;
  Ok(())
}
/// Into another parent, as its last (Engine DJ has no trigger for a move: its old siblings re-linked here).
pub fn move_list(db: &Connection, id: i64, parent: i64) -> R<()> {
  let (old, next, title): (i64, i64, String) = db.query_row("SELECT parentListId, nextListId, title FROM Playlist WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get::<_, Option<String>>(2)?.unwrap_or_default()))).map_err(e)?;
  if old == parent { return Ok(()); }
  // Out of the old chain: a value no other row has, then the one before it points past it.
  let tmp = -1_000_000_000_000 - id;
  db.execute("UPDATE Playlist SET nextListId = ?1 WHERE id = ?2", params![tmp, id]).map_err(e)?;
  db.execute("UPDATE Playlist SET nextListId = ?1 WHERE nextListId = ?2 AND parentListId = ?3", params![next, id, old]).map_err(e)?;
  // Into the new one, last.
  let t = free_title(db, parent, &title, id)?;
  db.execute("UPDATE Playlist SET parentListId = ?1, title = ?2 WHERE id = ?3", params![parent, t, id]).map_err(e)?;
  db.execute("UPDATE Playlist SET nextListId = ?1 WHERE parentListId = ?2 AND nextListId = 0 AND id <> ?1", params![id, parent]).map_err(e)?;
  db.execute(&format!("UPDATE Playlist SET nextListId = 0{} WHERE id = ?1", touched(db)), [id]).map_err(e)?;
  Ok(())
}
/// A playlist and everything in it (its songs' entries; the songs stay in the collection).
pub fn delete_list(db: &Connection, id: i64) -> R<()> {
  let kids: Vec<i64> = db.prepare("SELECT id FROM Playlist WHERE parentListId = ?1").map_err(e)?.query_map([id], |r| r.get(0)).map_err(e)?.collect::<Result<_, _>>().map_err(e)?;
  for k in kids { delete_list(db, k)?; }
  db.execute("DELETE FROM PlaylistEntity WHERE listId = ?1", [id]).map_err(e)?;
  // Engine DJ's trigger re-links its siblings.
  db.execute("DELETE FROM Playlist WHERE id = ?1", [id]).map_err(e)?;
  Ok(())
}
/// A playlist's songs, in this order ("uuid/trackId"; each once, as Engine DJ allows).
pub fn set_items(db: &Connection, list: i64, items: &[String]) -> R<()> {
  db.execute("DELETE FROM PlaylistEntity WHERE listId = ?1", [list]).map_err(e)?;
  let mut seen = std::collections::HashSet::new();
  let mut ids = vec![];
  for it in items {
    let Some((uuid, track)) = it.split_once('/') else { continue };
    let Ok(track) = track.parse::<i64>() else { continue };
    if !seen.insert(it.clone()) { continue; }
    db.execute(if has(db, "PlaylistEntity", "membershipReference") { "INSERT INTO PlaylistEntity (listId, trackId, databaseUuid, nextEntityId, membershipReference) VALUES (?1, ?2, ?3, 0, 0)" } else { "INSERT INTO PlaylistEntity (listId, trackId, databaseUuid, nextEntityId) VALUES (?1, ?2, ?3, 0)" }, params![list, track, uuid]).map_err(e)?;
    ids.push(db.last_insert_rowid());
  }
  for w in ids.windows(2) { db.execute("UPDATE PlaylistEntity SET nextEntityId = ?1 WHERE id = ?2", params![w[1], w[0]]).map_err(e)?; }
  if has(db, "Playlist", "lastEditTime") { db.execute("UPDATE Playlist SET lastEditTime = strftime('%Y-%m-%d %H:%M:%S', 'now') WHERE id = ?1", [list]).map_err(e)?; }
  Ok(())
}

/// A song for Engine DJ's collection: its path from the database's `Engine Library` folder ("../Music/a.mp3"), its
/// tags, length (s), size, and the file's date (s). Engine DJ analyses it when it next sees it.
#[derive(Clone, Debug, Default)]
pub struct NewTrack { pub path: String, pub title: String, pub artist: String, pub album: String, pub genre: String, pub comment: String, pub label: String, pub year: Option<i64>, pub length: Option<f64>, pub size: Option<f64>, pub created: Option<f64> }
/// Into the collection (Engine DJ's triggers give it its origin and an empty `PerformanceData`). Its id.
pub fn add_track(db: &Connection, t: &NewTrack, now: i64) -> R<i64> {
  let file = t.path.rsplit('/').next().unwrap_or(&t.path).to_string();
  let ext = file.rsplit_once('.').map(|x| x.1.to_lowercase()).unwrap_or_default();
  let nz = |s: &str| (!s.is_empty()).then(|| s.to_string());
  db.execute("INSERT INTO Track (path, filename, title, artist, album, genre, comment, label, year, length, fileBytes, fileType, rating, isPlayed, isAnalyzed, dateCreated, dateAdded, isAvailable, isMetadataOfPackedTrackChanged, isPerfomanceDataOfPackedTrackChanged, isMetadataImported, pdbImportKey, isBeatGridLocked, streamingFlags, explicitLyrics, lastEditTime)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, 0, 0, ?13, ?14, 1, 0, 0, 0, 0, 0, 0, 0, ?14)",
    params![t.path, file, nz(&t.title).unwrap_or_else(|| file.clone()), nz(&t.artist), nz(&t.album), nz(&t.genre), nz(&t.comment), nz(&t.label), t.year, t.length.map(|l| l.round() as i64), t.size.map(|s| s as i64), ext, t.created.map(|c| c as i64).unwrap_or(now), now]).map_err(e)?;
  Ok(db.last_insert_rowid())
}
/// The song at this path in the collection, if it has it.
pub fn track_at(db: &Connection, path: &str) -> R<Option<i64>> {
  db.query_row("SELECT id FROM Track WHERE path = ?1", [path], |r| r.get(0)).optional().map_err(e)
}

/// A file's path from an `Engine Library` folder, as Engine DJ keeps it ("../Music/a.mp3"); None on another drive.
pub fn rel_path(library: &std::path::Path, file: &std::path::Path) -> Option<String> {
  // As text (a Windows path reads the same on any system), its parts by either separator.
  let parts = |p: &std::path::Path| p.to_string_lossy().split(['/', '\\']).filter(|x| !x.is_empty()).map(String::from).collect::<Vec<_>>();
  let (a, b) = (parts(library), parts(file));
  if drive(&a) != drive(&b) { return None; }
  let common = a.iter().zip(&b).take_while(|(x, y)| x.eq_ignore_ascii_case(y)).count();
  let mut out: Vec<String> = std::iter::repeat_n("..".to_string(), a.len() - common).collect();
  out.extend(b[common..].iter().cloned());
  Some(out.join("/"))
}
/// Two paths on the same drive (or volume).
pub fn same_drive(a: &std::path::Path, b: &std::path::Path) -> bool {
  let parts = |p: &std::path::Path| p.to_string_lossy().split(['/', '\\']).filter(|x| !x.is_empty()).map(String::from).collect::<Vec<_>>();
  drive(&parts(a)) == drive(&parts(b))
}

/// A new Engine DJ library database at `path` (`…/Engine Library/Database2/m.db`), made as `like` is (its tables,
/// indexes, views and triggers, its version), with its own id. Engine DJ keeps one per drive with music on it; GLUE
/// makes one only where a song it adds has none. Its id.
pub fn create_like(like: &Connection, path: &std::path::Path) -> R<String> {
  if path.exists() { return Err(format!("{} is there already", path.display())); }
  std::fs::create_dir_all(path.parent().ok_or("no folder")?).map_err(|x| x.to_string())?;
  // A version 4 UUID, as Engine DJ's own.
  let hex: String = like.query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0)).map_err(e)?;
  let v = |i: usize| &hex[i..];
  let variant = ["8", "9", "a", "b"][usize::from_str_radix(&hex[16..17], 16).unwrap_or(0) % 4];
  let uuid = format!("{}-{}-4{}-{}{}-{}", &hex[0..8], &hex[8..12], &v(13)[..3], variant, &v(17)[..3], &hex[20..32]);
  let mut db = Connection::open(path).map_err(e)?;
  let schema: Vec<String> = like.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END, rowid").map_err(e)?
    .query_map([], |r| r.get(0)).map_err(e)?.collect::<Result<_, _>>().map_err(e)?;
  let version: i64 = like.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(e)?;
  let cols: Vec<String> = like.prepare("PRAGMA table_info(Information)").map_err(e)?.query_map([], |r| r.get::<_, String>(1)).map_err(e)?.collect::<Result<_, _>>().map_err(e)?;
  let row: Vec<rusqlite::types::Value> = like.query_row(&format!("SELECT {} FROM Information LIMIT 1", cols.join(", ")), [], |r| (0..cols.len()).map(|i| r.get(i)).collect()).map_err(e)?;
  let tx = db.transaction().map_err(e)?;
  for sql in &schema { tx.execute_batch(sql).map_err(e)?; }
  let vals: Vec<rusqlite::types::Value> = cols.iter().zip(row).map(|(c, v)| if c == "uuid" { rusqlite::types::Value::Text(uuid.clone()) } else { v }).collect();
  let marks: Vec<String> = (1..=cols.len()).map(|i| format!("?{i}")).collect();
  tx.execute(&format!("INSERT INTO Information ({}) VALUES ({})", cols.join(", "), marks.join(", ")), rusqlite::params_from_iter(vals)).map_err(e)?;
  tx.execute_batch(&format!("PRAGMA user_version = {version}")).map_err(e)?;
  tx.commit().map_err(e)?;
  Ok(uuid)
}

/// The drive a path's parts are on: Windows its letter ("f:"), macOS its volume ("volumes/f"), else the start disk.
fn drive(parts: &[String]) -> String {
  match parts {
    [d, ..] if d.len() == 2 && d.ends_with(':') => d.to_lowercase(),
    [v, name, ..] if v == "Volumes" => format!("volumes/{}", name.to_lowercase()),
    _ => "/".into(),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  /// An Engine DJ database with nothing in it, its schema Engine DJ's own.
  pub fn empty(uuid: &str) -> Connection {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch(&std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/fixtures/engine-schema.sql")).unwrap()).unwrap();
    db.execute("INSERT INTO Information (uuid, schemaVersionMajor, schemaVersionMinor, schemaVersionPatch) VALUES (?1, 3, 0, 2)", [uuid]).unwrap();
    db
  }
  #[test]
  fn a_library_made_like_another_takes_songs_as_engine_dj_does() {
    // 2026-10-09: a song on a drive with no Engine DJ library (C:, the library on F:): one made there, as Engine DJ would.
    let main = empty("main-uuid");
    main.execute_batch("PRAGMA user_version = 7").unwrap();
    let dir = std::env::temp_dir().join(format!("glue-create-like-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let path = dir.join("Engine Library").join("Database2").join("m.db");
    let uuid = create_like(&main, &path).unwrap();
    assert_eq!((uuid.len(), &uuid[14..15]), (36, "4"), "{uuid}");
    let db = Connection::open(&path).unwrap();
    let (u, major): (String, i64) = db.query_row("SELECT uuid, schemaVersionMajor FROM Information", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
    assert_eq!((u, major), (uuid.clone(), 3), "its own id, the main one's version");
    assert_eq!(db.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0)).unwrap(), 7);
    let id = add_track(&db, &NewTrack { path: "../Music/a.mp3".into(), ..Default::default() }, 1_790_000_000).unwrap();
    assert_eq!(db.query_row("SELECT COUNT(*) FROM PerformanceData WHERE trackId = ?1", [id], |r| r.get::<_, i64>(0)).unwrap(), 1, "Engine DJ's triggers came too");
    assert!(create_like(&main, &path).is_err(), "never over one that's there");
    drop(db);
    let _ = std::fs::remove_dir_all(&dir);
    assert!(same_drive(std::path::Path::new("F:\\Music\\a.mp3"), std::path::Path::new("f:/Engine Library")));
    assert!(!same_drive(std::path::Path::new("C:\\Users\\x\\Music"), std::path::Path::new("F:\\Engine Library")));
  }
  fn order(db: &Connection, parent: i64) -> Vec<String> {
    // Siblings in Engine DJ's order: from the one nothing points at.
    let rows: Vec<(i64, String, i64)> = db.prepare("SELECT id, title, nextListId FROM Playlist WHERE parentListId = ?1").unwrap().query_map([parent], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap().map(Result::unwrap).collect();
    let pointed: std::collections::HashSet<i64> = rows.iter().map(|r| r.2).collect();
    let mut cur = rows.iter().find(|r| !pointed.contains(&r.0));
    let mut out = vec![];
    while let Some(r) = cur { out.push(r.1.clone()); cur = rows.iter().find(|x| x.0 == r.2); }
    assert_eq!(out.len(), rows.len(), "one chain: {rows:?}");
    out
  }
  #[test]
  fn playlists_made_moved_renamed_and_deleted_as_engine_dj_keeps_them() {
    let db = empty("u1");
    let a = create_list(&db, "A", 0).unwrap();
    let b = create_list(&db, "B", 0).unwrap();
    let f = create_list(&db, "Folder", 0).unwrap();
    let c = create_list(&db, "A", f).unwrap();
    assert_eq!(order(&db, 0), ["A", "B", "Folder"]);
    // A title taken among its siblings: numbered.
    assert_eq!(create_list(&db, "B", 0).map(|id| db.query_row("SELECT title FROM Playlist WHERE id = ?1", [id], |r| r.get::<_, String>(0)).unwrap()).unwrap(), "B (2)");
    rename_list(&db, b, "Bee").unwrap();
    move_list(&db, a, f).unwrap();
    assert_eq!(order(&db, 0), ["Bee", "Folder", "B (2)"]);
    assert_eq!(order(&db, f), ["A", "A (2)"], "moved in last, its title free there");
    // Put in another order.
    let top: Vec<i64> = order_of(&read_lists(&db, "u1").unwrap(), 0);
    let mut back = top.clone(); back.reverse();
    set_order(&db, 0, &back).unwrap();
    assert_eq!(order(&db, 0), ["B (2)", "Folder", "Bee"]);
    assert_eq!(order_of(&read_lists(&db, "u1").unwrap(), 0), back);
    let _ = c;
    // Songs in order, each once.
    let t1 = add_track(&db, &NewTrack { path: "../Music/one.mp3".into(), title: "One".into(), length: Some(300.4), size: Some(1000.0), ..Default::default() }, 1_790_000_000).unwrap();
    let t2 = add_track(&db, &NewTrack { path: "../Music/two.flac".into(), ..Default::default() }, 1_790_000_000).unwrap();
    assert_eq!(db.query_row("SELECT COUNT(*) FROM PerformanceData", [], |r| r.get::<_, i64>(0)).unwrap(), 2, "Engine DJ's trigger made their rows");
    assert_eq!(db.query_row("SELECT originDatabaseUuid FROM Track WHERE id = ?1", [t1], |r| r.get::<_, String>(0)).unwrap(), "u1");
    assert_eq!(track_at(&db, "../Music/two.flac").unwrap(), Some(t2));
    let items = vec![format!("u1/{t2}"), format!("u1/{t1}"), format!("u1/{t2}"), "other/9".to_string()];
    set_items(&db, b, &items).unwrap();
    let lists = read_lists(&db, "u1").unwrap();
    assert_eq!(lists.iter().find(|l| l.id == b).unwrap().items, [format!("u1/{t2}"), format!("u1/{t1}"), "other/9".to_string()]);
    set_items(&db, b, &[format!("u1/{t1}")]).unwrap();
    assert_eq!(read_lists(&db, "u1").unwrap().iter().find(|l| l.id == b).unwrap().items, [format!("u1/{t1}")]);
    // A folder deleted: what's in it too; its siblings re-linked.
    set_items(&db, a, &[format!("u1/{t1}")]).unwrap();
    delete_list(&db, f).unwrap();
    assert_eq!(order(&db, 0), ["B (2)", "Bee"]);
    assert_eq!(db.query_row("SELECT COUNT(*) FROM PlaylistEntity WHERE listId = ?1", [a], |r| r.get::<_, i64>(0)).unwrap(), 0);
    assert_eq!(db.query_row("SELECT COUNT(*) FROM Track", [], |r| r.get::<_, i64>(0)).unwrap(), 2, "the songs stay");
  }
  #[test]
  fn paths_from_the_engine_library_folder() {
    let p = std::path::Path::new;
    assert_eq!(rel_path(p("F:\\Engine Library"), p("F:\\Music Collection\\a.mp3")).as_deref(), Some("../Music Collection/a.mp3"));
    assert_eq!(rel_path(p("C:\\Users\\dj\\Music\\Engine Library"), p("C:\\Users\\dj\\Music\\Sets\\b.wav")).as_deref(), Some("../Sets/b.wav"));
    assert_eq!(rel_path(p("F:\\Engine Library"), p("G:\\x.mp3")), None);
    // macOS: a drive is a volume; the start disk is one too.
    assert_eq!(rel_path(p("/Volumes/F/Engine Library"), p("/Volumes/F/Music Collection/a.mp3")).as_deref(), Some("../Music Collection/a.mp3"));
    assert_eq!(rel_path(p("/Users/dj/Music/Engine Library"), p("/Users/dj/Music/Sets/b.wav")).as_deref(), Some("../Sets/b.wav"));
    assert_eq!(rel_path(p("/Volumes/F/Engine Library"), p("/Volumes/G/x.mp3")), None);
    assert_eq!(rel_path(p("/Users/dj/Music/Engine Library"), p("/Volumes/G/x.mp3")), None);
  }
}
