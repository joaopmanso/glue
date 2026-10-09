//! The main DJ library kept in step both ways by GLUE Home (ADR 0170; ADR 0168, 0169), Engine DJ first. For a main
//! library whose syncing the user switched on (`Source.sync`), while Engine DJ (and its analyser) isn't running:
//! - each of its databases (the computer's, each drive's) is found by its id (`Information.uuid`);
//! - each song's hot cues, saved loops and grid are read from its `PerformanceData` row, merged with GLUE's
//!   (`glue_interop::sync`: each side's change goes to the other, a change on both is a clash for the user);
//! - what goes to Engine DJ is written in one transaction per database, after a copy of it in GLUE Home's cache
//!   (`dj-backups/<uuid>/`, the last 3), only the fields that changed, every byte GLUE doesn't know kept;
//! - what comes to GLUE is GLUE Home's own edit of the songs' `prep`;
//! - what they now agree on, and the clashes, are kept in GLUE Home's cache (`dj/<p>/<c>/<source>.json`): lost, the
//!   next sync takes only what's on one side, and removes nothing.
//!
//! It runs when something changed since the last time (GLUE's library, or a database's date).
use crate::{get, key, text, truthy, Engine, Host};
use glue_interop::perf::{self, Hot, Loop};
use glue_interop::sync::{self, Side};
use glue_store::dir::{read_json, write_json};
use rusqlite::{params, Connection, OpenFlags};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Engine DJ's programs: while either runs, its library isn't written.
const ENGINE_APPS: [&str; 2] = ["Engine DJ", "OfflineAnalyzer"];

/// What a sync did.
#[derive(Debug, Default, PartialEq)]
pub struct Synced { pub written: usize, pub taken: usize, pub clashes: usize, pub waiting: bool, pub lists: usize, pub questions: usize, pub relinked: usize }

/// A song's fields to write: its id, its packed hot cues, loops and grid where they changed, and the grid's BPM.
type Write = (i64, Option<Vec<u8>>, Option<Vec<u8>>, Option<Vec<u8>>, Option<f64>);

/// A song of the library: its record's id ("uuid/id") and GLUE's song.
struct Song { ext: String, id: i64, track: String }

fn mtime(p: &Path) -> f64 { std::fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0.0, |d| d.as_millis() as f64) }
/// A database Engine DJ is saving (its journal or write-ahead log not empty): not now.
fn busy(db: &Path) -> bool {
  ["-journal", "-wal"].iter().any(|s| { let mut j = db.as_os_str().to_owned(); j.push(s); std::fs::metadata(&j).is_ok_and(|m| m.len() > 0) })
}

impl<H: Host> Engine<H> {
  /// Every collection's main DJ library with syncing on (the service's DJ timer, after the look).
  pub fn dj_sync(&self) {
    if self.host.lease_held() { return; }
    let lib = self.describe().unwrap_or(Value::Null);
    for p in lib["profiles"].as_array().into_iter().flatten() { for col in p["collections"].as_array().into_iter().flatten() {
      let (pid, cid) = (text(p, "id"), text(col, "id"));
      if let Err(e) = self.dj_sync_collection(&pid, &cid, false) { eprintln!("GLUE Home: couldn’t sync the DJ library: {e}"); self.event(&format!("Couldn’t keep Engine DJ in step: {e}")); }
    } }
  }

  /// The databases of Engine DJ's set, by their id: where the library was read from, and each drive's.
  fn engine_dbs(&self, src: &Value, cfg: &Value) -> HashMap<String, PathBuf> {
    let mut at: Vec<PathBuf> = vec![];
    if let Some(mut p) = self.dj_place(&text(&src["origin"], "place"), cfg) { for part in text(&src["origin"], "relPath").split('/').filter(|x| !x.is_empty()) { p.push(part); } at.push(p); }
    for d in self.host.drives() { at.push(d.join("Engine Library").join("Database2").join("m.db")); }
    let mut out = HashMap::new();
    for p in at.into_iter().filter(|p| p.is_file()) {
      let Ok(db) = Connection::open_with_flags(&p, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX) else { continue };
      if let Ok(u) = db.query_row("SELECT uuid FROM Information LIMIT 1", [], |r| r.get::<_, String>(0)) { out.entry(u).or_insert(p); }
    }
    out
  }

