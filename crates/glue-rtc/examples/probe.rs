//! The protocol against a real browser (scripts/rtc-probe.mjs drives Edge): a server over a folder, signaled through
//! stdin and stdout as JSON lines. In: `{"offer": sdp}`, `{"ice": candidate|null}`. Out: `{"answer": sdp}`, and each
//! event as `{"event": name, "payload": …}`. The library's questions are answered here: `range` and `get` with the
//! song given on the command line, the rest with an error.
//!   cargo run --release --example probe -- <folder> <song>
use glue_rtc::{Arriving, Host, ReadSeek, Server, Song};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

struct Disk { dir: PathBuf, open: Mutex<Vec<(PathBuf, PathBuf)>>, out: Mutex<std::io::Stdout> }
impl Disk { fn say(&self, v: Value) { let mut o = self.out.lock().unwrap(); let _ = writeln!(o, "{v}"); let _ = o.flush(); } }
impl Host for Disk {
  fn event(&self, name: &str, payload: Value) { self.say(json!({ "event": name, "payload": payload })); }
  fn cache_read(&self, key: &str) -> Option<Vec<u8>> { if key.contains("..") { return None; } std::fs::read(self.dir.join("cache").join(key)).ok() }
  fn cache_put(&self, key: &str, data: &[u8]) -> Result<(), String> {
    let p = self.dir.join("cache").join(key);
    std::fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(p, data).map_err(|e| e.to_string())
  }
  fn open_song(&self, path: &str) -> Result<(Box<dyn ReadSeek>, u64), String> {
    let f = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let n = f.metadata().map_err(|e| e.to_string())?.len();
    Ok((Box::new(f), n))
  }
  fn incoming_begin(&self, name: &str) -> Result<Arriving, String> {
    let dir = self.dir.join("incoming");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let (fin, part) = (dir.join(name), dir.join(format!("{name}.part")));
    let f = std::fs::File::create(&part).map_err(|e| e.to_string())?;
    let mut open = self.open.lock().unwrap();
    open.push((part, fin));
    Ok(Arriving { name: name.into(), file: Box::new(f), token: open.len() as u64 - 1 })
  }
  fn incoming_end(&self, token: u64, ok: bool) -> Result<String, String> {
    let (part, fin) = self.open.lock().unwrap()[token as usize].clone();
    if !ok { let _ = std::fs::remove_file(&part); return Ok(String::new()); }
    std::fs::rename(&part, &fin).map_err(|e| e.to_string())?;
    Ok(fin.to_string_lossy().into_owned())
  }
}

/// The events go out as lines; this host also answers the library's questions itself.
struct Probe { disk: Arc<Disk>, server: Mutex<Option<Arc<Server<Fwd>>>>, song: String }
struct Fwd(Arc<Probe>);
impl Host for Fwd {
  fn event(&self, name: &str, payload: Value) {
    if name == "rtc-request" {
      let (p, payload) = (self.0.clone(), payload.clone());
      tokio::spawn(async move {
        let srv = p.server.lock().unwrap().clone().unwrap();
        let (conn, ch, n, req) = (payload["conn"].as_str().unwrap().to_string(), payload["chan"].as_u64().unwrap() as u32, payload["n"].as_u64().unwrap() as u32, payload["req"].clone());
        let range = (req["t"] == "range").then(|| (req["start"].as_u64().unwrap_or(0), req["len"].as_u64().unwrap_or(0)));
        let r = match req["t"].as_str().unwrap_or("") {
          "range" | "get" => srv.send_file(&conn, ch, n, &Song { path: p.song.clone(), range, name: "probe.flac".into(), typ: "audio/flac".into() }).await.map(|_| ()),
          t => srv.error(&conn, ch, n, &format!("the probe doesn't answer {t}")).await,
        };
        if let Err(e) = r { eprintln!("probe: {e}"); }
      });
    }
    self.0.disk.event(name, payload);
  }
  fn cache_read(&self, key: &str) -> Option<Vec<u8>> { self.0.disk.cache_read(key) }
  fn cache_put(&self, key: &str, data: &[u8]) -> Result<(), String> { self.0.disk.cache_put(key, data) }
  fn open_song(&self, path: &str) -> Result<(Box<dyn ReadSeek>, u64), String> { self.0.disk.open_song(path) }
  fn incoming_begin(&self, name: &str) -> Result<Arriving, String> { self.0.disk.incoming_begin(name) }
  fn incoming_end(&self, token: u64, ok: bool) -> Result<String, String> { self.0.disk.incoming_end(token, ok) }
}

#[tokio::main]
async fn main() {
  let args: Vec<String> = std::env::args().skip(1).collect();
  let disk = Arc::new(Disk { dir: PathBuf::from(&args[0]), open: Mutex::new(vec![]), out: Mutex::new(std::io::stdout()) });
  let probe = Arc::new(Probe { disk: disk.clone(), server: Mutex::new(None), song: args[1].clone() });
  let server = Server::new(Fwd(probe.clone()));
  *probe.server.lock().unwrap() = Some(server.clone());
  let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
  std::thread::spawn(move || { for l in std::io::stdin().lock().lines().map_while(Result::ok) { if tx.send(l).is_err() { break; } } });
  while let Some(line) = rx.recv().await {
    let Ok(m) = serde_json::from_str::<Value>(&line) else { continue };
    if let Some(sdp) = m["offer"].as_str() {
      match server.answer("probe", sdp, vec![], json!({ "version": "0.49.0", "max": 5, "name": "Probe" })).await {
        Ok(a) => disk.say(json!({ "answer": a })),
        Err(e) => disk.say(json!({ "error": e })),
      }
    } else if m.get("ice").is_some() {
      let c = serde_json::from_value(m["ice"].clone()).ok();
      if let Err(e) = server.add_ice("probe", c).await { eprintln!("probe: {e}"); }
    }
  }
}
