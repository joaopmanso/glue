//! The main Engine DJ library's playlists: what's left of ADR 0171's sync (superseded by ADR 0178; GLUE's own playlists
//! go to its GLUE folder now, `djmirror.rs`): the copies it brought in taken out once, the questions, GLUE's songs as
//! Engine DJ's (a song it lacks added to the collection of its drive's database), and the relink (ADR 0172). Written
//! into the database the library is read from (Engine DJ's settings' library; F: on the user's desktop).
use crate::{get, text, truthy, Engine, Host};
use glue_store::dir::{read_json, Dir};
use glue_interop::enginedb::{self, NewTrack};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

fn origin<'a>(l: &'a Value, k: &str) -> Option<&'a str> { l.get("origin").and_then(|o| o.get(k)).and_then(Value::as_str) }
fn parent_id(l: &Value) -> Option<&str> { l.get("parentId").and_then(Value::as_str).filter(|x| !x.is_empty()) }

impl<H: Host> Engine<H> {
  /// The copies of the main library's playlists in GLUE's playlists, taken out once (ADR 0178): 0.68–0.70 brought all of
  /// them in when the sync was turned on, and brought the folder back when it was deleted. They stay in the library's DJ
  /// collection; one imported again is an import, following it. A backup of the profile first
  /// (`backups/pre-engine-playlists-…zip`), and each copy into the bin (Recently deleted). The user's own playlists in
  /// there move to the top. Marked done in GLUE Home's cache (`listsOut`), with the old sync's state let go.
  pub(crate) fn dj_clear_copies(&self, p: &str, c: &str, sid: &str) -> Result<usize, String> {
    let rel = format!("dj/{p}/{c}/{sid}.json");
    let mut kept = read_json(&self.cache_dir(), &rel).ok().flatten().unwrap_or_else(|| json!({ "base": {}, "clashes": {} }));
    if truthy(kept.get("listsOut")) { return Ok(0); }
    let s = self.store(p, c)?;
    let mut st = s.lock().unwrap();
    let copies: HashSet<String> = st.lists.values().filter(|l| origin(l, "sourceId") == Some(sid)).map(|l| text(l, "id")).collect();
    if !copies.is_empty() {
      let profile = read_json(&self.dir(), &format!("profiles/{p}/profile.json")).ok().flatten().ok_or("no profile")?;
      let (_, at) = self.host.now();
      let zip = glue_store::backup::build_backup(&self.dir(), &profile, false, &at)?;
      self.dir().write_bytes(&format!("backups/pre-engine-playlists-{}-{p}-{c}.zip", &at[..10]), &zip)?;
      let mine: Vec<Value> = st.lists.values().filter(|l| !copies.contains(&text(l, "id")) && parent_id(l).is_some_and(|x| copies.contains(x))).cloned().collect();
      for mut l in mine { l["parentId"] = Value::Null; st.put_list(l); }
      // Top first: deleting a folder takes what's in it.
      for id in &copies { if st.lists.contains_key(id) { st.delete_list(id); } }
      self.flush_edit(&mut st, p, c)?;
      let n = copies.len();
      self.event(&format!("Engine DJ’s {n} playlist{} taken out of GLUE’s playlists: they’re in its DJ collection (a backup first)", if n == 1 { "" } else { "s" }));
    }
    drop(st);
    for k in ["lists", "orders", "questions", "decided"] { kept.as_object_mut().map(|o| o.shift_remove(k)); }
    kept["listsOut"] = json!(true);
    self.dj_keep(&rel, &mut kept)?;
    Ok(copies.len())
  }
}

impl<H: Host> Engine<H> {
  /// The playlists' questions (`djQuestions`).
  pub fn dj_questions(&self, p: &str, c: &str) -> Value { self.dj_kept(p, c, "questions", json!([])) }
  /// GLUE's lists kept in Engine DJ with songs that couldn't go there, and why (`djUnsent`): `{ list: { songs, why } }`.
  pub fn dj_unsent(&self, p: &str, c: &str) -> Value { self.dj_kept(p, c, "unsent", json!({})) }
  fn dj_kept(&self, p: &str, c: &str, k: &str, none: Value) -> Value {
    let Ok(s) = self.store(p, c) else { return none };
    let sid = { let st = s.lock().unwrap(); st.sources.values().find(|x| st.own_source(x) && truthy(get(x, "main")) && truthy(get(x, "sync"))).map(|x| text(x, "id")) };
    let Some(sid) = sid else { return none };
    glue_store::dir::read_json(&self.cache_dir(), &format!("dj/{p}/{c}/{sid}.json")).ok().flatten().map_or(none.clone(), |kept| if kept[k].is_null() { none } else { kept[k].clone() })
  }
}

