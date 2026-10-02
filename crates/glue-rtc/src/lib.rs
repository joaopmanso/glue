//! GLUE Home's connections to the account's other devices, in Rust (ADR 0150): the WebRTC peer connections and their
//! data channels, speaking the website's protocol (src/core/transfer.ts) byte for byte.
//! - **'stream' channels** (ADR 0045–0047, 0133): pings, `put` uploads and `cache` files are answered here, and a
//!   song's bytes (`get`, `range`, `get-incoming`) are read from disk here; every other request goes to the app
//!   (`Host::event("rtc-request")`), which answers with [`Server::reply`], [`Server::send_file`] or [`Server::error`].
//! - **any other channel** takes songs sent to this computer into its incoming folder (ADR 0044).
//! - The signaling stays the app's (one socket per device): it hands offers and candidates in ([`Server::answer`],
//!   [`Server::add_ice`]) and sends the candidates this side finds (`rtc-ice` events).
//!
//! No Tauri here: the app is a [`Host`], so the protocol is tested on its own (tests/, and `examples/probe.rs` against
//! a real browser).
use bytes::BytesMut;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use webrtc::data_channel::{DataChannel, DataChannelEvent};
use webrtc::peer_connection::{
  PeerConnection, PeerConnectionBuilder, PeerConnectionEventHandler, RTCConfigurationBuilder, RTCIceCandidateInit, RTCIceGatheringState, RTCIceServer,
  RTCPeerConnectionIceEvent, RTCPeerConnectionState, RTCSessionDescription,
};

/// Bytes per data-channel message (transfer.ts `CHUNK`).
pub const CHUNK: usize = 64 * 1024;
/// At most this much queued on a channel before sending waits (transfer.ts `HIGH_WATER`).
pub const HIGH_WATER: usize = 4 * 1024 * 1024;
/// The largest song taken (transfer.ts `MAX_FILE`).
pub const MAX_FILE: u64 = 4 * 1024 * 1024 * 1024;
/// A part of a song asked for (`range`) is at most this long.
pub const MAX_RANGE: u64 = 8 * 1024 * 1024;
/// The waveform's size (src/core/library/thumb.ts `WAVE_BYTES`).
pub const WAVE_BYTES: usize = 192 * 4;

/// A file that can be read in place.
pub trait ReadSeek: Read + Seek + Send {}
impl<T: Read + Seek + Send> ReadSeek for T {}

/// A song arriving, being written (a `.part` file until it's complete).
pub struct Arriving { pub name: String, pub file: Box<dyn std::io::Write + Send>, pub token: u64 }

/// What the app does for the connections.
pub trait Host: Send + Sync + 'static {
  /// Something for the app (`rtc-ice`, `rtc-state`, `rtc-request`, `rtc-receiving`, `rtc-received`, `rtc-served`,
  /// `rtc-activity`).
  fn event(&self, name: &str, payload: Value);
  /// A file of GLUE Home's cache (None: not there, or a key it refuses).
  fn cache_read(&self, key: &str) -> Option<Vec<u8>>;
  fn cache_put(&self, key: &str, data: &[u8]) -> Result<(), String>;
  /// A song file to send, opened for reading (paced as a song being played: the analysis gives way).
  fn open_song(&self, path: &str) -> Result<(Box<dyn ReadSeek>, u64), String>;
  /// A song starts arriving: its file in the incoming folder, under a name that isn't taken.
  fn incoming_begin(&self, name: &str) -> Result<Arriving, String>;
  /// It's complete (its real name; the path) or not (gone).
  fn incoming_end(&self, token: u64, ok: bool) -> Result<String, String>;
}

fn now_ms() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }

/// A binary message on a stream channel: the request's number (4 bytes, little endian), then the bytes.
pub fn frame(n: u32, payload: &[u8]) -> BytesMut {
  let mut b = BytesMut::with_capacity(4 + payload.len());
  b.extend_from_slice(&n.to_le_bytes());
  b.extend_from_slice(payload);
  b
}
pub fn unframe(b: &[u8]) -> Option<(u32, &[u8])> { (b.len() >= 4).then(|| (u32::from_le_bytes(b[..4].try_into().unwrap()), &b[4..])) }

