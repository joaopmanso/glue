//! The main Engine DJ library's playlists kept in step both ways (ADR 0171; with its cues, `djsync.rs`). The playlists
//! in GLUE's folder of the library are its:
//! - GLUE's copies (`List.origin`) and Engine DJ's playlists merged three ways against what they last agreed on (GLUE
//!   Home's cache, `lists`): a name or a place, the side that changed it (both: GLUE's); the songs, the side that
//!   changed them (both: GLUE's order without what Engine DJ removed, with what it added);
//! - a new playlist (or folder) in GLUE's folder of the library made in Engine DJ, parents first;
//! - a song Engine DJ doesn't have added to its collection: the database of the drive the file is on (Engine DJ keeps
//!   one per drive), its path from that `Engine Library` folder;
//! - a playlist gone from one side (or moved out of the library's folder in GLUE) asked about (`questions`): deleted on
//!   the other side too, or kept (made again where it went). GLUE's side of an answer at once; Engine DJ's at the next
//!   sync, Engine DJ closed.
//!
//! Written into the database the library is read from (Engine DJ's settings' library; F: on the user's desktop).
use crate::{get, text, truthy, Engine, Host};
use glue_interop::enginedb::{self, EList, NewTrack};
use glue_interop::sync::{merge_items, pick};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

fn origin<'a>(l: &'a Value, k: &str) -> Option<&'a str> { l.get("origin").and_then(|o| o.get(k)).and_then(Value::as_str) }
fn parent_id(l: &Value) -> Option<&str> { l.get("parentId").and_then(Value::as_str).filter(|x| !x.is_empty()) }

/// What a sync of the playlists did.
#[derive(Default)]
pub struct ListsDone { pub written: usize, pub taken: usize, pub questions: usize }

