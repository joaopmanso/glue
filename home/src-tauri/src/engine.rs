//! GLUE Home's library engine, native (crates/glue-engine, ADR 0153, 0154): the local link's `/rpc` from a GLUE tab here
//! is answered in Rust (edits, the feed, jobs, the analysis, where a dropped song or folder is), writing the GLUE folder
//! straight to disk; the analysis queue runs here too, and so do the shared sync (ADR 0155), the answers to other devices
//! (ADR 0156, through rtc.rs) and the account's signaling room with the sessions (ADR 0158: the room's socket is
//! signal.rs, the connections rtc.rs). The service page asks it things through `engine_cmd`. What the engine says goes
//! to the service page as events: `engine-event` (Activity), `engine-edited`, `engine-changed` (the status),
//! `engine-analysis` (the queue's state), `engine-background` (the background thumbnails' progress),
//! `engine-room` (online or not, and the sessions).
use glue_engine::library::Known;
use glue_engine::sync::CloudError;
use glue_engine::{Engine, Host};
use glue_store::json::Obj;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

pub struct App { app: AppHandle }

fn cfg(app: &AppHandle) -> Option<Value> { crate::get_config_impl(app.clone()) }

/// GLUE Cloud: the settings' `api`, or GLUE's.
fn api_of(c: &Value) -> String { c["api"].as_str().filter(|a| !a.is_empty()).unwrap_or(glue_engine::room::API).trim_end_matches('/').to_string() }
/// This GLUE Home's access token, when it was asked for, and for which credential.
static TOKEN: Mutex<Option<(String, std::time::Instant, String)>> = Mutex::new(None);
/// An access token (cloud.ts `access`): kept 40 minutes.
fn access(api: &str, c: &Value) -> Result<String, CloudError> {
  let (Some(device), Some(token)) = (c["deviceId"].as_str(), c["token"].as_str()) else { return Err(CloudError::new("GLUE Home isn’t connected to an account")) };
  let who = format!("{api}|{device}|{token}");
  if let Some((t, at, w)) = TOKEN.lock().unwrap().as_ref() { if *w == who && at.elapsed().as_secs() < 40 * 60 { return Ok(t.clone()); } }
  let r = ureq::post(&format!("{api}/v1/auth/device")).timeout(std::time::Duration::from_secs(30)).set("Content-Type", "application/json").send_string(&json!({ "deviceId": device, "token": token }).to_string());
  let parse = |r: ureq::Response| r.into_string().ok().and_then(|t| serde_json::from_str::<Value>(&t).ok());
  let v: Value = match r {
    Ok(r) => parse(r).ok_or_else(|| CloudError::new("GLUE Cloud answered strangely"))?,
    Err(ureq::Error::Status(code, r)) => {
      let why = parse(r).and_then(|j| j["error"].as_str().map(String::from)).unwrap_or_else(|| format!("GLUE Cloud said no ({code})"));
      return Err(CloudError { status: code, message: why });
    }
    Err(e) => return Err(CloudError::new(e.to_string())),
  };
  let t = v["access"].as_str().ok_or_else(|| CloudError::new("GLUE Cloud answered strangely"))?.to_string();
  *TOKEN.lock().unwrap() = Some((t.clone(), std::time::Instant::now(), who));
  Ok(t)
}

