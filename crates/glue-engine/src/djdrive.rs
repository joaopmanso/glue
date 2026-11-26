//! GLUE's own Engine DJ library (ADR 0196): the lists marked *Keep in Engine DJ* (the XML's tree, `dj_glued`), written
//! into a library of GLUE's that Engine DJ sees as a drive. Engine DJ 5.3 merges every drive's library with its
//! Collection each time it starts (2026-11-26, tried with the user: a list made, changed, renamed, deleted and nested
//! there showed so in the Collection), so GLUE never writes Engine DJ's own databases.
//! - **Where:** `djDrive` in the settings (a folder; `false`: none), else `<Music>/GLUE/Engine DJ`, its
//!   `Engine Library/Database2/m.db` made as the Collection's is (`create_like`). Shown as a drive by the host
//!   (`engine_drive`: Windows' `subst`).
//! - **What:** only the top "GLUE" folder and what's in it; Engine DJ copies the Collection's other lists into the
//!   library too, and they're left as they are. A list is known by its name among its siblings, as Engine DJ knows it:
//!   renamed, it's another list.
//! - **Songs:** a song Engine DJ has already (any of its libraries here, the same file) is that one, with its analysis;
//!   another goes into GLUE's library by its full path, and Engine DJ analyses it.
//! - **When:** the DJ timer, while Engine DJ is closed (ADR 0168), when GLUE's lists or the library's file changed;
//!   the library backed up first (`dj_backup`).
use crate::djlists::real_path;
use crate::djmirror::GLUE_FOLDER;
use crate::djsync::ENGINE_APPS;
use crate::djxml::hash;
use crate::{Engine, Host};
use glue_interop::enginedb::{self, EList, NewTrack};
use glue_interop::rekordbox_out::{XmlNode, XmlTrack};
use rusqlite::{params, Connection, OpenFlags};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// What was last written (GLUE's lists and the library's file then), and what the settings window and the page show.
#[derive(Default)]
pub struct DriveState { done: Option<(u64, Option<(u128, u64)>)>, pub status: Value }

type R<T> = Result<T, String>;
fn e(x: rusqlite::Error) -> String { x.to_string() }
fn stamp(p: &Path) -> Option<(u128, u64)> {
  let m = std::fs::metadata(p).ok()?;
  Some((m.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_nanos(), m.len()))
}
/// A file's path as one key (either separator, and Windows' paths in any case).
fn key(p: &Path) -> String { let s = p.to_string_lossy().replace('\\', "/"); if cfg!(windows) { s.to_lowercase() } else { s } }
/// A song's path in a library (from its `Engine Library` folder, or whole) as the file's.
fn resolve(lib: &Path, path: &str) -> PathBuf {
  let b = path.as_bytes();
  if path.starts_with('/') || path.starts_with('\\') || (b.len() > 2 && b[1] == b':') { return PathBuf::from(path); }
  let mut out = lib.to_path_buf();
  for part in path.split(['/', '\\']).filter(|x| !x.is_empty() && *x != ".") { if part == ".." { out.pop(); } else { out.push(part); } }
  out
}
/// GLUE's lists as one text (to see whether they changed).
fn sig(nodes: &[XmlNode], tracks: &[XmlTrack]) -> u64 {
  fn walk(n: &[XmlNode], tracks: &[XmlTrack], out: &mut String) {
    for x in n { match x {
      XmlNode::Folder { name, children } => { out.push_str(&format!("F{name}\u{1}[")); walk(children, tracks, out); out.push(']'); }
      XmlNode::Playlist { name, tracks: ts } => { out.push_str(&format!("P{name}\u{1}")); for t in ts { if let Some(t) = tracks.get(*t as usize - 1) { out.push_str(&t.path); out.push('\u{2}'); } } }
    } }
  }
  let mut s = String::new();
  walk(nodes, tracks, &mut s);
  hash(&s)
}

/// Siblings' names made unique as Engine DJ needs them ("Name (2)").
fn unique_names(nodes: &[XmlNode]) -> Vec<String> {
  let mut seen: HashSet<String> = HashSet::new();
  nodes.iter().map(|n| {
    let base = match n { XmlNode::Folder { name, .. } | XmlNode::Playlist { name, .. } => if name.trim().is_empty() { "Untitled".to_string() } else { name.clone() } };
    let mut t = base.clone();
    let mut k = 2;
    while !seen.insert(t.clone()) { t = format!("{base} ({k})"); k += 1; }
    t
  }).collect()
}

