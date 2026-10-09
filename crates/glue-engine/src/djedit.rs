//! Engine DJ's own playlists edited in GLUE's DJ collection (ADR 0179; ADR 0178's next step): the main library kept in
//! step (`Source.sync`), through GLUE Home only (ADR 0168).
//! - An edit is an operation (`djEdit`): a playlist or folder made, renamed, moved or deleted; songs added, removed or
//!   moved inside a playlist. It's kept in GLUE Home's cache (`ops`, in order) and shown at once: put on the library's
//!   tree (`Source.tree`, each list it touched marked `wait`), and put on again after each read of the library until
//!   it's written.
//! - Written into the database the library is read from while Engine DJ is closed (the cues' sync, `djsync.rs`): a
//!   backup first, one transaction, each operation on its own savepoint (one whose playlist went in Engine DJ
//!   meanwhile is dropped, the rest written). A song Engine DJ doesn't have is added to its collection, as ADR 0171.
//!   The library's next read shows what Engine DJ has.
//! - A new playlist's id is GLUE Home's (`n:…`) until it's written; later operations name it by that id. Written, it's
//!   Engine DJ's in the tree at once, and GLUE Home remembers which it became (`made`): an edit naming the old id (a
//!   page that hadn't seen the change yet) goes to it.
use crate::djlists::Songs;
use crate::{get, text, truthy, Engine, Host};
use glue_interop::enginedb;
use glue_store::dir::{read_json, write_json, FsDir};
use glue_store::store::Store;
use rusqlite::Connection;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

const OPS: [&str; 7] = ["new", "rename", "move", "delete", "add", "remove", "shift"];

/// The list `ext` in the tree.
fn find(tree: &[Value], ext: &str) -> Option<usize> { tree.iter().position(|l| text(l, "externalId") == ext) }
/// An operation's parent as the tree has it (null: the top).
fn parent_of(op: &Value) -> Value { op["parent"].as_str().filter(|x| !x.is_empty()).map_or(Value::Null, |x| json!(x)) }
/// `ext` and everything under it.
fn under(tree: &[Value], ext: &str) -> HashSet<String> {
  let mut out: HashSet<String> = HashSet::from([ext.to_string()]);
  loop {
    let more: Vec<String> = tree.iter().filter(|l| l["parent"].as_str().is_some_and(|p| out.contains(p)) && !out.contains(&text(l, "externalId"))).map(|l| text(l, "externalId")).collect();
    if more.is_empty() { return out; }
    out.extend(more);
  }
}
/// Into the tree among `parent`'s lists: before the list `before`, else after its last one.
fn place(tree: &mut Vec<Value>, item: Value, before: Option<&str>) {
  let parent = item["parent"].clone();
  let at = before.and_then(|b| find(tree, b).filter(|&i| tree[i]["parent"] == parent))
    .or_else(|| tree.iter().rposition(|l| l["parent"] == parent).map(|i| i + 1))
    .unwrap_or(tree.len());
  tree.insert(at, item);
}
/// Songs put before the entry `before` (else at the end), each once.
fn insert(items: &mut Vec<Value>, add: Vec<String>, before: Option<&str>) {
  let add: Vec<String> = add.into_iter().filter(|x| !items.iter().any(|i| i == x.as_str())).collect();
  let at = before.and_then(|b| items.iter().position(|i| i == b)).unwrap_or(items.len());
  for (k, x) in add.into_iter().enumerate() { items.insert(at + k, json!(x)); }
}

