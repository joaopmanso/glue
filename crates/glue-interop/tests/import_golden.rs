//! DJ libraries brought into a collection, against the website (tests/golden/import, recorded by
//! tests/store.golden.test.ts): each scenario's steps replayed over a folder in memory, the same ids given in order and
//! the clock moved as there, every file after each save byte for byte the TypeScript's.
use glue_interop::linked::import_lists;
use glue_interop::merge::apply_import;
use glue_interop::types::ImportedLibrary;
use glue_store::dir::MemDir;
use glue_store::store::{LoadOpts, Store};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::{AtomicI64, AtomicU32, Ordering};
use std::sync::Arc;

fn root() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/golden/import") }

/// `new Date(ms).toISOString()`.
fn iso(ms: i64) -> String {
  let (days, rem) = (ms.div_euclid(86_400_000), ms.rem_euclid(86_400_000));
  let day = glue_interop::types::iso_day(days as f64 * 86_400.0).unwrap();
  format!("{day}T{:02}:{:02}:{:02}.{:03}Z", rem / 3_600_000, rem / 60_000 % 60, rem / 1000 % 60, rem % 1000)
}

fn run(sc: &Value) -> Vec<Value> {
  let files: Vec<(String, String)> = sc["files"].as_object().unwrap().iter().map(|(k, v)| (k.clone(), v.as_str().unwrap().to_string())).collect();
  let mut dir = Some(MemDir::with(files));
  let mut s: Option<Store<MemDir>> = None;
  let now = Arc::new(AtomicI64::new(1_700_000_000_000));
  let n = Arc::new(AtomicU32::new(0));
  let mut out = vec![];
  for st in sc["steps"].as_array().unwrap() {
    if let Some(l) = st.get("load") {
      let opts = LoadOpts { me: l["me"].as_str().map(String::from), name: l["name"].as_str().map(String::from), shown_only: l["shownOnly"].as_bool().unwrap_or(false) };
      let at = now.clone();
      let mut store = Store::load(dir.take().unwrap(), l["pid"].as_str().unwrap(), l["cid"].as_str().unwrap(), opts, Box::new(move || { let ms = at.load(Ordering::SeqCst); (ms, iso(ms)) })).unwrap();
      let k = n.clone();
      store.set_ids(Box::new(move || format!("{:08x}00004000", k.fetch_add(1, Ordering::SeqCst) + 1)));
      out.push(json!({ "damaged": store.damaged }));
      s = Some(store);
    } else if let Some(op) = st.get("op") {
      s.as_mut().unwrap().apply(op);
    } else if let Some(i) = st.get("import") {
      let r = apply_import(s.as_mut().unwrap(), ImportedLibrary::from_json(&i["lib"]), i["fileName"].as_str().unwrap());
      out.push(json!({ "import": r.to_json() }));
    } else if let Some(i) = st.get("importLists") {
      let s = s.as_mut().unwrap();
      let src = s.sources.values().find(|x| x["app"] == i["app"] && x["fileName"] == i["fileName"]).cloned().unwrap();
      let ids: Vec<String> = i["ids"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect();
      out.push(json!({ "importLists": import_lists(s, &src, &ids) }));
    } else if let Some(ms) = st.get("advance") {
      now.fetch_add(ms.as_i64().unwrap(), Ordering::SeqCst);
    } else {
      let s = s.as_mut().unwrap();
      s.flush().unwrap();
      out.push(json!({ "files": s.root.snapshot() }));
    }
  }
  out
}

#[test]
fn libraries_come_in_as_on_the_website() {
  let mut failures = vec![];
  let mut names: Vec<String> = std::fs::read_dir(root()).unwrap().flatten().filter(|e| e.path().is_dir()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
  names.sort();
  assert!(names.len() >= 3, "{names:?}");
  for name in names {
    let read = |f: &str| -> Value { serde_json::from_str(&std::fs::read_to_string(root().join(&name).join(f)).unwrap()).unwrap() };
    let (sc, want) = (read("scenario.json"), read("expected.json"));
    let got = run(&sc);
    let want = want.as_array().unwrap();
    for (i, (g, w)) in got.iter().zip(want).enumerate() {
      if g == w { continue; }
      if let (Some(gf), Some(wf)) = (g.get("files").and_then(|f| f.as_object()), w.get("files").and_then(|f| f.as_object())) {
        for k in wf.keys().chain(gf.keys()) {
          let (a, b) = (gf.get(k).and_then(|v| v.as_str()).unwrap_or("<none>"), wf.get(k).and_then(|v| v.as_str()).unwrap_or("<none>"));
          if a != b {
            let at = a.chars().zip(b.chars()).take_while(|(x, y)| x == y).count();
            let ctx = |s: &str| s.chars().skip(at.saturating_sub(80)).take(200).collect::<String>();
            failures.push(format!("{name} step {i} {k}:\n   rust: …{}\n   ts:   …{}", ctx(a), ctx(b)));
          }
        }
      } else { failures.push(format!("{name} step {i}:\n   rust: {g}\n   ts:   {w}")); }
    }
    if got.len() != want.len() { failures.push(format!("{name}: {} results vs {}", got.len(), want.len())); }
  }
  assert!(failures.is_empty(), "\n{}", failures.join("\n"));
}
