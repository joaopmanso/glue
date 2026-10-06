//! The engine for the e2e tests (e2e/fakeHome.ts starts it): `glue-engine-test <GLUE folder> <cache folder>`, driven
//! by JSON lines on stdin, answering on stdout:
//!   in:  {"ask": n, "rpc": {...}}           a GLUE tab's request (Engine::rpc)
//!        {"ask": n, "cmd": "...", ...}      what GLUE Home's service page asks of it (home/src-tauri/src/engine.rs's commands)
//!        {"set": {"config": {...}}}         GLUE Home's settings (the Tauri stand-in's, e2e/tauri-mock.ts)
//!        {"set": {"lease": bool, "running": bool, "folders": {id: path}, "incoming": path, "known": {...}}}
//!                                           what e2e/fakeHome.ts stands for: the lease, Stop, the music folders its
//!                                           disk knows, its incoming folder, this computer's usual folders
//!   out: {"ask": n, "ok": ...} | {"ask": n, "err": "..."}
//!        {"note": "event"|"edited"|"changed"|"analysis"|"made"|"config"|"search", ...}   what GLUE Home would tell its
//!                                           service page (`config`: a change to the settings; `search`: a drive search)
//!        {"note": "tags", "path": relPath, "tags": {...}}     song info written into a file (the file is only touched,
//!                                                            its date 5 s on, as e2e/fakeHome.ts's /fs/tags does)
//!        {"call": n, "cloud": {"method", "path", "type", "body"}}  a call to GLUE Cloud (the test's stands in), answered
//!   in:  {"reply": n, "status": 200, "body": "..."}
//!   out: {"call": n, "web": url}            a cover service asked (ADR 0086; the test's stand in), answered
//!   in:  {"reply": n, "status": 200, "body": "<base64>"}
//!        {"note": "background", "progress": {...}}           the background thumbnails' progress (ADR 0156)
//! Every 2 s, as GLUE Home every 10 s: the jobs carried on, or the stores let go while a tab holds the lease. The
//! analysis looks for songs a second after the settings first arrive, then every 10 s (GLUE Home: 20 s, every minute).
//! Songs are analysed for real (crates/glue-audio).
use glue_engine::library::Known;
use glue_engine::{Engine, Host};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::sync::{mpsc, Arc, Mutex};

#[derive(Default)]
struct State { lease: bool, stopped: bool, config: Option<Value>, folders: serde_json::Map<String, Value>, incoming: Option<PathBuf>, known: Option<Known>, port: u64 }
type Replies = Arc<Mutex<(u64, std::collections::HashMap<u64, mpsc::Sender<(u16, String)>>)>>;
struct H { st: Arc<Mutex<State>>, out: Arc<Mutex<std::io::Stdout>>, glue: String, replies: Replies }
impl H {
  fn say(&self, v: Value) { let mut o = self.out.lock().unwrap(); let _ = writeln!(o, "{v}"); let _ = o.flush(); }
  /// A call to the test (GLUE Cloud, a cover service): its status and body.
  fn call(&self, what: Value) -> Option<(u16, String)> {
    let (tx, rx) = mpsc::channel();
    let n = { let mut r = self.replies.lock().unwrap(); r.0 += 1; let n = r.0; r.1.insert(n, tx); n };
    let mut m = what; m["call"] = json!(n);
    self.say(m);
    rx.recv_timeout(std::time::Duration::from_secs(60)).ok()
  }
  fn folder(&self, root_id: &str) -> Option<PathBuf> {
    if root_id == "incoming" { return Some(self.incoming_dir()); }
    self.config()["folders"][root_id].as_str().map(PathBuf::from)
  }
}
impl Host for H {
  fn lease_held(&self) -> bool { self.st.lock().unwrap().lease }
  /// The settings, with the music folders the stand-in's disk knows and its GLUE folder.
  fn config(&self) -> Value {
    let g = self.st.lock().unwrap();
    let mut c = g.config.clone().unwrap_or_else(|| json!({}));
    let mut f = c["folders"].as_object().cloned().unwrap_or_default();
    f.extend(g.folders.clone());
    c["folders"] = Value::Object(f);
    c["glue"] = json!(self.glue);
    if g.stopped { c["running"] = json!(false); }
    c
  }
  fn patch_config(&self, f: &dyn Fn(&Value) -> Option<Value>) -> Option<Value> {
    let patch = f(&self.config())?;
    {
      let mut g = self.st.lock().unwrap();
      let c = g.config.get_or_insert_with(|| json!({}));
      for (k, v) in patch.as_object().into_iter().flatten() { c[k] = v.clone(); }
    }
    self.say(json!({ "note": "config", "patch": patch }));
    Some(self.config())
  }
  fn version(&self) -> String { "0.54.0".into() }
  fn known_folders(&self) -> Known { self.st.lock().unwrap().known.clone().unwrap_or(Known { sep: std::path::MAIN_SEPARATOR, ..Default::default() }) }
  fn incoming_dir(&self) -> PathBuf { self.st.lock().unwrap().incoming.clone().unwrap_or_else(|| PathBuf::from(&self.glue).join("..").join("Incoming")) }
  fn find_folder(&self, name: &str, sample: &str, secs: u64) -> Option<String> {
    self.say(json!({ "note": "search", "name": name }));
    glue_engine::library::search_folder(self.known_folders().starts(), name, sample, secs.clamp(1, 25))
  }
  fn event(&self, text: &str) { self.say(json!({ "note": "event", "text": text })) }
  fn edited(&self, p: &str, c: &str, paths: &[String]) { self.say(json!({ "note": "edited", "p": p, "c": c, "paths": paths })) }
  fn changed(&self) { self.say(json!({ "note": "changed" })) }
  fn analysis_changed(&self, state: &Value) { self.say(json!({ "note": "analysis", "state": state })) }
  fn made(&self, p: &str, c: &str, id: &str) { self.say(json!({ "note": "made", "p": p, "c": c, "id": id })) }
  fn cloud(&self, method: &str, path: &str, content_type: Option<&str>, body: Option<&str>) -> Result<String, glue_engine::sync::CloudError> {
    let (status, text) = self.call(json!({ "cloud": { "method": method, "path": path, "type": content_type, "body": body } })).ok_or_else(|| glue_engine::sync::CloudError::new("GLUE Cloud didn’t answer"))?;
    if (200..300).contains(&status) { Ok(text) } else { Err(glue_engine::sync::CloudError { status, message: format!("GLUE Cloud: {status}") }) }
  }
  fn write_tags(&self, root_id: &str, rel_path: &str, tags: &glue_store::json::Obj) -> Result<(f64, f64), String> {
    let root = self.folder(root_id).ok_or("GLUE Home doesn’t know this song’s music folder")?;
    let file = rel_path.split('/').fold(root, |p, x| p.join(x));
    let f = std::fs::File::options().write(true).open(&file).map_err(|e| e.to_string())?;
    let m = f.metadata().map_err(|e| e.to_string())?;
    let at = m.modified().map_err(|e| e.to_string())? + std::time::Duration::from_secs(5);
    f.set_modified(at).map_err(|e| e.to_string())?;
    self.say(json!({ "note": "tags", "path": rel_path, "tags": tags }));
    let ms = at.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0);
    Ok((m.len() as f64, ms))
  }
  fn web_get(&self, url: &str) -> Result<Vec<u8>, String> {
    use base64::Engine as _;
    let (status, body) = self.call(json!({ "web": url })).ok_or("the service didn’t answer")?;
    if !(200..300).contains(&status) { return Err(format!("the service said {status}")); }
    base64::engine::general_purpose::STANDARD.decode(body).map_err(|e| e.to_string())
  }
  fn local_link(&self) -> Value { let c = self.config(); json!({ "port": self.st.lock().unwrap().port, "token": c["localToken"], "readToken": c["readToken"] }) }
  fn background_changed(&self, progress: &Value) { self.say(json!({ "note": "background", "progress": progress })) }
  fn reachable(&self, root_id: &str) -> bool {
    match self.folder(root_id) { None => true, Some(p) => std::fs::read_dir(p).map(|mut d| d.next().is_some()).unwrap_or(false) }
  }
}

