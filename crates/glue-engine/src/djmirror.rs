//! GLUE's own playlists kept in Engine DJ's "GLUE" folder, both ways (ADR 0180; ADR 0178's last Engine DJ step). The
//! main Engine DJ library kept in step (`Source.sync`), while Engine DJ is closed (the cues' sync, `djsync.rs`).
//! - **Which:** GLUE's own playlists and folders (no `origin`) with `apps` naming "engine", and everything in a folder
//!   that has it. The folders they're in come too, as folders (their own songs aren't sent).
//! - **Where:** the folder "GLUE" at the top of Engine DJ's tree (made when there's something to put in it), GLUE's
//!   folders down to each one under it. Which Engine DJ playlist each GLUE list is, is GLUE Home's (`mirror` in its
//!   cache), not `List.origin` (that's an import).
//! - **Both ways**, three ways against what they last agreed on (`mirrorBase`, by Engine DJ's id), as ADR 0171–0173:
//!   a name or a place, the side that changed it (both: GLUE's); the songs, the side that changed them (both: GLUE's
//!   order, without what Engine DJ removed, with what it added), the ones GLUE can't name left where they are; the
//!   order among siblings, the same way. A song Engine DJ doesn't have is added to its collection.
//! - **Made in Engine DJ** inside the GLUE folder: made in GLUE (one at its top kept in Engine DJ).
//! - **Gone from one side** (deleted, or moved out of the GLUE folder in Engine DJ): asked (`questions`), as ADR 0171.
//! - **Turned off in GLUE** (or moved where it isn't kept): taken out of the GLUE folder; GLUE's stays.
use crate::djlists::Songs;
use crate::{text, Engine, Host};
use glue_interop::enginedb::{self, EList};
use glue_interop::sync::{merge_items, pick, splice};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// The folder in Engine DJ's tree GLUE's playlists go in.
pub const GLUE_FOLDER: &str = "GLUE";

/// What a sync of the playlists did.
#[derive(Default)]
pub struct MirrorDone { pub written: usize, pub taken: usize, pub questions: usize }

fn parent_id(l: &Value) -> Option<&str> { l.get("parentId").and_then(Value::as_str).filter(|x| !x.is_empty()) }
fn own(l: &Value) -> bool { l.get("origin").is_none_or(Value::is_null) }
fn kept_in(l: &Value, app: &str) -> bool { l.get("apps").and_then(Value::as_array).is_some_and(|a| a.iter().any(|x| x == app)) }
fn items_of(l: &Value) -> Vec<String> { l["items"].as_array().into_iter().flatten().filter_map(|x| x.as_str().map(String::from)).collect() }

/// GLUE's lists kept in an app's GLUE folder: `scope` (theirs or a folder's they're in), and `all` with the folders
/// they're in.
pub fn kept_lists(lists: &indexmap::IndexMap<String, Value>, app: &str) -> (HashSet<String>, HashSet<String>) {
  let mut scope = HashSet::new();
  for (id, l) in lists {
    if !own(l) { continue; }
    let mut cur = Some(l);
    let mut guard = 0;
    while let Some(x) = cur {
      if !own(x) { break; }
      if kept_in(x, app) { scope.insert(id.clone()); break; }
      guard += 1;
      if guard > lists.len() { break; }
      cur = parent_id(x).and_then(|p| lists.get(p));
    }
  }
  let mut all = scope.clone();
  for id in &scope {
    let mut cur = lists.get(id).and_then(parent_id).map(String::from);
    let mut guard = 0;
    while let Some(p) = cur { if !lists.get(&p).is_some_and(own) || !all.insert(p.clone()) { break; } guard += 1; if guard > lists.len() { break; } cur = lists.get(&p).and_then(parent_id).map(String::from); }
  }
  (scope, all)
}

/// GLUE's list as merged, with the songs that couldn't go to Engine DJ (`missed`) kept where they were: each after the
/// song before it in GLUE's list that's still there (else first).
fn keep_unsent(original: &[String], merged: Vec<String>, missed: &HashMap<String, String>) -> Vec<String> {
  let mut out = merged;
  for (i, t) in original.iter().enumerate() {
    if !missed.contains_key(t) || out.contains(t) { continue; }
    let at = original[..i].iter().rev().find_map(|p| out.iter().position(|x| x == p)).map_or(0, |k| k + 1);
    out.insert(at, t.clone());
  }
  out
}

