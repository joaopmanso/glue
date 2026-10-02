//! The connections to the account's other devices, native (crates/glue-rtc, ADR 0150). The service page keeps the
//! signaling (one socket per device) and the sessions' rules (who's admitted, Disconnect), and answers the library's
//! questions; every connection, channel and song byte is here. Events go to the service page: `rtc-ice`,
//! `rtc-state`, `rtc-request`, `rtc-receiving`, `rtc-received`, `rtc-served`, `rtc-activity`.
use glue_rtc::{Arriving, Host, IceCandidate, IceServer, ReadSeek, Server, Song};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct App { app: AppHandle, arriving: Mutex<HashMap<u64, (PathBuf, PathBuf)>>, next: Mutex<u64> }

/// A song file read for another device: each read marks it as being played, so the analysis gives way (ADR 0138).
struct Playing(fs::File);
impl Read for Playing { fn read(&mut self, b: &mut [u8]) -> std::io::Result<usize> { crate::local::mark_playing(); self.0.read(b) } }
impl Seek for Playing { fn seek(&mut self, p: SeekFrom) -> std::io::Result<u64> { self.0.seek(p) } }

impl Host for App {
  fn event(&self, name: &str, payload: Value) { let _ = self.app.emit_to("service", name, payload); }
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
pub fn new(app: &AppHandle) -> Rtc { Server::new(App { app: app.clone(), arriving: Mutex::new(HashMap::new()), next: Mutex::new(0) }) }

/// An offer from another device's tab (`id`: its handshake's): the answer. `servers`: STUN/TURN as the website names
/// them (src/core/ice.ts: `urls` a string or a list); `hello`: `{ version, max, name }`.
#[tauri::command]
pub async fn rtc_answer(rtc: State<'_, Rtc>, id: String, sdp: String, servers: Vec<Value>, hello: Value) -> Result<String, String> {
  let text = |v: &Value| v.as_str().unwrap_or("").to_string();
  let servers = servers.iter().map(|s| IceServer {
    urls: match &s["urls"] { Value::String(u) => vec![u.clone()], Value::Array(a) => a.iter().filter_map(|u| u.as_str().map(String::from)).collect(), _ => vec![] },
    username: text(&s["username"]), credential: text(&s["credential"]),
  }).collect();
  rtc.answer(&id, &sdp, servers, hello).await
}

#[tauri::command]
pub async fn rtc_ice(rtc: State<'_, Rtc>, id: String, candidate: Option<IceCandidate>) -> Result<(), String> { rtc.add_ice(&id, candidate).await }

#[tauri::command]
pub async fn rtc_close(rtc: State<'_, Rtc>, id: String) -> Result<(), String> { rtc.close(&id).await; Ok(()) }

/// An answer to a request (`rtc-request`): its data, and its bytes as the body (`x-reply`: `{ conn, chan, n, data, extra }`).
#[tauri::command]
pub async fn rtc_reply(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
  let head: Value = request.headers().get("x-reply").and_then(|v| v.to_str().ok()).and_then(|s| serde_json::from_str(s).ok()).ok_or("no reply")?;
  let bytes = match request.body() { tauri::ipc::InvokeBody::Raw(b) => b.clone(), _ => vec![] };
  let rtc = app.state::<Rtc>().inner().clone();
  rtc.reply(head["conn"].as_str().unwrap_or(""), head["chan"].as_u64().unwrap_or(0) as u32, head["n"].as_u64().unwrap_or(0) as u32, head["data"].clone(), &bytes, head["extra"].clone()).await
}

/// A song's file (or part of it) sent from disk: the bytes sent.
#[tauri::command]
pub async fn rtc_send_file(rtc: State<'_, Rtc>, conn: String, chan: u32, n: u32, song: Song) -> Result<u64, String> { rtc.send_file(&conn, chan, n, &song).await }

#[tauri::command]
pub async fn rtc_error(rtc: State<'_, Rtc>, conn: String, chan: u32, n: u32, error: String) -> Result<(), String> { rtc.error(&conn, chan, n, &error).await }

/// Said on every session (`made`, `incoming`).
#[tauri::command]
pub async fn rtc_tell(rtc: State<'_, Rtc>, msg: Value) -> Result<(), String> { rtc.tell(msg).await; Ok(()) }