/// A folder's songs as Engine DJ keeps them: each song of its lists once, `membershipReference` how many hold it.
fn folder_songs(kids: &[Vec<String>]) -> Vec<(String, i64)> {
  let mut out: Vec<(String, i64)> = vec![];
  let mut at: HashMap<String, usize> = HashMap::new();
  for k in kids { for s in k { match at.get(s) { Some(i) => out[*i].1 += 1, None => { at.insert(s.clone(), out.len()); out.push((s.clone(), 1)); } } } }
  out
}
fn folder_now(db: &Connection, list: i64, items: &[String]) -> R<Vec<(String, i64)>> {
  let refs: HashMap<String, i64> = db.prepare("SELECT databaseUuid || '/' || trackId, membershipReference FROM PlaylistEntity WHERE listId = ?1").map_err(e)?
    .query_map([list], |r| Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), r.get::<_, Option<i64>>(1)?.unwrap_or(0)))).map_err(e)?.collect::<Result<_, _>>().map_err(e)?;
  Ok(items.iter().map(|i| (i.clone(), refs.get(i).copied().unwrap_or(0))).collect())
}
fn set_folder(db: &Connection, list: i64, songs: &[(String, i64)]) -> R<()> {
  db.execute("DELETE FROM PlaylistEntity WHERE listId = ?1", [list]).map_err(e)?;
  let mut last: Option<i64> = None;
  for (s, n) in songs {
    let Some((u, t)) = s.split_once('/').and_then(|(u, t)| t.parse::<i64>().ok().map(|t| (u, t))) else { continue };
    db.execute("INSERT INTO PlaylistEntity (listId, trackId, databaseUuid, nextEntityId, membershipReference) VALUES (?1, ?2, ?3, 0, ?4)", params![list, t, u, n]).map_err(e)?;
    let id = db.last_insert_rowid();
    if let Some(p) = last { db.execute("UPDATE PlaylistEntity SET nextEntityId = ?1 WHERE id = ?2", params![id, p]).map_err(e)?; }
    last = Some(id);
  }
  db.execute("UPDATE Playlist SET lastEditTime = strftime('%Y-%m-%d %H:%M:%S', 'now') WHERE id = ?1", [list]).map_err(e)?;
  Ok(())
}

/// `want` made the lists under `parent` (by name; others there taken out, the order GLUE's). Each one's songs (a
/// folder's: its lists'), counting the changes in `n`.
fn apply(db: &Connection, lists: &[EList], parent: i64, want: &[XmlNode], item: &dyn Fn(u64) -> Option<String>, n: &mut usize, depth: usize) -> R<Vec<Vec<String>>> {
  if depth > 64 { return Ok(vec![]); }
  let names = unique_names(want);
  let here: Vec<&EList> = lists.iter().filter(|l| l.parent == parent).collect();
  for l in here.iter().filter(|l| !names.contains(&l.title)) { enginedb::delete_list(db, l.id)?; *n += 1; }
  let mut ids = vec![];
  let mut held: Vec<Vec<String>> = vec![];
  for (node, name) in want.iter().zip(&names) {
    let had = here.iter().find(|l| &l.title == name);
    let id = match had { Some(l) => l.id, None => { *n += 1; enginedb::create_list(db, name, parent)? } };
    let now: &[String] = had.map_or(&[], |l| &l.items);
    match node {
      XmlNode::Playlist { tracks, .. } => {
        let mut seen = HashSet::new();
        let items: Vec<String> = tracks.iter().filter_map(|t| item(*t)).filter(|i| seen.insert(i.clone())).collect();
        if items != now { enginedb::set_items(db, id, &items)?; *n += 1; }
        held.push(items);
      }
      XmlNode::Folder { children, .. } => held.push(folder(db, lists, id, now, children, item, n, depth + 1)?),
    }
    ids.push(id);
  }
  let kept: Vec<i64> = enginedb::order_of(lists, parent).into_iter().filter(|i| ids.contains(i)).collect();
  if kept != ids { enginedb::set_order(db, parent, &ids)?; *n += 1; }
  Ok(held)
}
/// A folder made as `want` says, and its own songs (its lists'). Its songs.
#[allow(clippy::too_many_arguments)]
fn folder(db: &Connection, lists: &[EList], id: i64, now: &[String], want: &[XmlNode], item: &dyn Fn(u64) -> Option<String>, n: &mut usize, depth: usize) -> R<Vec<String>> {
  let songs = folder_songs(&apply(db, lists, id, want, item, n, depth)?);
  if songs != folder_now(db, id, now)? { set_folder(db, id, &songs)?; *n += 1; }
  Ok(songs.into_iter().map(|x| x.0).collect())
}