/// A single-use code that signs GLUE Home's own window in to the account as this computer (ADR 0159), when GLUE Home is
/// connected to one; asked as the window opens, so at most 5 s (none: the window opens signed out, as before).
pub fn window_code(app: &AppHandle) -> Option<String> {
  let c = cfg(app)?;
  let api = api_of(&c);
  let token = access(&api, &c).ok()?;
  let r = ureq::post(&format!("{api}/v1/auth/window-code")).timeout(std::time::Duration::from_secs(5))
    .set("Authorization", &format!("Bearer {token}")).set("Content-Type", "application/json").send_string("{}").ok()?;
  let v: Value = serde_json::from_str(&r.into_string().ok()?).ok()?;
  v["code"].as_str().map(String::from)
}

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
  fn background_changed(&self, progress: &Value) { let _ = self.app.emit_to("service", "engine-background", progress); }
  /// A cover service's answer (ADR 0086): only the addresses web.rs allows.
  fn web_get(&self, url: &str) -> Result<Vec<u8>, String> { crate::web::get(url, &self.version()) }
  /// The local link and its tokens (the full one, and the read-only one for a GLUE tab while GLUE Home is the engine).
  fn local_link(&self) -> Value { let c = self.config(); json!({ "port": crate::local::PORT.load(std::sync::atomic::Ordering::Relaxed), "token": c["localToken"], "readToken": c["readToken"] }) }
  fn serving(&self) -> bool { crate::rtc::busy() }
  fn access_token(&self) -> Result<String, CloudError> { let c = self.config(); access(&api_of(&c), &c) }
  fn open_socket(&self, url: &str) -> Result<Box<dyn glue_engine::room::Socket>, String> { crate::signal::open(url) }
  fn peers(&self) -> Option<Arc<dyn glue_engine::room::Peers>> { Some(Arc::new(crate::rtc::Conns(self.app.try_state::<crate::rtc::Rtc>()?.inner().clone()))) }
  fn room_changed(&self, room: &Value) { let _ = self.app.emit_to("service", "engine-room", room); }
  /// GLUE Cloud (the settings' `api`, or GLUE's), with this GLUE Home's access token: asked for with its credential
  /// (`/v1/auth/device`) and kept 40 minutes, as the service page did.
  fn cloud(&self, method: &str, path: &str, content_type: Option<&str>, body: Option<&str>) -> Result<String, CloudError> {
    let c = self.config();
    let api = api_of(&c);
    let token = access(&api, &c)?;
    let req = ureq::request(method, &format!("{api}{path}")).set("Authorization", &format!("Bearer {token}")).timeout(std::time::Duration::from_secs(60));
    let r = match (content_type, body) {
      (Some(t), Some(b)) => req.set("Content-Type", t).send_string(b),
      (None, Some(b)) => req.send_string(b),
      _ => req.call(),
    };
    match r {
      Ok(r) => r.into_string().map_err(|e| CloudError::new(e.to_string())),
      Err(ureq::Error::Status(code, _)) => { if code == 401 { *TOKEN.lock().unwrap() = None; } Err(CloudError { status: code, message: format!("GLUE Cloud: {code}") }) }
      Err(e) => Err(CloudError::new(e.to_string())),
    }
  }
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

/// The engine: its GLUE folder, whether the settings chose it, and the engine.
type Current = (PathBuf, bool, Arc<Engine<App>>);
static ENGINE: Mutex<Option<Current>> = Mutex::new(None);

/// The engine for the GLUE folder in the settings (a new one when it changes). With none chosen, it's over an empty
/// folder of GLUE Home's own: GLUE Home is still online in the account's room and takes songs sent to it, with no
/// library. The room moves to the new engine.
pub fn current(app: &AppHandle) -> Result<Arc<Engine<App>>, String> {
  let chosen = cfg(app).and_then(|c| c.get("glue").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(PathBuf::from));
  let glue = match &chosen { Some(g) => g.clone(), None => app.path().app_data_dir().map_err(|x| x.to_string())?.join("no-glue-folder") };
  let mut e = ENGINE.lock().unwrap();
  if let Some((at, _, en)) = e.as_ref() { if *at == glue { return Ok(en.clone()); } }
  if chosen.is_none() { std::fs::create_dir_all(&glue).map_err(|x| x.to_string())?; }
  let cache = app.path().app_cache_dir().map_err(|x| x.to_string())?.join("library");
  let en = Engine::new(glue.clone(), cache, App { app: app.clone() });
  if let Some((_, _, old)) = e.replace((glue, chosen.is_some(), en.clone())) {
    let new = en.clone();
    std::thread::spawn(move || { old.room_stop(); new.room_start(); });
  }
  Ok(en)
}
/// The engine over the GLUE folder the settings chose (a GLUE tab's requests, the library's answers).
pub fn engine(app: &AppHandle) -> Result<Arc<Engine<App>>, String> {
  let en = current(app)?;
  if !ENGINE.lock().unwrap().as_ref().is_some_and(|(_, chosen, e)| *chosen && Arc::ptr_eq(e, &en)) { return Err("No GLUE folder chosen in GLUE Home".into()); }
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
  tauri::async_runtime::spawn_blocking(move || {
    // The room, the sessions, songs received and which computer this is don't need a GLUE folder.
    let any = matches!(cmd["cmd"].as_str().unwrap_or(""), "roomStart" | "roomStop" | "roomDisconnect" | "roomState" | "learnComputer" | "attach" | "analyseWaiting");
    glue_engine::command(&if any { current(&app)? } else { engine(&app)? }, &cmd)
  }).await.map_err(|e| e.to_string())?
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