impl<H: Host> Engine<H> {
  /// The playlists of the main library `src`, in `db` (its library database). `backed`: databases already copied this
  /// sync.
  #[allow(clippy::too_many_arguments)]
  pub(crate) fn dj_sync_lists(&self, p: &str, c: &str, src: &Value, db_path: &Path, dbs: &HashMap<String, PathBuf>, kept: &mut Value, at: &str, backed: &mut HashSet<String>, remap: &HashMap<String, String>) -> Result<ListsDone, String> {
    let sid = text(src, "id");
    let mut done = ListsDone::default();
    let s = self.store(p, c)?;
    // All of its playlists in GLUE's folder of it (the folder whole: its new ones come too), for a library kept in
    // step since before they were brought in with it (0.67).
    {
      let mut st = s.lock().unwrap();
      let whole = st.lists.values().any(|l| origin(l, "sourceId") == Some(&sid) && origin(l, "externalId") == Some("") && !truthy(l.get("origin").and_then(|o| o.get("chain"))));
      if !whole {
        let cur = st.sources.get(&sid).cloned().unwrap_or_else(|| src.clone());
        glue_interop::linked::import_lists(&mut st, &cur, &[String::new()]);
        self.flush_edit(&mut st, p, c)?;
      }
    }
    // GLUE's side: its lists, which are in the library's folder, its songs as the library's.
    let (lists, recs, tracks) = { let st = s.lock().unwrap(); (st.lists.clone(), src["tracks"].as_array().cloned().unwrap_or_default(), st.tracks.iter().map(|(k, v)| (k.clone(), v.clone())).collect::<HashMap<String, Value>>()) };
    // A GLUE song as Engine DJ's record: the one a gone record was pointed at (ADR 0172), not the gone one.
    let mut ext_of: HashMap<String, String> = HashMap::new();
    for t in &recs { let x = text(t, "externalId"); if !remap.contains_key(&x) || !ext_of.contains_key(&text(t, "trackId")) { ext_of.insert(text(t, "trackId"), remap.get(&x).cloned().unwrap_or(x)); } }
    let track_of: HashMap<String, String> = recs.iter().map(|t| (text(t, "externalId"), text(t, "trackId"))).collect();
    let Some(top) = lists.values().find(|l| origin(l, "sourceId") == Some(&sid) && origin(l, "externalId") == Some("")).cloned() else { return Ok(done) };
    let top_id = text(&top, "id");
    // Inside the library's folder: its own copies and anything under it.
    let inside = |l: &Value| -> bool {
      let mut cur = parent_id(l).map(String::from);
      let mut guard = 0;
      while let Some(id) = cur { if id == top_id { return true; } guard += 1; if guard > lists.len() { return false; } cur = lists.get(&id).and_then(parent_id).map(String::from); }
      false
    };
    let mut db = Connection::open(db_path).map_err(|e| format!("{}: {e}", db_path.display()))?;
    let own: String = db.query_row("SELECT uuid FROM Information LIMIT 1", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let app: HashMap<String, EList> = enginedb::read_lists(&db, &own)?.into_iter().map(|l| (l.id.to_string(), l)).collect();
    let mut questions: Vec<Value> = kept["questions"].as_array().cloned().unwrap_or_default();
    let decided = kept["decided"].as_object().cloned().unwrap_or_default();
    let mut glue_edits: Vec<Value> = vec![];
    let mut base = kept["lists"].as_object().cloned().unwrap_or_default();
    let mut songs = Songs { ext_of: &ext_of, tracks: &tracks, added: HashMap::new(), dbs, lib: db_path, cfg: self.host.config(), at, now: self.host.now().0 / 1000 };
    if backed.insert(own.clone()) { self.dj_backup(&own, db_path, at)?; }
    let tx = db.transaction().map_err(|e| e.to_string())?;

    // New in GLUE's folder of the library: made in Engine DJ, parents first.
    let mut made: HashMap<String, String> = HashMap::new();   // GLUE list → Engine DJ's id
    let mut fresh: Vec<&Value> = lists.values().filter(|l| l.get("origin").is_none_or(Value::is_null) && inside(l)).collect();
    let depth = |l: &Value| { let mut d = 0; let mut cur = parent_id(l).map(String::from); while let Some(id) = cur { d += 1; if d > lists.len() { break; } cur = lists.get(&id).and_then(parent_id).map(String::from); } d };
    fresh.sort_by_key(|l| depth(l));
    let ext_of_list = |id: &str, made: &HashMap<String, String>| -> Option<String> {
      if id == top_id { return Some("0".into()); }
      if let Some(x) = made.get(id) { return Some(x.clone()); }
      lists.get(id).filter(|l| origin(l, "sourceId") == Some(&sid)).and_then(|l| origin(l, "externalId")).map(String::from)
    };
    for l in fresh {
      let Some(parent) = parent_id(l).and_then(|pid| ext_of_list(pid, &made)) else { continue };
      let id = enginedb::create_list(&tx, &text(l, "name"), parent.parse().unwrap_or(0))?;
      let items: Vec<String> = l["items"].as_array().into_iter().flatten().filter_map(|x| x.as_str()).filter_map(|tid| songs.song(self, tid, &tx, backed)).collect();
      enginedb::set_items(&tx, id, &items)?;
      made.insert(text(l, "id"), id.to_string());
      let mut u = l.clone();
      u["origin"] = json!({ "sourceId": sid, "externalId": id.to_string() });
      glue_edits.push(u);
      base.insert(id.to_string(), json!({ "name": text(l, "name"), "parent": parent, "items": items }));
      done.written += 1;
    }

    // GLUE's copies and Engine DJ's playlists.
    let copies: Vec<&Value> = lists.values().filter(|l| origin(l, "sourceId") == Some(&sid) && origin(l, "externalId").is_some_and(|x| !x.is_empty())).collect();
    let mut seen: HashSet<String> = HashSet::new();
    for l in &copies {
      let ext = origin(l, "externalId").unwrap().to_string();
      seen.insert(ext.clone());
      let b = base.get(&ext).cloned();
      let Some(e) = app.get(&ext) else {
        // Gone from Engine DJ: asked (the answer may be in).
        match decided.get(&ext).and_then(Value::as_str) {
          Some("keep") => {
            // Made again in Engine DJ, from GLUE's copy.
            let parent = parent_id(l).and_then(|pid| ext_of_list(pid, &made)).unwrap_or_else(|| "0".into());
            let id = enginedb::create_list(&tx, &text(l, "name"), parent.parse().unwrap_or(0))?;
            let items: Vec<String> = l["items"].as_array().into_iter().flatten().filter_map(|x| x.as_str()).filter_map(|tid| songs.song(self, tid, &tx, backed)).collect();
            enginedb::set_items(&tx, id, &items)?;
            let mut u = (*l).clone();
            u["origin"] = json!({ "sourceId": sid, "externalId": id.to_string() });
            glue_edits.push(u);
            base.remove(&ext);
            base.insert(id.to_string(), json!({ "name": text(l, "name"), "parent": parent, "items": items }));
            questions.retain(|q| text(q, "ext") != ext);
            done.written += 1;
          }
          _ => if !questions.iter().any(|q| text(q, "ext") == ext) { questions.push(json!({ "ext": ext, "name": text(l, "name"), "deletedIn": "app", "list": text(l, "id") })); },
        }
        continue;
      };
      // Moved out of the library's folder in GLUE: as if deleted there.
      if !inside(l) {
        if !questions.iter().any(|q| text(q, "ext") == ext) { questions.push(json!({ "ext": ext, "name": text(l, "name"), "deletedIn": "glue", "list": text(l, "id") })); }
        continue;
      }
      let g_parent = parent_id(l).and_then(|pid| ext_of_list(pid, &made)).unwrap_or_else(|| "0".into());
      let g_items: Vec<String> = l["items"].as_array().into_iter().flatten().filter_map(|x| x.as_str()).filter_map(|tid| songs.song(self, tid, &tx, backed)).collect();
      let (b_name, b_parent, b_items) = (b.as_ref().map(|b| text(b, "name")), b.as_ref().map(|b| text(b, "parent")), b.as_ref().map(|b| b["items"].as_array().into_iter().flatten().filter_map(|x| x.as_str().map(String::from)).collect::<Vec<_>>()));
      let name = pick(&text(l, "name"), &e.title, b_name.as_ref());
      let parent = pick(&g_parent, &e.parent.to_string(), b_parent.as_ref());
      let items = merge_items(&g_items, &e.items, b_items.as_deref());
      // To Engine DJ.
      let id = e.id;
      if name != e.title { enginedb::rename_list(&tx, id, &name)?; done.written += 1; }
      if parent != e.parent.to_string() && (parent == "0" || app.contains_key(&parent) || made.values().any(|m| *m == parent)) { enginedb::move_list(&tx, id, parent.parse().unwrap_or(0))?; done.written += 1; }
      if items != e.items { enginedb::set_items(&tx, id, &items)?; done.written += 1; }
      // To GLUE: what it can name (a song Engine DJ has that GLUE hasn't read yet comes with the next read).
      let glue_items: Vec<Value> = items.iter().filter_map(|x| track_of.get(x).cloned().or_else(|| songs.added.iter().find(|(_, v)| *v == x).map(|(k, _)| k.clone()))).map(|t| json!(t)).collect();
      let glue_parent = if parent == "0" { Some(top_id.clone()) } else { lists.values().find(|x| origin(x, "sourceId") == Some(&sid) && origin(x, "externalId") == Some(&parent)).map(|x| text(x, "id")).or_else(|| made.iter().find(|(_, v)| **v == parent).map(|(k, _)| k.clone())) };
      let mut u = (*l).clone();
      let mut changed = false;
      if name != text(l, "name") { u["name"] = json!(name); changed = true; }
      if glue_items != l["items"].as_array().cloned().unwrap_or_default() { u["items"] = Value::Array(glue_items); changed = true; }
      if let Some(gp) = glue_parent.filter(|gp| Some(gp.as_str()) != parent_id(l)) { u["parentId"] = json!(gp); changed = true; }
      if changed { glue_edits.push(u); done.taken += 1; }
      base.insert(ext.clone(), json!({ "name": name, "parent": parent, "items": items }));
      questions.retain(|q| text(q, "ext") != ext);
    }
    // The order of playlists among their siblings (ADR 0172), merged as their songs are: the side that changed it;
    // both, GLUE's (with what each added).
    {
      let now_lists = enginedb::read_lists(&tx, &own)?;
      // GLUE's lists as they are now (with this sync's edits).
      let latest = |id: &str| -> Option<Value> { glue_edits.iter().rev().find(|u| text(u, "id") == id).cloned().or_else(|| lists.get(id).cloned()) };
      let ids: Vec<String> = lists.keys().cloned().chain(glue_edits.iter().map(|u| text(u, "id"))).collect::<indexmap::IndexSet<_>>().into_iter().collect();
      let view: Vec<Value> = ids.iter().filter_map(|id| latest(id)).collect();
      let ext_parent = |l: &Value| -> Option<String> {
        let pid = parent_id(l)?;
        if pid == top_id { return Some("0".into()); }
        view.iter().find(|x| text(x, "id") == pid).filter(|x| origin(x, "sourceId") == Some(&sid)).and_then(|x| origin(x, "externalId")).map(String::from)
      };
      let mut orders = kept["orders"].as_object().cloned().unwrap_or_default();
      let mut parents: Vec<String> = vec!["0".into()];
      for l in &now_lists { if now_lists.iter().any(|k| k.parent == l.id) { parents.push(l.id.to_string()); } }
      for par in parents {
        let l_order: Vec<String> = enginedb::order_of(&now_lists, par.parse().unwrap_or(0)).into_iter().map(|i| i.to_string()).collect();
        let mut kids: Vec<&Value> = view.iter().filter(|x| origin(x, "sourceId") == Some(&sid) && origin(x, "externalId").is_some_and(|e| !e.is_empty()) && ext_parent(x).as_deref() == Some(par.as_str())).collect();
        if kids.is_empty() { continue; }
        kids.sort_by(|a, b| a["position"].as_f64().unwrap_or(f64::MAX).partial_cmp(&b["position"].as_f64().unwrap_or(f64::MAX)).unwrap_or(std::cmp::Ordering::Equal));
        let g_order: Vec<String> = kids.iter().filter_map(|x| origin(x, "externalId").map(String::from)).filter(|e| l_order.contains(e)).collect();
        let b_order: Option<Vec<String>> = orders.get(&par).and_then(Value::as_array).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect());
        let mut merged: Vec<String> = merge_items(&g_order, &l_order, b_order.as_deref()).into_iter().filter(|e| l_order.contains(e)).collect();
        for e in &l_order { if !merged.contains(e) { merged.push(e.clone()); } }
        if merged != l_order { enginedb::set_order(&tx, par.parse().unwrap_or(0), &merged.iter().filter_map(|x| x.parse().ok()).collect::<Vec<i64>>())?; done.written += 1; }
        // GLUE: the same order (its own lists among them after).
        for (i, e) in merged.iter().enumerate() {
          if let Some(x) = kids.iter().find(|x| origin(x, "externalId") == Some(e.as_str())) {
            if x["position"].as_f64() != Some(i as f64) { let mut u = (*x).clone(); u["position"] = json!(i); glue_edits.push(u); }
          }
        }
        orders.insert(par, json!(merged));
      }
      kept["orders"] = Value::Object(orders);
    }
    // Agreed on before, gone from GLUE's folder now (deleted there): asked; the answer applied.
    for (ext, _) in base.clone() {
      if seen.contains(&ext) || made.values().any(|m| *m == ext) || base.get(&ext).is_none() { continue; }
      if !app.contains_key(&ext) { base.remove(&ext); questions.retain(|q| text(q, "ext") != ext); continue; }
      match decided.get(&ext).and_then(Value::as_str) {
        Some("delete") => { enginedb::delete_list(&tx, ext.parse().unwrap_or(0))?; base.remove(&ext); questions.retain(|q| text(q, "ext") != ext); done.written += 1; }
        _ => if !questions.iter().any(|q| text(q, "ext") == ext) { questions.push(json!({ "ext": ext, "name": app[&ext].title, "deletedIn": "glue" })); },
      }
    }
    // A moved-out copy answered "delete": gone from Engine DJ; GLUE's list stays the user's own.
    for q in questions.clone() {
      let ext = text(&q, "ext");
      if text(&q, "deletedIn") != "glue" || decided.get(&ext).and_then(Value::as_str) != Some("delete") || !app.contains_key(&ext) { continue; }
      if let Some(l) = copies.iter().find(|l| origin(l, "externalId") == Some(&ext)) { let mut u = (*l).clone(); u["origin"] = Value::Null; glue_edits.push(u); }
      enginedb::delete_list(&tx, ext.parse().unwrap_or(0))?;
      base.remove(&ext);
      questions.retain(|x| text(x, "ext") != ext);
      done.written += 1;
    }
    tx.commit().map_err(|e| e.to_string())?;
    // GLUE's lists: GLUE Home's own edit.
    if !glue_edits.is_empty() {
      let mut st = s.lock().unwrap();
      for l in glue_edits { st.put_list(l); }
      self.flush_edit(&mut st, p, c)?;
    }
    let answered: Vec<String> = decided.keys().filter(|k| !questions.iter().any(|q| text(q, "ext") == **k)).cloned().collect();
    if let Some(d) = kept["decided"].as_object_mut() { for k in answered { d.remove(&k); } }
    kept["lists"] = Value::Object(base);
    done.questions = questions.len();
    kept["questions"] = Value::Array(questions);
    Ok(done)
  }

