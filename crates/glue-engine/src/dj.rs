//! DJ libraries followed live by GLUE Home (ADR 0167; the website's `djWatch`, ADR 0063, 0065): every few seconds each
//! library a collection knows the place of (a music folder, the GLUE folder, a library chosen with GLUE Home's dialog)
//! is looked at; one whose file is newer is read again here, in Rust (`glue_interop`), and brought in as GLUE Home's own
//! edit: its songs, the tree browsed in the sidebar, GLUE's copies of its playlists. Engine DJ writes its database as
//! you work: a save in progress (its journal isn't empty) waits for the next look. The page shows how each one is, and
//! asks for an import or a Refresh here.
use crate::{get, text, truthy, Engine, Host};
use glue_interop::merge::apply_import;
use glue_store::project::unknown_computer;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::time::{Duration, Instant};

/// Read again at most this often, however often it changes.
const AT_MOST: Duration = Duration::from_secs(10);

#[derive(Default)]
pub(crate) struct DjWatch { looking: bool, status: HashMap<String, &'static str>, last_read: HashMap<String, Instant>, warned: HashSet<String> }

const APPS: [(&str, &str); 6] = [("rekordbox", "rekordbox"), ("engine", "Engine DJ"), ("serato", "Serato"), ("traktor", "Traktor"), ("apple", "Apple Music"), ("m3u", "M3U")];
fn app_name(app: &str) -> &str { APPS.iter().find(|a| a.0 == app).map_or(app, |a| a.1) }

/// A library's files where they are now: the ones to read (with their names), when they last changed (ms), and the
/// main one (Engine DJ's journal is next to it).
struct Found { files: Vec<(String, PathBuf)>, modified: f64, main: PathBuf }

fn mtime(p: &std::path::Path) -> Option<f64> {
  let m = std::fs::metadata(p).ok()?.modified().ok()?;
  Some(m.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as f64)
}

impl<H: Host> Engine<H> {
  /// Where a library's place is on this computer: its music folder (as GLUE Home has it), the GLUE folder, or a folder
  /// chosen with GLUE Home's dialog (`hl:` and its path). A place only a browser can reach isn't GLUE Home's.
  pub fn dj_place(&self, place: &str, cfg: &Value) -> Option<PathBuf> {
    if place == "home" { return Some(self.glue()); }
    if let Some(p) = place.strip_prefix("hl:") { return Some(PathBuf::from(p)); }
    if place.starts_with("place:") { return None; }
    cfg["folders"][place].as_str().filter(|s| !s.is_empty()).map(PathBuf::from)
  }
  /// The library at a place and path, as it is now; None: not there (lost).
  fn dj_find(&self, app: &str, place: &str, rel: &str, cfg: &Value) -> Option<Found> {
    let mut at = self.dj_place(place, cfg)?;
    for part in rel.split('/').filter(|x| !x.is_empty()) { at.push(part); }
    if app == "serato" || at.is_dir() {
      // Serato: "database V2" and every crate (their dates only, until one is newer).
      let db = at.join("database V2");
      let mut files = vec![("database V2".to_string(), db.clone())];
      if let Ok(rd) = std::fs::read_dir(at.join("Subcrates")) {
        let mut crates: Vec<(String, PathBuf)> = rd.flatten().filter(|e| e.path().is_file()).map(|e| (e.file_name().to_string_lossy().into_owned(), e.path())).filter(|(n, _)| n.to_ascii_lowercase().ends_with(".crate")).collect();
        crates.sort();
        files.extend(crates);
      }
      let modified = files.iter().map(|f| mtime(&f.1)).collect::<Option<Vec<f64>>>()?.into_iter().fold(f64::NEG_INFINITY, f64::max);
      return Some(Found { files, modified, main: db });
    }
    let modified = mtime(&at)?;
    let name = at.file_name()?.to_string_lossy().into_owned();
    Some(Found { files: vec![(name, at.clone())], modified, main: at })
  }
  fn dj_set(&self, id: &str, st: &'static str) { self.dj.lock().unwrap().status.insert(id.to_string(), st); }

  /// The look, every few seconds (the service's timer): every collection's libraries GLUE Home can reach. Not while a
  /// tab is the writer (it follows them itself).
  pub fn dj_look(&self) {
    if self.host.lease_held() { return; }
    { let mut w = self.dj.lock().unwrap(); if w.looking { return; } w.looking = true; }
    let cfg = self.host.config();
    let computer = self.host.computer();
    let lib = self.describe().unwrap_or(Value::Null);
    for p in lib["profiles"].as_array().into_iter().flatten() { for col in p["collections"].as_array().into_iter().flatten() {
      let (pid, cid) = (text(p, "id"), text(col, "id"));
      let Some(meta) = self.read(&format!("profiles/{pid}/collections/{cid}/collection.json")) else { continue };
      if truthy(get(&meta, "movedTo")) || (truthy(get(&meta, "shared")) && unknown_computer(computer.as_deref())) { continue; }
      let Ok(s) = self.store(&pid, &cid) else { continue };
      let sources: Vec<Value> = { let st = s.lock().unwrap(); st.sources.values().filter(|x| st.own_source(x) && x.get("origin").is_some_and(Value::is_object)).cloned().collect() };
      for src in sources {
        if self.host.lease_held() { break; }
        if let Err(e) = self.dj_check(&pid, &cid, &src, false, &cfg) { self.dj_set(&text(&src, "id"), "lost"); eprintln!("GLUE Home: couldn’t look at {}: {e}", text(&src, "fileName")); }
      }
    } }
    self.dj.lock().unwrap().looking = false;
  }

  /// One library looked at, and read again when it changed (`force`: now, whatever its date). Ok(None): GLUE Home can't
  /// reach its file; Ok(Some(notice)): looked at (the notice the page shows, if any).
  fn dj_check(&self, p: &str, c: &str, src: &Value, force: bool, cfg: &Value) -> Result<Option<String>, String> {
    let id = text(src, "id");
    let origin = &src["origin"];
    let place = text(origin, "place");
    if self.dj_place(&place, cfg).is_none() { return Ok(None); }
    let Some(found) = self.dj_find(&text(src, "app"), &place, &text(origin, "relPath"), cfg) else { self.dj_set(&id, "lost"); return Ok(None) };
    self.dj_set(&id, "live");
    // Up to date, unless GLUE hasn't kept its tree yet (a library imported before ADR 0063).
    let known = origin["modified"].as_f64().unwrap_or(0.0);
    if !force && truthy(get(src, "tree")) && found.modified <= known + 1000.0 { return Ok(Some(String::new())); }
    if !force && self.dj.lock().unwrap().last_read.get(&id).is_some_and(|t| t.elapsed() < AT_MOST) { return Ok(Some(String::new())); }
    if text(src, "app") == "engine" {
      let mut j = found.main.clone().into_os_string();
      j.push("-journal");
      if std::fs::metadata(&j).is_ok_and(|m| m.len() > 0) { return Ok(Some(String::new())); }
    }
    self.dj.lock().unwrap().last_read.insert(id.clone(), Instant::now());
    self.dj_set(&id, "reading");
    let r = self.dj_read(p, c, src, &found, force);
    self.dj_set(&id, "live");
    r.map(Some)
  }
  /// `syncSource`: read again, and GLUE's songs, the library's tree and GLUE's copies of its playlists brought up to date.
  fn dj_read(&self, p: &str, c: &str, src: &Value, found: &Found, asked: bool) -> Result<String, String> {
    let files: Vec<(String, Vec<u8>)> = found.files.iter().map(|(n, path)| std::fs::read(path).map(|b| (n.clone(), b)).map_err(|e| e.to_string())).collect::<Result<_, _>>()?;
    let (libs, _) = glue_interop::parse_library_files(&files);
    let app = text(src, "app");
    let Some((lib, _)) = libs.into_iter().find(|l| l.0.app == app) else { return Ok(String::new()) };
    let id = text(src, "id");
    let s = self.store(p, c)?;
    let mut st = s.lock().unwrap();
    if self.host.lease_held() || !st.sources.contains_key(&id) { return Ok(String::new()); }
    let rep = apply_import(&mut st, lib, &text(src, "fileName"));
    let l = &rep.linked_lists;
    // It looked incomplete (ADR 0090): ignored, and read again at the next look (it isn't marked as read).
    if l.incomplete {
      let first = self.dj.lock().unwrap().warned.insert(id.clone());
      let say = format!("{}’s library looks incomplete right now ({} playlists or folders): GLUE kept its copies and will read it again.", app_name(&app), rep.lists);
      if first { self.event(&say); }
      return Ok(if asked || first { say } else { String::new() });
    }
    self.dj.lock().unwrap().warned.remove(&id);
    if let Some(cur) = st.sources.get(&rep.source_id).cloned() {
      let mut origin = cur["origin"].as_object().cloned().unwrap_or_default();
      origin.insert("modified".into(), json!(found.modified));
      let mut next = cur.as_object().cloned().unwrap_or_default();
      next.insert("origin".into(), Value::Object(origin));
      st.put_source(Value::Object(next));
    }
    self.flush_edit(&mut st, p, c)?;
    drop(st);
    if let Some(e) = self.arc() { e.analysis_stale(); }
    let what: Vec<String> = [(l.updated, "updated"), (l.added, "new"), (l.removed, "gone")].iter().filter(|x| x.0 > 0).map(|x| format!("{} {}", x.0, x.1)).collect();
    let say = if !what.is_empty() { format!("{} changed its playlists: in GLUE {}.", app_name(&app), what.join(", ")) }
      else if asked { format!("{} read again: {} tracks, {} playlists or folders; GLUE’s copies were up to date.", app_name(&app), rep.tracks, rep.lists) } else { String::new() };
    if !what.is_empty() { self.event(&say); }
    Ok(say)
  }

  /// The DJ libraries in a collection's music folders and the GLUE folder (`djFind`; the website's `findLibraries`,
  /// ADR 0030): a shallow look where they live, not a full scan.
  pub fn dj_find_all(&self, p: &str, c: &str) -> Result<Value, String> {
    let cfg = self.host.config();
    let roots: Vec<Value> = self.store(p, c)?.lock().unwrap().meta["roots"].as_array().cloned().unwrap_or_default();
    let mut out = vec![];
    let mut at = |place: &str, name: &str, dir: PathBuf, depth: usize| {
      for (kind, rel, modified, size) in find_libraries(&dir, depth) {
        out.push(json!({ "kind": kind, "relPath": rel, "place": place, "placeName": name, "modified": modified, "size": size }));
      }
    };
    for r in &roots { if let Some(dir) = self.dj_place(&text(r, "id"), &cfg) { at(&text(r, "id"), &text(r, "name"), dir, 3); } }
    let glue = self.glue();
    at("home", &glue.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), glue.clone(), 2);
    Ok(Value::Array(out))
  }

