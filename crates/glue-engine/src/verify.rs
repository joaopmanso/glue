//! The native engine checked against this computer's analyses (ADR 0147), home/ui/verify.ts in Rust (ADR 0160): a random
//! sample of the shared songs GLUE Home analysed, each analysed again natively (nothing saved) and compared with what's
//! stored (`verify`, ADR 0147's criteria). Each song's outcome is added to GLUE Home's cache, `x/verify.jsonl`; GLUE
//! Home's window shows the tally (the status's `verify`).
use crate::{text, Engine, Host};
use glue_store::dir::Dir;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// Numbers that are the same but for the last digits (the goldens' rule: within 1e-9 of their size): the maths
/// libraries round differently there (the desktop's check, 2026-10-02: a key's tuning off in its 16th digit).
fn near(x: f64, y: f64) -> bool { x == y || (x - y).abs() <= 1e-9 * x.abs().max(y.abs()).max(1.0) }

/// Equal as JSON, numbers by value (within `near`), keys in any order.
fn same(a: &Value, b: &Value) -> bool {
  match (a, b) {
    (Value::Number(x), Value::Number(y)) => near(x.as_f64().unwrap_or(f64::NAN), y.as_f64().unwrap_or(f64::NAN)),
    (Value::Object(x), Value::Object(y)) => x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| same(v, w))),
    (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(v, w)| same(v, w)),
    _ => a == b,
  }
}

/// Where two JSON values differ (`d.info.tags.ARTIST: "a" vs "b"`), at most `max` places, values cut short.
fn where_differ(a: &Value, b: &Value, path: &str, out: &mut Vec<String>, max: usize) {
  if out.len() >= max { return; }
  match (a, b) {
    (Value::Number(x), Value::Number(y)) if near(x.as_f64().unwrap_or(f64::NAN), y.as_f64().unwrap_or(f64::NAN)) => {}
    (Value::Object(x), Value::Object(y)) => {
      for k in x.keys().chain(y.keys().filter(|k| !x.contains_key(*k))) {
        where_differ(x.get(k).unwrap_or(&Value::Null), y.get(k).unwrap_or(&Value::Null), &format!("{path}.{k}"), out, max);
      }
    }
    (Value::Array(x), Value::Array(y)) if x.len() == y.len() => for (i, (v, w)) in x.iter().zip(y).enumerate() { where_differ(v, w, &format!("{path}[{i}]"), out, max); },
    _ if a == b => {}
    _ => {
      let short = |v: &Value| { let s = v.to_string(); if s.chars().count() > 60 { s.chars().take(60).collect::<String>() + "…" } else { s } };
      out.push(format!("{path}: {} natively, {} stored", short(a), short(b)));
    }
  }
}

/// Bytes that differ, and by how much at most.
fn bytes_off(a: &[u8], b: &[u8]) -> (usize, i32) {
  if a.len() != b.len() { return (a.len().max(b.len()), 255); }
  a.iter().zip(b).fold((0, 0), |(n, m), (x, y)| { let d = (*x as i32 - *y as i32).abs(); (n + (d != 0) as usize, m.max(d)) })
}

/// The share of a fingerprint's bits that differ (1 for a different length).
fn bit_errors(a: &[u8], b: &[u8]) -> f64 {
  if a.len() != b.len() || a.len() < 4 { return if a == b { 0.0 } else { 1.0 }; }
  let bits: u32 = a[4..].iter().zip(&b[4..]).map(|(x, y)| (x ^ y).count_ones()).sum();
  bits as f64 / (8 * (a.len() - 4)).max(1) as f64
}

