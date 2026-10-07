//! GLUE Home in the account's signaling room, and its sessions (room.rs, ADR 0158): a socket and the connections
//! stood in for, GLUE Cloud answering what the room asks.
use glue_engine::room::{Peers, Received, Socket};
use glue_engine::{command, Engine, Host};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

#[derive(Default)]
struct Calls { answered: Vec<String>, ice: Vec<(String, Option<Value>)>, closed: Vec<String>, told: Vec<Value> }
#[derive(Default)]
struct FakePeers(Mutex<Calls>);
impl Peers for FakePeers {
  fn answer(&self, id: &str, _sdp: &str, servers: &[Value], hello: Value) -> Result<String, String> {
    assert!(!servers.is_empty() && hello["max"].is_number());
    std::thread::sleep(Duration::from_millis(150));   // candidates arrive meanwhile
    self.0.lock().unwrap().answered.push(id.into());
    Ok(format!("answer-{id}"))
  }
  fn add_ice(&self, id: &str, c: Option<Value>) { self.0.lock().unwrap().ice.push((id.into(), c)); }
  fn close(&self, id: &str) { self.0.lock().unwrap().closed.push(id.into()); }
  fn tell(&self, msg: Value) { self.0.lock().unwrap().told.push(msg); }
}

/// The test's end of the room's socket: what the engine sent, and a way to send it messages or close it.
struct Wire { sent: mpsc::Receiver<String>, to: mpsc::Sender<Received> }
struct FakeSocket { out: mpsc::Sender<String>, inn: mpsc::Receiver<Received> }
impl Socket for FakeSocket {
  fn send(&mut self, t: &str) -> Result<(), String> { self.out.send(t.into()).map_err(|e| e.to_string()) }
  fn recv(&mut self, wait: Duration) -> Received { self.inn.recv_timeout(wait).unwrap_or(Received::Nothing) }
  fn close(&mut self, _code: u16) {}
}