/// GLUE's songs as Engine DJ's: their record, or added to the collection of their drive's database.
pub(crate) struct Songs<'a> { pub(crate) ext_of: &'a HashMap<String, String>, pub(crate) tracks: &'a HashMap<String, Value>, pub(crate) added: HashMap<String, String>, pub(crate) dbs: &'a HashMap<String, PathBuf>, pub(crate) lib: &'a Path, pub(crate) cfg: Value, pub(crate) at: &'a str, pub(crate) now: i64,
  /// Why a song couldn't go (by GLUE's song), said to the user (2026-10-09: one left out without a word).
  pub(crate) missed: HashMap<String, String> }
impl<'a> Songs<'a> {
  pub(crate) fn new(ext_of: &'a HashMap<String, String>, tracks: &'a HashMap<String, Value>, dbs: &'a HashMap<String, PathBuf>, lib: &'a Path, cfg: Value, at: &'a str, now: i64) -> Self {
    Songs { ext_of, tracks, added: HashMap::new(), dbs, lib, cfg, at, now, missed: HashMap::new() }
  }
  fn miss(&mut self, tid: &str, why: String) -> Option<String> { self.missed.insert(tid.to_string(), why); None }
}
impl Songs<'_> {
  /// A GLUE song's record in Engine DJ ("uuid/id"); added where it's missing. None: it can't be (no file here, or no
  /// Engine DJ library on its drive).
  pub(crate) fn song<H: Host>(&mut self, eng: &Engine<H>, tid: &str, lib: &Connection, backed: &mut HashSet<String>) -> Option<String> {
    if let Some(x) = self.ext_of.get(tid).or_else(|| self.added.get(tid)) { return Some(x.clone()); }
    let Some(t) = self.tracks.get(tid) else { return self.miss(tid, "it isn’t in this collection any more".into()) };
    if truthy(get(t, "remote")) { return self.miss(tid, "it’s another computer’s song".into()); }
    if text(t, "relPath").is_empty() { return self.miss(tid, "it isn’t in a music folder (a song added on its own)".into()); }
    let Some(root) = self.cfg["folders"][text(t, "rootId")].as_str() else { return self.miss(tid, "GLUE Home doesn’t know where its music folder is on this computer".into()) };
    let mut file = PathBuf::from(root);
    for part in text(t, "relPath").split('/') { file.push(part); }
    if !file.is_file() { return self.miss(tid, format!("its file isn’t there ({})", file.display())); }
    // The database on the file's drive (of several there, the one whose Engine Library is nearest).
    let Some((uuid, dbp, rel)) = self.dbs.iter().filter_map(|(u, d)| { let lib = d.parent()?.parent()?; enginedb::rel_path(lib, &file).map(|r| (u.clone(), d.clone(), r)) }).min_by_key(|x| x.2.matches("../").count()) else {
      let drive = file.components().next().map(|c| c.as_os_str().to_string_lossy().to_string()).unwrap_or_default();
      return self.miss(tid, format!("its drive ({drive}) has no Engine DJ library: add one song from it in Engine DJ once, and GLUE adds the rest"));
    };
    let other = if dbp == self.lib { None } else { match Connection::open(&dbp) { Ok(c) => Some(c), Err(e) => return self.miss(tid, format!("Engine DJ’s library on its drive couldn’t be opened ({e})")) } };
    let db = other.as_ref().unwrap_or(lib);
    let id = match enginedb::track_at(db, &rel) {
      Ok(Some(id)) => id,
      Ok(None) => {
        if backed.insert(uuid.clone()) { if let Err(e) = eng.dj_backup(&uuid, &dbp, self.at) { return self.miss(tid, format!("Engine DJ’s library couldn’t be backed up first ({e})")); } }
        let n = |k: &str| t.get(k).and_then(Value::as_f64);
        match enginedb::add_track(db, &NewTrack { path: rel, title: text(t, "title"), artist: text(t, "artist"), album: text(t, "album"), genre: text(t, "genre"), comment: text(t, "comment"), label: text(t, "label"),
          year: text(t, "year").parse().ok(), length: n("duration"), size: n("size"), created: n("mtime").map(|m| m / 1000.0) }, self.now) {
          Ok(id) => id,
          Err(e) => return self.miss(tid, format!("Engine DJ’s library didn’t take it ({e})")),
        }
      }
      Err(e) => return self.miss(tid, format!("Engine DJ’s library couldn’t be read ({e})")),
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
    let none = HashMap::new();
    let mut songs = Songs::new(&none, &tracks, dbs, lib_db, cfg.clone(), at, self.host.now().0 / 1000);
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
