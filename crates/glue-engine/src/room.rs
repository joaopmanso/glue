//! GLUE Home in the account's signaling room, and its sessions with the account's other devices (ADR 0036, 0045, 0133,
//! 0150), home/ui/cloud.ts `stayOnline` and service.ts's signaling in Rust (ADR 0158).
//! - **The room:** a WebSocket the host opens (`Host::open_socket`) to GLUE Cloud's `/v1/signal`, with an access token
//!   for this GLUE Home's credential; a ping every 30 s, a new token before the old one ends (closed with 4002 at 50
//!   minutes), again after 1, 2, 4… up to 60 s when it drops; 4000: replaced (GLUE Home started elsewhere with this
//!   device), 4001: removed from the account.
//! - **Offers** from other devices' tabs: one session per device's tab, at most "Most at once" (`sessions.rs`), the
//!   connection answered by the host's peers (`Host::peers`: crates/glue-rtc in GLUE Home), candidates relayed both
//!   ways (those that come before the answer wait for it); a connection not open in 30 s, or disconnected for 15 s, is
//!   let go.
//! - **Told to every session:** songs analysed here (`made`, half a second together), songs received (`incoming`).
//! - **Songs received** from another device: analysed at once (TO BE SORTED, ADR 0048) and listed in the settings.
use crate::sessions::{admit, max_of, session_key, Admit};
use crate::{text, Engine, Host};
use glue_store::dir::Dir;
use indexmap::{IndexMap, IndexSet};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex, Weak};
use std::time::{Duration, Instant};

/// GLUE Cloud (home/ui/bridge.ts `API`).
pub const API: &str = "https://glue-api.joaopmanso.workers.dev";

/// What a socket gave: a text message, its close (with its code), or nothing yet.
pub enum Received { Text(String), Closed(u16), Nothing }
/// The room's socket, as the host opens it.
pub trait Socket: Send {
  fn send(&mut self, text: &str) -> Result<(), String>;
  /// A message, waiting at most `wait`.
  fn recv(&mut self, wait: Duration) -> Received;
  fn close(&mut self, code: u16);
}
/// The connections to other devices (crates/glue-rtc in GLUE Home).
pub trait Peers: Send + Sync {
  /// An offer's answer (`servers`: STUN/TURN as the website names them; `hello`: `{ version, max, name }`).
  fn answer(&self, id: &str, sdp: &str, servers: &[Value], hello: Value) -> Result<String, String>;
  fn add_ice(&self, id: &str, candidate: Option<Value>);
  fn close(&self, id: &str);
  /// Said on every session's channel.
  fn tell(&self, msg: Value);
}

#[derive(Debug, Clone)]
pub struct Session { pub key: String, pub from: String, pub name: String, pub since: i64, pub last: i64, pub calls: u64, pub id: String, pub open: bool }

#[derive(Default)]
struct St {
  state: String, text: String,
  sessions: IndexMap<String, Session>,
  /// Handshake id → (device, session key).
  conns: HashMap<String, (String, String)>,
  /// Candidates that came before their connection was answered.
  early: HashMap<String, Vec<Option<Value>>>,
  /// Disconnected in the settings: refused until then (ms).
  refused: HashMap<String, i64>,
  /// Each connection's last state.
  states: HashMap<String, String>,
}

/// Songs analysed since the last word to the connected devices, by collection.
type Made = IndexMap<(String, String), IndexSet<String>>;

#[derive(Default)]
pub struct Room {
  /// Bumped by each start and stop: a room loop of an older one stops.
  gen: AtomicU64,
  st: Mutex<St>,
  out: Mutex<Option<mpsc::Sender<String>>>,
  pub(crate) ice: crate::ice::IceCache,
  made: Mutex<(Made, bool)>,
  sync_soon: Mutex<Option<Instant>>,
}

fn now() -> i64 { crate::now().0 }
fn enc(s: &str) -> String { s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect() }

impl<H: Host> Engine<H> {
  fn api(cfg: &Value) -> String { cfg["api"].as_str().filter(|a| !a.is_empty()).unwrap_or(API).trim_end_matches('/').to_string() }