/// One song checked: how the native analysis compares with what's stored (ADR 0147's criteria). `kind`: "same"
/// (identical, or both couldn't analyse it), "close" (a lossy file within the criteria), "differs", "failed" (only the
/// native engine couldn't), "fixed" (only the native engine could), "skipped" (nothing current to compare with).
pub fn verify(bytes: &[u8], name: &str, size: f64, mtime: f64, read: &dyn Fn(&str) -> Option<Vec<u8>>, keys: &dyn Fn(&str, &str) -> String) -> Value {
  let stored: Option<Value> = read(&keys("s", "json")).and_then(|b| serde_json::from_slice(&b).ok());
  let Some(stored) = stored else { return json!({ "kind": "skipped", "why": "not analysed here yet" }) };
  let ss = &stored["summary"];
  if ss["engine"].is_string() { return json!({ "kind": "skipped", "why": "analysed natively already" }); }
  if stored["size"].as_f64() != Some(size) || stored["mtime"].as_f64() != Some(mtime) { return json!({ "kind": "skipped", "why": "the file changed since" }); }
  let stored_failed = ss["error"].is_string();
  if ss["v"].as_f64() != Some(glue_audio::out::summary::ANALYSIS_VERSION) || (!stored_failed && ss["vv"].as_f64() != Some(glue_audio::out::summary::VERDICT_VERSION)) { return json!({ "kind": "skipped", "why": "analysed by an older version" }); }
  let t0 = std::time::Instant::now();
  let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| glue_audio::analyse(bytes, name, size, mtime, String::new())));
  let ms = t0.elapsed().as_millis() as u64;
  let a = match r {
    Err(_) => return json!({ "kind": "failed", "why": "the native engine panicked", "ms": ms }),
    Ok(Err(e)) => return json!({ "kind": if stored_failed { "same" } else { "failed" }, "why": format!("native: {e}"), "stored": ss["headline"], "ms": ms }),
    Ok(Ok(a)) => a,
  };
  // The service page couldn't (an ALAC M4A its WebView can't decode…), the native engine could.
  if stored_failed { return json!({ "kind": "fixed", "why": format!("stored: {}", ss["error"].as_str().unwrap_or("")), "codec": a.info.codec, "label": a.summary.label, "ms": ms }); }
  let lossy = a.info.lossless != Some(true);
  let mut diffs: Vec<String> = vec![];
  let mut close: Vec<String> = vec![];
  let ns = serde_json::to_value(&a.summary).unwrap_or(Value::Null);
  for k in ["grade", "label", "headline", "origin", "wall", "full", "effBits", "declaredBits", "findings"] {
    if !same(&ns[k], &ss[k]) { diffs.push(format!("{k}: {} vs {}", ns[k], ss[k])); }
  }
  let near = |k: &str, tol: f64, out: &mut Vec<String>, diffs: &mut Vec<String>| match (ns[k].as_f64(), ss[k].as_f64()) {
    (Some(x), Some(y)) if x == y => {}
    (Some(x), Some(y)) if lossy && (x - y).abs() <= tol => out.push(format!("{k} {x} vs {y}")),
    (None, None) => {}
    (x, y) => diffs.push(format!("{k}: {x:?} vs {y:?}")),
  };
  near("fc", 30.0, &mut close, &mut diffs);
  near("bpm", 0.05, &mut close, &mut diffs);
  if !same(&ns["key"]["tonic"], &ss["key"]["tonic"]) || ns["key"]["mode"] != ss["key"]["mode"] { diffs.push(format!("key {} vs {}", ns["key"], ss["key"])); }
  // The files: the thumbnails and waveform byte for byte (±2 for a lossy file), the details, the fingerprint.
  for (k, mine) in [("t", &a.thumb), ("w", &a.wave)] {
    let Some(g) = read(&keys(k, "bin")) else { continue };
    let (n, max) = bytes_off(mine, &g);
    if n == 0 {} else if lossy && max <= 2 { close.push(format!("{k}: {n} bytes ±{max}")); } else { diffs.push(format!("{k}: {n} bytes differ, by up to {max}")); }
  }
  if let (Some(h), Some(bin)) = (read(&keys("d", "json")), read(&keys("d", "bin"))) {
    let h: Value = serde_json::from_slice(&h).unwrap_or(Value::Null);
    if !same(&h, &a.details.0) { let max = diffs.len() + 4; where_differ(&a.details.0, &h, "d", &mut diffs, max); }
    match glue_audio::out::files::unzlib(&bin) {
      Ok(raw) => { let (n, max) = bytes_off(&a.details.1, &raw); if n == 0 {} else if lossy { close.push(format!("d: {n} bytes ±{max}")); } else { diffs.push(format!("d: {n} bytes differ")); } }
      Err(_) => diffs.push("d: the stored block can't be read".into()),
    }
  }
  // The tag fields (`s.fields`): what the library shows of the song's tags.
  let mine = a.analysed(size, mtime);
  if !same(&mine["fields"], &stored["fields"]) { let max = diffs.len() + 3; where_differ(&mine["fields"], &stored["fields"], "s.fields", &mut diffs, max); }
  if let Some(g) = read(&keys("p", "bin")) {
    let ber = bit_errors(&a.fingerprint, &g);
    if ber == 0.0 {} else if ber <= if lossy { 0.02 } else { 0.001 } { close.push(format!("p: {:.2}% bits", ber * 100.0)); } else { diffs.push(format!("p: {:.2}% of bits differ", ber * 100.0)); }
  }
  if let (Some(c), Some(Some(mine))) = (read(&keys("c", "txt")), a.cover.as_ref().map(|c| c.as_ref().map(|c| c.hash.clone()))) {
    if String::from_utf8_lossy(&c) != mine { diffs.push(format!("cover {mine} vs {}", String::from_utf8_lossy(&c))); }
  }
  let kind = if !diffs.is_empty() { "differs" } else if !close.is_empty() { "close" } else { "same" };
  json!({ "kind": kind, "lossy": lossy, "codec": a.info.codec, "decoder": a.decoder, "flacError": a.flac_error, "label": ns["label"], "diffs": diffs, "close": close, "ms": ms,
    // When the stored result was made, and by what: a difference only in older ones is the older decoder's.
    "storedAt": ss["at"], "storedEngine": ss["engine"] })
}