  /// A playlist's question answered (`djListResolve`): `delete` it on the other side too, or keep it (made again where
  /// it went). GLUE's side now; Engine DJ's at the next sync.
  pub fn dj_list_resolve(&self, p: &str, c: &str, ext: &str, delete: bool) -> Result<Value, String> {
    let s = self.store(p, c)?;
    let src = { let st = s.lock().unwrap(); st.sources.values().find(|x| st.own_source(x) && truthy(get(x, "main")) && truthy(get(x, "sync"))).cloned().ok_or("No main DJ library kept in step")? };
    let sid = text(&src, "id");
    let rel = format!("dj/{p}/{c}/{sid}.json");
    let mut kept = glue_store::dir::read_json(&self.cache_dir(), &rel).ok().flatten().ok_or("Nothing to settle")?;
    let q = kept["questions"].as_array().into_iter().flatten().find(|q| text(q, "ext") == ext).cloned().ok_or("Nothing to settle")?;
    let gone_in_app = text(&q, "deletedIn") == "app";
    {
      let mut st = s.lock().unwrap();
      if gone_in_app && delete {
        // Deleted in Engine DJ, and in GLUE too.
        if let Some(id) = st.lists.values().find(|l| origin(l, "sourceId") == Some(&sid) && origin(l, "externalId") == Some(ext)).map(|l| text(l, "id")) { st.delete_list(&id); }
        if let Some(o) = kept["lists"].as_object_mut() { o.remove(ext); }
        if let Some(a) = kept["questions"].as_array_mut() { a.retain(|x| text(x, "ext") != ext); }
      } else if !gone_in_app && !delete {
        // Deleted (or moved out) in GLUE, kept: GLUE gets its copy back; one moved out stays the user's own.
        if let Some(mut l) = st.lists.values().find(|l| origin(l, "sourceId") == Some(&sid) && origin(l, "externalId") == Some(ext)).cloned() { l["origin"] = Value::Null; st.put_list(l); }
        let cur = st.sources.get(&sid).cloned().unwrap_or(src.clone());
        glue_interop::linked::import_lists(&mut st, &cur, &[ext.to_string()]);
        if let Some(a) = kept["questions"].as_array_mut() { a.retain(|x| text(x, "ext") != ext); }
      } else {
        // Engine DJ's side: at the next sync.
        if !kept["decided"].is_object() { kept["decided"] = json!({}); }
        kept["decided"][ext] = json!(if delete { "delete" } else { "keep" });
      }
      self.flush_edit(&mut st, p, c)?;
    }
    glue_store::dir::write_json(&self.cache_dir(), &rel, &kept)?;
    let r = self.dj_sync_collection(p, c, true)?;
    Ok(json!({ "written": r.written, "waiting": r.waiting }))
  }
  /// The playlists' questions (`djQuestions`).
  pub fn dj_questions(&self, p: &str, c: &str) -> Value {
    let Ok(s) = self.store(p, c) else { return json!([]) };
    let sid = { let st = s.lock().unwrap(); st.sources.values().find(|x| st.own_source(x) && truthy(get(x, "main")) && truthy(get(x, "sync"))).map(|x| text(x, "id")) };
    let Some(sid) = sid else { return json!([]) };
    glue_store::dir::read_json(&self.cache_dir(), &format!("dj/{p}/{c}/{sid}.json")).ok().flatten().map_or(json!([]), |k| k["questions"].clone())
  }
}

