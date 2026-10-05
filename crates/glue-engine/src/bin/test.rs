//! The engine for the e2e tests (e2e/fakeHome.ts starts it): `glue-engine-test <GLUE folder> <cache folder>`, driven
//! by JSON lines on stdin, answering on stdout:
//!   in:  {"ask": n, "rpc": {...}}           a GLUE tab's request (Engine::rpc; `null` when it isn't the engine's)
//!        {"ask": n, "cmd": "...", ...}      what GLUE Home's service page asks of it (home/src-tauri/src/engine.rs's commands)
//!        {"set": {"lease": bool, "computer": "...", "analysis": {...}, "running": bool, "folders": {id: path}, "incoming": path}}
//!   out: {"ask": n, "ok": ...} | {"ask": n, "err": "..."}
//!        {"note": "event"|"edited"|"added"|"changed", ...}   what GLUE Home would tell its service page
//!        {"note": "tags", "path": relPath, "tags": {...}}     song info written into a file (the file is only touched,
//!                                                            its date 5 s on, as e2e/fakeHome.ts's /fs/tags does)
//! Every 2 s, as GLUE Home every 10 s: the jobs carried on, or the stores let go while a tab holds the lease.
use glue_engine::{Engine, Host};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct State { lease: bool, computer: Option<String>, analysis: Value, stopped: bool, folders: std::collections::HashMap<String, PathBuf>, incoming: Option<PathBuf> }
struct H { st: Arc<Mutex<State>>, out: Arc<Mutex<std::io::Stdout>> }
impl H {
  fn say(&self, v: Value) { let mut o = self.out.lock().unwrap(); let _ = writeln!(o, "{v}"); let _ = o.flush(); }
  fn folder(&self, root_id: &str) -> Option<PathBuf> { let g = self.st.lock().unwrap(); if root_id == "incoming" { g.incoming.clone() } else { g.folders.get(root_id).cloned() } }
}
impl Host for H {
  fn lease_held(&self) -> bool { self.st.lock().unwrap().lease }
  fn running(&self) -> bool { !self.st.lock().unwrap().stopped }
  fn computer(&self) -> Option<String> { self.st.lock().unwrap().computer.clone() }
  fn version(&self) -> String { "0.52.0".into() }
  fn analysis_state(&self) -> Value { self.st.lock().unwrap().analysis.clone() }
  fn event(&self, text: &str) { self.say(json!({ "note": "event", "text": text })) }
  fn edited(&self, p: &str, c: &str, paths: &[String]) { self.say(json!({ "note": "edited", "p": p, "c": c, "paths": paths })) }
  fn changed(&self) { self.say(json!({ "note": "changed" })) }
  fn added(&self) { self.say(json!({ "note": "added" })) }
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
  fn reachable(&self, root_id: &str) -> bool {
    match self.folder(root_id) { None => true, Some(p) => std::fs::read_dir(p).map(|mut d| d.next().is_some()).unwrap_or(false) }
  }
}

fn main() {
  let args: Vec<String> = std::env::args().skip(1).collect();
  let (st, out) = (Arc::new(Mutex::new(State::default())), Arc::new(Mutex::new(std::io::stdout())));
  let engine = Engine::new(args[0].clone().into(), args[1].clone().into(), H { st: st.clone(), out: out.clone() });
  let (e2, st2) = (engine.clone(), st.clone());
  std::thread::spawn(move || loop {
    std::thread::sleep(std::time::Duration::from_secs(2));
    if st2.lock().unwrap().lease { e2.forget(); } else { e2.run_jobs(); }
  });
  let say = |v: Value| { let mut o = out.lock().unwrap(); let _ = writeln!(o, "{v}"); let _ = o.flush(); };
  for line in std::io::stdin().lock().lines().map_while(Result::ok) {
    let Ok(m) = serde_json::from_str::<Value>(&line) else { continue };
    if let Some(s) = m.get("set") {
      let mut g = st.lock().unwrap();
      if let Some(l) = s["lease"].as_bool() { g.lease = l; }
      if let Some(c) = s.get("computer") { g.computer = c.as_str().map(String::from); }
      if let Some(a) = s.get("analysis") { g.analysis = a.clone(); }
      if let Some(r) = s["running"].as_bool() { g.stopped = !r; }
      if let Some(f) = s["folders"].as_object() { g.folders = f.iter().filter_map(|(k, v)| v.as_str().map(|p| (k.clone(), PathBuf::from(p)))).collect(); }
      if let Some(i) = s["incoming"].as_str() { g.incoming = Some(i.into()); }
      continue;
    }
    let (engine, out, ask) = (engine.clone(), out.clone(), m["ask"].clone());
    // Each on its own (a `wait` holds for up to 25 s).
    std::thread::spawn(move || {
      let r: Result<Value, String> = if let Some(b) = m.get("rpc") { engine.rpc(b).unwrap_or(Ok(Value::Null)) } else { glue_engine::command(&engine, &m) };
      let v = match r { Ok(v) => json!({ "ask": ask, "ok": v }), Err(e) => json!({ "ask": ask, "err": e }) };
      let mut o = out.lock().unwrap(); let _ = writeln!(o, "{v}"); let _ = o.flush();
    });
  }
  say(json!({ "note": "bye" }));
}