/// The check's progress (`VerifyState` in GLUE Home's window).
#[derive(Default)]
pub struct Check { pub st: Mutex<Value>, stop: AtomicBool }
impl Check {
  pub fn json(&self) -> Value { let v = self.st.lock().unwrap().clone(); if v.is_null() { fresh(false) } else { v } }
}
fn fresh(running: bool) -> Value { json!({ "running": running, "done": 0, "total": 0, "counts": {}, "ms": 0, "timed": 0, "skips": {}, "odd": [] }) }

const HEX: &[u8] = b"0123456789abcdef";

impl<H: Host> Engine<H> {
  /// Check `n` songs, one at a time on a thread of its own (this computer's other work goes on). 0: stop.
  pub fn verify_run(self: &Arc<Self>, n: usize) {
    if n == 0 { self.svc.check.stop.store(true, Ordering::SeqCst); return; }
    if self.svc.check.json()["running"] == true || self.host.config()["glue"].as_str().is_none_or(|g| g.is_empty()) { return; }
    *self.svc.check.st.lock().unwrap() = fresh(true);
    self.svc.check.stop.store(false, Ordering::SeqCst);
    self.report();
    let me = self.clone();
    std::thread::spawn(move || { me.verify_loop(n); me.svc.check.st.lock().unwrap()["running"] = json!(false); me.report(); });
  }
  fn verify_loop(&self, n: usize) {
    let cfg = self.host.config();
    let cache = self.cache_dir();
    let mut all: Vec<(String, String, String)> = vec![];
    let lib = self.describe().unwrap_or(Value::Null);
    for p in lib["profiles"].as_array().into_iter().flatten() { for c in p["collections"].as_array().into_iter().flatten() {
      let (pid, cid) = (text(p, "id"), text(c, "id"));
      if cfg["serve"][format!("{pid}/{cid}")] == false { continue; }
      for a in HEX { for b in HEX {
        let shard = format!("{}{}", *a as char, *b as char);
        for f in cache.list(&format!("s/{pid}/{cid}/{shard}"), false).unwrap_or_default() { if let Some(id) = f.strip_suffix(".json") { all.push((pid.clone(), cid.clone(), id.to_string())); } }
      } }
    } }
    // A random sample (the first n of a shuffle).
    let mut seed = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(7) | 1;
    for i in (1..all.len()).rev() { seed ^= seed << 13; seed ^= seed >> 7; seed ^= seed << 17; all.swap(i, (seed % (i as u64 + 1)) as usize); }
    all.truncate(n);
    { self.svc.check.st.lock().unwrap()["total"] = json!(all.len()); }
    self.report();
    for (k, (p, c, id)) in all.iter().enumerate() {
      if self.svc.check.stop.load(Ordering::SeqCst) { break; }
      let r = self.verify_song(p, c, id).unwrap_or_else(|e| json!({ "kind": "skipped", "why": e, "missing": true }));
      {
        let mut st = self.svc.check.st.lock().unwrap();
        let kind = r["kind"].as_str().unwrap_or("skipped").to_string();
        if r["missing"] == true { let m = st["counts"]["missing"].as_u64().unwrap_or(0) + 1; st["counts"]["missing"] = json!(m); }
        let n = st["counts"][&kind].as_u64().unwrap_or(0) + 1;
        st["counts"][&kind] = json!(n);
        if kind == "skipped" {
          let why = r["why"].as_str().unwrap_or("?");
          let why = if ["isn’t reachable", "couldn’t find", "isn’t in"].iter().any(|w| why.contains(w)) { "its file isn’t reachable".to_string() } else { why.to_string() };
          let n = st["skips"][&why].as_u64().unwrap_or(0) + 1;
          st["skips"][&why] = json!(n);
        }
        if let Some(ms) = r["ms"].as_f64().filter(|_| kind != "skipped") { st["ms"] = json!(st["ms"].as_f64().unwrap_or(0.0) + ms); st["timed"] = json!(st["timed"].as_u64().unwrap_or(0) + 1); }
        if kind == "differs" || kind == "failed" {
          let why = r["diffs"].as_array().filter(|d| !d.is_empty()).map(|d| d.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join("; ")).or_else(|| r["why"].as_str().map(String::from)).unwrap_or_default();
          let odd = json!({ "name": r["name"].as_str().unwrap_or(id), "kind": kind, "why": why });
          if let Some(list) = st["odd"].as_array_mut() { list.insert(0, odd); list.truncate(20); }
        }
        st["done"] = json!(k + 1);
      }
      if (k + 1) % 5 == 0 || k + 1 == all.len() { self.report(); }
    }
  }
  /// One song checked natively (nothing saved); its outcome added to `x/verify.jsonl` in GLUE Home's cache.
  pub fn verify_song(&self, p: &str, c: &str, id: &str) -> Result<Value, String> {
    let f = self.track_path(p, c, id, &self.host.config())?;
    let path = std::path::Path::new(&f.path);
    let meta = std::fs::metadata(path).map_err(|e| format!("{} couldn’t find it ({e})", f.name))?;
    let mtime = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as f64).unwrap_or(0.0);
    let t0 = std::time::Instant::now();
    let bytes = self.host.read_song(path, &f.name)?;
    let read_ms = t0.elapsed().as_millis() as u64;
    let cache = self.cache_dir();
    let read = |rel: &str| cache.read_bytes(rel).ok().flatten();
    let keys = |dir: &str, ext: &str| crate::analyse::key(dir, p, c, id, ext);
    let mut out = verify(&bytes, &f.name, meta.len() as f64, mtime, &read, &keys);
    if let Value::Object(m) = &mut out {
      m.insert("id".into(), json!(id));
      m.insert("name".into(), json!(f.name));
      m.insert("size".into(), json!(meta.len()));
      m.insert("readMs".into(), json!(read_ms));
    }
    let log = self.cache.join("x").join("verify.jsonl");
    let _ = std::fs::create_dir_all(self.cache.join("x"));
    if let Ok(mut fh) = std::fs::OpenOptions::new().create(true).append(true).open(log) { use std::io::Write; let _ = writeln!(fh, "{out}"); }
    Ok(out)
  }
}