#[derive(Default)]
struct Seen { config: Value, url: Vec<String>, wires: Vec<Wire>, room: Value, events: Vec<String>, refuse: bool, slow: bool }
#[derive(Clone, Default)]
struct H(Arc<Mutex<Seen>>, Arc<FakePeers>);
impl Host for H {
  fn lease_held(&self) -> bool { false }
  fn config(&self) -> Value { self.0.lock().unwrap().config.clone() }
  fn patch_config(&self, f: &dyn Fn(&Value) -> Option<Value>) -> Option<Value> { let mut g = self.0.lock().unwrap(); let p = f(&g.config)?; for (k, v) in p.as_object()? { g.config[k] = v.clone(); } Some(g.config.clone()) }
  fn incoming_dir(&self) -> PathBuf { std::env::temp_dir() }
  fn version(&self) -> String { "0.57.0".into() }
  fn access_token(&self) -> Result<String, glue_engine::sync::CloudError> {
    if self.0.lock().unwrap().slow { std::thread::sleep(Duration::from_millis(300)); }
    if self.0.lock().unwrap().refuse { Err(glue_engine::sync::CloudError { status: 401, message: "no".into() }) } else { Ok("tok en".into()) }
  }
  fn open_socket(&self, url: &str) -> Result<Box<dyn Socket>, String> {
    let (out, sent) = mpsc::channel();
    let (to, inn) = mpsc::channel();
    let mut g = self.0.lock().unwrap();
    g.url.push(url.into());
    g.wires.push(Wire { sent, to });
    Ok(Box::new(FakeSocket { out, inn }))
  }
  fn peers(&self) -> Option<Arc<dyn Peers>> { Some(self.1.clone()) }
  fn room_changed(&self, room: &Value) { self.0.lock().unwrap().room = room.clone(); }
  fn event(&self, t: &str) { self.0.lock().unwrap().events.push(t.into()); }
  fn cloud(&self, _m: &str, path: &str, _t: Option<&str>, _b: Option<&str>) -> Result<String, glue_engine::sync::CloudError> {
    match path { "/v1/turn" => Ok(r#"{"iceServers":[],"ttl":0}"#.into()), "/v1/computer" => Ok(r#"{"computer":null}"#.into()), _ => Err(glue_engine::sync::CloudError { status: 404, message: "no".into() }) }
  }
}

fn until(f: impl Fn() -> bool) { for _ in 0..300 { if f() { return; } std::thread::sleep(Duration::from_millis(10)); } panic!("not in time"); }
fn setup(max: u32) -> (Arc<Engine<H>>, H) {
  let glue = std::env::temp_dir().join(format!("glue-room-{}-{max}", std::process::id()));
  let _ = std::fs::create_dir_all(&glue);
  let h = H::default();
  h.0.lock().unwrap().config = json!({ "deviceId": "hdesk", "token": "t", "name": "Desktop", "user": { "email": "dj@example.com" }, "api": "https://cloud.example", "maxSessions": max });
  let e = Engine::new(glue.clone(), glue.join("cache"), h.clone());
  (e, h)
}
/// The room's messages the engine sent, parsed, waiting a little for them.
fn sent(h: &H, n: usize) -> Vec<Value> {
  let mut out = vec![];
  for _ in 0..200 {
    { let g = h.0.lock().unwrap(); let w = g.wires.last().unwrap(); while let Ok(t) = w.sent.try_recv() { if !t.contains("\"ping\"") { out.push(serde_json::from_str(&t).unwrap()); } } }
    if out.len() >= n { break; }
    std::thread::sleep(Duration::from_millis(10));
  }
  out
}
fn signal(h: &H, from: &str, data: Value) { h.0.lock().unwrap().wires.last().unwrap().to.send(Received::Text(json!({ "type": "signal", "from": from, "data": data }).to_string())).unwrap(); }
fn offer(id: &str, tab: &str) -> Value { json!({ "app": "glue-send", "t": "offer", "id": id, "sdp": "o", "tab": tab, "name": "iPhone" }) }

#[test]
fn online_offers_answered_and_candidates_relayed_both_ways() {
  let (e, h) = setup(5);
  e.room_start();
  until(|| h.0.lock().unwrap().room["state"] == "online");
  assert_eq!(h.0.lock().unwrap().room["text"], "Online as Desktop · dj@example.com");
  assert_eq!(h.0.lock().unwrap().url[0], "wss://cloud.example/v1/signal?token=tok%20en");
  // An offer, and its first candidate before GLUE Home has answered: held, then given after the answer.
  signal(&h, "ph", offer("o1", "t1"));
  signal(&h, "ph", json!({ "app": "glue-send", "t": "ice", "id": "o1", "candidate": { "candidate": "c1" } }));
  let m = sent(&h, 1);
  assert_eq!(m[0], json!({ "type": "signal", "to": "ph", "data": { "app": "glue-send", "t": "answer", "id": "o1", "sdp": "answer-o1" } }));
  assert_eq!(h.1.0.lock().unwrap().ice, vec![("o1".to_string(), Some(json!({ "candidate": "c1" })))]);
  // A candidate this side found goes to the phone; the connection opens: a session in the window.
  e.peer_ice("o1", json!({ "candidate": "mine" }));
  assert_eq!(sent(&h, 1)[0]["data"], json!({ "app": "glue-send", "t": "ice", "id": "o1", "candidate": { "candidate": "mine" } }));
  e.peer_state("o1", "connected");
  until(|| h.0.lock().unwrap().room["sessions"]["list"][0]["open"] == json!(true));
  assert_eq!(h.0.lock().unwrap().room["sessions"]["list"][0]["name"], "iPhone");
  // Songs analysed: told together, half a second later.
  e.tell(json!({ "t": "event", "kind": "incoming" }));
  assert_eq!(h.1.0.lock().unwrap().told.len(), 1);
  // The phone says bye: closed, gone from the list.
  signal(&h, "ph", json!({ "app": "glue-send", "t": "bye", "id": "o1" }));
  until(|| h.0.lock().unwrap().room["sessions"]["list"].as_array().unwrap().is_empty());
  assert!(h.1.0.lock().unwrap().closed.contains(&"o1".to_string()));
  e.room_stop();
}

#[test]
fn full_refused_and_the_same_tab_replaces_its_own() {
  let (e, h) = setup(1);
  e.room_start();
  until(|| h.0.lock().unwrap().room["state"] == "online");
  signal(&h, "ph", offer("o1", "t1"));
  assert_eq!(sent(&h, 1)[0]["data"]["t"], "answer");
  // Another device when full: bye, with why; nobody connected is dropped for it.
  signal(&h, "lap", offer("o2", "x"));
  let m = sent(&h, 1);
  assert_eq!((m[0]["to"].clone(), m[0]["data"]["t"].clone()), (json!("lap"), json!("bye")));
  assert!(m[0]["data"]["reason"].as_str().unwrap().contains("is full: 1 devices connected"), "{m:?}");
  // The same tab again (it reconnected): replaces its own session.
  signal(&h, "ph", offer("o3", "t1"));
  assert_eq!(sent(&h, 1)[0]["data"]["id"], "o3");
  assert!(h.1.0.lock().unwrap().closed.contains(&"o1".to_string()));
  // Disconnected in the settings: refused for an hour.
  e.disconnect("ph/t1");
  signal(&h, "ph", offer("o4", "t1"));
  assert!(sent(&h, 1)[0]["data"]["reason"].as_str().unwrap().starts_with("Disconnected in GLUE Home’s settings on Desktop"));
  assert!(h.0.lock().unwrap().events.iter().any(|x| x == "Disconnected iPhone (refused for an hour)"));
  // A connection that fails is let go.
  signal(&h, "lap", offer("o5", "y"));
  assert_eq!(sent(&h, 1)[0]["data"]["t"], "answer");
  e.peer_state("o5", "failed");
  until(|| h.0.lock().unwrap().room["sessions"]["list"].as_array().unwrap().is_empty());
  e.room_stop();
  assert_eq!(h.0.lock().unwrap().room["state"], "stopped");
}

#[test]
fn removed_from_the_account_or_replaced() {
  let (e, h) = setup(5);
  e.room_start();
  until(|| h.0.lock().unwrap().room["state"] == "online");
  h.0.lock().unwrap().wires.last().unwrap().to.send(Received::Closed(4000)).unwrap();
  until(|| h.0.lock().unwrap().room["state"] == "stopped");
  assert!(h.0.lock().unwrap().room["text"].as_str().unwrap().contains("another computer"));
  // Started again: removed from the account (a message): the credential forgotten.
  e.room_start();
  until(|| h.0.lock().unwrap().room["state"] == "online");
  h.0.lock().unwrap().wires.last().unwrap().to.send(Received::Text(r#"{"type":"removed"}"#.into())).unwrap();
  until(|| h.0.lock().unwrap().room["state"] == "removed");
  assert_eq!(h.0.lock().unwrap().config["deviceId"], Value::Null);
  // Started again without a credential: still says removed, and doesn't try.
  let tries = h.0.lock().unwrap().url.len();
  e.room_start();
  std::thread::sleep(Duration::from_millis(100));
  { let g = h.0.lock().unwrap(); assert_eq!((g.room["state"].clone(), g.url.len()), (json!("removed"), tries)); }
  // A credential GLUE Cloud refuses (401): removed.
  { let mut g = h.0.lock().unwrap(); g.config["deviceId"] = json!("h2"); g.config["token"] = json!("t2"); g.refuse = true; }
  e.room_start();
  until(|| h.0.lock().unwrap().room["state"] == "removed");
  assert_eq!(command(&e, &json!({ "cmd": "roomState" })).unwrap()["state"], "removed");
}

/// Stopped while a start still waits for its token (2026-10-07): that start says nothing, and opens nothing.
#[test]
fn a_start_overtaken_by_stop_says_nothing() {
  let (e, h) = setup(3);
  h.0.lock().unwrap().slow = true;
  e.room_start();
  std::thread::sleep(Duration::from_millis(50));
  e.room_stop();
  std::thread::sleep(Duration::from_millis(600));
  let g = h.0.lock().unwrap();
  assert_eq!((g.room["state"].clone(), g.url.len()), (json!("stopped"), 0));
}