fn shard(id: &str) -> &str { &id[..id.len().min(2)] }
fn safe_part(s: &str) -> bool { !s.is_empty() && !s.contains(['/', '\\']) && s != "." && s != ".." }

/// What arrived for a `put` (ADR 0046): where it goes in the cache, checked as the service page checked it.
pub fn put_keys(req: &Value, bytes: &[u8]) -> Result<Vec<(String, Vec<u8>)>, String> {
  let s = |k: &str| req[k].as_str().unwrap_or("");
  let (p, c, id) = (s("profile"), s("collection"), s("track"));
  let song = |dir: &str, ext: &str| -> Result<String, String> {
    if ![p, c, id].iter().all(|x| safe_part(x)) { return Err("bad song".into()); }
    Ok(format!("{dir}/{p}/{c}/{}/{id}.{ext}", shard(id)))
  };
  Ok(match s("kind") {
    "thumb" => vec![(song("t", "bin")?, bytes.to_vec())],
    "wave" => if bytes.len() == WAVE_BYTES { vec![(song("w", "bin")?, bytes.to_vec())] } else { vec![] },
    "art" => {
      let (hash, px) = (s("hash"), req["px"].as_u64().unwrap_or(0));
      let ok = (8..=64).contains(&hash.len()) && hash.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
      if ok && (px == 64 || px == 320) { vec![(format!("a/{hash}-{px}.jpg"), bytes.to_vec())] } else { vec![] }
    }
    // The block first: a header always has its data.
    _ => vec![(song("d", "bin")?, bytes.to_vec()), (song("d", "json")?, serde_json::to_vec(&req["header"]).unwrap_or_default())],
  })
}

/// Messages up to 256 KB, as browsers take: the website's frames are 64 KB and their request number (RFC 8841's
/// default, 64 KB, would make a browser refuse to send them).
pub fn settings() -> webrtc::peer_connection::SettingEngine {
  webrtc::peer_connection::SettingEngineBuilder::new().with_sctp_max_message_size(rtc::peer_connection::configuration::setting_engine::SctpMaxMessageSize::Unbounded).build()
}

/// A song file to send: all of it, or `range` (start, length).
#[derive(Debug, Clone, serde::Deserialize)]
pub struct Song { pub path: String, pub range: Option<(u64, u64)>, pub name: String, #[serde(rename = "type")] pub typ: String }

/// One channel's sending side: text, and a request's bytes in frames.
#[derive(Clone)]
struct Chan(Arc<dyn DataChannel>);
impl Chan {
  async fn text(&self, v: &Value) -> Result<(), String> { self.0.send_text(&v.to_string()).await.map_err(|e| e.to_string()) }
  async fn bytes(&self, n: u32, b: &[u8]) -> Result<(), String> {
    for part in b.chunks(CHUNK) { self.0.send(frame(n, part)).await.map_err(|e| e.to_string())?; }
    Ok(())
  }
}

struct Conn {
  pc: Arc<dyn PeerConnection>,
  chans: Mutex<HashMap<u32, Chan>>,
  /// The session's channel (its first stream channel): where what happens is said (ADR 0133).
  session: Mutex<Option<u32>>,
  calls: AtomicU64,
  last: AtomicU64,
  told: AtomicU64,
}

/// Every connection of this GLUE Home.
pub struct Server<H: Host> {
  host: Arc<H>,
  conns: Mutex<HashMap<String, Arc<Conn>>>,
  next_chan: AtomicU32,
}

struct Handler<H: Host> { server: Arc<Server<H>>, id: String, hello: Value }

#[async_trait::async_trait]
impl<H: Host> PeerConnectionEventHandler for Handler<H> {
  async fn on_ice_candidate(&self, e: RTCPeerConnectionIceEvent) {
    if let Ok(c) = e.candidate.to_json() { self.server.host.event("rtc-ice", json!({ "id": self.id, "candidate": c })); }
  }
  async fn on_ice_gathering_state_change(&self, s: RTCIceGatheringState) {
    if s == RTCIceGatheringState::Complete { self.server.host.event("rtc-ice", json!({ "id": self.id, "candidate": null })); }
  }
  async fn on_connection_state_change(&self, s: RTCPeerConnectionState) {
    self.server.host.event("rtc-state", json!({ "id": self.id, "state": s.to_string() }));
  }
  async fn on_data_channel(&self, dc: Arc<dyn DataChannel>) {
    let (server, id, hello) = (self.server.clone(), self.id.clone(), self.hello.clone());
    tokio::spawn(async move {
      let label = dc.label().await.unwrap_or_default();
      if label == "stream" { server.serve(&id, dc, hello).await } else { server.receive(dc, hello).await }
    });
  }
}

impl<H: Host> Server<H> {
  pub fn new(host: H) -> Arc<Self> { Arc::new(Server { host: Arc::new(host), conns: Mutex::new(HashMap::new()), next_chan: AtomicU32::new(1) }) }