/// An operation put on the library's tree, as it'll be once written. `ext_of`: a GLUE song's record ("uuid/id"); one
/// Engine DJ doesn't have yet is `glue:<song>` until it's added.
pub(crate) fn overlay(tree: &mut Vec<Value>, op: &Value, ext_of: &HashMap<String, String>) {
  let list = text(op, "list");
  let before = op["before"].as_str().filter(|x| !x.is_empty());
  let i = find(tree, &list);
  match text(op, "t").as_str() {
    "new" => {
      let kind = if text(op, "kind") == "folder" { "folder" } else { "playlist" };
      place(tree, json!({ "externalId": text(op, "tmp"), "kind": kind, "name": text(op, "name"), "parent": parent_of(op), "items": [], "wait": true }), before);
      // Something put in a folder makes it one.
      if let Some(p) = op["parent"].as_str().and_then(|p| find(tree, p)) { tree[p]["kind"] = json!("folder"); }
    }
    "rename" => if let Some(i) = i { tree[i]["name"] = json!(text(op, "name")); tree[i]["wait"] = json!(true); },
    "move" => if let Some(i) = i {
      let to = parent_of(op);
      // Not into itself.
      if to.as_str().is_some_and(|p| under(tree, &list).contains(p)) { return; }
      let mut l = tree.remove(i);
      l["parent"] = to; l["wait"] = json!(true);
      place(tree, l, before);
    },
    "delete" => { let gone = under(tree, &list); tree.retain(|l| !gone.contains(&text(l, "externalId"))); }
    "add" => if let Some(i) = i {
      let add: Vec<String> = op["songs"].as_array().into_iter().flatten().filter_map(Value::as_str).map(|t| ext_of.get(t).cloned().unwrap_or_else(|| format!("glue:{t}"))).collect();
      let mut items = tree[i]["items"].as_array().cloned().unwrap_or_default();
      insert(&mut items, add, before);
      tree[i]["items"] = Value::Array(items); tree[i]["wait"] = json!(true);
    },
    "remove" => if let Some(i) = i {
      let out: HashSet<&str> = op["items"].as_array().into_iter().flatten().filter_map(Value::as_str).collect();
      let items: Vec<Value> = tree[i]["items"].as_array().into_iter().flatten().filter(|x| !x.as_str().is_some_and(|x| out.contains(x))).cloned().collect();
      tree[i]["items"] = Value::Array(items); tree[i]["wait"] = json!(true);
    },
    "shift" => if let Some(i) = i {
      let moved: Vec<String> = op["items"].as_array().into_iter().flatten().filter_map(Value::as_str).map(String::from).collect();
      let mut items: Vec<Value> = tree[i]["items"].as_array().into_iter().flatten().filter(|x| !x.as_str().is_some_and(|x| moved.iter().any(|m| m == x))).cloned().collect();
      let had: HashSet<&str> = tree[i]["items"].as_array().into_iter().flatten().filter_map(Value::as_str).collect();
      insert(&mut items, moved.iter().filter(|m| had.contains(m.as_str())).cloned().collect(), before);
      tree[i]["items"] = Value::Array(items); tree[i]["wait"] = json!(true);
    },
    _ => {}
  }
}

/// A playlist's songs in Engine DJ, in order.
fn items_in(db: &Connection, own: &str, list: i64) -> Result<Vec<String>, String> {
  Ok(enginedb::read_lists(db, own)?.into_iter().find(|l| l.id == list).ok_or_else(|| format!("playlist {list} isn’t in Engine DJ any more"))?.items)
}
/// `id` put before `before` among its parent's playlists (else it stays last).
fn order_before(db: &Connection, own: &str, id: i64, parent: i64, before: Option<i64>) -> Result<(), String> {
  let Some(b) = before else { return Ok(()) };
  let lists = enginedb::read_lists(db, own)?;
  let mut order: Vec<i64> = enginedb::order_of(&lists, parent).into_iter().filter(|x| *x != id).collect();
  let Some(at) = order.iter().position(|x| *x == b) else { return Ok(()) };
  order.insert(at, id);
  enginedb::set_order(db, parent, &order)
}

impl<H: Host> Engine<H> {
  /// The main Engine DJ library kept in step, if `sid` is it (edits are written only into that one).
  fn dj_editable(&self, st: &Store<FsDir>, sid: &str) -> Option<Value> {
    st.sources.get(sid).filter(|x| st.own_source(x) && truthy(get(x, "main")) && truthy(get(x, "sync")) && text(x, "app") == "engine").cloned()
  }
  fn dj_ext_of(src: &Value) -> HashMap<String, String> {
    let mut m = HashMap::new();
    for t in src["tracks"].as_array().into_iter().flatten() { m.entry(text(t, "trackId")).or_insert_with(|| text(t, "externalId")); }
    m
  }

