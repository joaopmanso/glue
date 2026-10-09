//! Engine DJ's playlists and songs written as Engine DJ writes them (ADR 0171; its schema in
//! tests/fixtures/engine-schema.sql): a playlist is a row of `Playlist`, its siblings a linked list (`nextListId`, 0 the
//! last), its songs a linked list of `PlaylistEntity` (`nextEntityId`); Engine DJ's own triggers re-link siblings on
//! an insert and a delete; a title is unique among its siblings, a song once per playlist.
use rusqlite::{params, Connection, OptionalExtension};

/// A playlist of Engine DJ's: its title, parent (0: the top), and its songs in order ("uuid/trackId").
#[derive(Clone, Debug, PartialEq)]
pub struct EList { pub id: i64, pub title: String, pub parent: i64, pub items: Vec<String> }

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
  let mut lists: Vec<EList> = db.prepare("SELECT id, title, parentListId FROM Playlist ORDER BY id").map_err(e)?
    .query_map([], |r| Ok(EList { id: r.get(0)?, title: r.get::<_, Option<String>>(1)?.unwrap_or_default(), parent: r.get::<_, Option<i64>>(2)?.unwrap_or(0), items: vec![] })).map_err(e)?
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
  let parts = |p: &std::path::Path| p.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>();
  let (a, b) = (parts(library), parts(file));
  if a.first().map(|x| x.to_lowercase()) != b.first().map(|x| x.to_lowercase()) { return None; }
  let common = a.iter().zip(&b).take_while(|(x, y)| x.eq_ignore_ascii_case(y)).count();
  let mut out: Vec<String> = std::iter::repeat_n("..".to_string(), a.len() - common).collect();
  out.extend(b[common..].iter().cloned());
  Some(out.join("/"))
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
    assert_eq!(order(&db, 0), ["Bee", "B (2)"]);
    assert_eq!(db.query_row("SELECT COUNT(*) FROM PlaylistEntity WHERE listId = ?1", [a], |r| r.get::<_, i64>(0)).unwrap(), 0);
    assert_eq!(db.query_row("SELECT COUNT(*) FROM Track", [], |r| r.get::<_, i64>(0)).unwrap(), 2, "the songs stay");
  }
  #[test]
  fn paths_from_the_engine_library_folder() {
    let p = std::path::Path::new;
    assert_eq!(rel_path(p("F:\\Engine Library"), p("F:\\Music Collection\\a.mp3")).as_deref(), Some("../Music Collection/a.mp3"));
    assert_eq!(rel_path(p("C:\\Users\\dj\\Music\\Engine Library"), p("C:\\Users\\dj\\Music\\Sets\\b.wav")).as_deref(), Some("../Sets/b.wav"));
    assert_eq!(rel_path(p("F:\\Engine Library"), p("G:\\x.mp3")), None);
  }
}