  fn conn(&self, id: &str) -> Option<Arc<Conn>> { self.conns.lock().unwrap().get(id).cloned() }
  fn chan(&self, id: &str, ch: u32) -> Result<Chan, String> {
    self.conn(id).and_then(|c| c.chans.lock().unwrap().get(&ch).cloned()).ok_or_else(|| "that connection has closed".to_string())
  }

  /// An offer from a device (`id`: its handshake's): the answer's SDP. `servers`: STUN/TURN; `hello`:
  /// `{ version, max, name }`, said on each channel as it opens.
  pub async fn answer(self: &Arc<Self>, id: &str, offer: &str, servers: Vec<RTCIceServer>, hello: Value) -> Result<String, String> {
    self.close(id).await;
    let handler = Arc::new(Handler { server: self.clone(), id: id.to_string(), hello });
    let pc = PeerConnectionBuilder::new()
      .with_configuration(RTCConfigurationBuilder::new().with_ice_servers(servers).build())
      .with_handler(handler)
      .with_runtime(webrtc::runtime::default_runtime().ok_or("no runtime")?)
      .with_udp_addrs(vec!["0.0.0.0:0".to_string()])
      .with_data_channel_send_buffer_limit(HIGH_WATER)
      .with_setting_engine(settings())
      .build().await.map_err(|e| e.to_string())?;
    let pc: Arc<dyn PeerConnection> = Arc::new(pc);
    self.conns.lock().unwrap().insert(id.to_string(), Arc::new(Conn { pc: pc.clone(), chans: Mutex::new(HashMap::new()), session: Mutex::new(None), calls: AtomicU64::new(0), last: AtomicU64::new(now_ms()), told: AtomicU64::new(0) }));
    pc.set_remote_description(RTCSessionDescription::offer(offer.to_string()).map_err(|e| e.to_string())?).await.map_err(|e| e.to_string())?;
    let answer = pc.create_answer(None).await.map_err(|e| e.to_string())?;
    let sdp = answer.sdp.clone();
    pc.set_local_description(answer).await.map_err(|e| e.to_string())?;
    Ok(pc.local_description().await.map(|d| d.sdp).unwrap_or(sdp))
  }

  /// A candidate of the other side (None: it has no more).
  pub async fn add_ice(&self, id: &str, candidate: Option<RTCIceCandidateInit>) -> Result<(), String> {
    let Some(c) = candidate else { return Ok(()) };
    let conn = self.conn(id).ok_or("no such connection")?;
    conn.pc.add_ice_candidate(c).await.map_err(|e| e.to_string())
  }

  pub async fn close(&self, id: &str) {
    let c = self.conns.lock().unwrap().remove(id);
    if let Some(c) = c { let _ = c.pc.close().await; }
  }