fn main() {
  let args: Vec<String> = std::env::args().skip(1).collect();
  let (st, out) = (Arc::new(Mutex::new(State::default())), Arc::new(Mutex::new(std::io::stdout())));
  let replies: Replies = Default::default();
  let engine = Engine::new(args[0].clone().into(), args[1].clone().into(), H { st: st.clone(), out: out.clone(), glue: args[0].clone(), replies: replies.clone() });
  let (e2, st2) = (engine.clone(), st.clone());
  std::thread::spawn(move || loop {
    std::thread::sleep(std::time::Duration::from_secs(2));
    if st2.lock().unwrap().lease { e2.forget(); } else { e2.run_jobs(); }
  });
  let say = |v: Value| { let mut o = out.lock().unwrap(); let _ = writeln!(o, "{v}"); let _ = o.flush(); };
  for line in std::io::stdin().lock().lines().map_while(Result::ok) {
    let Ok(m) = serde_json::from_str::<Value>(&line) else { continue };
    if let Some(n) = m["reply"].as_u64() {
      if let Some(tx) = replies.lock().unwrap().1.remove(&n) { let _ = tx.send((m["status"].as_u64().unwrap_or(0) as u16, m["body"].as_str().unwrap_or("").to_string())); }
      continue;
    }
    if let Some(s) = m.get("set") {
      let first = {
        let mut g = st.lock().unwrap();
        if let Some(l) = s["lease"].as_bool() { g.lease = l; }
        if let Some(r) = s["running"].as_bool() { g.stopped = !r; }
        if let Some(f) = s["folders"].as_object() { g.folders = f.clone(); }
        if let Some(i) = s["incoming"].as_str() { g.incoming = Some(i.into()); }
        if let Some(p) = s["port"].as_u64() { g.port = p; }
        if let Some(k) = s.get("known").filter(|k| k.is_object()) { g.known = Some(Known::from_json(k)); }
        match s.get("config").filter(|c| c.is_object()) { Some(c) => g.config.replace(c.clone()).is_none(), None => false }
      };
      // GLUE Home started: the analysis as its settings say.
      if first { engine.start_analysis(std::time::Duration::from_secs(1), std::time::Duration::from_secs(10)); }
      continue;
    }
    let (engine, out, ask) = (engine.clone(), out.clone(), m["ask"].clone());
    // Each on its own (a `wait` holds for up to 25 s).
    std::thread::spawn(move || {
      let r: Result<Value, String> = if let Some(b) = m.get("rpc") { engine.rpc(b) } else { glue_engine::command(&engine, &m) };
      let v = match r { Ok(v) => json!({ "ask": ask, "ok": v }), Err(e) => json!({ "ask": ask, "err": e }) };
      let mut o = out.lock().unwrap(); let _ = writeln!(o, "{v}"); let _ = o.flush();
    });
  }
  say(json!({ "note": "bye" }));
}