  /// The room's state and the sessions, for GLUE Home's window: `{ state, text, sessions: { list, max } }`.
  pub fn room_json(&self) -> Value {
    let max = max_of(self.host.config()["maxSessions"].as_f64());
    let st = self.room.st.lock().unwrap();
    json!({ "state": st.state, "text": st.text, "sessions": { "list": st.sessions.values().map(|s| json!({ "key": s.key, "name": s.name, "since": s.since, "last": s.last, "calls": s.calls, "open": s.open })).collect::<Vec<_>>(), "max": max } })
  }
  /// The window is told what changed.
  pub(crate) fn room_told(&self) { self.host.room_changed(&self.room_json()); }
  fn room_set(&self, state: &str, text: &str) {
    { let mut st = self.room.st.lock().unwrap(); st.state = state.into(); st.text = text.into(); }
    self.room_told();
  }

  /// Online in the room (or say why not), until `room_stop` or another start, every connection made anew (the account
  /// may have changed). Settings without a credential: not connected; Stop: stopped.
  pub fn room_start(self: &Arc<Self>) {
    self.close_all();
    let gen = self.room.gen.fetch_add(1, Ordering::SeqCst) + 1;
    let me = Arc::downgrade(self);
    std::thread::Builder::new().name("glue-room".into()).spawn(move || room_loop(me, gen)).ok();
  }
  /// Out of the room, every connection closed (Stop, or the account changed).
  pub fn room_stop(&self) {
    self.room.gen.fetch_add(1, Ordering::SeqCst);
    self.close_all();
    let cfg = self.host.config();
    if cfg["deviceId"].as_str().is_some_and(|d| !d.is_empty()) { self.room_set("stopped", "Stopped") } else { self.unpaired() }
  }
  /// Not connected to an account; removed from it says so until a new credential comes.
  fn unpaired(&self) { if self.room.st.lock().unwrap().state != "removed" { self.room_set("unpaired", "Not connected to a GLUE account"); } }
  fn close_all(&self) {
    let ids: Vec<String> = { let mut st = self.room.st.lock().unwrap(); st.sessions.clear(); st.early.clear(); st.states.clear(); st.conns.drain().map(|x| x.0).collect() };
    if let Some(p) = self.host.peers() { for id in ids { p.close(&id); } }
  }
  fn live(&self, gen: u64) -> bool { self.room.gen.load(Ordering::SeqCst) == gen }
  /// A message to a device, on the room.
  fn room_send(&self, to: &str, data: Value) {
    if let Some(tx) = self.room.out.lock().unwrap().as_ref() { let _ = tx.send(json!({ "type": "signal", "to": to, "data": data }).to_string()); }
  }
  /// Removed from the account (on the website): the credential forgotten, unless the settings hold a new one (connecting
  /// again with a new code removes the old device).
  fn room_removed(self: &Arc<Self>, gone: &str) {
    let now_cfg = self.host.config();
    if now_cfg["deviceId"].as_str().is_some_and(|d| !d.is_empty() && d != gone) { self.room_start(); return; }
    self.host.patch_config(&|_| Some(json!({ "deviceId": null, "token": null, "user": null })));
    self.room_set("removed", "Removed from the GLUE account: connect again in the settings");
  }

  /// Sync the shared collections in a moment (several nudges at once make one).
  pub fn sync_soon(self: &Arc<Self>, ms: u64) {
    let at = Instant::now() + Duration::from_millis(ms);
    let first = { let mut s = self.room.sync_soon.lock().unwrap(); let first = s.is_none(); *s = Some(at); first };
    if !first { return; }
    let me = self.clone();
    std::thread::spawn(move || loop {
      let at = { *me.room.sync_soon.lock().unwrap() };
      let Some(at) = at else { return };
      let wait = at.saturating_duration_since(Instant::now());
      if !wait.is_zero() { std::thread::sleep(wait); continue; }
      *me.room.sync_soon.lock().unwrap() = None;
      if me.host.running() {
        match me.sync_shared_here() { Ok(n) if n > 0 => me.host.event(&format!("Took in {n} change{} from your other devices", if n == 1 { "" } else { "s" })), _ => {} }
      }
      return;
    });
  }