  /// The connections: how much each was asked, and when last (ADR 0133).
  pub fn sessions(&self) -> Vec<Value> {
    self.conns.lock().unwrap().iter().map(|(id, c)| json!({ "id": id, "calls": c.calls.load(Ordering::Relaxed), "last": c.last.load(Ordering::Relaxed) })).collect()
  }

  /// Said on every session's channel (ADR 0133: `made`, `incoming`).
  pub async fn tell(&self, msg: Value) {
    let chans: Vec<Chan> = self.conns.lock().unwrap().values().filter_map(|c| { let s = (*c.session.lock().unwrap())?; c.chans.lock().unwrap().get(&s).cloned() }).collect();
    for ch in chans { let _ = ch.text(&msg).await; }
  }

  /// An answer: `meta` (its `data`, the size of the bytes, and `extra`: name, type), the bytes, `eof`.
  pub async fn reply(&self, id: &str, ch: u32, n: u32, data: Value, bytes: &[u8], extra: Value) -> Result<(), String> {
    let c = self.chan(id, ch)?;
    let mut meta = json!({ "t": "meta", "n": n, "size": bytes.len(), "data": data });
    if let (Value::Object(m), Value::Object(x)) = (&mut meta, &extra) { for (k, v) in x { m.insert(k.clone(), v.clone()); } }
    c.text(&meta).await?;
    c.bytes(n, bytes).await?;
    let mut eof = json!({ "t": "eof", "n": n });
    if let Some(t) = extra.get("type") { eof["type"] = t.clone(); }
    c.text(&eof).await
  }

  pub async fn error(&self, id: &str, ch: u32, n: u32, error: &str) -> Result<(), String> {
    self.chan(id, ch)?.text(&json!({ "t": "error", "n": n, "error": error })).await
  }

  /// A song's file, read from disk as it's sent: whole (`get`: `name` and `type` with it) or a part of it
  /// (`range`: `{ total, type }` as its data, at most 8 MB). The bytes sent.
  pub async fn send_file(&self, id: &str, ch: u32, n: u32, song: &Song) -> Result<u64, String> {
    let (range, name, typ) = (song.range, song.name.as_str(), song.typ.as_str());
    let c = self.chan(id, ch)?;
    let (mut f, total) = self.host.open_song(&song.path)?;
    let (start, len) = match range { Some((s, l)) => { let s = s.min(total); (s, l.min(MAX_RANGE).min(total - s)) } None => (0, total) };
    let (data, extra) = if range.is_some() { (json!({ "total": total, "type": typ }), json!({ "name": name })) } else { (Value::Null, json!({ "name": name, "type": typ })) };
    let mut meta = json!({ "t": "meta", "n": n, "size": len, "data": data });
    for (k, v) in extra.as_object().unwrap() { meta[k] = v.clone(); }
    c.text(&meta).await?;
    f.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    let mut left = len;
    let mut f = Some(f);
    while left > 0 {
      let want = left.min(1 << 20) as usize;
      // Read off the async threads: a disk (or a NAS) can take its time.
      let mut file = f.take().unwrap();
      let (file, buf) = tokio::task::spawn_blocking(move || { let mut buf = vec![0u8; want]; let r = file.read(&mut buf).map(|k| { buf.truncate(k); buf }); (file, r) }).await.map_err(|e| e.to_string())?;
      let buf = buf.map_err(|e| e.to_string())?;
      f = Some(file);
      if buf.is_empty() { break; }
      c.bytes(n, &buf).await?;
      left -= buf.len() as u64;
    }
    let mut eof = json!({ "t": "eof", "n": n });
    if range.is_none() { eof["type"] = json!(typ); }
    c.text(&eof).await?;
    Ok(len - left)
  }

  fn activity(&self, id: &str, counted: bool) {
    let Some(c) = self.conn(id) else { return };
    let now = now_ms();
    c.last.store(now, Ordering::Relaxed);
    if counted { c.calls.fetch_add(1, Ordering::Relaxed); }
    // Said at most every 2 s (the settings window's list).
    if now.saturating_sub(c.told.load(Ordering::Relaxed)) >= 2000 {
      c.told.store(now, Ordering::Relaxed);
      self.host.event("rtc-activity", json!({ "id": id, "calls": c.calls.load(Ordering::Relaxed), "last": now }));
    }
  }