#[cfg(test)]
mod tests {
  use std::path::PathBuf;

  /// A song's stored files made from its own native analysis compare as the same; a changed byte doesn't.
  #[test]
  fn verify_compares_with_the_stored_files() {
    use std::collections::HashMap;
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests");
    let bytes = std::fs::read(root.join("fixtures/flac-96k-24.flac")).unwrap();
    let (size, mtime) = (bytes.len() as f64, 1_700_000_000_000.0);
    let a = glue_audio::analyse(&bytes, "x.flac", size, mtime, String::new()).unwrap();
    let mut files: HashMap<String, Vec<u8>> = HashMap::new();
    // As the service page stored it (no `engine`: not made natively).
    let mut s = a.analysed(size, mtime);
    s["summary"].as_object_mut().unwrap().remove("engine");
    files.insert("s.json".into(), serde_json::to_vec(&s).unwrap());
    files.insert("t.bin".into(), a.thumb.clone());
    files.insert("w.bin".into(), a.wave.clone());
    files.insert("d.json".into(), serde_json::to_vec(&a.details.0).unwrap());
    files.insert("d.bin".into(), glue_audio::out::files::zlib(&a.details.1));
    files.insert("p.bin".into(), a.fingerprint.clone());
    let keys = |d: &str, e: &str| format!("{d}.{e}");
    let run = |files: &HashMap<String, Vec<u8>>| super::verify(&bytes, "x.flac", size, mtime, &|k| files.get(k).cloned(), &keys);
    assert_eq!(run(&files)["kind"], "same", "{}", run(&files));
    // A header field that differs is named, with both values.
    let mut h = a.details.0.clone();
    h["info"]["fileName"] = serde_json::json!("old.flac");
    files.insert("d.json".into(), serde_json::to_vec(&h).unwrap());
    let r = run(&files);
    assert_eq!(r["kind"], "differs");
    assert_eq!(r["diffs"][0], "d.info.fileName: \"x.flac\" natively, \"old.flac\" stored", "{r}");
    files.insert("d.json".into(), serde_json::to_vec(&a.details.0).unwrap());
    files.get_mut("t.bin").unwrap()[10] ^= 0x40;
    assert_eq!(run(&files)["kind"], "differs");
    files.remove("s.json");
    assert_eq!(run(&files)["kind"], "skipped");
  }
}