/// A name without the " (2)" Engine DJ adds to one already there among its siblings (as often as it was added).
fn base_name(name: &str) -> &str {
  let mut n = name.trim_end();
  while let Some(open) = n.rfind(" (") {
    let num = &n[open + 2..];
    if num.len() > 1 && num.ends_with(')') && num[..num.len() - 1].chars().all(|c| c.is_ascii_digit()) { n = n[..open].trim_end(); } else { break; }
  }
  n
}

impl<H: Host> Engine<H> {
  /// 0.72's copies put right, once (2026-10-09): two syncs ran at once, each made GLUE's playlist in Engine DJ's GLUE
  /// folder and brought the other's back into GLUE as new, again and again. Engine DJ's GLUE folder (all GLUE's making)
  /// is emptied, after a backup of its library; in GLUE, the lists kept in Engine DJ with the same name (but for the
  /// " (2)"s) in the same place are one: the oldest stays (the user's), the others go into the bin, after a backup of
  /// the profile. The next sync makes GLUE's again in the GLUE folder, once.
  pub(crate) fn dj_mirror_repair(&self, p: &str, c: &str, db_path: &Path, kept: &mut Value, at: &str, backed: &mut HashSet<String>) -> Result<(), String> {
    if kept.get("mirrorFixed").and_then(Value::as_bool) == Some(true) { return Ok(()); }
    let mut db = Connection::open(db_path).map_err(|e| format!("{}: {e}", db_path.display()))?;
    let own_uuid: String = db.query_row("SELECT uuid FROM Information LIMIT 1", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let app = enginedb::read_lists(&db, &own_uuid)?;
    // Only where 0.72's sync ran (it kept its folder's id). Its folder, and the others two syncs at once made beside it
    // ("GLUE (2)"…) whose every playlist is named as one of GLUE's kept in Engine DJ: never a playlist of the user's.
    let s = self.store(p, c)?;
    let names: HashSet<String> = { let st = s.lock().unwrap(); let (_, all) = kept_lists(&st.lists, "engine"); all.iter().map(|id| base_name(&text(&st.lists[id], "name")).to_lowercase()).collect() };
    let gf = kept["glueFolder"].as_i64().filter(|id| app.iter().any(|l| l.id == *id && l.parent == 0));
    let inside = |top: i64| { let mut u: HashSet<i64> = HashSet::new(); let mut more = true; while more { more = false; for l in &app { if (l.parent == top || u.contains(&l.parent)) && u.insert(l.id) { more = true; } } } u };
    let made: Vec<i64> = app.iter().filter(|l| l.parent == 0 && base_name(&l.title) == GLUE_FOLDER && (Some(l.id) == gf || (l.title != GLUE_FOLDER && app.iter().filter(|k| inside(l.id).contains(&k.id)).all(|k| names.contains(&base_name(&k.title).to_lowercase()))))).map(|l| l.id).collect();
    if gf.is_some() && made.iter().any(|g| app.iter().any(|l| l.parent == *g) || Some(*g) != gf) {
      if backed.insert(own_uuid.clone()) { self.dj_backup(&own_uuid, db_path, at)?; }
      let tx = db.transaction().map_err(|e| e.to_string())?;
      for g in &made { enginedb::delete_list(&tx, *g)?; }
      tx.commit().map_err(|e| e.to_string())?;
      // GLUE's copies.
      let mut st = s.lock().unwrap();
      let (scope, _) = kept_lists(&st.lists, "engine");
      let mut groups: HashMap<(String, String), Vec<Value>> = HashMap::new();
      for id in &scope { let l = &st.lists[id]; groups.entry((parent_id(l).unwrap_or("").to_string(), base_name(&text(l, "name")).to_lowercase())).or_default().push(l.clone()); }
      let mut extra: Vec<String> = vec![];
      for (_, mut ls) in groups { if ls.len() < 2 { continue; } ls.sort_by_key(|l| (text(l, "createdAt"), text(l, "id"))); extra.extend(ls.iter().skip(1).map(|l| text(l, "id"))); }
      if !extra.is_empty() {
        let profile = glue_store::dir::read_json(&self.dir(), &format!("profiles/{p}/profile.json")).ok().flatten().ok_or("no profile")?;
        let zip = glue_store::backup::build_backup(&self.dir(), &profile, false, at)?;
        glue_store::dir::Dir::write_bytes(&self.dir(), &format!("backups/pre-engine-glue-folder-{}-{p}-{c}.zip", &at[..10]), &zip)?;
        for id in &extra { if st.lists.contains_key(id) { st.delete_list(id); } }
        self.flush_edit(&mut st, p, c)?;
      }
      drop(st);
      let n = extra.len();
      self.event(&format!("Engine DJ’s GLUE folder put right: made again from GLUE’s playlists{}", if n > 0 { format!("; {n} copie{} in GLUE into Recently deleted", if n == 1 { "" } else { "s" }) } else { String::new() }));
      for k in ["mirror", "mirrorBase", "mirrorOrders", "glueFolder", "decided"] { kept.as_object_mut().map(|o| o.shift_remove(k)); }
      kept["questions"] = json!([]);
    }
    kept["mirrorFixed"] = json!(true);
    Ok(())
  }

  /// GLUE's playlists kept in the main library's GLUE folder, in `db_path` (its library database), Engine DJ closed.
  #[allow(clippy::too_many_arguments)]
  pub(crate) fn dj_sync_mirror(&self, p: &str, c: &str, src: &Value, db_path: &Path, dbs: &HashMap<String, PathBuf>, kept: &mut Value, at: &str, backed: &mut HashSet<String>, remap: &HashMap<String, String>) -> Result<MirrorDone, String> {
    let mut done = MirrorDone::default();
    let s = self.store(p, c)?;
    let (lists, recs, tracks) = { let st = s.lock().unwrap(); (st.lists.clone(), src["tracks"].as_array().cloned().unwrap_or_default(), st.tracks.iter().map(|(k, v)| (k.clone(), v.clone())).collect::<HashMap<String, Value>>()) };
    let (scope, all) = kept_lists(&lists, "engine");
    let mut map: HashMap<String, i64> = kept["mirror"].as_object().map(|m| m.iter().filter_map(|(k, v)| Some((k.clone(), v.as_i64()?))).collect()).unwrap_or_default();
    if scope.is_empty() && map.is_empty() { return Ok(done); }
    // A GLUE song as Engine DJ's record: the one a gone record was pointed at (ADR 0172), not the gone one.
    let mut ext_of: HashMap<String, String> = HashMap::new();
    for t in &recs { let x = text(t, "externalId"); if !remap.contains_key(&x) || !ext_of.contains_key(&text(t, "trackId")) { ext_of.insert(text(t, "trackId"), remap.get(&x).cloned().unwrap_or(x)); } }
    let track_of: HashMap<String, String> = recs.iter().map(|t| (text(t, "externalId"), text(t, "trackId"))).collect();

    let mut db = Connection::open(db_path).map_err(|e| format!("{}: {e}", db_path.display()))?;
    let own_uuid: String = db.query_row("SELECT uuid FROM Information LIMIT 1", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let app: HashMap<i64, EList> = enginedb::read_lists(&db, &own_uuid)?.into_iter().map(|l| (l.id, l)).collect();
    let mut gf = kept["glueFolder"].as_i64().filter(|id| app.get(id).is_some_and(|l| l.parent == 0))
      .or_else(|| app.values().find(|l| l.parent == 0 && l.title == GLUE_FOLDER).map(|l| l.id));
    if gf.is_none() && scope.is_empty() && map.is_empty() { return Ok(done); }
    if backed.insert(own_uuid.clone()) { self.dj_backup(&own_uuid, db_path, at)?; }
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let gf = match gf.take() { Some(g) => g, None => { done.written += 1; enginedb::create_list(&tx, GLUE_FOLDER, 0)? } };
    kept["glueFolder"] = json!(gf);
    // Engine DJ's lists inside the GLUE folder.
    let under: HashSet<i64> = {
      let mut u: HashSet<i64> = HashSet::new();
      let mut more = true;
      while more { more = false; for l in app.values() { if (l.parent == gf || u.contains(&l.parent)) && u.insert(l.id) { more = true; } } }
      u
    };
    let mut base = kept["mirrorBase"].as_object().cloned().unwrap_or_default();
    let mut questions: Vec<Value> = kept["questions"].as_array().cloned().unwrap_or_default();
    let decided = kept["decided"].as_object().cloned().unwrap_or_default();
    let mut songs = Songs::new(&ext_of, &tracks, dbs, db_path, self.host.config(), at, self.host.now().0 / 1000);
    let mut glue_edits: Vec<Value> = vec![];
    let mut glue_new: Vec<Value> = vec![];
    let depth = |id: &str| { let mut d = 0; let mut cur = lists.get(id).and_then(parent_id).map(String::from); while let Some(x) = cur { d += 1; if d > lists.len() { break; } cur = lists.get(&x).and_then(parent_id).map(String::from); } d };
    // A GLUE list's parent in Engine DJ: its folder's, or the GLUE folder.
    let parent_in_app = |l: &Value, map: &HashMap<String, i64>| -> i64 { parent_id(l).filter(|p| all.contains(*p)).and_then(|p| map.get(p).copied()).unwrap_or(gf) };
    let sent_items = |l: &Value, songs: &mut Songs, tx: &Connection, backed: &mut HashSet<String>| -> Vec<String> {
      if !scope.contains(&text(l, "id")) { return vec![]; }
      items_of(l).iter().filter_map(|tid| songs.song(self, tid, tx, backed)).collect()
    };
    let ask = |questions: &mut Vec<Value>, ext: i64, name: &str, where_: &str, list: &str| {
      if !questions.iter().any(|q| text(q, "ext") == ext.to_string()) { questions.push(json!({ "ext": ext.to_string(), "name": name, "deletedIn": where_, "list": list })); }
    };

    // 1. New in GLUE: made in Engine DJ, parents first.
    let mut fresh: Vec<&String> = all.iter().filter(|id| !map.contains_key(*id)).collect();
    fresh.sort_by_key(|id| (depth(id.as_str()), lists[id.as_str()]["position"].as_f64().unwrap_or(0.0) as i64));
    let made_now: HashSet<String> = fresh.iter().map(|x| (*x).clone()).collect();
    for id in fresh {
      let l = &lists[id];
      let parent = parent_in_app(l, &map);
      let eid = enginedb::create_list(&tx, &text(l, "name"), parent)?;
      let items = sent_items(l, &mut songs, &tx, backed);
      if !items.is_empty() { enginedb::set_items(&tx, eid, &items)?; }
      map.insert(id.clone(), eid);
      base.insert(eid.to_string(), json!({ "name": text(l, "name"), "parent": parent.to_string(), "items": items }));
      done.written += 1;
    }
    let glue_of = |eid: i64, map: &HashMap<String, i64>| map.iter().find(|(_, v)| **v == eid).map(|(k, _)| k.clone());

    // 2. On both sides: merged.
    for (id, &eid) in map.clone().iter() {
      let Some(l) = lists.get(id) else { continue };
      if !all.contains(id) || made_now.contains(id) { continue; }
      let Some(e) = app.get(&eid).filter(|_| under.contains(&eid)) else {
        // Not new this sync, gone from Engine DJ's GLUE folder: asked (the answer may be in).
        if base.contains_key(&eid.to_string()) || app.contains_key(&eid) {
          match decided.get(&eid.to_string()).and_then(Value::as_str) {
            Some("delete") => { glue_edits.push(json!({ "delete": id })); map.remove(id); base.remove(&eid.to_string()); questions.retain(|q| text(q, "ext") != eid.to_string()); done.taken += 1; }
            _ => ask(&mut questions, eid, &text(l, "name"), "app", id),
          }
        }
        continue;
      };
      let b = base.get(&eid.to_string()).cloned();
      let g_parent = parent_in_app(l, &map).to_string();
      let g_items = sent_items(l, &mut songs, &tx, backed);
      let (b_name, b_parent) = (b.as_ref().map(|b| text(b, "name")), b.as_ref().map(|b| text(b, "parent")));
      let b_items: Option<Vec<String>> = b.as_ref().map(|b| items_of(&json!({ "items": b["items"] })));
      let name = pick(&text(l, "name"), &e.title, b_name.as_ref());
      let parent = pick(&g_parent, &e.parent.to_string(), b_parent.as_ref());
      // A place outside the GLUE folder: GLUE's.
      let parent = if parent == gf.to_string() || under.contains(&parent.parse().unwrap_or(-1)) || map.values().any(|v| v.to_string() == parent) { parent } else { g_parent.clone() };
      let in_scope = scope.contains(id);
      let items = if in_scope {
        let known = |x: &str| track_of.contains_key(x) || songs.added.values().any(|v| v == x) || ext_of.values().any(|v| v == x) || g_items.iter().any(|v| v == x);
        let l_known: Vec<String> = e.items.iter().filter(|x| known(x)).cloned().collect();
        let b_known: Option<Vec<String>> = b_items.map(|b| b.into_iter().filter(|x| known(x)).collect());
        splice(&e.items, known, &merge_items(&g_items, &l_known, b_known.as_deref()))
      } else { e.items.clone() };
      // To Engine DJ.
      if name != e.title { enginedb::rename_list(&tx, eid, &name)?; done.written += 1; }
      if parent != e.parent.to_string() { enginedb::move_list(&tx, eid, parent.parse().unwrap_or(gf))?; done.written += 1; }
      if items != e.items { enginedb::set_items(&tx, eid, &items)?; done.written += 1; }
      // To GLUE.
      let mut u = l.clone();
      let mut changed = false;
      if name != text(l, "name") { u["name"] = json!(name); changed = true; }
      if in_scope {
        let merged: Vec<String> = items.iter().filter_map(|x| track_of.get(x).cloned().or_else(|| songs.added.iter().find(|(_, v)| *v == x).map(|(k, _)| k.clone()))).collect();
        // The songs that couldn't go to Engine DJ stay in GLUE's, where they were (2026-10-09: one was taken out).
        let glue_items: Vec<Value> = keep_unsent(&items_of(l), merged, &songs.missed).into_iter().map(|t| json!(t)).collect();
        if glue_items != l["items"].as_array().cloned().unwrap_or_default() { u["items"] = Value::Array(glue_items); changed = true; }
      }
      if parent != g_parent {
        // Moved in Engine DJ: into the GLUE list it is there (its top: GLUE's top, or where it was if that isn't kept).
        let gp = if parent == gf.to_string() { parent_id(l).filter(|p| !all.contains(*p)).map(|p| json!(p)).unwrap_or(Value::Null) } else { glue_of(parent.parse().unwrap_or(-1), &map).map_or(Value::Null, |x| json!(x)) };
        if gp != l["parentId"] { u["parentId"] = gp; changed = true; }
      }
      if changed { glue_edits.push(u); done.taken += 1; }
      base.insert(eid.to_string(), json!({ "name": name, "parent": parent, "items": items }));
      questions.retain(|q| text(q, "ext") != eid.to_string());
    }

    // 3. Made in Engine DJ inside the GLUE folder: made in GLUE, parents first (one at the top kept in Engine DJ).
    let mut theirs: Vec<&EList> = app.values().filter(|e| under.contains(&e.id) && glue_of(e.id, &map).is_none() && !base.contains_key(&e.id.to_string())).collect();
    let edepth = |e: &EList| { let mut d = 0; let mut cur = e.parent; while cur != gf && cur != 0 { d += 1; if d > app.len() { break; } cur = app.get(&cur).map_or(0, |x| x.parent); } d };
    theirs.sort_by_key(|e| (edepth(e), e.id));
    {
      let mut st = s.lock().unwrap();
      for e in theirs {
        let parent = if e.parent == gf { Value::Null } else { match glue_of(e.parent, &map) { Some(g) => json!(g), None => continue } };
        let folder = app.values().any(|k| k.parent == e.id);
        let items: Vec<Value> = e.items.iter().filter_map(|x| track_of.get(x)).map(|t| json!(t)).collect();
        let id = st.new_id();
        let mut l = json!({ "schemaVersion": 1, "id": id, "kind": if folder { "folder" } else { "playlist" }, "name": e.title, "parentId": parent, "position": 1_000_000, "notes": "", "items": items, "origin": null, "createdAt": st.now().1 });
        // Kept in Engine DJ: by its folder's setting, or its own.
        if e.parent == gf || !glue_of(e.parent, &map).is_some_and(|g| scope.contains(&g)) { l["apps"] = json!(["engine"]); }
        map.insert(id.clone(), e.id);
        base.insert(e.id.to_string(), json!({ "name": e.title, "parent": e.parent.to_string(), "items": e.items }));
        glue_new.push(l);
        done.taken += 1;
      }
    }

    // 4. Gone from GLUE (deleted there): asked; the answer applied. Turned off (or moved where it isn't kept): taken out,
    //    once nothing in it is still GLUE's in Engine DJ (one waiting for an answer, say).
    let now_lists = enginedb::read_lists(&tx, &own_uuid)?;
    for (id, eid) in map.clone() {
      if all.contains(&id) || glue_new.iter().any(|l| text(l, "id") == id) { continue; }
      let in_app = app.contains_key(&eid) && under.contains(&eid);
      if lists.contains_key(&id) {
        // Still in GLUE, not kept: out of the GLUE folder (what's still kept in it was moved out by the merge above).
        // (Kept: one still sent, or gone from GLUE and waiting for an answer; what's taken out with it goes with it.)
        let held = |k: &EList| glue_of(k.id, &map).is_some_and(|g| all.contains(&g) || !lists.contains_key(&g));
        if in_app && now_lists.iter().any(|k| k.parent == eid && held(k)) { continue; }
        if in_app { enginedb::delete_list(&tx, eid)?; done.written += 1; }
        map.remove(&id); base.remove(&eid.to_string());
        continue;
      }
      if !in_app { map.remove(&id); base.remove(&eid.to_string()); questions.retain(|q| text(q, "ext") != eid.to_string()); continue; }
      match decided.get(&eid.to_string()).and_then(Value::as_str) {
        Some("delete") => { enginedb::delete_list(&tx, eid)?; map.remove(&id); base.remove(&eid.to_string()); questions.retain(|q| text(q, "ext") != eid.to_string()); done.written += 1; }
        _ => ask(&mut questions, eid, &app[&eid].title, "glue", &id),
      }
    }

    // 5. The order among siblings (ADR 0172), each folder of the GLUE folder's and its top.
    {
      let now_lists = enginedb::read_lists(&tx, &own_uuid)?;
      // GLUE's lists as they are now (with this sync's edits).
      let mut latest_of: HashMap<String, Value> = HashMap::new();
      for l in glue_new.iter() { latest_of.insert(text(l, "id"), l.clone()); }
      for u in glue_edits.iter().filter(|u| u.get("delete").is_none()) {
        let id = text(u, "id");
        let mut cur = latest_of.get(&id).cloned().or_else(|| lists.get(&id).cloned()).unwrap_or_else(|| u.clone());
        for k in ["name", "items", "parentId", "position"] { if let Some(v) = u.get(k) { cur[k] = v.clone(); } }
        latest_of.insert(id, cur);
      }
      let latest = |id: &str| -> Option<Value> { latest_of.get(id).cloned().or_else(|| lists.get(id).cloned()) };
      let mut placed: Vec<(String, usize)> = vec![];
      let mut orders = kept["mirrorOrders"].as_object().cloned().unwrap_or_default();
      let mut parents: Vec<i64> = vec![gf];
      for (id, eid) in &map { if lists.get(id).is_some_and(|l| text(l, "kind") == "folder") || now_lists.iter().any(|k| k.parent == *eid) { parents.push(*eid); } }
      for par in parents {
        let l_order: Vec<String> = enginedb::order_of(&now_lists, par).into_iter().map(|i| i.to_string()).collect();
        let mut kids: Vec<(Value, String)> = map.iter().filter_map(|(id, eid)| { let l = latest(id)?; (l_order.contains(&eid.to_string())).then_some((l, eid.to_string())) }).collect();
        if kids.is_empty() { continue; }
        kids.sort_by(|a, b| a.0["position"].as_f64().unwrap_or(f64::MAX).partial_cmp(&b.0["position"].as_f64().unwrap_or(f64::MAX)).unwrap_or(std::cmp::Ordering::Equal));
        let g_order: Vec<String> = kids.iter().map(|k| k.1.clone()).collect();
        let known = |x: &str| g_order.iter().any(|g| g == x);
        let l_known: Vec<String> = l_order.iter().filter(|x| known(x)).cloned().collect();
        let key = par.to_string();
        let b_order: Option<Vec<String>> = orders.get(&key).and_then(Value::as_array).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).filter(|x| known(x)).collect());
        let mut merged: Vec<String> = merge_items(&g_order, &l_known, b_order.as_deref()).into_iter().filter(|e| l_known.contains(e)).collect();
        for e in &l_known { if !merged.contains(e) { merged.push(e.clone()); } }
        let merged = splice(&l_order, known, &merged);
        if merged != l_order { enginedb::set_order(&tx, par, &merged.iter().filter_map(|x| x.parse().ok()).collect::<Vec<i64>>())?; done.written += 1; }
        for (i, e) in merged.iter().filter(|e| known(e)).enumerate() {
          if let Some((l, _)) = kids.iter().find(|k| k.1 == *e) {
            if l["position"].as_f64() != Some(i as f64) { placed.push((text(l, "id"), i)); }
          }
        }
        orders.insert(key, json!(merged));
      }
      kept["mirrorOrders"] = Value::Object(orders);
      for (id, i) in placed {
        if let Some(n) = glue_new.iter_mut().find(|n| text(n, "id") == id) { n["position"] = json!(i); } else { glue_edits.push(json!({ "id": id, "position": i })); }
      }
    }
    tx.commit().map_err(|e| e.to_string())?;
    // The songs that couldn't go, by GLUE list, and why: shown by the list in GLUE, and said once when they change.
    {
      let mut unsent = serde_json::Map::new();
      for id in &scope {
        let Some(l) = lists.get(id) else { continue };
        let songs_out: Vec<String> = items_of(l).into_iter().filter(|t| songs.missed.contains_key(t)).collect();
        if songs_out.is_empty() { continue; }
        let mut why: Vec<String> = songs_out.iter().filter_map(|t| songs.missed.get(t).cloned()).collect(); why.sort(); why.dedup();
        unsent.insert(id.clone(), json!({ "songs": songs_out, "why": why }));
      }
      if kept["unsent"] != Value::Object(unsent.clone()) {
        for (id, u) in &unsent {
          if kept["unsent"].get(id) == Some(u) { continue; }
          let n = u["songs"].as_array().map_or(0, Vec::len);
          self.event(&format!("Engine DJ: {n} song{} of “{}” couldn’t go to its GLUE folder: {}", if n == 1 { "" } else { "s" }, text(&lists[id], "name"), u["why"].as_array().into_iter().flatten().filter_map(Value::as_str).collect::<Vec<_>>().join("; ")));
        }
        kept["unsent"] = Value::Object(unsent);
      }
    }
    // Which is which, kept before GLUE's side is saved (one that fails mustn't lose it: Engine DJ's are written).
    let answered: Vec<String> = decided.keys().filter(|k| !questions.iter().any(|q| text(q, "ext") == **k)).cloned().collect();
    if let Some(d) = kept["decided"].as_object_mut() { for k in answered { d.remove(&k); } }
    kept["mirror"] = json!(map);
    kept["mirrorBase"] = Value::Object(base);
    done.questions = questions.len();
    kept["questions"] = Value::Array(questions);
    // GLUE's side: GLUE Home's own edit.
    if !glue_edits.is_empty() || !glue_new.is_empty() {
      let mut st = s.lock().unwrap();
      for l in glue_new { st.put_list(l); }
      for u in glue_edits {
        if let Some(id) = u.get("delete").and_then(Value::as_str) { if st.lists.contains_key(id) { st.delete_list(id); } continue; }
        // The latest of each list (a merge, then its place).
        let id = text(&u, "id");
        let mut cur = st.lists.get(&id).cloned().unwrap_or_else(|| u.clone());
        for k in ["name", "items", "parentId", "position"] { if let Some(v) = u.get(k) { cur[k] = v.clone(); } }
        st.put_list(cur);
      }
      self.flush_edit(&mut st, p, c)?;
    }
    Ok(done)
  }