  // ---- offers, candidates, goodbyes --------------------------------------------------------------------------
  fn on_signal(self: &Arc<Self>, from: &str, data: &Value) {
    if data["app"] != "glue-send" { return; }
    let id = text(data, "id");
    match data["t"].as_str().unwrap_or("") {
      "offer" => {
        // Its candidates may come before it's answered (answering runs on its own thread): held from now.
        self.room.st.lock().unwrap().early.entry(id).or_default();
        let (me, from, data) = (self.clone(), from.to_string(), data.clone());
        std::thread::spawn(move || me.on_offer(&from, &data));
      }
      "ice" => {
        let c = data.get("candidate").cloned().filter(|c| !c.is_null());
        let known = { let mut st = self.room.st.lock().unwrap(); if let Some(w) = st.early.get_mut(&id) { w.push(c.clone()); None } else { Some(st.conns.contains_key(&id)) } };
        if known == Some(true) { if let Some(p) = self.host.peers() { p.add_ice(&id, c); } }
      }
      "bye" => {
        let key = { let mut st = self.room.st.lock().unwrap(); st.early.remove(&id); st.conns.get(&id).map(|c| c.1.clone()).filter(|k| st.sessions.get(k).is_some_and(|s| s.id == id)) };
        match key { Some(k) => self.end_session(&k), None => { self.room.st.lock().unwrap().conns.remove(&id); if let Some(p) = self.host.peers() { p.close(&id); } } }
      }
      _ => {}
    }
  }
  fn on_offer(self: &Arc<Self>, from: &str, data: &Value) {
    let cfg = self.host.config();
    let id = text(data, "id");
    let key = session_key(from, data["tab"].as_str(), &id);
    let name = Some(text(data, "name")).filter(|n| !n.is_empty()).unwrap_or_else(|| "Another device".into());
    let here = cfg["name"].as_str().unwrap_or("that computer").to_string();
    let say = |d: Value| { if d["t"] == "bye" { self.room.st.lock().unwrap().early.remove(&id); } self.room_send(from, d) };
    // This computer's own browser isn't counted, nor ever refused for room (ADR 0137): the limit is other devices'.
    let computer = cfg["computer"].as_str().unwrap_or("");
    let own = !computer.is_empty() && from == computer;
    let max = max_of(cfg["maxSessions"].as_f64());
    let (has, others, refused_until) = { let st = self.room.st.lock().unwrap(); (st.sessions.contains_key(&key), st.sessions.values().filter(|s| s.from != computer).count(), st.refused.get(&key).copied()) };
    match admit(has, others, max, refused_until, now(), own) {
      Admit::Refused => { say(json!({ "app": "glue-send", "t": "bye", "id": id, "reason": format!("Disconnected in GLUE Home’s settings on {here}.") })); return; }
      Admit::Full => {
        say(json!({ "app": "glue-send", "t": "bye", "id": id, "reason": format!("GLUE Home on {here} is full: {others} devices connected (raise the limit in its settings).") }));
        self.host.event(&format!("{name} couldn’t connect: {others} devices are connected already (the most at once is {max})"));
        return;
      }
      Admit::Ok { replaces } => if replaces { self.end_session(&key); },   // the same tab again (it reconnected)
    }
    let Some(peers) = self.host.peers() else { say(json!({ "app": "glue-send", "t": "bye", "id": id, "reason": "GLUE Home can’t take connections here." })); return };
    {
      let mut st = self.room.st.lock().unwrap();
      st.early.entry(id.clone()).or_default();
      st.sessions.insert(key.clone(), Session { key: key.clone(), from: from.into(), name: name.clone(), since: now(), last: now(), calls: 0, id: id.clone(), open: false });
      st.conns.insert(id.clone(), (from.into(), key.clone()));
    }
    self.room_told();
    // Not open in time (the other side gave up, or its candidates never came): let go (ADR 0132).
    { let (me, key, id) = (Arc::downgrade(self), key.clone(), id.clone()); std::thread::spawn(move || { std::thread::sleep(Duration::from_secs(30)); if let Some(e) = me.upgrade() { let late = e.room.st.lock().unwrap().sessions.get(&key).is_some_and(|s| s.id == id && !s.open); if late { e.end_session(&key); } } }); }
    // The relay's credentials (ADR 0081), asked for once a day.
    let servers = self.room.ice.get(now(), || self.host.cloud("GET", "/v1/turn", None, None).map_err(|e| e.message));
    let hello = json!({ "version": self.host.version(), "max": max, "name": cfg["name"].as_str().unwrap_or("GLUE Home") });
    match peers.answer(&id, &text(data, "sdp"), &servers, hello) {
      Ok(sdp) => {
        let early = self.room.st.lock().unwrap().early.remove(&id).unwrap_or_default();
        for c in early { peers.add_ice(&id, c); }
        say(json!({ "app": "glue-send", "t": "answer", "id": id, "sdp": sdp }));
      }
      Err(why) => {
        // Said, not left unanswered: the other side shows why at once instead of waiting for its time-out.
        peers.close(&id);
        { let mut st = self.room.st.lock().unwrap(); st.early.remove(&id); st.conns.remove(&id); if st.sessions.get(&key).is_some_and(|s| s.id == id) { st.sessions.shift_remove(&key); } }
        say(json!({ "app": "glue-send", "t": "bye", "id": id, "reason": format!("GLUE Home couldn’t take the connection: {why}") }));
        self.host.event(&format!("A connection couldn’t be set up: {why}"));
        self.room_told();
      }
    }
  }
  fn end_session(&self, key: &str) {
    let id = { let mut st = self.room.st.lock().unwrap(); let Some(s) = st.sessions.shift_remove(key) else { return }; st.conns.remove(&s.id); st.states.remove(&s.id); s.id };
    if let Some(p) = self.host.peers() { p.close(&id); }
    self.room_told();
  }
  /// Disconnected in GLUE Home's settings: its tab is refused for an hour (it would only connect again).
  pub fn disconnect(&self, key: &str) {
    let name = { let mut st = self.room.st.lock().unwrap(); st.refused.insert(key.into(), now() + 3_600_000); st.sessions.get(key).map(|s| s.name.clone()).unwrap_or_else(|| "a device".into()) };
    self.end_session(key);
    self.host.event(&format!("Disconnected {name} (refused for an hour)"));
  }

