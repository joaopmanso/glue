//! GLUE Home's library engine, native (crates/glue-engine, ADR 0153, 0154): the local link's `/rpc` from a GLUE tab here
//! is answered in Rust (edits, the feed, jobs, the analysis, where a dropped song or folder is), writing the GLUE folder
//! straight to disk; the analysis queue runs here too. The shared sync and the answers to other devices, still in the
//! service page until the plan's E4, use it through `engine_cmd`. What the engine says goes to the service page as
//! events: `engine-event` (Activity), `engine-edited` (the sync sends it up), `engine-changed` (the status),
//! `engine-analysis` (the queue's state), `engine-made` (a song's parts made: the sessions are told).
use glue_engine::library::Known;
use glue_engine::{Engine, Host};
use glue_store::json::Obj;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

pub struct App { app: AppHandle }

fn cfg(app: &AppHandle) -> Option<Value> { crate::get_config_impl(app.clone()) }

impl Host for App {
  fn lease_held(&self) -> bool { crate::local::leased() }
  fn config(&self) -> Value { cfg(&self.app).unwrap_or_else(|| json!({})) }
  /// Read, changed and saved under one lock (the engine's own changes don't cross); the windows are told.
  fn patch_config(&self, f: &dyn Fn(&Value) -> Option<Value>) -> Option<Value> {
    static SAVING: Mutex<()> = Mutex::new(());
    let _g = SAVING.lock().unwrap();
    let mut cur = self.config();
    let patch = f(&cur)?;
    for (k, v) in patch.as_object()? { cur[k] = v.clone(); }
    crate::set_config_impl(self.app.clone(), cur.clone()).ok()?;
    Some(cur)
  }
  fn version(&self) -> String { self.app.package_info().version.to_string() }
  fn known_folders(&self) -> Known { Known::from_json(&crate::known_folders(self.app.clone())) }
  /// Every drive (Windows) or volume (macOS), to search for a music folder or a dropped song.
  fn drives(&self) -> Vec<PathBuf> {
    #[allow(unused_mut)]
    let mut out = vec![];
    #[cfg(windows)]
    for d in b'C'..=b'Z' { let r = PathBuf::from(format!("{}:\\", d as char)); if r.exists() { out.push(r); } }
    #[cfg(target_os = "macos")]
    if let Ok(v) = std::fs::read_dir("/Volumes") { out.extend(v.flatten().map(|e| e.path())); }
    out
  }
  fn incoming_dir(&self) -> PathBuf { crate::incoming_dir(&self.app) }
  /// Only files in the folders GLUE Home may use, giving way to songs being played (ADR 0138).
  fn read_song(&self, path: &Path, name: &str) -> Result<Vec<u8>, String> {
    let file = crate::allowed(&self.app, &path.to_string_lossy())?;
    crate::analysis::read_song(&file, name)
  }
  fn foreground_at(&self) -> f64 { crate::local::FOREGROUND_AT.load(std::sync::atomic::Ordering::Relaxed) as f64 }
  fn event(&self, text: &str) { let _ = self.app.emit_to("service", "engine-event", text); }
  fn edited(&self, p: &str, c: &str, paths: &[String]) { let _ = self.app.emit_to("service", "engine-edited", json!({ "p": p, "c": c, "paths": paths })); }
  fn changed(&self) { let _ = self.app.emit_to("service", "engine-changed", ()); }
  fn analysis_changed(&self, state: &Value) { let _ = self.app.emit_to("service", "engine-analysis", state); }
  fn made(&self, p: &str, c: &str, id: &str) { let _ = self.app.emit_to("service", "engine-made", json!({ "p": p, "c": c, "id": id })); }
  /// Into the song's file (ADR 0071), in the music folder it's in (or the incoming folder), as `/fs/tags` writes.
  fn write_tags(&self, root_id: &str, rel_path: &str, tags: &Obj) -> Result<(f64, f64), String> {
    let root = folder(&self.app, root_id).ok_or("GLUE Home doesn’t know this song’s music folder")?;
    let target = root.join(rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    if rel_path.split('/').any(|p| p == ".." || p.is_empty()) { return Err("bad path".into()); }
    let (size, mtime) = crate::tags::write_tags(&target, tags)?;
    Ok((size as f64, mtime as f64))
  }
  /// A music folder that isn't reachable (a network folder not connected): its songs wait for it.
  fn reachable(&self, root_id: &str) -> bool {
    match folder(&self.app, root_id) { None => true, Some(p) => std::fs::read_dir(p).map(|mut d| d.next().is_some()).unwrap_or(false) }
  }
}

/// Where a music folder is on this computer: the settings' (GLUE Home found or was told), or the incoming folder.
fn folder(app: &AppHandle, root_id: &str) -> Option<PathBuf> {
  if root_id == "incoming" { return Some(crate::incoming_dir(app)); }
  cfg(app)?.get("folders")?.get(root_id)?.as_str().map(PathBuf::from)
}

static ENGINE: Mutex<Option<(PathBuf, Arc<Engine<App>>)>> = Mutex::new(None);

/// The engine for the GLUE folder in the settings (a new one when it changes).
pub fn engine(app: &AppHandle) -> Result<Arc<Engine<App>>, String> {
  let glue = cfg(app).and_then(|c| c.get("glue").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(PathBuf::from)).ok_or("No GLUE folder chosen in GLUE Home")?;
  let mut e = ENGINE.lock().unwrap();
  if let Some((at, en)) = e.as_ref() { if *at == glue { return Ok(en.clone()); } }
  let cache = app.path().app_cache_dir().map_err(|x| x.to_string())?.join("library");
  let en = Engine::new(glue.clone(), cache, App { app: app.clone() });
  *e = Some((glue, en.clone()));
  Ok(en)
}

/// A GLUE tab's request (`/rpc`): the engine's answer (`{error}` when it couldn't).
pub fn rpc(app: &AppHandle, body: &str) -> String {
  let r = serde_json::from_str::<Value>(body).map_err(|e| e.to_string()).and_then(|b| engine(app)?.rpc(&b));
  match r { Ok(v) => v.to_string(), Err(err) => json!({ "error": err }).to_string() }
}

/// What the service page asks of the engine (`glue_engine::command`).
#[tauri::command]
pub async fn engine_cmd(app: AppHandle, cmd: Value) -> Result<Value, String> {
  tauri::async_runtime::spawn_blocking(move || glue_engine::command(&engine(&app)?, &cmd)).await.map_err(|e| e.to_string())?
}

/// Started with GLUE Home: the analysis (20 s after starting, then every minute, ADR 0103), and every 10 s the jobs
/// carried on (or, while a GLUE tab from before the engine holds the lease, the stores let go: nothing kept here goes
/// stale).
pub fn start(app: &AppHandle) {
  if let Ok(e) = engine(app) { e.start_analysis(std::time::Duration::from_secs(20), std::time::Duration::from_secs(60)); }
  let app = app.clone();
  std::thread::spawn(move || loop {
    std::thread::sleep(std::time::Duration::from_secs(10));
    if let Ok(e) = engine(&app) { if crate::local::leased() { e.forget(); } else { e.run_jobs(); } }
  });
}
