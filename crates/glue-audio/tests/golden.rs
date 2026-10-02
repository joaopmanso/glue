//! The native engine against the JavaScript pipeline's results (tests/golden, made by tests/golden.test.ts): the same
//! file info, summary and verdict (text and all), and the same numbers within a hair (the maths differs by ≤2 ulp).
use glue_audio::{analyse, analyse_demo, types::AnalysisResult};
use serde_json::{json, Value};
use std::path::PathBuf;

fn root() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..") }
fn golden(name: &str, file: &str) -> Value { serde_json::from_str(&std::fs::read_to_string(root().join("tests/golden").join(name).join(file)).unwrap()).unwrap() }

/// Equal as JSON, numbers within `tol` (relative, or absolute near 0); `path` says where they differ.
fn same(a: &Value, b: &Value, tol: f64, path: &str, out: &mut Vec<String>) {
  match (a, b) {
    (Value::Number(x), Value::Number(y)) => {
      let (x, y) = (x.as_f64().unwrap(), y.as_f64().unwrap());
      if (x - y).abs() > tol * x.abs().max(y.abs()).max(1.0) { out.push(format!("{path}: {x} vs {y}")); }
    }
    (Value::Object(x), Value::Object(y)) => {
      let keys: std::collections::BTreeSet<&String> = x.keys().chain(y.keys()).collect();
      for k in keys {
        if out.len() > 20 { return; }
        match (x.get(k), y.get(k)) {
          (Some(p), Some(q)) => same(p, q, tol, &format!("{path}.{k}"), out),
          (p, q) => out.push(format!("{path}.{k}: {p:?} vs {q:?}")),
        }
      }
    }
    (Value::Array(x), Value::Array(y)) => {
      if x.len() != y.len() { out.push(format!("{path}: length {} vs {}", x.len(), y.len())); return; }
      for (i, (p, q)) in x.iter().zip(y).enumerate() { same(p, q, tol, &format!("{path}[{i}]"), out); }
    }
    _ => if a != b { out.push(format!("{path}: {a} vs {b}")); },
  }
}

fn result_json(r: &AnalysisResult) -> Value {
  let col_sums: Vec<f64> = (0..r.cols).map(|c| (0..r.rows).map(|k| r.spec[c * r.rows + k] as f64).sum()).collect();
  json!({
    "stats": r.stats, "music": r.music, "sr": r.sr, "duration": r.duration, "channels": r.channels, "containerBits": r.container_bits,
    "N": r.n, "binHz": r.bin_hz, "cols": r.cols, "rows": r.rows, "ltas": r.ltas, "colSums": col_sums,
  })
}

fn check(name: &str, info: Value, mut summary: Value, verdict: Value, result: Value) {
  let mut diffs = vec![];
  let o = summary.as_object_mut().unwrap();
  o.remove("at"); o.remove("engine"); o.remove("fp");
  same(&info, &golden(name, "info.json"), 1e-12, "info", &mut diffs);
  same(&summary, &golden(name, "summary.json"), 1e-12, "summary", &mut diffs);
  same(&verdict, &golden(name, "verdict.json"), 1e-9, "verdict", &mut diffs);
  same(&result, &golden(name, "result.json"), 1e-6, "result", &mut diffs);
  assert!(diffs.is_empty(), "{name} differs from the JavaScript pipeline:\n  {}", diffs.join("\n  "));
}

#[test]
fn lossless_fixtures_match_javascript() {
  for name in ["wav-44k-24.wav", "aiff-44k-24.aiff", "flac-96k-24.flac", "flac-192k-24.flac", "flac-cover.flac"] {
    let bytes = std::fs::read(root().join("tests/fixtures").join(name)).unwrap();
    let a = analyse(&bytes, name, bytes.len() as f64, 1_700_000_000_000.0, String::new()).unwrap_or_else(|e| panic!("{name}: {e}"));
    check(name, serde_json::to_value(&a.info).unwrap(), serde_json::to_value(&a.summary).unwrap(), serde_json::to_value(&a.verdict).unwrap(), result_json(&a.result));
  }
}

#[test]
fn the_demo_matches_javascript() {
  let (r, v, s, info) = analyse_demo();
  check("demo", serde_json::to_value(&info).unwrap(), serde_json::to_value(&s).unwrap(), serde_json::to_value(&v).unwrap(), result_json(&r));
}