  /// A stream channel: requests in, answers out (ADR 0045–0047, 0133).
  async fn serve(self: Arc<Self>, id: &str, dc: Arc<dyn DataChannel>, hello: Value) {
    let ch = self.next_chan.fetch_add(1, Ordering::Relaxed);
    let chan = Chan(dc.clone());
    match self.conn(id) {
      Some(c) => { c.chans.lock().unwrap().insert(ch, chan.clone()); c.session.lock().unwrap().get_or_insert(ch); }
      None => return,
    }
    let say_hello = { let chan = chan.clone(); let hello = hello.clone(); move || { let chan = chan.clone(); let h = json!({ "t": "session", "version": hello["version"], "max": hello["max"] }); async move { let _ = chan.text(&h).await; } } };
    // Said once: the channel may be open already, or open later.
    let mut said = matches!(dc.ready_state().await, Ok(webrtc::data_channel::RTCDataChannelState::Open));
    if said { say_hello().await; }
    let mut uploads: HashMap<u32, (Value, Vec<u8>)> = HashMap::new();
    while let Some(ev) = dc.poll().await {
      match ev {
        DataChannelEvent::OnOpen => if !said { said = true; say_hello().await },
        DataChannelEvent::OnClose => break,
        DataChannelEvent::OnMessage(m) if !m.is_string => {
          self.activity(id, false);
          if let Some((n, b)) = unframe(&m.data) { if let Some(u) = uploads.get_mut(&n) { u.1.extend_from_slice(b); } }
        }
        DataChannelEvent::OnMessage(m) => {
          let Ok(req) = serde_json::from_slice::<Value>(&m.data) else { continue };
          let n = req["n"].as_u64().unwrap_or(0) as u32;
          let t = req["t"].as_str().unwrap_or("").to_string();
          // The heartbeat: answered at once, not counted as something asked.
          if t == "ping" { self.activity(id, false); let _ = self.reply(id, ch, n, json!("pong"), &[], json!({})).await; continue; }
          self.activity(id, true);
          match t.as_str() {
            "put" => { uploads.insert(n, (req, Vec::new())); }
            "end" => {
              let Some((r, bytes)) = uploads.remove(&n) else { continue };
              let (me, id) = (self.clone(), id.to_string());
              tokio::spawn(async move {
                let t0 = std::time::Instant::now();
                let res = put_keys(&r, &bytes).and_then(|keys| keys.iter().try_for_each(|(k, b)| me.host.cache_put(k, b)));
                let _ = match res { Ok(()) => me.reply(&id, ch, n, Value::Null, &[], json!({})).await, Err(e) => me.error(&id, ch, n, &e).await };
                me.host.event("rtc-served", json!({ "what": format!("put {}", r["kind"].as_str().unwrap_or("details")), "ms": t0.elapsed().as_millis() as u64, "bytes": 0 }));
              });
            }
            "cache" => {
              let (me, id) = (self.clone(), id.to_string());
              tokio::spawn(async move {
                let t0 = std::time::Instant::now();
                let keys: Vec<String> = req["keys"].as_array().map(|a| a.iter().take(200).filter_map(|k| k.as_str().map(String::from)).collect()).unwrap_or_default();
                let (mut found, mut all) = (vec![], vec![]);
                for k in keys { let b = me.host.cache_read(&k); found.push(json!([k, b.as_ref().map(|b| b.len()).unwrap_or(0)])); if let Some(b) = b { all.extend(b); } }
                let size = all.len() as u64;
                let _ = me.reply(&id, ch, n, Value::Array(found), &all, json!({})).await;
                me.host.event("rtc-served", json!({ "what": "cache", "ms": t0.elapsed().as_millis() as u64, "bytes": size }));
              });
            }
            // The library's questions: the app answers (Server::reply, send_file, error).
            _ => self.host.event("rtc-request", json!({ "conn": id, "chan": ch, "n": n, "req": req })),
          }
        }
        _ => {}
      }
    }
    if let Some(c) = self.conn(id) { c.chans.lock().unwrap().remove(&ch); let mut s = c.session.lock().unwrap(); if *s == Some(ch) { *s = None; } }
  }