impl<H: Host> Engine<H> {
  /// GLUE's library's folder; None: none wanted (or no Music folder; not on a Mac yet).
  pub fn dj_drive_dir(&self) -> Option<PathBuf> {
    match &self.host.config()["djDrive"] {
      Value::Bool(false) => None,
      Value::String(p) if !p.trim().is_empty() => Some(PathBuf::from(p.trim())),
      _ if cfg!(windows) => Some(PathBuf::from(self.host.known_folders().music?).join("GLUE").join("Engine DJ")),
      _ => None,
    }
  }

  fn drive_status(&self, st: Value) {
    let mut d = self.drive.lock().unwrap();
    let changed = d.status != st;
    d.status = st;
    drop(d);
    if changed { self.report_soon(); }
  }

  /// Writes GLUE's library when GLUE's lists or the library changed and Engine DJ is closed (the DJ timer).
  pub fn dj_drive(&self) {
    let Some(dir) = self.dj_drive_dir() else { self.drive_status(json!({ "path": null })); return };
    let mut st = json!({ "path": dir.to_string_lossy() });
    if let Err(x) = std::fs::create_dir_all(&dir) { st["error"] = json!(format!("{}: {x}", dir.display())); return self.drive_status(st); }
    match self.host.engine_drive(&dir) {
      Ok(l) => st["letter"] = json!(l),
      Err(x) => { st["error"] = json!(x); return self.drive_status(st); }
    }
    let db_path = dir.join("Engine Library").join("Database2").join("m.db");
    let glued = self.dj_glued();
    if glued.is_none() && !db_path.is_file() { st["lists"] = json!(0); st["songs"] = json!(0); st["left"] = json!(0); return self.drive_status(st); }
    let (nodes, tracks, counts) = glued.unwrap_or_else(|| (vec![], vec![], json!({ "lists": 0, "songs": 0, "left": 0 })));
    for k in ["lists", "songs", "left"] { st[k] = counts[k].clone(); }
    let h = sig(&nodes, &tracks);
    let (done, at) = { let d = self.drive.lock().unwrap(); (d.done, d.status.get("at").cloned()) };
    if let Some(at) = at { st["at"] = at; }
    if done == Some((h, stamp(&db_path))) { return self.drive_status(st); }
    if self.host.apps_running(&ENGINE_APPS) { st["waiting"] = json!(true); return self.drive_status(st); }
    match self.dj_drive_write(&db_path, &nodes, &tracks, !nodes.is_empty()) {
      Ok(n) => {
        self.drive.lock().unwrap().done = Some((h, stamp(&db_path)));
        if n > 0 {
          st["at"] = json!(self.host.now().1);
          self.event(&format!("GLUE’s playlists written for Engine DJ: {} playlist{}, {} song{} (Engine DJ shows them when it next starts)", st["lists"], if st["lists"] == 1 { "" } else { "s" }, st["songs"], if st["songs"] == 1 { "" } else { "s" }));
        }
      }
      Err(x) => { st["error"] = json!(x); }
    }
    self.drive_status(st);
  }

  /// The libraries Engine DJ has here (the Collection, each drive's), by id: where to look for a song first.
  fn engine_libraries(&self, own: &Path) -> Vec<(String, PathBuf)> {
    let mut at: Vec<PathBuf> = vec![];
    if let Some(c) = self.engine_collection() { at.push(c); }
    for d in self.host.drives() { at.push(d.join("Engine Library").join("Database2").join("m.db")); }
    let own = real_path(own);
    let mut seen = HashSet::new();
    let mut out = vec![];
    for p in at.into_iter().filter(|p| p.is_file() && real_path(p) != own) {
      let Ok(db) = Connection::open_with_flags(&p, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX) else { continue };
      if let Ok(u) = db.query_row("SELECT uuid FROM Information LIMIT 1", [], |r| r.get::<_, String>(0)) { if seen.insert(u.clone()) { out.push((u, p)); } }
    }
    out
  }

