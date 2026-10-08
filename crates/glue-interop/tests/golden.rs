//! The Rust parsers against the website's (tests/golden/interop, recorded by tests/interop.golden.test.ts): each case's
//! files parsed together, the libraries and what was skipped as the website's.
use serde_json::{json, Value};
use std::path::PathBuf;

fn root() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/golden/interop") }

/// Equal as JSON (numbers by value, objects whatever their order).
fn same(a: &Value, b: &Value, at: &str, diffs: &mut Vec<String>) {
  match (a, b) {
    (Value::Number(x), Value::Number(y)) if x.as_f64() == y.as_f64() => {}
    (Value::Object(x), Value::Object(y)) => {
      for k in x.keys().chain(y.keys()) { if !(x.contains_key(k) && y.contains_key(k)) { diffs.push(format!("{at}.{k}: only one has it")); } }
      for (k, v) in x { if let Some(w) = y.get(k) { same(v, w, &format!("{at}.{k}"), diffs); } }
    }
    (Value::Array(x), Value::Array(y)) if x.len() == y.len() => { for (i, (v, w)) in x.iter().zip(y).enumerate() { same(v, w, &format!("{at}[{i}]"), diffs); } }
    _ if a == b => {}
    _ => diffs.push(format!("{at}: {} ≠ {}", a.to_string().chars().take(300).collect::<String>(), b.to_string().chars().take(300).collect::<String>())),
  }
}

#[test]
fn the_libraries_read_as_the_website_reads_them() {
  let mut names: Vec<String> = std::fs::read_dir(root()).unwrap().flatten().filter(|e| e.path().is_dir()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
  names.sort();
  assert!(names.len() >= 8, "{names:?}");
  let mut diffs = vec![];
  for name in names {
    let dir = root().join(&name);
    let order: Vec<String> = serde_json::from_str(&std::fs::read_to_string(dir.join("files.json")).unwrap()).unwrap();
    let files: Vec<(String, Vec<u8>)> = order.iter().map(|f| (f.clone(), std::fs::read(dir.join("in").join(f)).unwrap())).collect();
    let (libs, skipped) = glue_interop::parse_library_files(&files);
    let got = json!({ "libs": libs.iter().map(|(l, f)| json!({ "lib": l.to_json(), "fileName": f })).collect::<Vec<_>>(), "skipped": skipped });
    let want: Value = serde_json::from_str(&std::fs::read_to_string(dir.join("expected.json")).unwrap()).unwrap();
    same(&got, &want, &name, &mut diffs);
  }
  assert!(diffs.is_empty(), "{}", diffs.join("\n"));
}