/// GLUE's songs as Engine DJ's: their record, or added to the collection of their drive's database.
struct Songs<'a> { ext_of: &'a HashMap<String, String>, tracks: &'a HashMap<String, Value>, added: HashMap<String, String>, dbs: &'a HashMap<String, PathBuf>, lib: &'a Path, cfg: Value, at: &'a str, now: i64 }
impl Songs<'_> {
  /// A GLUE song's record in Engine DJ ("uuid/id"); added where it's missing. None: it can't be (no file here, or no
  /// Engine DJ library on its drive).
  fn song<H: Host>(&mut self, eng: &Engine<H>, tid: &str, lib: &Connection, backed: &mut HashSet<String>) -> Option<String> {
    if let Some(x) = self.ext_of.get(tid).or_else(|| self.added.get(tid)) { return Some(x.clone()); }
    let t = self.tracks.get(tid)?;
    let root = self.cfg["folders"][text(t, "rootId")].as_str()?;
    if text(t, "relPath").is_empty() { return None; }
    let mut file = PathBuf::from(root);
    for part in text(t, "relPath").split('/') { file.push(part); }
    if !file.is_file() { return None; }
    // The database on the file's drive (of several there, the one whose Engine Library is nearest).
    let (uuid, dbp, rel) = self.dbs.iter().filter_map(|(u, d)| { let lib = d.parent()?.parent()?; enginedb::rel_path(lib, &file).map(|r| (u.clone(), d.clone(), r)) }).min_by_key(|x| x.2.matches("../").count())?;
    let other = if dbp == self.lib { None } else { Some(Connection::open(&dbp).ok()?) };
    let db = other.as_ref().unwrap_or(lib);
    let id = match enginedb::track_at(db, &rel).ok()? {
      Some(id) => id,
      None => {
        if backed.insert(uuid.clone()) { eng.dj_backup(&uuid, &dbp, self.at).ok()?; }
        let n = |k: &str| t.get(k).and_then(Value::as_f64);
        enginedb::add_track(db, &NewTrack { path: rel, title: text(t, "title"), artist: text(t, "artist"), album: text(t, "album"), genre: text(t, "genre"), comment: text(t, "comment"), label: text(t, "label"),
          year: text(t, "year").parse().ok(), length: n("duration"), size: n("size"), created: n("mtime").map(|m| m / 1000.0) }, self.now).ok()?
      }
    };
    let x = format!("{uuid}/{id}");
    self.added.insert(tid.to_string(), x.clone());
    Some(x)
  }
}