  /// GLUE's library made as `nodes` say under "GLUE" (`any`: GLUE keeps lists in Engine DJ; none: "GLUE" taken out).
  /// How many changes.
  fn dj_drive_write(&self, db_path: &Path, nodes: &[XmlNode], tracks: &[XmlTrack], any: bool) -> R<usize> {
    let others = self.engine_libraries(db_path);
    if !db_path.is_file() {
      let (_, like) = others.first().ok_or("Engine DJ’s library isn’t on this computer (open Engine DJ once first)")?;
      let like = Connection::open_with_flags(like, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(e)?;
      enginedb::create_like(&like, db_path)?;
    }
    let mut db = Connection::open(db_path).map_err(e)?;
    let own: String = db.query_row("SELECT uuid FROM Information LIMIT 1", [], |r| r.get(0)).map_err(e)?;
    // The songs Engine DJ has, by file: its other libraries' first (their analysis, no second copy), then GLUE's.
    let mut known: HashMap<String, String> = HashMap::new();
    let mut index = |uuid: &str, c: &Connection, lib: &Path| -> R<()> {
      let lib = real_path(lib);
      let mut q = c.prepare("SELECT id, path FROM Track WHERE path IS NOT NULL").map_err(e)?;
      for r in q.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))).map_err(e)? {
        let (id, p) = r.map_err(e)?;
        known.entry(key(&resolve(&lib, &p))).or_insert_with(|| format!("{uuid}/{id}"));
      }
      Ok(())
    };
    for (u, p) in &others {
      let Ok(c) = Connection::open_with_flags(p, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX) else { continue };
      let Some(lib) = p.parent().and_then(Path::parent) else { continue };
      index(u, &c, lib)?;
    }
    let own_lib = db_path.parent().and_then(Path::parent).ok_or("no folder")?.to_path_buf();
    index(&own, &db, &own_lib)?;
    // What's there now, and what's wanted, compared before anything is written (nothing to do: nothing backed up).
    let lists = enginedb::read_lists(&db, &own)?;
    let glue = lists.iter().find(|l| l.parent == 0 && l.title == GLUE_FOLDER).map(|l| l.id);
    if !any && glue.is_none() { return Ok(0); }
    let now = self.host.now().0;
    // Worked out in a transaction thrown away first: nothing to change, nothing backed up or written.
    let run = |tx: &Connection, known: &mut HashMap<String, String>| -> R<usize> {
      let mut n = 0;
      let mut ids: HashMap<u64, Option<String>> = HashMap::new();
      for t in tracks {
        let file = real_path(Path::new(&t.path));
        let k = key(&file);
        let x = match known.get(&k) {
          Some(x) => x.clone(),
          None => {
            let path = file.to_string_lossy().replace('\\', "/");
            let id = enginedb::add_track(tx, &NewTrack { path, title: t.name.clone(), artist: t.artist.clone(), album: t.album.clone(), genre: t.genre.clone(), comment: t.comment.clone(), label: t.label.clone(),
              year: t.year.parse().ok(), length: t.duration, size: t.size, created: None, bitrate: t.bitrate.map(|b| b.round() as i64) }, now)?;
            n += 1;
            let x = format!("{own}/{id}");
            known.insert(k, x.clone());
            x
          }
        };
        ids.insert(t.id, Some(x));
      }
      let item = |t: u64| ids.get(&t).cloned().flatten();
      match glue {
        Some(g) if !any => { enginedb::delete_list(tx, g)?; n += 1; }
        g => {
          let g = match g { Some(g) => g, None => { n += 1; enginedb::create_list(tx, GLUE_FOLDER, 0)? } };
          let had = lists.iter().find(|l| l.id == g).map(|l| l.items.clone()).unwrap_or_default();
          folder(tx, &lists, g, &had, nodes, &item, &mut n, 0)?;
        }
      }
      Ok(n)
    };
    let n = { let tx = db.transaction().map_err(e)?; let n = run(&tx, &mut known.clone())?; tx.rollback().map_err(e)?; n };
    if n == 0 { return Ok(0); }
    self.dj_backup(&own, db_path, &self.host.now().1)?;
    let tx = db.transaction().map_err(e)?;
    let n = run(&tx, &mut known)?;
    tx.commit().map_err(e)?;
    Ok(n)
  }
}