  /// `djEdit`: an edit of the library's playlists, kept until it's written and shown at once. Its new playlist's id, for
  /// "new".
  pub fn dj_edit(&self, p: &str, c: &str, sid: &str, op: &Value) -> Result<Value, String> {
    let t = text(op, "t");
    if !OPS.contains(&t.as_str()) { return Err(format!("not an edit GLUE Home knows: {t}")); }
    let s = self.store(p, c)?;
    let mut st = s.lock().unwrap();
    let src = self.dj_editable(&st, sid).ok_or("Engine DJ’s playlists are edited in GLUE once its main library is kept in step both ways, with GLUE Home")?;
    let rel = format!("dj/{p}/{c}/{sid}.json");
    let mut op = op.clone();
    {
      // (The sync reads and writes this file too: one at a time.)
      let _one = self.dj.lock().unwrap();
      let mut kept = read_json(&self.cache_dir(), &rel).ok().flatten().unwrap_or_else(|| json!({ "base": {}, "clashes": {} }));
      for k in ["list", "parent", "before"] { if let Some(id) = op[k].as_str().and_then(|x| kept["made"][x].as_i64()) { op[k] = json!(id.to_string()); } }
      let ops = kept["ops"].as_array().map_or(0, Vec::len);
      if t == "new" { op["tmp"] = json!(format!("n:{}-{ops}", self.host.now().0)); }
      if !kept["ops"].is_array() { kept["ops"] = json!([]); }
      kept["ops"].as_array_mut().unwrap().push(op.clone());
      write_json(&self.cache_dir(), &rel, &kept)?;
    }
    let mut tree = src["tree"].as_array().cloned().unwrap_or_default();
    overlay(&mut tree, &op, &Self::dj_ext_of(&src));
    let mut next = src.clone();
    next["tree"] = Value::Array(tree);
    st.put_source(next);
    self.flush_edit(&mut st, p, c)?;
    Ok(json!({ "ok": true, "id": op["tmp"] }))
  }

  /// The sync's state saved (`kept`): the edits made since it was read kept, the ones it wrote let go.
  pub(crate) fn dj_keep(&self, rel: &str, kept: &mut Value) -> Result<(), String> {
    let _one = self.dj.lock().unwrap();
    let done = kept.as_object_mut().and_then(|o| o.shift_remove("opsDone")).and_then(|x| x.as_u64()).unwrap_or(0) as usize;
    let now = read_json(&self.cache_dir(), rel).ok().flatten().and_then(|k| k["ops"].as_array().cloned()).unwrap_or_default();
    kept["ops"] = Value::Array(now.into_iter().skip(done).collect());
    write_json(&self.cache_dir(), rel, kept)
  }

  /// The edits not written yet, put on the library's tree again (after a read of it).
  pub(crate) fn dj_overlay_pending(&self, p: &str, c: &str, st: &mut Store<FsDir>, sid: &str) {
    let Some(kept) = read_json(&self.cache_dir(), &format!("dj/{p}/{c}/{sid}.json")).ok().flatten() else { return };
    let Some(ops) = kept["ops"].as_array().filter(|o| !o.is_empty()) else { return };
    let Some(src) = st.sources.get(sid).cloned() else { return };
    let ext_of = Self::dj_ext_of(&src);
    let mut tree = src["tree"].as_array().cloned().unwrap_or_default();
    for op in ops { overlay(&mut tree, op, &ext_of); }
    let mut next = src;
    next["tree"] = Value::Array(tree);
    st.put_source(next);
  }