  /// A playlist's question answered (`djListResolve`): `delete` it on the other side too, or keep it (made again on the
  /// side it went from, at the next sync). GLUE's side at once; Engine DJ's at the next sync, Engine DJ closed.
  pub fn dj_list_resolve(&self, p: &str, c: &str, ext: &str, delete: bool) -> Result<Value, String> {
    let _one = self.dj_one.lock().unwrap_or_else(|e| e.into_inner());
    let s = self.store(p, c)?;
    let src = { let st = s.lock().unwrap(); st.sources.values().find(|x| st.own_source(x) && crate::truthy(crate::get(x, "main")) && crate::truthy(crate::get(x, "sync"))).cloned().ok_or("No main DJ library kept in step")? };
    let sid = text(&src, "id");
    let rel = format!("dj/{p}/{c}/{sid}.json");
    let mut kept = glue_store::dir::read_json(&self.cache_dir(), &rel).ok().flatten().ok_or("Nothing to settle")?;
    let q = kept["questions"].as_array().into_iter().flatten().find(|q| text(q, "ext") == ext).cloned().ok_or("Nothing to settle")?;
    let (gone_in_app, list) = (text(&q, "deletedIn") == "app", text(&q, "list"));
    let forget = |kept: &mut Value| {
      if let Some(m) = kept["mirror"].as_object_mut() { m.retain(|_, v| v.as_i64().map(|x| x.to_string()) != Some(ext.to_string())); }
      if let Some(b) = kept["mirrorBase"].as_object_mut() { b.remove(ext); }
      if let Some(a) = kept["questions"].as_array_mut() { a.retain(|x| text(x, "ext") != ext); }
    };
    if gone_in_app && delete {
      // Gone from Engine DJ's GLUE folder, and from GLUE too.
      let mut st = s.lock().unwrap();
      if st.lists.contains_key(&list) { st.delete_list(&list); }
      self.flush_edit(&mut st, p, c)?;
      forget(&mut kept);
    } else if !delete {
      // Kept: made again on the side it went from (GLUE's list in Engine DJ, or Engine DJ's in GLUE), at the next sync.
      forget(&mut kept);
    } else {
      // Deleted in GLUE, and in Engine DJ too: at the next sync.
      if !kept["decided"].is_object() { kept["decided"] = json!({}); }
      kept["decided"][ext] = json!("delete");
    }
    self.dj_keep(&rel, &mut kept)?;
    let r = self.dj_sync_held(p, c, true)?;
    Ok(json!({ "written": r.written, "waiting": r.waiting }))
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn kept_lists_are_the_ones_marked_and_what_their_folders_hold() {
    let mut ls = indexmap::IndexMap::new();
    for (id, parent, apps, origin) in [("sets", None, false, false), ("fri", Some("sets"), true, false), ("gigs", None, true, false), ("in", Some("gigs"), false, false), ("imp", None, true, true), ("loose", None, false, false)] {
      ls.insert(id.to_string(), json!({ "id": id, "parentId": parent, "apps": if apps { json!(["engine"]) } else { Value::Null }, "origin": if origin { json!({ "sourceId": "x", "externalId": "1" }) } else { Value::Null } }));
    }
    let (scope, all) = kept_lists(&ls, "engine");
    let mut s: Vec<&String> = scope.iter().collect(); s.sort();
    let mut a: Vec<&String> = all.iter().collect(); a.sort();
    assert_eq!(s, ["fri", "gigs", "in"]);
    assert_eq!(a, ["fri", "gigs", "in", "sets"], "Sets as the folder Friday is in; an import never");
  }
  #[test]
  fn songs_that_couldnt_go_stay_where_they_were() {
    let s = |v: &[&str]| v.iter().map(|x| x.to_string()).collect::<Vec<_>>();
    let missed: HashMap<String, String> = HashMap::from([("b".into(), "why".into()), ("e".into(), "why".into())]);
    assert_eq!(keep_unsent(&s(&["a", "b", "c", "d", "e"]), s(&["a", "c", "d"]), &missed), s(&["a", "b", "c", "d", "e"]));
    assert_eq!(keep_unsent(&s(&["b", "a"]), s(&["a"]), &missed), s(&["b", "a"]), "first, when nothing's before it");
    assert_eq!(keep_unsent(&s(&["a", "b", "c"]), s(&["c", "a"]), &missed), s(&["c", "a", "b"]), "after the one before it, wherever that went");
  }
  #[test]
  fn engine_djs_added_numbers_come_off() {
    assert_eq!(base_name("Mix (2) (3)"), "Mix");
    assert_eq!(base_name("Mix (Live)"), "Mix (Live)");
    assert_eq!(base_name("2024 (1)"), "2024");
    assert_eq!(base_name("Mix ()"), "Mix ()");
  }
}
