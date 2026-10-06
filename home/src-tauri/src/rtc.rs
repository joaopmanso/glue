//! The connections to the account's other devices, native (crates/glue-rtc, ADR 0150): every connection, channel and
//! song byte. The engine holds the room and the sessions (ADR 0158): it opens and closes them through `Conns` (its
//! `Peers`), and hears what they found and did (candidates, states, activity, songs received) on one thread of their
//! own, in order. The library's questions are answered by the engine too (ADR 0156: `answer`). To the service page:
//! `rtc-receiving` and `rtc-served` (the settings window's).
use glue_engine::answers::Answer;
use glue_rtc::{Arriving, Host, IceCandidate, IceServer, ReadSeek, Server, Song};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

pub struct App { app: AppHandle, arriving: Mutex<HashMap<u64, (PathBuf, PathBuf)>>, next: Mutex<u64>, to_engine: Mutex<mpsc::Sender<(String, Value)>> }

/// A song file read for another device: each read marks it as being played, so the analysis gives way (ADR 0138).
struct Playing(fs::File);
impl Read for Playing { fn read(&mut self, b: &mut [u8]) -> std::io::Result<usize> { crate::local::mark_playing(); self.0.read(b) } }
impl Seek for Playing { fn seek(&mut self, p: SeekFrom) -> std::io::Result<u64> { self.0.seek(p) } }

/// Requests being answered now, and whether a song is arriving: GLUE Home is busy for another device (the background
/// thumbnails wait, and so do updates).
static SERVING: AtomicUsize = AtomicUsize::new(0);
static RECEIVING: AtomicBool = AtomicBool::new(false);
pub fn busy() -> bool { SERVING.load(Ordering::Relaxed) > 0 || RECEIVING.load(Ordering::Relaxed) }

/// A request the connection doesn't answer itself, answered by the engine on a thread of its own (a slow one, an
/// analysis, doesn't hold up the others), and counted for the settings window (`rtc-served`, ADR 0083).
fn answer(app: &AppHandle, r: Value) {
  let app = app.clone();
  SERVING.fetch_add(1, Ordering::Relaxed);
  std::thread::spawn(move || {
    let t0 = std::time::Instant::now();
    let (conn, chan, n) = (r["conn"].as_str().unwrap_or("").to_string(), r["chan"].as_u64().unwrap_or(0) as u32, r["n"].as_u64().unwrap_or(0) as u32);
    let rtc = app.state::<Rtc>().inner().clone();
    let res = crate::engine::engine(&app).and_then(|e| e.answer(&r["req"]));
    let sent = tauri::async_runtime::block_on(async {
      match res {
        Ok(Answer::Data { data, bytes, tell }) => {
          let r = rtc.reply(&conn, chan, n, data, &bytes, json!({})).await.map(|_| bytes.len() as u64);
          if let Some(m) = tell { rtc.tell(m).await; }
          r
        }
        Ok(Answer::File { path, range, name, typ }) => rtc.send_file(&conn, chan, n, &Song { path, range, name, typ }).await,
        Err(e) => rtc.error(&conn, chan, n, &e).await.map(|_| 0),
      }
    }).unwrap_or(0);
    SERVING.fetch_sub(1, Ordering::Relaxed);
    let _ = app.emit_to("service", "rtc-served", json!({ "what": r["req"]["t"], "ms": t0.elapsed().as_secs_f64() * 1000.0, "bytes": sent }));
  });
}

