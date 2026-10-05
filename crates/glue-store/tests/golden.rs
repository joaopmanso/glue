//! The Rust store against the website's (tests/golden/store, recorded by tests/store.golden.test.ts): every scenario's
//! steps replayed over a folder in memory, every file after each save byte for byte the TypeScript's.
use glue_store::dir::{Dir, MemDir};
use glue_store::store::{LoadOpts, Store};
use serde_json::{json, Value};
use std::path::PathBuf;

fn root() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/golden/store") }

fn run(sc: &Value) -> Vec<Value> {
  let files: Vec<(String, String)> = sc["files"].as_object().unwrap().iter().map(|(k, v)| (k.clone(), v.as_str().unwrap().to_string())).collect();
  let mut dir = Some(MemDir::with(files));
  let mut s: Option<Store<MemDir>> = None;
  let mut twins: Vec<(String, String)> = vec![];
  let mut out = vec![];
  for st in sc["steps"].as_array().unwrap() {
    if let Some(l) = st.get("load") {
      let opts = LoadOpts { me: l["me"].as_str().map(String::from), name: l["name"].as_str().map(String::from), shown_only: l["shownOnly"].as_bool().unwrap_or(false) };
      let clock = Box::new(|| (1_700_000_000_000i64, "2023-11-14T22:13:20.000Z".to_string()));
      let st = Store::load(dir.take().unwrap(), l["pid"].as_str().unwrap(), l["cid"].as_str().unwrap(), opts, clock).unwrap();
      out.push(json!({ "damaged": st.damaged }));
      s = Some(st);
    } else if let Some(op) = st.get("op") {
      s.as_mut().unwrap().apply(op);
    } else if let Some(f) = st.get("fold") {
      let r = s.as_mut().unwrap().fold_computer(f["into"].as_str().unwrap(), f["name"].as_str());
      twins = r.as_ref().map(|r| r.1.clone()).unwrap_or_default();
      out.push(json!({ "fold": r.map(|(c, twins)| json!({
        "counts": { "copiesMoved": c.copies_moved, "copiesDropped": c.copies_dropped, "analysesMoved": c.analyses_moved, "twins": c.twins },
        "twins": twins.iter().map(|(a, b)| json!([a, b])).collect::<Vec<_>>(),
      })) }));
    } else if st.get("absorb").is_some() {
      let s = s.as_mut().unwrap();
      let mut into = indexmap::IndexMap::new();
      for (from, to) in &twins { if let Some(t) = s.tracks.get(to) { into.insert(from.clone(), t.clone()); } }
      s.absorb_tracks(&into);
    } else if let Some(paths) = st.get("reload") {
      let s = s.as_mut().unwrap();
      for (k, v) in st["files"].as_object().unwrap() { s.root.write(k, v.as_str().unwrap()).unwrap(); }
      let paths: Vec<String> = paths.as_array().unwrap().iter().map(|p| p.as_str().unwrap().to_string()).collect();
      s.reload_files(&paths).unwrap();
    } else {
      let s = s.as_mut().unwrap();
      s.flush().unwrap();
      out.push(json!({ "files": s.root.snapshot() }));
    }
  }
  out
}

#[test]
fn the_store_writes_what_the_website_writes() {
  let mut failures = vec![];
  let mut names: Vec<String> = std::fs::read_dir(root()).unwrap().flatten().filter(|e| e.path().is_dir()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
  names.sort();
  assert!(names.len() >= 7, "{names:?}");
  for name in names {
    let read = |f: &str| -> Value { serde_json::from_str(&std::fs::read_to_string(root().join(&name).join(f)).unwrap()).unwrap() };
    let (sc, want) = (read("scenario.json"), read("expected.json"));
    let got = run(&sc);
    let want = want.as_array().unwrap();
    for (i, (g, w)) in got.iter().zip(want).enumerate() {
      if g == w { continue; }
      // Say which file differs, and where.
      if let (Some(gf), Some(wf)) = (g.get("files").and_then(|f| f.as_object()), w.get("files").and_then(|f| f.as_object())) {
        for k in wf.keys().chain(gf.keys()) {
          let (a, b) = (gf.get(k).and_then(|v| v.as_str()).unwrap_or("<none>"), wf.get(k).and_then(|v| v.as_str()).unwrap_or("<none>"));
          if a != b {
            let at = a.chars().zip(b.chars()).take_while(|(x, y)| x == y).count();
            let ctx = |s: &str| s.chars().skip(at.saturating_sub(60)).take(160).collect::<String>();
            failures.push(format!("{name} step {i} {k}:\n   rust: …{}\n   ts:   …{}", ctx(a), ctx(b)));
            break;
          }
        }
      } else { failures.push(format!("{name} step {i}:\n   rust: {g}\n   ts:   {w}")); }
    }
    if got.len() != want.len() { failures.push(format!("{name}: {} results vs {}", got.len(), want.len())); }
  }
  assert!(failures.is_empty(), "\n{}", failures.join("\n"));
}