  /// How each library GLUE Home follows is, for the page (`dj`): 'live', 'lost' or 'reading'.
  pub fn dj_status(&self, p: &str, c: &str) -> Value {
    let Ok(s) = self.store(p, c) else { return json!({}) };
    let ids: Vec<String> = s.lock().unwrap().sources.keys().cloned().collect();
    let w = self.dj.lock().unwrap();
    json!(ids.iter().filter_map(|id| w.status.get(id).map(|st| (id.clone(), json!(st)))).collect::<serde_json::Map<_, _>>())
  }
  /// Refresh, asked for in the page (`djRefresh`): read now. False: GLUE Home can't reach its file.
  pub fn dj_refresh(&self, p: &str, c: &str, id: &str) -> Result<Value, String> {
    let src = self.store(p, c)?.lock().unwrap().sources.get(id).cloned().ok_or("That library isn’t in the collection.")?;
    if !src.get("origin").is_some_and(Value::is_object) { return Ok(json!({ "ok": false })); }
    match self.dj_check(p, c, &src, true, &self.host.config())? { Some(say) => Ok(json!({ "ok": true, "notice": say })), None => Ok(json!({ "ok": false })) }
  }
  /// A library imported from where it is (`djImport`, the page's `importDetected`): read here, brought in, and followed
  /// from then on. An Engine DJ set's databases (`also`) are read together: one library. What each import did.
  pub fn dj_import(&self, p: &str, c: &str, place: &str, rel: &str, also: &[(String, String)]) -> Result<Value, String> {
    let cfg = self.host.config();
    let found = self.dj_find("", place, rel, &cfg).ok_or("GLUE Home can’t reach that library.")?;
    let mut files: Vec<(String, Vec<u8>)> = vec![];
    for (n, path) in &found.files { files.push((n.clone(), std::fs::read(path).map_err(|e| e.to_string())?)); }
    for (pl, r) in also { if let Some(f) = self.dj_find("", pl, r, &cfg) { for (n, path) in f.files { files.push((n, std::fs::read(&path).map_err(|e| e.to_string())?)); } } }
    let (libs, skipped) = glue_interop::parse_library_files(&files);
    if libs.is_empty() { return Err(if skipped.is_empty() { "not recognised".into() } else { skipped.join(", ") }); }
    let s = self.store(p, c)?;
    let mut st = s.lock().unwrap();
    let mut out = vec![];
    for (lib, file_name) in libs {
      let (name, app) = (lib.name.clone(), lib.app);
      let rep = apply_import(&mut st, lib, &file_name);
      // An Engine DJ set keeps following the database it follows (the computer's own).
      if let Some(cur) = st.sources.get(&rep.source_id).cloned() {
        let had = cur.get("origin").filter(|o| o.is_object());
        if !(had.is_some() && app == "engine" && had.is_some_and(|h| text(h, "place") != place || text(h, "relPath") != rel)) {
          let mut next = cur.as_object().cloned().unwrap_or_default();
          next.insert("origin".into(), json!({ "place": place, "relPath": rel, "modified": found.modified }));
          st.put_source(Value::Object(next));
          self.dj_set(&rep.source_id, "live");
        }
      }
      out.push(json!({ "name": name, "report": rep.to_json() }));
    }
    let paths = self.flush(&mut st, p, c)?;
    if !paths.is_empty() { self.edited(p, c, &paths); }
    drop(st);
    if let Some(e) = self.arc() { e.analysis_stale(); }
    // The files written, for the page to read at once (the feed brings them a moment later).
    Ok(json!({ "imports": out, "skipped": skipped, "paths": paths }))
  }
}

/// Folders not looked into (`SKIP`): hidden ones, the system's, GLUE's own.
fn skipped(name: &str) -> bool {
  let l = name.to_ascii_lowercase();
  name.starts_with('.') || ["$recycle.bin", "system volume information", "node_modules", "profiles", "files", "cache", "stems", "previews", "windows"].contains(&l.as_str())
    || l.starts_with("program files")
}
/// A look into a huge folder stays quick.
const MAX_DIRS: usize = 4000;

/// The DJ libraries under a folder (`findLibraries`): Engine DJ's `Engine Library/Database2/m.db`, Serato's `_Serato_`
/// (with its "database V2"), Traktor's collection.nml, and two folders deep an exported rekordbox XML or an Apple Music
/// library XML (by their first bytes). (kind, path in the folder, date in ms, size.)
pub fn find_libraries(root: &std::path::Path, max_depth: usize) -> Vec<(&'static str, String, f64, u64)> {
  let mut out = vec![];
  let mut dirs = 0;
  fn meta(p: &std::path::Path) -> Option<(f64, u64)> { let m = std::fs::metadata(p).ok()?; Some((mtime(p)?, m.len())) }
  fn walk(dir: &std::path::Path, prefix: &str, depth: usize, max: usize, dirs: &mut usize, out: &mut Vec<(&'static str, String, f64, u64)>) {
    *dirs += 1;
    if *dirs > MAX_DIRS { return; }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
      let name = e.file_name().to_string_lossy().into_owned();
      let rel = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
      let path = e.path();
      let Ok(ft) = e.file_type() else { continue };
      if ft.is_dir() {
        if name == "Engine Library" {
          let db = path.join("Database2").join("m.db");
          if let Some((m, s)) = db.is_file().then(|| meta(&db)).flatten() { out.push(("engine", format!("{rel}/Database2/m.db"), m, s)); }
          continue;
        }
        if name == "_Serato_" {
          let db = path.join("database V2");
          if let Some((m, s)) = db.is_file().then(|| meta(&db)).flatten() { out.push(("serato", rel, m, s)); }
          continue;
        }
        if depth < max && !skipped(&name) { walk(&path, &rel, depth + 1, max, dirs, out); }
        continue;
      }
      let lower = name.to_lowercase();
      if lower == "collection.nml" { if let Some((m, s)) = meta(&path) { out.push(("traktor", rel, m, s)); } }
      else if lower.ends_with(".xml") && depth <= 2 {
        let Some((m, s)) = meta(&path) else { continue };
        if s < 200 { continue; }
        let mut head = vec![0u8; 600];
        let n = std::fs::File::open(&path).and_then(|mut f| std::io::Read::read(&mut f, &mut head)).unwrap_or(0);
        let text = glue_interop::types::utf8(&head[..n]);
        if glue_interop::rekordbox::is_rekordbox_xml(&text) { out.push(("rekordbox", rel, m, s)); }
        else if glue_interop::apple::is_apple_library(&text) && lower.contains("library") { out.push(("apple", rel, m, s)); }
      }
    }
  }
  walk(root, "", 0, max_depth, &mut dirs, &mut out);
  out
}