  /// A channel that brings songs into the incoming folder (ADR 0044): `file`, its bytes, `end`, one at a time.
  async fn receive(self: Arc<Self>, dc: Arc<dyn DataChannel>, hello: Value) {
    let chan = Chan(dc.clone());
    let ready = json!({ "t": "ready", "name": hello["name"].as_str().unwrap_or("GLUE Home") });
    let mut said = matches!(dc.ready_state().await, Ok(webrtc::data_channel::RTCDataChannelState::Open));
    if said { let _ = chan.text(&ready).await; }
    struct Cur { n: u64, a: Arriving, size: u64, got: u64, error: String, told: u64 }
    let mut cur: Option<Cur> = None;
    while let Some(ev) = dc.poll().await {
      match ev {
        DataChannelEvent::OnOpen => if !said { said = true; let _ = chan.text(&ready).await; },
        DataChannelEvent::OnClose => break,
        DataChannelEvent::OnMessage(m) if !m.is_string => {
          let Some(c) = cur.as_mut() else { continue };
          if !c.error.is_empty() { continue; }
          c.got += m.data.len() as u64;
          if c.got > c.size { c.error = "more bytes than announced".into(); continue; }
          if let Err(e) = c.a.file.write_all(&m.data) { c.error = e.to_string(); continue; }
          if c.got - c.told >= 1 << 20 { c.told = c.got; self.host.event("rtc-receiving", json!({ "name": c.a.name, "got": c.got, "size": c.size })); }
        }
        DataChannelEvent::OnMessage(m) => {
          let Ok(msg) = serde_json::from_slice::<Value>(&m.data) else { continue };
          let n = msg["n"].as_u64().unwrap_or(0);
          match msg["t"].as_str().unwrap_or("") {
            "file" => {
              let size = msg["size"].as_u64().unwrap_or(0);
              if size > MAX_FILE { let _ = chan.text(&json!({ "t": "failed", "n": n, "error": "too large" })).await; continue; }
              match self.host.incoming_begin(msg["name"].as_str().unwrap_or("song")) {
                Ok(a) => { self.host.event("rtc-receiving", json!({ "name": a.name, "got": 0, "size": size })); cur = Some(Cur { n, a, size, got: 0, error: String::new(), told: 0 }); }
                Err(e) => { let _ = chan.text(&json!({ "t": "failed", "n": n, "error": e })).await; }
              }
            }
            "end" if cur.as_ref().is_some_and(|c| c.n == n) => {
              let mut c = cur.take().unwrap();
              let _ = c.a.file.flush();
              let (token, name) = (c.a.token, c.a.name.clone());
              drop(c.a.file);
              self.host.event("rtc-receiving", Value::Null);
              if !c.error.is_empty() || c.got != c.size {
                let _ = self.host.incoming_end(token, false);
                let _ = chan.text(&json!({ "t": "failed", "n": n, "error": if c.error.is_empty() { "incomplete".to_string() } else { c.error } })).await;
              } else {
                match self.host.incoming_end(token, true) {
                  Ok(path) => {
                    let _ = chan.text(&json!({ "t": "saved", "n": n, "name": name })).await;
                    self.host.event("rtc-received", json!({ "name": name, "path": path, "size": c.size }));
                  }
                  Err(e) => { let _ = chan.text(&json!({ "t": "failed", "n": n, "error": e })).await; }
                }
              }
            }
            _ => {}
          }
        }
        _ => {}
      }
    }
    if let Some(c) = cur { drop(c.a.file); let _ = self.host.incoming_end(c.a.token, false); self.host.event("rtc-receiving", Value::Null); }
  }
}

pub use webrtc::peer_connection::{RTCIceCandidateInit as IceCandidate, RTCIceServer as IceServer};