  // ---- what the connections say (the host's peers) -----------------------------------------------------------
  /// A candidate this side found: to the device it's with.
  pub fn peer_ice(&self, id: &str, candidate: Value) {
    let to = self.room.st.lock().unwrap().conns.get(id).map(|c| c.0.clone());
    if let Some(to) = to { self.room_send(&to, json!({ "app": "glue-send", "t": "ice", "id": id, "candidate": candidate })); }
  }
  /// A connection's state: open; gone (failed, closed); or disconnected, which often passes (a phone moving between
  /// Wi-Fi and mobile data): let go only if it stays 15 s.
  pub fn peer_state(self: &Arc<Self>, id: &str, state: &str) {
    let key = {
      let mut st = self.room.st.lock().unwrap();
      st.states.insert(id.into(), state.into());
      st.conns.get(id).map(|c| c.1.clone()).filter(|k| st.sessions.get(k).is_some_and(|s| s.id == id))
    };
    let Some(key) = key else { return };
    match state {
      "connected" => { if let Some(s) = self.room.st.lock().unwrap().sessions.get_mut(&key) { s.open = true; } self.room_told(); }
      "failed" | "closed" => self.end_session(&key),
      "disconnected" => {
        let (me, id) = (Arc::downgrade(self), id.to_string());
        std::thread::spawn(move || { std::thread::sleep(Duration::from_secs(15)); if let Some(e) = me.upgrade() { let still = e.room.st.lock().unwrap().states.get(&id).is_some_and(|s| s == "disconnected"); if still { e.end_session(&key); } } });
      }
      _ => {}
    }
  }
  /// How much a session was asked, and when last (its row in the settings).
  pub fn peer_activity(&self, id: &str, calls: u64, last: i64) {
    { let mut st = self.room.st.lock().unwrap(); let key = st.conns.get(id).map(|c| c.1.clone()); if let Some(s) = key.and_then(|k| st.sessions.get_mut(&k)) { if s.id == id { s.calls = calls; s.last = last; } } }
    self.room_told();
  }
  /// Said to every session (ADR 0133), when there are any.
  pub fn tell(&self, msg: Value) {
    if self.room.st.lock().unwrap().sessions.is_empty() { return; }
    if let Some(p) = self.host.peers() { p.tell(msg); }
  }
  /// A song's parts were made here: every session told, half a second later with the others made meanwhile.
  pub(crate) fn room_made(&self, p: &str, c: &str, id: &str) {
    if self.room.st.lock().unwrap().sessions.is_empty() { return; }
    let first = { let mut m = self.room.made.lock().unwrap(); m.0.entry((p.into(), c.into())).or_default().insert(id.into()); !std::mem::replace(&mut m.1, true) };
    if !first { return; }
    let me: Weak<Self> = self.me.lock().unwrap().clone();
    std::thread::spawn(move || {
      std::thread::sleep(Duration::from_millis(500));
      let Some(e) = me.upgrade() else { return };
      let all: Vec<((String, String), IndexSet<String>)> = { let mut m = e.room.made.lock().unwrap(); m.1 = false; m.0.drain(..).collect() };
      for ((p, c), ids) in all { e.tell(json!({ "t": "event", "kind": "made", "profile": p, "collection": c, "tracks": ids.into_iter().collect::<Vec<_>>() })); }
    });
  }
  /// A song arrived from another device (written by the connection): analysed at once, so it's ready in TO BE SORTED
  /// (said to every session when it is), and listed in the settings' "received".
  pub fn received(self: &Arc<Self>, name: &str, path: &str, size: u64) {
    let (me, n, p) = (self.clone(), name.to_string(), path.to_string());
    std::thread::spawn(move || {
      if let Err(e) = me.analyse_incoming(&n, &p) { eprintln!("GLUE Home: couldn’t analyse {n}: {e}"); }
      me.tell(json!({ "t": "event", "kind": "incoming" }));
    });
    let r = json!({ "name": name, "path": path, "from": "another device", "at": now(), "size": size });
    self.host.patch_config(&move |cur| {
      let mut list = vec![r.clone()];
      list.extend(cur["received"].as_array().into_iter().flatten().cloned());
      list.truncate(30);
      Some(json!({ "received": list }))
    });
    self.host.event(&format!("Received {name} from another device"));
    self.room_told();
  }
  /// The songs in the incoming folder without an analysis (they arrived while GLUE Home was off), analysed.
  pub fn analyse_waiting(&self) {
    for f in crate::incoming::list(&self.host.incoming_dir()) {
      let (name, path) = (text(&f, "name"), text(&f, "path"));
      if let Err(e) = self.analyse_incoming(&name, &path) { eprintln!("GLUE Home: couldn’t analyse {name}: {e}"); }
    }
  }
  /// A song in the incoming folder analysed (ADR 0048, 0147): `i/<name>.thumb.bin`, `.wave.bin`, `.details.bin` + `.json`,
  /// and `.summary.json` last (the summary with the file's format and length). Analysed already: nothing to do.
  pub fn analyse_incoming(&self, name: &str, path: &str) -> Result<(), String> {
    if name.is_empty() || name.contains(['/', '\\']) || name.starts_with('.') { return Err("bad name".into()); }
    let k = |what: &str| format!("i/{name}.{what}");
    if self.cache_bytes(&k("summary.json")).is_some() { return Ok(()); }
    let bytes = self.host.read_song(std::path::Path::new(path), name)?;
    let n = name.to_string();
    let size = bytes.len() as u64;
    let a = crate::analyse::on_own_thread("glue-incoming", move || {
      glue_audio::control::set_deadline(Some(Instant::now() + crate::analyse::time_for(size)));
      let r = glue_audio::analyse(&bytes, &n, bytes.len() as f64, 0.0, crate::analyse::now_iso());
      glue_audio::control::set_deadline(None);
      r
    })?.map_err(|e| e.to_string())?;
    let d = self.cache_dir();
    if !a.thumb.is_empty() { d.write_bytes(&k("thumb.bin"), &a.thumb)?; }
    if !a.wave.is_empty() { d.write_bytes(&k("wave.bin"), &a.wave)?; }
    d.write_bytes(&k("details.bin"), &glue_audio::out::files::zlib(&a.details.1))?;
    d.write_bytes(&k("details.json"), &serde_json::to_vec(&a.details.0).unwrap_or_default())?;
    let mut s = serde_json::to_value(&a.summary).unwrap_or(Value::Null);
    s["format"] = if a.info.container.is_empty() { Value::Null } else { serde_json::to_value(glue_audio::out::files::format_of(&a.info)).unwrap_or(Value::Null) };
    s["duration"] = json!(a.info.duration);
    d.write_bytes(&k("summary.json"), &serde_json::to_vec(&s).unwrap_or_default())
  }
}