impl<H: Host> Engine<H> {
  /// Engine DJ's songs whose file is gone, pointed at the copy GLUE kept (ADR 0172): a duplicate GLUE Home cleaned up
  /// (ADR 0070) went into the copy that stays, in GLUE; in Engine DJ its record still names the file that went. The
  /// kept copy on the same drive: the record names it now (keeping its id, cues, playlists and history), unless Engine
  /// DJ has it already as another song, whose playlist entries it then takes (and the cues, where it has none); on
  /// another drive: that drive's song (added where needed) takes the playlist entries. How many.
  #[allow(clippy::too_many_arguments)]
  pub(crate) fn dj_relink(&self, p: &str, c: &str, src: &Value, lib_db: &Path, dbs: &HashMap<String, PathBuf>, at: &str, backed: &mut HashSet<String>) -> Result<(usize, HashMap<String, String>), String> {
    let s = self.store(p, c)?;
    let mut remap: HashMap<String, String> = HashMap::new();
    let (recs, tracks) = { let st = s.lock().unwrap(); (src["tracks"].as_array().cloned().unwrap_or_default(), st.tracks.iter().map(|(k, v)| (k.clone(), v.clone())).collect::<HashMap<String, Value>>()) };
    let cfg = self.host.config();
    let file_of = |tid: &str| -> Option<PathBuf> {
      let t = tracks.get(tid)?;
      let root = cfg["folders"][text(t, "rootId")].as_str()?;
      if text(t, "relPath").is_empty() { return None; }
      let mut f = PathBuf::from(root);
      for part in text(t, "relPath").split('/') { f.push(part); }
      f.is_file().then_some(f)
    };
    let lib = Connection::open(lib_db).map_err(|e| e.to_string())?;
    let own: String = lib.query_row("SELECT uuid FROM Information LIMIT 1", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let mut fixed = 0;
    let mut songs = Songs { ext_of: &HashMap::new(), tracks: &tracks, added: HashMap::new(), dbs, lib: lib_db, cfg: cfg.clone(), at, now: self.host.now().0 / 1000 };
    for (uuid, dbp) in dbs {
      let Some(folder) = dbp.parent().and_then(|d| d.parent()) else { continue };
      let same = dbp == lib_db;
      let other = if same { None } else { Some(Connection::open(dbp).map_err(|e| e.to_string())?) };
      let db = other.as_ref().unwrap_or(&lib);
      let paths: HashMap<i64, String> = db.prepare("SELECT id, path FROM Track").map_err(|e| e.to_string())?
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Option<String>>(1)?.unwrap_or_default()))).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
      for rec in &recs {
        let ext = text(rec, "externalId");
        let Some((u, id)) = ext.split_once('/') else { continue };
        let Ok(id) = id.parse::<i64>() else { continue };
        if u != uuid { continue; }
        let Some(path) = paths.get(&id).filter(|x| !x.is_empty()) else { continue };
        let mut was = folder.to_path_buf();
        for part in path.split('/') { was.push(part); }
        if was.exists() { continue; }
        let Some(kept) = file_of(&text(rec, "trackId")) else { continue };
        match enginedb::rel_path(folder, &kept) {
          Some(rel) => match enginedb::track_at(db, &rel)? {
            None => {
              if backed.insert(uuid.clone()) { self.dj_backup(uuid, dbp, at)?; }
              let name = kept.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
              let size = std::fs::metadata(&kept).map(|m| m.len() as i64).ok();
              db.execute("UPDATE Track SET path = ?1, filename = ?2, fileBytes = COALESCE(?3, fileBytes), isAvailable = 1 WHERE id = ?4", rusqlite::params![rel, name, size, id]).map_err(|e| e.to_string())?;
              fixed += 1;
            }
            Some(e) if e != id => {
              if backed.insert(uuid.clone()) { self.dj_backup(uuid, dbp, at)?; }
              // Its cues, where the song kept has none.
              let hot = |t: i64| -> Option<Vec<u8>> { db.query_row("SELECT quickCues FROM PerformanceData WHERE trackId = ?1", [t], |r| r.get::<_, Option<Vec<u8>>>(0)).ok().flatten() };
              let has = |q: Option<Vec<u8>>| q.as_deref().and_then(|b| glue_interop::perf::unq(Some(b))).is_some_and(|raw| glue_interop::perf::hot_slots(Some(&raw), 44100.0).iter().any(Option::is_some));
              if !has(hot(e)) && has(hot(id)) {
                db.execute("UPDATE PerformanceData SET quickCues = (SELECT quickCues FROM PerformanceData WHERE trackId = ?1), loops = (SELECT loops FROM PerformanceData WHERE trackId = ?1) WHERE trackId = ?2", rusqlite::params![id, e]).map_err(|e| e.to_string())?;
              }
              if backed.insert(own.clone()) { self.dj_backup(&own, lib_db, at)?; }
              if repoint(&lib, &own, uuid, id, uuid, e)? > 0 { fixed += 1; }
              remap.insert(ext.clone(), format!("{uuid}/{e}"));
            }
            _ => {}
          },
          None => {
            // On another drive: that drive's song takes the playlist entries.
            let Some(x) = songs.song(self, &text(rec, "trackId"), &lib, backed) else { continue };
            let Some((u2, e2)) = x.split_once('/').and_then(|(u, i)| i.parse::<i64>().ok().map(|i| (u.to_string(), i))) else { continue };
            if backed.insert(own.clone()) { self.dj_backup(&own, lib_db, at)?; }
            if repoint(&lib, &own, uuid, id, &u2, e2)? > 0 { fixed += 1; }
            remap.insert(ext.clone(), format!("{u2}/{e2}"));
          }
        }
      }
    }
    Ok((fixed, remap))
  }
}

