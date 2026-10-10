//! Engine DJ's playlists written as Engine DJ writes them (ADR 0182). The user's databases (2026-10-10) show it:
//! - the computer's Collection (`…\Music\Engine Library`, C:) holds the tree Engine DJ shows;
//! - each drive's database (F: "Shared") holds a copy of the lists with that drive's songs (and the folders they're in),
//!   each with the **same id** as in the Collection; Engine DJ makes each change in both.
//!
//! So GLUE writes into the Collection's database first (a new list's id free in every database it sees: `make_room`),
//! then makes what changed there (the tree before and after: `dj_to_drives`) in each drive's database: a list deleted
//! there; a list with that drive's songs (or one already there) made or put as the Collection has it, the folders it's
//! in first; the order of their siblings as the Collection's (a list only the drive has keeps its place). Nothing else
//! in a drive's copy is touched. And, once (`treeFixed`), what GLUE 0.71–0.72.3 wrote into the drive's database alone is
//! put right: a list there with an id past every one the Collection has given (only GLUE's can be) goes; a list the
//! drive has under the Collection's id with another name or place takes the Collection's.
use crate::{Engine, Host};
use glue_interop::enginedb::{self, EList};
use glue_interop::sync::splice;
use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// A database's tree, by id.
pub(crate) type Tree = HashMap<i64, EList>;

fn uuid_of(db: &Connection) -> Result<String, String> { db.query_row("SELECT uuid FROM Information LIMIT 1", [], |r| r.get(0)).map_err(|e| e.to_string()) }
/// A database's tree (`None`: it can't be read).
pub(crate) fn tree_at(path: &Path) -> Option<Tree> {
  let db = Connection::open(path).ok()?;
  let own = uuid_of(&db).ok()?;
  Some(enginedb::read_lists(&db, &own).ok()?.into_iter().map(|l| (l.id, l)).collect())
}
fn depth(t: &Tree, id: i64) -> usize { let mut d = 0; let mut cur = t.get(&id).map_or(0, |l| l.parent); while cur != 0 && d <= t.len() { d += 1; cur = t.get(&cur).map_or(0, |l| l.parent); } d }
fn ancestors(t: &Tree, id: i64) -> Vec<i64> { let mut out = vec![]; let mut cur = t.get(&id).map_or(0, |l| l.parent); while cur != 0 && out.len() <= t.len() { out.push(cur); cur = t.get(&cur).map_or(0, |l| l.parent); } out.reverse(); out }
/// A list (or one under it) holds songs of the database `uuid`.
fn holds(t: &Tree, id: i64, uuid: &str) -> bool {
  let mut todo = vec![id];
  let mut seen = HashSet::new();
  while let Some(x) = todo.pop() {
    if !seen.insert(x) { continue; }
    if t.get(&x).is_some_and(|l| l.items.iter().any(|i| i.split_once('/').is_some_and(|(u, _)| u == uuid))) { return true; }
    todo.extend(t.values().filter(|l| l.parent == x).map(|l| l.id));
  }
  false
}
/// A list put into `db` with this id, title and parent, as Engine DJ's own rows are (the last of its siblings).
fn insert_with_id(db: &Connection, l: &EList) -> Result<(), String> {
  let has = |c: &str| db.prepare("PRAGMA table_info(Playlist)").and_then(|mut q| q.query_map([], |r| r.get::<_, String>(1))?.collect::<Result<Vec<_>, _>>()).is_ok_and(|v| v.iter().any(|x| x == c));
  let (mut cols, mut vals) = ("id, title, parentListId, nextListId".to_string(), "?1, ?2, ?3, 0".to_string());
  for (c, v) in [("isPersisted", "1"), ("lastEditTime", "strftime('%Y-%m-%d %H:%M:%S', 'now')"), ("isExplicitlyExported", "1")] { if has(c) { cols += &format!(", {c}"); vals += &format!(", {v}"); } }
  db.execute(&format!("INSERT INTO Playlist ({cols}) VALUES ({vals})"), rusqlite::params![l.id, l.title, l.parent]).map_err(|e| e.to_string())?;
  Ok(())
}

