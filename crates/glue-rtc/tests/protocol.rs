//! The protocol end to end: a "website" (a webrtc-rs peer here, a browser in examples/probe.rs) connects to the
//! server, asks on a stream channel and sends a song on another, against a host in memory.
use glue_rtc::{Arriving, Host, ReadSeek, Server, Song};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;
use webrtc::data_channel::{DataChannel, DataChannelEvent};
use webrtc::peer_connection::{PeerConnection, PeerConnectionBuilder, PeerConnectionEventHandler, RTCConfigurationBuilder, RTCIceGatheringState, RTCPeerConnectionIceEvent, RTCSessionDescription};

/// A song arriving: its name, its bytes so far, and whether it was kept.
type Arrival = (String, Arc<Mutex<Vec<u8>>>, bool);
struct Mem { cache: Mutex<HashMap<String, Vec<u8>>>, songs: HashMap<String, Vec<u8>>, incoming: Mutex<HashMap<u64, Arrival>>, events: mpsc::UnboundedSender<(String, Value)> }
struct Sink(Arc<Mutex<Vec<u8>>>);
impl std::io::Write for Sink { fn write(&mut self, b: &[u8]) -> std::io::Result<usize> { self.0.lock().unwrap().extend_from_slice(b); Ok(b.len()) } fn flush(&mut self) -> std::io::Result<()> { Ok(()) } }
struct H(Arc<Mem>);
impl Host for H {
  fn event(&self, name: &str, payload: Value) { let _ = self.0.events.send((name.into(), payload)); }
  fn cache_read(&self, key: &str) -> Option<Vec<u8>> { self.0.cache.lock().unwrap().get(key).cloned() }
  fn cache_put(&self, key: &str, data: &[u8]) -> Result<(), String> { self.0.cache.lock().unwrap().insert(key.into(), data.to_vec()); Ok(()) }
  fn open_song(&self, path: &str) -> Result<(Box<dyn ReadSeek>, u64), String> { let b = self.0.songs.get(path).ok_or("no such song")?.clone(); let n = b.len() as u64; Ok((Box::new(std::io::Cursor::new(b)), n)) }
  fn incoming_begin(&self, name: &str) -> Result<Arriving, String> {
    let mut m = self.0.incoming.lock().unwrap();
    let token = m.len() as u64 + 1;
    let buf = Arc::new(Mutex::new(vec![]));
    m.insert(token, (name.to_string(), buf.clone(), false));
    Ok(Arriving { name: name.to_string(), file: Box::new(Sink(buf)), token })
  }
  fn incoming_end(&self, token: u64, ok: bool) -> Result<String, String> { let mut m = self.0.incoming.lock().unwrap(); let e = m.get_mut(&token).ok_or("?")?; e.2 = ok; Ok(format!("C:\\In\\{}", e.0)) }
}

#[derive(Clone)]
struct Client { ice: mpsc::UnboundedSender<Option<webrtc::peer_connection::RTCIceCandidateInit>>, gathered: mpsc::UnboundedSender<()> }
#[async_trait::async_trait]
impl PeerConnectionEventHandler for Client {
  async fn on_ice_candidate(&self, e: RTCPeerConnectionIceEvent) { if let Ok(c) = e.candidate.to_json() { let _ = self.ice.send(Some(c)); } }
  async fn on_ice_gathering_state_change(&self, s: RTCIceGatheringState) { if s == RTCIceGatheringState::Complete { let _ = self.gathered.send(()); } }
}