/// The library's playlist entries of one song (`from_uuid/from`) given to another; an entry of a playlist that has the
/// other already goes (Engine DJ's trigger re-links the rest).
fn repoint(lib: &Connection, own: &str, from_uuid: &str, from: i64, to_uuid: &str, to: i64) -> Result<usize, String> {
  let entries: Vec<(i64, i64)> = lib.prepare("SELECT id, listId FROM PlaylistEntity WHERE trackId = ?1 AND (databaseUuid = ?2 OR (?2 = ?3 AND (databaseUuid IS NULL OR databaseUuid = '')))").map_err(|e| e.to_string())?
    .query_map(rusqlite::params![from, from_uuid, own], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
  let n = entries.len();
  for (id, list) in entries {
    let there: bool = lib.query_row("SELECT 1 FROM PlaylistEntity WHERE listId = ?1 AND trackId = ?2 AND databaseUuid = ?3", rusqlite::params![list, to, to_uuid], |_| Ok(())).is_ok();
    if there { lib.execute("DELETE FROM PlaylistEntity WHERE id = ?1", [id]).map_err(|e| e.to_string())?; }
    else { lib.execute("UPDATE PlaylistEntity SET trackId = ?1, databaseUuid = ?2 WHERE id = ?3", rusqlite::params![to, to_uuid, id]).map_err(|e| e.to_string())?; }
  }
  Ok(n)
}
