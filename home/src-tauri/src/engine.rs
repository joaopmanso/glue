//! GLUE Home's library engine, native (crates/glue-engine, ADR 0153): the local link's `/rpc` from a GLUE tab here is
//! answered in Rust (hello, wait, open, status, edit, restamp, job), writing the GLUE folder straight to disk. The
//! analysis queue and the shared sync, still in the service page until the plan's E3 and E4, use the same stores
//! through `engine_cmd`. What the engine says goes to the service page as events: `engine-event` (Activity),
//! `engine-edited` (the sync sends it up), `engine-added` (the analysis looks), `engine-changed` (the status).
use glue_engine::{Engine, Host};
use glue_store::json::Obj;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Listener, Manager};

pub struct App { app: AppHandle }

/// The analysis queue's state, as the service page last said it (for `status`).
static ANALYSIS: Mutex<Option<Value>> = Mutex::new(None);

fn cfg(app: &AppHandle) -> Option<Value> { crate::get_config_impl(app.clone()) }

impl Host for App {
  fn lease_held(&self) -> bool { crate::local::leased() }
  fn running(&self) -> bool { cfg(&self.app).and_then(|c| c.get("running").and_then(|v| v.as_bool())) != Some(false) }
  fn computer(&self) -> Option<String> { cfg(&self.app).and_then(|c| c.get("computer").and_then(|v| v.as_str()).map(String::from)) }
  fn version(&self) -> String { self.app.package_info().version.to_string() }
  fn analysis_state(&self) -> Value { ANALYSIS.lock().unwrap().clone().unwrap_or(Value::Null) }
  fn event(&self, text: &str) { let _ = self.app.emit_to("service", "engine-event", text); }
  fn edited(&self, p: &str, c: &str, paths: &[String]) { let _ = self.app.emit_to("service", "engine-edited", json!({ "p": p, "c": c, "paths": paths })); }
  fn changed(&self) { let _ = self.app.emit_to("service", "engine-changed", ()); }
  fn added(&self) { let _ = self.app.emit_to("service", "engine-added", ()); }
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

/// A GLUE tab's request (`/rpc`): the engine's answer, or None when it's the analysis queue's (the service page's).
pub fn rpc(app: &AppHandle, body: &str) -> Option<String> {
  let b: Value = serde_json::from_str(body).ok()?;
  let e = match engine(app) {
    Ok(e) => e,
    Err(err) => return matches!(b["op"].as_str(), Some("hello" | "wait" | "open" | "status" | "edit" | "restamp" | "job")).then(|| json!({ "error": err }).to_string()),
  };
  let r = e.rpc(&b)?;
  Some(match r { Ok(v) => v.to_string(), Err(err) => json!({ "error": err }).to_string() })
}

/// What the service page asks of the engine (`glue_engine::command`).
#[tauri::command]
pub async fn engine_cmd(app: AppHandle, cmd: Value) -> Result<Value, String> {
  tauri::async_runtime::spawn_blocking(move || glue_engine::command(&engine(&app)?, &cmd)).await.map_err(|e| e.to_string())?
}

/// Started with GLUE Home: the analysis state kept from the service page's status, and every 10 s the jobs carried on
/// (or, while a GLUE tab from before the engine holds the lease, the stores let go: nothing kept here goes stale).
pub fn start(app: &AppHandle) {
  app.listen_any("status", |e| {
    if let Ok(v) = serde_json::from_str::<Value>(e.payload()) { if let Some(a) = v.get("analysing") { *ANALYSIS.lock().unwrap() = Some(a.clone()); } }
  });
  let app = app.clone();
  std::thread::spawn(move || loop {
    std::thread::sleep(std::time::Duration::from_secs(10));
    if let Ok(e) = engine(&app) { if crate::local::leased() { e.forget(); } else { e.run_jobs(); } }
  });
}