  /// A collection's main DJ library, kept in step (`now`: whether anything changed or not).
  pub fn dj_sync_collection(&self, p: &str, c: &str, now: bool) -> Result<Synced, String> {
    let s = self.store(p, c)?;
    let (src, songs) = {
      let st = s.lock().unwrap();
      let Some(src) = st.sources.values().find(|x| st.own_source(x) && truthy(get(x, "main")) && truthy(get(x, "sync")) && text(x, "app") == "engine").cloned() else { return Ok(Synced::default()) };
      let songs: Vec<Song> = src["tracks"].as_array().into_iter().flatten().filter_map(|t| {
        let ext = text(t, "externalId");
        let (_, id) = ext.split_once('/')?;
        Some(Song { ext: ext.clone(), id: id.parse().ok()?, track: text(t, "trackId") })
      }).filter(|x| st.tracks.get(&x.track).is_some_and(|t| !truthy(get(t, "remote")))).collect();
      (src, songs)
    };
    let sid = text(&src, "id");
    // The copies of its playlists 0.68–0.70 brought into GLUE's playlists, gone once (ADR 0178).
    if let Err(x) = self.dj_clear_copies(p, c, &sid) { eprintln!("GLUE Home: couldn’t take Engine DJ’s playlists out of GLUE’s: {x}"); }
    // Engine DJ open: GLUE's changes wait for it to close.
    if self.host.apps_running(&ENGINE_APPS) { let mut w = self.dj.lock().unwrap(); w.syncing.insert(sid, "waiting"); w.backed.clear(); return Ok(Synced { waiting: true, ..Default::default() }); }
    let cfg = self.host.config();
    let dbs = self.engine_dbs(&src, &cfg);
    // Not again unless something changed: GLUE's library, or a database.
    let mut sig: Vec<String> = dbs.iter().map(|(u, p)| format!("{u}:{}", mtime(p))).collect();
    sig.sort();
    let sig = format!("{}|{}", self.rev(), sig.join(","));
    let k = format!("{}/{}", key(p, c).0, key(p, c).1);
    if !now && self.dj.lock().unwrap().synced_at.get(&k) == Some(&sig) { self.dj.lock().unwrap().syncing.insert(sid, "synced"); return Ok(Synced::default()); }

    let cache_rel = format!("dj/{p}/{c}/{sid}.json");
    let mut kept = read_json(&self.cache_dir(), &cache_rel).ok().flatten().unwrap_or_else(|| json!({ "base": {}, "clashes": {} }));
    let mut done = Synced::default();
    let mut edits: Vec<(String, Value)> = vec![];
    let (_, at) = self.host.now();
    let mut backed = self.dj.lock().unwrap().backed.clone();
    let mut by_db: HashMap<String, Vec<&Song>> = HashMap::new();
    for x in &songs { if let Some((u, _)) = x.ext.split_once('/') { by_db.entry(u.to_string()).or_default().push(x); } }
    for (uuid, list) in by_db {
      // A drive not connected: its songs wait for it.
      let Some(path) = dbs.get(&uuid) else { continue };
      if busy(path) { done.waiting = true; continue; }
      let mut db = Connection::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
      let mut writes: Vec<Write> = vec![];
      {
        let mut q = db.prepare("SELECT quickCues, loops, beatData, trackData FROM PerformanceData WHERE trackId = ?1").map_err(|e| e.to_string())?;
        for x in &list {
          let row = q.query_row(params![x.id], |r| Ok((r.get::<_, Option<Vec<u8>>>(0)?, r.get::<_, Option<Vec<u8>>>(1)?, r.get::<_, Option<Vec<u8>>>(2)?, r.get::<_, Option<Vec<u8>>>(3)?)));
          let Ok((quick, loops, beats, track)) = row else { continue };
          let (quick, beats) = (perf::unq(quick.as_deref()), perf::unq(beats.as_deref()));
          let bd = beats.as_deref().and_then(perf::beat_data);
          let mut sr = bd.map_or(0.0, |b| b.0);
          if !glue_interop::types::positive(sr) { sr = perf::unq(track.as_deref()).map_or(0.0, |t| perf::track_rate(&t)); }
          if !glue_interop::types::positive(sr) { continue; }
          let app = Side { hot: perf::hot_slots(quick.as_deref(), sr), loops: perf::loop_slots(loops.as_deref(), sr), grid: bd.and_then(|b| b.1) };
          let base = kept["base"].get(&x.ext).map(Side::from_json);
          let prep = { let st = s.lock().unwrap(); st.tracks.get(&x.track).and_then(|t| t.get("prep")).cloned() };
          let (glue, placed) = sync::glue_side(prep.as_ref(), &app, base.as_ref());
          let m = sync::merge(&glue, &app, base.as_ref());
          // To Engine DJ: only the fields that changed.
          let hot = (m.app.hot != app.hot).then(|| perf::qcompress(&perf::encode_hot(quick.as_deref(), &m.app.hot, sr)));
          let lp = (m.app.loops != app.loops).then(|| perf::encode_loops(loops.as_deref(), &m.app.loops, sr));
          let grid = if !sync::same_grid(&m.app.grid, &app.grid) { m.app.grid.and_then(|g| beats.as_deref().and_then(|b| perf::encode_grid(b, &g)).map(|raw| (perf::qcompress(&raw), g.bpm))) } else { None };
          if hot.is_some() || lp.is_some() || grid.is_some() { let (g, bpm) = grid.map_or((None, None), |(g, b)| (Some(g), Some(b))); writes.push((x.id, hot, lp, g, bpm)); }
          // To GLUE.
          if let Some(next) = sync::glue_prep(prep.as_ref(), &glue, &placed, &m.glue) { edits.push((x.track.clone(), next)); }
          kept["base"][&x.ext] = m.base.to_json();
          if m.clashes.is_empty() { if let Some(o) = kept["clashes"].as_object_mut() { o.remove(&x.track); } }
          else { kept["clashes"][&x.track] = Value::Array(m.clashes.iter().map(|w| sync::clash_json(w, &glue, &app)).collect()); }
        }
      }
      if !writes.is_empty() {
        if backed.insert(uuid.clone()) { self.dj_backup(&uuid, path, &at)?; }
        let tx = db.transaction().map_err(|e| e.to_string())?;
        for (id, hot, lp, grid, bpm) in &writes {
          if let Some(b) = hot { tx.execute("UPDATE PerformanceData SET quickCues = ?1 WHERE trackId = ?2", params![b, id]).map_err(|e| e.to_string())?; }
          if let Some(b) = lp { tx.execute("UPDATE PerformanceData SET loops = ?1 WHERE trackId = ?2", params![b, id]).map_err(|e| e.to_string())?; }
          if let Some(b) = grid { tx.execute("UPDATE PerformanceData SET beatData = ?1 WHERE trackId = ?2", params![b, id]).map_err(|e| e.to_string())?; }
          // Engine DJ's BPM column follows the grid [UNVERIFIED that it reads it from here].
          if let Some(b) = bpm { tx.execute("UPDATE Track SET bpmAnalyzed = ?1 WHERE id = ?2", params![b, id]).map_err(|e| e.to_string())?; }
        }
        tx.commit().map_err(|e| e.to_string())?;
        done.written += writes.len();
      }
    }
    // Songs pointed at the copy the duplicates' clean-up kept (ADR 0172), in the database the library is read from. Its
    // playlists aren't GLUE's own any more (ADR 0178): they stay in its DJ collection, a copy is an import.
    let lib_db = self.dj_place(&text(&src["origin"], "place"), &cfg).map(|mut p| { for part in text(&src["origin"], "relPath").split('/').filter(|x| !x.is_empty()) { p.push(part); } p });
    if let Some(lib_db) = lib_db.filter(|p| p.is_file()) {
      if busy(&lib_db) { done.waiting = true; }
      else {
        match self.dj_relink(p, c, &src, &lib_db, &dbs, &at, &mut backed) {
          Ok((n, _)) => { if n > 0 { done.relinked = n; self.event(&format!("Engine DJ: {n} song{} pointed at the copy GLUE kept", if n == 1 { "" } else { "s" })); } }
          Err(x) => eprintln!("GLUE Home: couldn’t point Engine DJ’s songs at the copies kept: {x}"),
        }
      }
    }
    // GLUE's songs: GLUE Home's own edit.
    if !edits.is_empty() {
      let mut st = s.lock().unwrap();
      for (id, prep) in &edits {
        let Some(mut t) = st.tracks.get(id).cloned() else { continue };
        if prep.as_object().is_some_and(|o| o.is_empty()) { t.as_object_mut().unwrap().shift_remove("prep"); } else { t["prep"] = prep.clone(); }
        st.put_track(t);
      }
      self.flush_edit(&mut st, p, c)?;
      done.taken = edits.len();
    }
    self.dj.lock().unwrap().backed.extend(backed);
    done.clashes = kept["clashes"].as_object().map_or(0, Map::len);
    write_json(&self.cache_dir(), &cache_rel, &kept)?;
    // What it is now (after its own writes, which change the databases' dates).
    let mut sig2: Vec<String> = dbs.iter().map(|(u, p)| format!("{u}:{}", mtime(p))).collect();
    sig2.sort();
    { let mut w = self.dj.lock().unwrap(); if !done.waiting { w.synced_at.insert(k, format!("{}|{}", self.rev(), sig2.join(","))); } w.syncing.insert(text(&src, "id"), if done.waiting { "waiting" } else { "synced" }); }
    if done.written > 0 { self.event(&format!("Engine DJ: GLUE’s cues and grids written for {} song{}", done.written, if done.written == 1 { "" } else { "s" })); }
    if done.taken > 0 { self.event(&format!("Engine DJ’s cue and grid changes taken into GLUE for {} song{}", done.taken, if done.taken == 1 { "" } else { "s" })); }
    Ok(done)
  }