  /// The edits written into the library's database `db` (Engine DJ closed; the caller checked). How many. The ones it
  /// went through (`opsDone`) leave the cache when the sync saves it (`dj_keep`), not ones made meanwhile.
  #[allow(clippy::too_many_arguments)]
  pub(crate) fn dj_write_ops(&self, p: &str, c: &str, src: &Value, db_path: &Path, dbs: &HashMap<String, PathBuf>, kept: &mut Value, at: &str, backed: &mut HashSet<String>) -> Result<usize, String> {
    let ops = kept["ops"].as_array().cloned().unwrap_or_default();
    if ops.is_empty() { return Ok(0); }
    let s = self.store(p, c)?;
    let tracks: HashMap<String, Value> = { let st = s.lock().unwrap(); st.tracks.iter().map(|(k, v)| (k.clone(), v.clone())).collect() };
    let ext_of = Self::dj_ext_of(src);
    let mut db = Connection::open(db_path).map_err(|e| format!("{}: {e}", db_path.display()))?;
    let own: String = db.query_row("SELECT uuid FROM Information LIMIT 1", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    if backed.insert(own.clone()) { self.dj_backup(&own, db_path, at)?; }
    let mut songs = Songs { ext_of: &ext_of, tracks: &tracks, added: HashMap::new(), dbs, lib: db_path, cfg: self.host.config(), at, now: self.host.now().0 / 1000 };
    let mut ids: HashMap<String, i64> = kept["made"].as_object().map(|m| m.iter().filter_map(|(k, v)| Some((k.clone(), v.as_i64()?))).collect()).unwrap_or_default();
    let mut done = 0;
    let mut tx = db.transaction().map_err(|e| e.to_string())?;
    for op in &ops {
      let sp = tx.savepoint().map_err(|e| e.to_string())?;
      match self.dj_write_op(&sp, &own, op, &mut ids, &mut songs, backed) {
        Ok(()) => { sp.commit().map_err(|e| e.to_string())?; done += 1; }
        // (Rolled back on its own: the others are written.)
        Err(x) => { eprintln!("GLUE Home: an edit of Engine DJ’s playlists wasn’t written: {x}"); self.event(&format!("Engine DJ: an edit of “{}” wasn’t written ({x})", text(op, "name"))); }
      }
    }
    tx.commit().map_err(|e| e.to_string())?;
    kept["opsDone"] = json!(ops.len());
    // The new ones by Engine DJ's id: remembered, and in the tree now.
    if !kept["made"].is_object() { kept["made"] = json!({}); }
    let fresh: HashMap<String, String> = ids.iter().filter(|(k, _)| k.starts_with("n:") && kept["made"].get(k.as_str()).is_none()).map(|(k, v)| (k.clone(), v.to_string())).collect();
    for (k, v) in &fresh { kept["made"][k] = json!(v.parse::<i64>().unwrap_or(0)); }
    if !fresh.is_empty() {
      let mut st = s.lock().unwrap();
      if let Some(mut next) = st.sources.get(&text(src, "id")).cloned() {
        for l in next["tree"].as_array_mut().into_iter().flatten() {
          for k in ["externalId", "parent"] { if let Some(v) = l[k].as_str().and_then(|x| fresh.get(x)) { l[k] = json!(v); } }
        }
        st.put_source(next);
        self.flush_edit(&mut st, p, c)?;
      }
    }
    Ok(done)
  }

  fn dj_write_op(&self, db: &Connection, own: &str, op: &Value, ids: &mut HashMap<String, i64>, songs: &mut Songs, backed: &mut HashSet<String>) -> Result<(), String> {
    let id_of = |x: &str, ids: &HashMap<String, i64>| -> Result<i64, String> {
      if x.is_empty() { return Ok(0); }
      ids.get(x).copied().or_else(|| x.parse().ok()).ok_or_else(|| format!("no playlist {x}"))
    };
    let list = text(op, "list");
    let before = op["before"].as_str().filter(|x| !x.is_empty());
    match text(op, "t").as_str() {
      "new" => {
        let parent = id_of(op["parent"].as_str().unwrap_or(""), ids)?;
        let id = enginedb::create_list(db, &text(op, "name"), parent)?;
        ids.insert(text(op, "tmp"), id);
        order_before(db, own, id, parent, before.map(|b| id_of(b, ids)).transpose()?)
      }
      "rename" => enginedb::rename_list(db, id_of(&list, ids)?, &text(op, "name")),
      "move" => {
        let (id, parent) = (id_of(&list, ids)?, id_of(op["parent"].as_str().unwrap_or(""), ids)?);
        // Not into itself or what's in it.
        let lists = enginedb::read_lists(db, own)?;
        let mut up = Some(parent);
        while let Some(x) = up.filter(|x| *x != 0) { if x == id { return Err("a folder can’t go into itself".into()); } up = lists.iter().find(|l| l.id == x).map(|l| l.parent); }
        let was = lists.iter().find(|l| l.id == id).ok_or("it isn’t in Engine DJ any more")?.parent;
        if was != parent { enginedb::move_list(db, id, parent)?; }
        order_before(db, own, id, parent, before.map(|b| id_of(b, ids)).transpose()?)
      }
      "delete" => {
        let id = id_of(&list, ids)?;
        if enginedb::read_lists(db, own)?.iter().all(|l| l.id != id) { return Ok(()); }
        enginedb::delete_list(db, id)
      }
      "add" => {
        let id = id_of(&list, ids)?;
        let mut items = items_in(db, own, id)?;
        let add: Vec<String> = op["songs"].as_array().into_iter().flatten().filter_map(Value::as_str).filter_map(|t| songs.song(self, t, db, backed)).collect();
        let at = before.and_then(|b| items.iter().position(|i| i == b)).unwrap_or(items.len());
        let add: Vec<String> = add.into_iter().filter(|x| !items.contains(x)).collect();
        for (k, x) in add.into_iter().enumerate() { items.insert(at + k, x); }
        enginedb::set_items(db, id, &items)
      }
      "remove" => {
        let id = id_of(&list, ids)?;
        let out: HashSet<&str> = op["items"].as_array().into_iter().flatten().filter_map(Value::as_str).collect();
        let items: Vec<String> = items_in(db, own, id)?.into_iter().filter(|x| !out.contains(x.as_str())).collect();
        enginedb::set_items(db, id, &items)
      }
      "shift" => {
        let id = id_of(&list, ids)?;
        let now = items_in(db, own, id)?;
        let moved: Vec<String> = op["items"].as_array().into_iter().flatten().filter_map(Value::as_str).filter(|x| now.iter().any(|n| n == x)).map(String::from).collect();
        let mut items: Vec<String> = now.into_iter().filter(|x| !moved.contains(x)).collect();
        let at = before.and_then(|b| items.iter().position(|i| i == b)).unwrap_or(items.len());
        for (k, x) in moved.into_iter().enumerate() { items.insert(at + k, x); }
        enginedb::set_items(db, id, &items)
      }
      t => Err(format!("not an edit GLUE Home knows: {t}")),
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  fn tree() -> Vec<Value> {
    vec![
      json!({ "externalId": "1", "kind": "folder", "name": "Sets", "parent": null, "items": [] }),
      json!({ "externalId": "2", "kind": "playlist", "name": "Friday", "parent": "1", "items": ["u/1", "u/2"] }),
      json!({ "externalId": "3", "kind": "playlist", "name": "Warm", "parent": null, "items": ["u/3"] }),
    ]
  }
  fn names(t: &[Value]) -> Vec<String> { t.iter().map(|l| format!("{}>{}", l["parent"].as_str().unwrap_or("-"), text(l, "name"))).collect() }

  #[test]
  fn edits_show_on_the_tree() {
    let ext: HashMap<String, String> = HashMap::from([("song1".into(), "u/1".into())]);
    let mut t = tree();
    overlay(&mut t, &json!({ "t": "new", "tmp": "n:1", "name": "Saturday", "parent": "1", "before": "2" }), &ext);
    assert_eq!(names(&t), ["->Sets", "1>Saturday", "1>Friday", "->Warm"]);
    assert_eq!(t[1]["wait"], true);
    overlay(&mut t, &json!({ "t": "move", "list": "3", "parent": "1" }), &ext);
    assert_eq!(names(&t), ["->Sets", "1>Saturday", "1>Friday", "1>Warm"]);
    overlay(&mut t, &json!({ "t": "move", "list": "1", "parent": "3" }), &ext);
    assert_eq!(t[0]["parent"], Value::Null, "not into what's in it");
    overlay(&mut t, &json!({ "t": "add", "list": "2", "songs": ["song1", "song9"], "before": "u/2" }), &ext);
    assert_eq!(t[2]["items"], json!(["u/1", "glue:song9", "u/2"]), "one it has once; one it hasn't by GLUE's id");
    overlay(&mut t, &json!({ "t": "shift", "list": "2", "items": ["u/2"], "before": "u/1" }), &ext);
    assert_eq!(t[2]["items"], json!(["u/2", "u/1", "glue:song9"]));
    overlay(&mut t, &json!({ "t": "remove", "list": "2", "items": ["u/1"] }), &ext);
    assert_eq!(t[2]["items"], json!(["u/2", "glue:song9"]));
    overlay(&mut t, &json!({ "t": "rename", "list": "2", "name": "Fri" }), &ext);
    assert_eq!(t[2]["name"], "Fri");
    overlay(&mut t, &json!({ "t": "delete", "list": "1" }), &ext);
    assert!(t.is_empty(), "a folder with what's in it");
  }
}