/// The next text message on a channel, as JSON (binary ones go to `bin`).
async fn next_text(dc: &Arc<dyn DataChannel>, bin: &mut Vec<Vec<u8>>) -> Value {
  loop {
    match tokio::time::timeout(Duration::from_secs(15), dc.poll()).await.expect("an answer in time") {
      Some(DataChannelEvent::OnMessage(m)) if m.is_string => return serde_json::from_slice(&m.data).unwrap(),
      Some(DataChannelEvent::OnMessage(m)) => bin.push(m.data.to_vec()),
      Some(_) => {}
      None => panic!("channel closed"),
    }
  }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_device_asks_and_sends() {
  let (etx, mut erx) = mpsc::unbounded_channel();
  let song: Vec<u8> = (0..300_000u32).map(|i| (i % 251) as u8).collect();
  let mem = Arc::new(Mem { songs: HashMap::from([("C:\\Music\\a.flac".to_string(), song.clone())]), events: etx, cache: Mutex::default(), incoming: Mutex::default() });
  mem.cache.lock().unwrap().insert("t/p1/c1/ab/ab01.bin".into(), vec![9; 3072]);
  let server = Server::new(H(mem.clone()));

  // The "website": an offer with a stream channel and a files channel.
  let (itx, mut irx) = mpsc::unbounded_channel();
  let (gtx, mut grx) = mpsc::unbounded_channel();
  let pc = PeerConnectionBuilder::new().with_configuration(RTCConfigurationBuilder::new().build()).with_handler(Arc::new(Client { ice: itx, gathered: gtx }))
    .with_runtime(webrtc::runtime::default_runtime().unwrap()).with_setting_engine(glue_rtc::settings()).with_udp_addrs(vec!["0.0.0.0:0".to_string()]).build().await.unwrap();
  let stream = pc.create_data_channel("stream", None).await.unwrap();
  let files = pc.create_data_channel("files", None).await.unwrap();
  let offer = pc.create_offer(None).await.unwrap();
  pc.set_local_description(offer).await.unwrap();
  let _ = grx.recv().await;
  let offer = pc.local_description().await.unwrap().sdp;
  let answer = server.answer("h1", &offer, vec![], json!({ "version": "0.49.0", "max": 5, "name": "Desk" })).await.unwrap();
  pc.set_remote_description(RTCSessionDescription::answer(answer).unwrap()).await.unwrap();
  while let Ok(Some(c)) = irx.try_recv() { server.add_ice("h1", Some(c)).await.unwrap(); }
  // The server's candidates, as the app would relay them; and the app's answers to the library's questions.
  let (srv, pc2) = (server.clone(), Arc::new(pc));
  let pcc = pc2.clone();
  tokio::spawn(async move {
    while let Some((name, p)) = erx.recv().await {
      match name.as_str() {
        "rtc-ice" => if let Some(c) = p["candidate"].as_object() { let _ = pcc.add_ice_candidate(serde_json::from_value(Value::Object(c.clone())).unwrap()).await; },
        "rtc-request" => {
          let (conn, ch, n, req) = (p["conn"].as_str().unwrap().to_string(), p["chan"].as_u64().unwrap() as u32, p["n"].as_u64().unwrap() as u32, p["req"].clone());
          match req["t"].as_str().unwrap() {
            "range" => { srv.send_file(&conn, ch, n, &Song { path: "C:\\Music\\a.flac".into(), range: Some((req["start"].as_u64().unwrap(), req["len"].as_u64().unwrap())), name: "a.flac".into(), typ: "audio/flac".into() }).await.unwrap(); }
            "get" => { srv.send_file(&conn, ch, n, &Song { path: "C:\\Music\\a.flac".into(), range: None, name: "a.flac".into(), typ: "audio/flac".into() }).await.unwrap(); }
            "folders" => srv.reply(&conn, ch, n, json!([{ "id": "r1", "name": "Music", "collection": "DJ · Main" }]), &[], json!({})).await.unwrap(),
            _ => srv.error(&conn, ch, n, "not here").await.unwrap(),
          }
        }
        _ => {}
      }
    }
  });

  let mut bin = vec![];
  // Said first on a session's channel.
  assert_eq!(next_text(&stream, &mut bin).await, json!({ "t": "session", "version": "0.49.0", "max": 5 }));
  // A heartbeat, answered here.
  stream.send_text(&json!({ "t": "ping", "n": 1 }).to_string()).await.unwrap();
  assert_eq!(next_text(&stream, &mut bin).await["data"], "pong");
  assert_eq!(next_text(&stream, &mut bin).await, json!({ "t": "eof", "n": 1 }));
  // A cache file, read here.
  stream.send_text(&json!({ "t": "cache", "n": 2, "keys": ["t/p1/c1/ab/ab01.bin", "t/p1/c1/ab/ab02.bin"] }).to_string()).await.unwrap();
  let m = next_text(&stream, &mut bin).await;
  assert_eq!((m["data"].clone(), m["size"].clone()), (json!([["t/p1/c1/ab/ab01.bin", 3072], ["t/p1/c1/ab/ab02.bin", 0]]), json!(3072)));
  next_text(&stream, &mut bin).await;
  assert_eq!(bin.iter().map(|b| b.len() - 4).sum::<usize>(), 3072);
  assert!(bin.iter().all(|b| u32::from_le_bytes(b[..4].try_into().unwrap()) == 2));
  bin.clear();
  // Part of a song, read from "disk" here, the path from the app.
  stream.send_text(&json!({ "t": "range", "n": 3, "start": 100_000, "len": 150_000, "profile": "p1", "collection": "c1", "track": "ab01" }).to_string()).await.unwrap();
  let m = next_text(&stream, &mut bin).await;
  assert_eq!((m["size"].clone(), m["data"].clone(), m["name"].clone()), (json!(150_000), json!({ "total": 300_000, "type": "audio/flac" }), json!("a.flac")));
  assert_eq!(next_text(&stream, &mut bin).await, json!({ "t": "eof", "n": 3 }));
  let got: Vec<u8> = bin.iter().flat_map(|b| b[4..].to_vec()).collect();
  // 64 KB frames and their number (a peer that took only RFC 8841's 64 KB lost them: settings()).
  assert_eq!(bin.iter().map(|b| b.len()).collect::<Vec<_>>(), [65540, 65540, 18932]);
  assert!(got == song[100_000..250_000]);
  assert!(bin.iter().all(|b| b.len() <= 4 + 64 * 1024));
  bin.clear();
  // The whole song.
  stream.send_text(&json!({ "t": "get", "n": 4, "profile": "p1", "collection": "c1", "track": "ab01" }).to_string()).await.unwrap();
  let m = next_text(&stream, &mut bin).await;
  assert_eq!((m["size"].clone(), m["type"].clone()), (json!(300_000), json!("audio/flac")));
  assert_eq!(next_text(&stream, &mut bin).await, json!({ "t": "eof", "n": 4, "type": "audio/flac" }));
  assert_eq!(bin.iter().flat_map(|b| b[4..].to_vec()).collect::<Vec<u8>>(), song);
  bin.clear();
  // A question for the library (the app answers), and one it can't.
  stream.send_text(&json!({ "t": "folders", "n": 5 }).to_string()).await.unwrap();
  assert_eq!(next_text(&stream, &mut bin).await["data"][0]["name"], "Music");
  next_text(&stream, &mut bin).await;
  stream.send_text(&json!({ "t": "details", "n": 6, "profile": "p1", "collection": "c1", "track": "ab09" }).to_string()).await.unwrap();
  assert_eq!(next_text(&stream, &mut bin).await, json!({ "t": "error", "n": 6, "error": "not here" }));
  // A waveform handed over: kept in the cache.
  stream.send_text(&json!({ "t": "put", "n": 7, "kind": "wave", "profile": "p1", "collection": "c1", "track": "ab01", "size": 768 }).to_string()).await.unwrap();
  stream.send(glue_rtc::frame(7, &[5u8; 768])).await.unwrap();
  stream.send_text(&json!({ "t": "end", "n": 7 }).to_string()).await.unwrap();
  assert_eq!(next_text(&stream, &mut bin).await["t"], "meta");
  next_text(&stream, &mut bin).await;
  assert_eq!(mem.cache.lock().unwrap().get("w/p1/c1/ab/ab01.bin").map(|b| b.len()), Some(768));
  // What happened, said on the session.
  server.tell(json!({ "t": "event", "kind": "incoming" })).await;
  assert_eq!(next_text(&stream, &mut bin).await, json!({ "t": "event", "kind": "incoming" }));

  // A song sent to this computer, in 64 KB messages.
  let mut fbin = vec![];
  assert_eq!(next_text(&files, &mut fbin).await, json!({ "t": "ready", "name": "Desk" }));
  let sent: Vec<u8> = (0..200_000u32).map(|i| (i % 13) as u8).collect();
  files.send_text(&json!({ "t": "file", "n": 1, "name": "new.mp3", "size": sent.len() }).to_string()).await.unwrap();
  for part in sent.chunks(64 * 1024) { files.send(bytes::BytesMut::from(part)).await.unwrap(); }
  files.send_text(&json!({ "t": "end", "n": 1 }).to_string()).await.unwrap();
  assert_eq!(next_text(&files, &mut fbin).await, json!({ "t": "saved", "n": 1, "name": "new.mp3" }));
  let (name, buf, ok) = mem.incoming.lock().unwrap().get(&1).cloned().unwrap();
  assert_eq!((name.as_str(), ok), ("new.mp3", true));
  assert_eq!(*buf.lock().unwrap(), sent);
  // One that says more than it sends isn't kept.
  files.send_text(&json!({ "t": "file", "n": 2, "name": "short.mp3", "size": 1000 }).to_string()).await.unwrap();
  files.send(bytes::BytesMut::from(&[1u8; 10][..])).await.unwrap();
  files.send_text(&json!({ "t": "end", "n": 2 }).to_string()).await.unwrap();
  assert_eq!(next_text(&files, &mut fbin).await, json!({ "t": "failed", "n": 2, "error": "incomplete" }));
  // Counted as the service page counted them: every request but pings (a put and its end are two).
  assert_eq!(server.sessions()[0]["calls"], 7);
  server.close("h1").await;
  pc2.close().await.unwrap();
}

#[test]
fn puts_are_checked_like_the_service_page_checked_them() {
  let k = |r: Value, n: usize| glue_rtc::put_keys(&r, &vec![0; n]).map(|v| v.into_iter().map(|(k, _)| k).collect::<Vec<_>>());
  assert_eq!(k(json!({ "kind": "thumb", "profile": "p", "collection": "c", "track": "ab1" }), 10).unwrap(), ["t/p/c/ab/ab1.bin"]);
  assert_eq!(k(json!({ "kind": "wave", "profile": "p", "collection": "c", "track": "ab1" }), 10).unwrap(), Vec::<String>::new());
  assert_eq!(k(json!({ "kind": "art", "hash": "0123abcd", "px": 64 }), 10).unwrap(), ["a/0123abcd-64.jpg"]);
  assert_eq!(k(json!({ "kind": "art", "hash": "../x", "px": 64 }), 10).unwrap(), Vec::<String>::new());
  assert_eq!(k(json!({ "kind": "details", "profile": "p", "collection": "c", "track": "ab1", "header": {} }), 10).unwrap(), ["d/p/c/ab/ab1.bin", "d/p/c/ab/ab1.json"]);
  assert!(k(json!({ "kind": "thumb", "profile": "..", "collection": "c", "track": "ab1" }), 10).is_err());
}

/// The relay's servers as GLUE Cloud's `/v1/turn` gives them (Cloudflare's: TURN over UDP, TCP and TLS, with STUN):
/// taken, whatever this side can use of them.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_relays_servers_are_taken() {
  let (etx, _erx) = mpsc::unbounded_channel();
  let server = Server::new(H(Arc::new(Mem { songs: HashMap::new(), events: etx, cache: Mutex::default(), incoming: Mutex::default() })));
  let (itx, _irx) = mpsc::unbounded_channel();
  let (gtx, mut grx) = mpsc::unbounded_channel();
  let pc = PeerConnectionBuilder::new().with_configuration(RTCConfigurationBuilder::new().build()).with_handler(Arc::new(Client { ice: itx, gathered: gtx }))
    .with_runtime(webrtc::runtime::default_runtime().unwrap()).with_udp_addrs(vec!["0.0.0.0:0".to_string()]).build().await.unwrap();
  pc.create_data_channel("stream", None).await.unwrap();
  pc.set_local_description(pc.create_offer(None).await.unwrap()).await.unwrap();
  let _ = grx.recv().await;
  let offer = pc.local_description().await.unwrap().sdp;
  let servers = vec![
    glue_rtc::IceServer { urls: vec!["stun:stun.cloudflare.com:3478".into(), "stun:stun.l.google.com:19302".into()], ..Default::default() },
    glue_rtc::IceServer { urls: vec!["turn:turn.cloudflare.com:3478?transport=udp".into(), "turn:turn.cloudflare.com:3478?transport=tcp".into(), "turns:turn.cloudflare.com:5349?transport=tcp".into()], username: "u".into(), credential: "c".into() },
  ];
  let answer = server.answer("t1", &offer, servers, json!({ "version": "x", "max": 1, "name": "x" })).await;
  assert!(answer.as_ref().is_ok_and(|a| a.contains("a=ice-ufrag")), "{answer:?}");
  server.close("t1").await;
}
