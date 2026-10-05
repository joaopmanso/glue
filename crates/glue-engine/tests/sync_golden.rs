//! The shared sync held to the website's (tests/golden/sync, recorded by tests/sync.golden.test.ts from
//! src/store/shared/engine.ts against GLUE Cloud's real code): each run's calls to GLUE Cloud, in order and with the
//! same arguments (packed texts compared unpacked), answered as recorded; then the same files, byte for byte.
use glue_engine::sync::{pack_text, sync_shared, unpack_text, CloudError, Place, SharedCloud};
use glue_store::dir::{Dir, MemDir};
use glue_store::json::stringify;
use serde_json::{json, Value};
use std::cell::RefCell;

struct Replay { calls: Vec<Value>, at: RefCell<usize>, name: String }
impl Replay {
  fn next(&self, call: &str, args: Value) -> Value {
    let mut i = self.at.borrow_mut();
    let want = self.calls.get(*i).unwrap_or_else(|| panic!("{}: an extra call {call} {args}", self.name));
    assert_eq!((call, &args), (want["call"].as_str().unwrap(), &want["args"]), "{}: call {} differs", self.name, *i);
    *i += 1;
    want["answer"].clone()
  }
}
impl SharedCloud for Replay {
  fn changes(&self, since: i64) -> Result<Value, CloudError> { Ok(self.next("changes", json!([since]))) }
  // Recorded unpacked (gzip's header differs by system): packed again here.
  fn bundle(&self, paths: &[String]) -> Result<String, CloudError> {
    let lines = self.next("bundle", json!([paths]));
    Ok(lines.as_array().unwrap().iter().map(|l| format!("{}\t{}\t{}\t{}", l[0].as_str().unwrap(), l[1], l[2].as_str().unwrap(), pack_text(l[3].as_str().unwrap()))).collect::<Vec<_>>().join("\n"))
  }
  fn log(&self, since: i64) -> Result<Value, CloudError> {
    let mut a = self.next("log", json!([since]));
    for e in a["entries"].as_array_mut().unwrap() { let t = pack_text(e["data"].as_str().unwrap()); e["data"] = json!(t); }
    Ok(a)
  }
  fn append(&self, base: i64, paths: &[String], data: &str) -> Result<Value, CloudError> { Ok(self.next("append", json!([base, paths, unpack_text(data).unwrap()]))) }
  fn touched(&self, to: i64) -> Result<Value, CloudError> { Ok(self.next("touched", json!([to]))) }
  fn checkpoint(&self, at: i64, body: &str, done: bool) -> Result<Value, CloudError> {
    let lines: Vec<Value> = body.split('\n').filter(|l| !l.is_empty()).map(|l| {
      let f: Vec<&str> = l.split('\t').collect();
      json!([f[0], f[1], f[2].parse::<i64>().unwrap(), if f[3] == "-" { "-".to_string() } else { unpack_text(f[3]).unwrap() }])
    }).collect();
    Ok(self.next("checkpoint", json!([at, lines, done])))
  }
}

#[test]
fn the_sync_does_what_the_website_does() {
  let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/golden/sync");
  let mut n = 0;
  for e in std::fs::read_dir(&dir).unwrap() {
    let path = e.unwrap().path();
    let name = path.file_stem().unwrap().to_string_lossy().into_owned();
    let g: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    let root = MemDir::with(g["files"].as_object().unwrap().iter().map(|(k, v)| (k.clone(), v.as_str().unwrap().to_string())));
    for (i, run) in g["runs"].as_array().unwrap().iter().enumerate() {
      for (k, v) in run["edit"].as_object().into_iter().flatten() { if v.is_null() { root.remove(k).unwrap(); } else { root.write(k, v.as_str().unwrap()).unwrap(); } }
      let cloud = Replay { calls: run["calls"].as_array().unwrap().clone(), at: RefCell::new(0), name: format!("{name} run {i}") };
      let place = Place { root: &root, pid: g["pid"].as_str().unwrap().into(), cid: g["cid"].as_str().unwrap().into(), me: g["me"].as_str().unwrap().into(), cloud: &cloud };
      let hint: Option<Vec<String>> = run["hint"].as_array().map(|h| h.iter().map(|x| x.as_str().unwrap().to_string()).collect());
      let mut changed = vec![];
      let r = sync_shared(&place, hint.as_deref(), &mut changed).unwrap_or_else(|e| panic!("{name} run {i}: {e}"));
      assert_eq!(*cloud.at.borrow(), cloud.calls.len(), "{name} run {i}: calls left over");
      assert_eq!(json!(r.changed), run["changed"], "{name} run {i}: changed");
      assert_eq!(stringify(&json!(r.clashes)), stringify(&run["clashes"]), "{name} run {i}: clashes");
      assert_eq!(json!(r.pushed), run["pushed"], "{name} run {i}: pushed");
      let after: Value = root.snapshot().into_iter().map(|(k, v)| (k, Value::String(v))).collect::<serde_json::Map<_, _>>().into();
      for (k, v) in run["after"].as_object().unwrap() { assert_eq!(after.get(k), Some(v), "{name} run {i}: {k}"); }
      assert_eq!(after.as_object().unwrap().len(), run["after"].as_object().unwrap().len(), "{name} run {i}: files");
      n += 1;
    }
  }
  assert!(n >= 5, "the recorded runs");
}