impl Host for App {
  fn event(&self, name: &str, payload: Value) {
    if name == "rtc-request" { return answer(&self.app, payload); }
    if name == "rtc-receiving" { RECEIVING.store(!payload.is_null(), Ordering::Relaxed); }
    if matches!(name, "rtc-ice" | "rtc-state" | "rtc-activity" | "rtc-received") { let _ = self.to_engine.lock().unwrap().send((name.into(), payload)); return; }
    let _ = self.app.emit_to("service", name, payload);
  }
  fn cache_read(&self, key: &str) -> Option<Vec<u8>> { crate::cache_path(&self.app, key).ok().and_then(|p| fs::read(p).ok()) }
  fn cache_put(&self, key: &str, data: &[u8]) -> Result<(), String> { crate::cache_put(&self.app, key, data) }
  fn open_song(&self, path: &str) -> Result<(Box<dyn ReadSeek>, u64), String> {
    let p = crate::allowed(&self.app, path)?;
    let f = fs::File::open(&p).map_err(|e| e.to_string())?;
    let n = f.metadata().map_err(|e| e.to_string())?.len();
    Ok((Box::new(Playing(f)), n))
  }
  fn incoming_begin(&self, name: &str) -> Result<Arriving, String> {
    let (f, part, fin, name) = crate::incoming_part(&self.app, name)?;
    let mut next = self.next.lock().unwrap();
    *next += 1;
    self.arriving.lock().unwrap().insert(*next, (part, fin));
    Ok(Arriving { name, file: Box::new(f), token: *next })
  }
  fn incoming_end(&self, token: u64, ok: bool) -> Result<String, String> {
    let (part, fin) = self.arriving.lock().unwrap().remove(&token).ok_or("unknown transfer")?;
    if !ok { let _ = fs::remove_file(&part); return Ok(String::new()); }
    fs::rename(&part, &fin).map_err(|e| e.to_string())?;
    Ok(fin.to_string_lossy().into_owned())
  }
}

pub type Rtc = Arc<Server<App>>;
pub fn new(app: &AppHandle) -> Rtc {
  let (tx, rx) = mpsc::channel::<(String, Value)>();
  let a = app.clone();
  // What the connections say, to the engine, in the order they said it (a state after the one before it).
  std::thread::Builder::new().name("glue-rtc-events".into()).spawn(move || for (name, v) in rx {
    let Ok(e) = crate::engine::current(&a) else { continue };
    let t = |k: &str| v[k].as_str().unwrap_or("").to_string();
    match name.as_str() {
      "rtc-ice" => e.peer_ice(&t("id"), v["candidate"].clone()),
      "rtc-state" => e.peer_state(&t("id"), &t("state")),
      "rtc-activity" => e.peer_activity(&t("id"), v["calls"].as_u64().unwrap_or(0), v["last"].as_f64().unwrap_or(0.0) as i64),
      _ => e.received(&t("name"), &t("path"), v["size"].as_u64().unwrap_or(0)),
    }
  }).ok();
  Server::new(App { app: app.clone(), arriving: Mutex::new(HashMap::new()), next: Mutex::new(0), to_engine: Mutex::new(tx) })
}

/// The engine's hold on the connections (its `Peers`): called from its own threads, never the connections' runtime.
pub struct Conns(pub Rtc);
impl glue_engine::room::Peers for Conns {
  /// `servers`: STUN/TURN as the website names them (src/core/ice.ts: `urls` a string or a list).
  fn answer(&self, id: &str, sdp: &str, servers: &[Value], hello: Value) -> Result<String, String> {
    let text = |v: &Value| v.as_str().unwrap_or("").to_string();
    let servers = servers.iter().map(|s| IceServer {
      urls: match &s["urls"] { Value::String(u) => vec![u.clone()], Value::Array(a) => a.iter().filter_map(|u| u.as_str().map(String::from)).collect(), _ => vec![] },
      username: text(&s["username"]), credential: text(&s["credential"]),
    }).collect();
    tauri::async_runtime::block_on(self.0.answer(id, sdp, servers, hello))
  }
  fn add_ice(&self, id: &str, c: Option<Value>) {
    let c = c.and_then(|c| serde_json::from_value::<IceCandidate>(c).ok());
    let _ = tauri::async_runtime::block_on(self.0.add_ice(id, c));
  }
  fn close(&self, id: &str) { tauri::async_runtime::block_on(self.0.close(id)) }
  fn tell(&self, msg: Value) { tauri::async_runtime::block_on(self.0.tell(msg)) }
}

/// Is GLUE Home sending or receiving for another device now? (Updates wait.)
#[tauri::command]
pub fn rtc_busy() -> bool { busy() }