/// The room, while this start is the latest.
fn room_loop<H: Host>(me: Weak<Engine<H>>, gen: u64) {
  let mut retry = 0u32;
  // How long to wait before trying again (1, 2, 4… up to 60 s), said; false: stopped meanwhile.
  let wait = |e: &Engine<H>, retry: &mut u32, why: &str| -> bool {
    let secs = 60u64.min(1u64 << (*retry).min(6));
    *retry += 1;
    e.room_set("offline", &format!("Offline: {why}{}trying again in {secs} s", if why.is_empty() { "" } else { "; " }));
    let until = Instant::now() + Duration::from_secs(secs);
    while Instant::now() < until { if !e.live(gen) { return false; } std::thread::sleep(Duration::from_millis(200)); }
    true
  };
  loop {
    let Some(e) = me.upgrade() else { return };
    if !e.live(gen) { return; }
    let cfg = e.host.config();
    let device = cfg["deviceId"].as_str().unwrap_or("").to_string();
    if device.is_empty() || cfg["token"].as_str().is_none_or(|t| t.is_empty()) { e.unpaired(); return; }
    if !e.host.running() { e.room_set("stopped", "Stopped"); return; }
    if e.room.st.lock().unwrap().state != "online" { e.room_set("connecting", "Connecting…"); }
    let token = match e.host.access_token() {
      Ok(t) => t,
      Err(x) if x.status == 401 => { e.room_removed(&device); return; }
      Err(_) => { if wait(&e, &mut retry, "Can’t reach GLUE Cloud") { continue } else { return } }
    };
    let url = format!("{}/v1/signal?token={}", Engine::<H>::api(&cfg).replacen("http", "ws", 1), enc(&token));
    let mut sock = match e.host.open_socket(&url) { Ok(s) => s, Err(_) => { if wait(&e, &mut retry, "Disconnected") { continue } else { return } } };
    retry = 0;
    let email = cfg["user"]["email"].as_str().filter(|s| !s.is_empty()).map(|m| format!(" · {m}")).unwrap_or_default();
    e.room_set("online", &format!("Online as {}{email}", cfg["name"].as_str().unwrap_or("GLUE Home")));
    { let e2 = e.clone(); std::thread::spawn(move || { e2.learn_computer(); let _ = e2.room.ice.get(now(), || e2.host.cloud("GET", "/v1/turn", None, None).map_err(|x| x.message)); }); }
    let (tx, rx) = mpsc::channel();
    *e.room.out.lock().unwrap() = Some(tx);
    let (opened, mut pinged) = (Instant::now(), Instant::now());
    // Why it ended: None stopped (or removed, replaced: said), Some(true) to renew the token at once, Some(false) lost.
    let end: Option<bool> = loop {
      if !e.live(gen) { sock.close(1000); break None; }
      while let Ok(t) = rx.try_recv() { if sock.send(&t).is_err() { break; } }
      if pinged.elapsed() >= Duration::from_secs(30) { let _ = sock.send(r#"{"type":"ping"}"#); pinged = Instant::now(); }
      // Access tokens last an hour: a new one before then.
      if opened.elapsed() >= Duration::from_secs(50 * 60) { sock.close(4002); break Some(true); }
      match sock.recv(Duration::from_millis(200)) {
        Received::Nothing => {}
        Received::Text(t) => {
          let Ok(m) = serde_json::from_str::<Value>(&t) else { continue };
          match m["type"].as_str().unwrap_or("") {
            // Acted on at once: the close handshake may never arrive.
            "removed" => { sock.close(1000); e.room_removed(&device); break None; }
            "replaced" => { sock.close(1000); e.room_set("stopped", "Stopped: GLUE Home started on another computer with this account’s same device"); break None; }
            "signal" => { let from = text(&m, "from"); if !from.is_empty() { e.on_signal(&from, &m["data"]); } }
            // A shared collection changed on another device (ADR 0097): taken in here.
            "shared" if m["from"].as_str() != Some(device.as_str()) => e.sync_soon(1500),
            _ => {}
          }
        }
        Received::Closed(4001) => { e.room_removed(&device); break None; }
        Received::Closed(4000) => { e.room_set("stopped", "Stopped: GLUE Home started on another computer with this account’s same device"); break None; }
        Received::Closed(4002) => break Some(true),
        Received::Closed(_) => break Some(false),
      }
    };
    *e.room.out.lock().unwrap() = None;
    match end { None => return, Some(true) => continue, Some(false) => { if !wait(&e, &mut retry, "Disconnected") { return; } } }
  }
}