  /// A copy of a database before GLUE writes into it, in GLUE Home's cache (the last 3 of each: once each time Engine DJ
  /// has been closed, ADR 0173).
  pub(crate) fn dj_backup(&self, uuid: &str, db: &Path, at: &str) -> Result<(), String> {
    let dir = self.cache.join("dj-backups").join(uuid);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::copy(db, dir.join(format!("{}.db", at.replace([':', '.'], "-")))).map_err(|e| format!("couldn’t back up {}: {e}", db.display()))?;
    let mut all: Vec<PathBuf> = std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "db")).collect();
    all.sort();
    while all.len() > 3 { let _ = std::fs::remove_file(all.remove(0)); }
    Ok(())
  }

  /// The clashes waiting in a collection's main DJ library, by GLUE song (`djClashes`).
  pub fn dj_clashes(&self, p: &str, c: &str) -> Value {
    let Ok(s) = self.store(p, c) else { return json!({}) };
    let sid = { let st = s.lock().unwrap(); st.sources.values().find(|x| st.own_source(x) && truthy(get(x, "main"))).map(|x| text(x, "id")) };
    let Some(sid) = sid else { return json!({}) };
    read_json(&self.cache_dir(), &format!("dj/{p}/{c}/{sid}.json")).ok().flatten().map_or(json!({}), |k| k["clashes"].clone())
  }
  /// A clash settled (`djResolve`): GLUE's kept (written into the library) or the library's (taken into GLUE), by
  /// what they're taken to have agreed on; then a sync.
  pub fn dj_resolve(&self, p: &str, c: &str, track: &str, keep_glue: bool) -> Result<Value, String> {
    let s = self.store(p, c)?;
    let (sid, ext) = {
      let st = s.lock().unwrap();
      let src = st.sources.values().find(|x| st.own_source(x) && truthy(get(x, "main"))).ok_or("No main DJ library")?;
      let ext = src["tracks"].as_array().into_iter().flatten().find(|t| text(t, "trackId") == track).map(|t| text(t, "externalId")).ok_or("That song isn’t in the main DJ library")?;
      (text(src, "id"), ext)
    };
    let rel = format!("dj/{p}/{c}/{sid}.json");
    let mut kept = read_json(&self.cache_dir(), &rel).ok().flatten().ok_or("Nothing to settle")?;
    let clashes = kept["clashes"][track].as_array().cloned().unwrap_or_default();
    let mut base = kept["base"].get(&ext).map(Side::from_json).unwrap_or_default();
    for cl in &clashes {
      // The other side's value as the agreed one: the side kept then counts as the one that changed.
      let v = if keep_glue { &cl["app"] } else { &cl["glue"] };
      let what = text(cl, "what");
      match what.split_once(' ') {
        Some(("hot", i)) => if let Ok(i) = i.parse::<usize>() { base.hot[i] = v.is_object().then(|| Hot { t: v["t"].as_f64().unwrap_or(0.0), name: text(v, "name"), color: v["color"].as_str().map(String::from) }); },
        Some(("loop", i)) => if let Ok(i) = i.parse::<usize>() { base.loops[i] = v.is_object().then(|| Loop { a: v["a"].as_f64().unwrap_or(0.0), b: v["b"].as_f64().unwrap_or(0.0), name: text(v, "name"), color: v["color"].as_str().map(String::from) }); },
        _ => base.grid = glue_interop::types::Grid::from_json(v),
      }
    }
    kept["base"][&ext] = base.to_json();
    if let Some(o) = kept["clashes"].as_object_mut() { o.remove(track); }
    write_json(&self.cache_dir(), &rel, &kept)?;
    let r = self.dj_sync_collection(p, c, true)?;
    Ok(json!({ "written": r.written, "taken": r.taken, "waiting": r.waiting }))
  }
}