impl<H: Host> Engine<H> {
  /// The databases other than the Collection's that carry the tree (each drive's here).
  fn drive_dbs(tree_db: &Path, dbs: &HashMap<String, PathBuf>) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = dbs.values().filter(|p| *p != tree_db && p.is_file()).cloned().collect();
    v.sort(); v.dedup();
    v
  }

  /// A new list's id free in every database (the Collection's next one past each one's highest), before GLUE makes one.
  pub(crate) fn make_room(&self, tree_db: &Path, dbs: &HashMap<String, PathBuf>) -> Result<(), String> {
    let high = Self::drive_dbs(tree_db, dbs).iter().filter_map(|p| Connection::open(p).ok()?.query_row("SELECT MAX(id) FROM Playlist", [], |r| r.get::<_, Option<i64>>(0)).ok().flatten()).max().unwrap_or(0);
    let db = Connection::open(tree_db).map_err(|e| e.to_string())?;
    let seq: i64 = db.query_row("SELECT seq FROM sqlite_sequence WHERE name = 'Playlist'", [], |r| r.get(0)).optional().map_err(|e| e.to_string())?.unwrap_or(0);
    if high > seq { db.execute("UPDATE sqlite_sequence SET seq = ?1 WHERE name = 'Playlist'", [high]).map_err(|e| e.to_string())?; }
    Ok(())
  }

  /// What changed in the Collection's tree since `before`, made in each drive's database (as Engine DJ does). How many
  /// changes.
  pub(crate) fn dj_to_drives(&self, tree_db: &Path, dbs: &HashMap<String, PathBuf>, before: &Tree, at: &str, backed: &mut HashSet<String>) -> Result<usize, String> {
    let Some(after) = tree_at(tree_db) else { return Ok(0) };
    let same = |a: &EList, b: &EList| a.title == b.title && a.parent == b.parent && a.next == b.next && a.items == b.items;
    let removed: Vec<i64> = before.keys().filter(|k| !after.contains_key(k)).copied().collect();
    let mut changed: Vec<i64> = after.values().filter(|l| before.get(&l.id).is_none_or(|b| !same(b, l))).map(|l| l.id).collect();
    // Only what changed in the Collection goes (a list whose neighbour was added changed only its place in the order:
    // its songs, which a drive's copy can have otherwise, aren't touched).
    let was = |id: i64| before.get(&id);
    if removed.is_empty() && changed.is_empty() { return Ok(0); }
    changed.sort_by_key(|id| (depth(&after, *id), *id));
    let mut done = 0;
    for path in Self::drive_dbs(tree_db, dbs) {
      let mut db = Connection::open(&path).map_err(|e| format!("{}: {e}", path.display()))?;
      let own = uuid_of(&db)?;
      let mine: Tree = enginedb::read_lists(&db, &own)?.into_iter().map(|l| (l.id, l)).collect();
      // What this drive gets: what it has, and what holds its songs.
      let wanted: Vec<i64> = changed.iter().copied().filter(|id| mine.contains_key(id) || holds(&after, *id, &own)).collect();
      let gone: Vec<i64> = removed.iter().copied().filter(|id| mine.contains_key(id)).collect();
      if wanted.is_empty() && gone.is_empty() { continue; }
      if backed.insert(own.clone()) { self.dj_backup(&own, &path, at)?; }
      let tx = db.transaction().map_err(|e| e.to_string())?;
      let mut have: HashSet<i64> = mine.keys().copied().collect();
      for id in &gone { if have.contains(id) { enginedb::delete_list(&tx, *id)?; have.remove(id); done += 1; } }
      let mut parents: HashSet<i64> = HashSet::new();
      for id in &wanted {
        // The folders it's in first.
        for a in ancestors(&after, *id) {
          if have.contains(&a) { continue; }
          let Some(l) = after.get(&a) else { continue };
          insert_with_id(&tx, l)?; have.insert(a); parents.insert(l.parent); done += 1;
          if !l.items.is_empty() { enginedb::set_items(&tx, a, &l.items)?; }
        }
        let l = &after[id];
        let new = !have.contains(id);
        if new { insert_with_id(&tx, l)?; have.insert(*id); done += 1; }
        let Some(cur) = enginedb::read_list(&tx, &own, *id)? else { continue };
        let b = was(*id);
        if cur.parent != l.parent && (new || b.is_none_or(|b| b.parent != l.parent)) { enginedb::move_list(&tx, *id, l.parent)?; parents.insert(cur.parent); done += 1; }
        if cur.title != l.title && (new || b.is_none_or(|b| b.title != l.title)) { enginedb::rename_list(&tx, *id, &l.title)?; done += 1; }
        if cur.items != l.items && (new || b.is_none_or(|b| b.items != l.items)) { enginedb::set_items(&tx, *id, &l.items)?; done += 1; }
        parents.insert(l.parent);
      }
      // The order of their siblings, as the Collection's (one only the drive has keeps its place).
      let now: Vec<EList> = enginedb::read_lists(&tx, &own)?;
      for p in parents {
        let mine_order: Vec<String> = enginedb::order_of(&now, p).into_iter().map(|x| x.to_string()).collect();
        let theirs: Vec<String> = enginedb::order_of(&after.values().cloned().collect::<Vec<_>>(), p).into_iter().filter(|x| have.contains(x)).map(|x| x.to_string()).collect();
        let merged = splice(&mine_order, |x| x.parse::<i64>().is_ok_and(|i| after.contains_key(&i)), &theirs);
        if merged != mine_order { enginedb::set_order(&tx, p, &merged.iter().filter_map(|x| x.parse().ok()).collect::<Vec<i64>>())?; done += 1; }
      }
      tx.commit().map_err(|e| e.to_string())?;
    }
    Ok(done)
  }

  /// Once (`treeFixed`): what GLUE 0.71–0.72.3 wrote into a drive's database alone, put right (see the top). GLUE's
  /// memory of the old tree (its GLUE folder, its new lists' ids, the edits waiting) let go: it's the Collection's now.
  pub(crate) fn dj_tree_repair(&self, tree_db: &Path, dbs: &HashMap<String, PathBuf>, kept: &mut Value, at: &str, backed: &mut HashSet<String>) -> Result<usize, String> {
    if kept.get("treeFixed").and_then(Value::as_bool) == Some(true) { return Ok(0); }
    let Some(coll) = tree_at(tree_db) else { return Ok(0) };
    let top = coll.keys().copied().max().unwrap_or(0);
    let mut fixed = 0;
    for path in Self::drive_dbs(tree_db, dbs) {
      let mut db = Connection::open(&path).map_err(|e| format!("{}: {e}", path.display()))?;
      let own = uuid_of(&db)?;
      let mine: Tree = enginedb::read_lists(&db, &own)?.into_iter().map(|l| (l.id, l)).collect();
      let extra: Vec<i64> = { let mut v: Vec<i64> = mine.keys().copied().filter(|id| *id > top && !coll.contains_key(id)).collect(); v.sort_by_key(|id| std::cmp::Reverse(depth(&mine, *id))); v };
      let clash: Vec<i64> = mine.values().filter(|l| coll.get(&l.id).is_some_and(|c| c.title != l.title || c.parent != l.parent)).map(|l| l.id).collect();
      if extra.is_empty() && clash.is_empty() { continue; }
      if backed.insert(own.clone()) { self.dj_backup(&own, &path, at)?; }
      let tx = db.transaction().map_err(|e| e.to_string())?;
      for id in &extra { if tx.query_row("SELECT 1 FROM Playlist WHERE id = ?1", [id], |_| Ok(())).optional().map_err(|e| e.to_string())?.is_some() { enginedb::delete_list(&tx, *id)?; fixed += 1; } }
      for id in &clash {
        let c = &coll[id];
        let Some(cur) = enginedb::read_list(&tx, &own, *id)? else { continue };
        if cur.parent != c.parent { enginedb::move_list(&tx, *id, c.parent)?; }
        if cur.title != c.title { enginedb::rename_list(&tx, *id, &c.title)?; }
        enginedb::set_items(&tx, *id, &c.items)?;
        fixed += 1;
      }
      tx.commit().map_err(|e| e.to_string())?;
      self.event(&format!("Engine DJ: {} put right as its Collection has it ({} of GLUE’s taken out, {} back to the Collection’s), a backup first", path.display(), extra.len(), clash.len()));
    }
    for k in ["mirror", "mirrorBase", "mirrorOrders", "glueFolder", "made", "ops", "decided", "unsent"] { kept.as_object_mut().map(|o| o.shift_remove(k)); }
    kept["questions"] = json!([]);
    kept["treeFixed"] = json!(true);
    Ok(fixed)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  fn l(id: i64, title: &str, parent: i64, items: &[&str]) -> EList { EList { id, title: title.into(), parent, items: items.iter().map(|s| s.to_string()).collect(), next: 0 } }
  #[test]
  fn what_a_list_holds_and_where_it_is() {
    let t: Tree = [l(1, "Sets", 0, &[]), l(2, "Fri", 1, &["f/1"]), l(3, "Other", 0, &["c/1"])].into_iter().map(|x| (x.id, x)).collect();
    assert!(holds(&t, 1, "f") && holds(&t, 2, "f") && !holds(&t, 3, "f"));
    assert_eq!(ancestors(&t, 2), vec![1]);
    assert_eq!((depth(&t, 2), depth(&t, 1)), (1, 0));
  }
}
