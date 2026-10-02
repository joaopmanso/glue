//! The native analysis engine in GLUE Home (crates/glue-audio, ADR 0147). For now (0.45) it's linked and checked here:
//! `verify_song` analyses a song natively, saves nothing, and compares with what the service page made of it; the
//! service page still analyses until GLUE Home switches over (ADR 0147's batches).
use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use tauri::AppHandle;

/// What GLUE Home's native results say made them (`AnalysisSummary.engine`).
#[allow(dead_code)]
pub const ENGINE: &str = glue_audio::out::summary::ENGINE;

/// The cache files of a song (cache.ts's keys).
fn key(dir: &str, p: &str, c: &str, id: &str, ext: &str) -> String { format!("{dir}/{p}/{c}/{}/{id}.{ext}", &id[..id.len().min(2)]) }

/// Equal as JSON, numbers by value, keys in any order.
fn same(a: &Value, b: &Value) -> bool {
  match (a, b) {
    (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
    (Value::Object(x), Value::Object(y)) => x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| same(v, w))),
    (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(v, w)| same(v, w)),
    _ => a == b,
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
    if !same(&h, &a.details.0) { diffs.push("d: the header differs".into()); }
    match glue_audio::out::files::unzlib(&bin) {
      Ok(raw) => { let (n, max) = bytes_off(&a.details.1, &raw); if n == 0 {} else if lossy { close.push(format!("d: {n} bytes ±{max}")); } else { diffs.push(format!("d: {n} bytes differ")); } }
      Err(_) => diffs.push("d: the stored block can't be read".into()),
    }
  }
  if let Some(g) = read(&keys("p", "bin")) {
    let ber = bit_errors(&a.fingerprint, &g);
    if ber == 0.0 {} else if ber <= if lossy { 0.02 } else { 0.001 } { close.push(format!("p: {:.2}% bits", ber * 100.0)); } else { diffs.push(format!("p: {:.2}% of bits differ", ber * 100.0)); }
  }
  if let (Some(c), Some(Some(mine))) = (read(&keys("c", "txt")), a.cover.as_ref().map(|c| c.as_ref().map(|c| c.hash.clone()))) {
    if String::from_utf8_lossy(&c) != mine { diffs.push(format!("cover {mine} vs {}", String::from_utf8_lossy(&c))); }
  }
  let kind = if !diffs.is_empty() { "differs" } else if !close.is_empty() { "close" } else { "same" };
  json!({ "kind": kind, "lossy": lossy, "codec": a.info.codec, "label": ns["label"], "diffs": diffs, "close": close, "ms": ms, "storedMs": ss["ms"] })
}

/// Check one song of a shared collection natively (dry run: nothing is saved); the outcome is added to
/// `x/verify.jsonl` in GLUE Home's cache, and returned.
#[tauri::command]
pub async fn verify_song(app: AppHandle, path: String, p: String, c: String, id: String) -> Result<Value, String> {
  if [&p, &c, &id].iter().any(|s| s.is_empty() || s.contains(['/', '\\', '.'])) { return Err("bad song".into()); }
  tauri::async_runtime::spawn_blocking(move || {
    let file = crate::allowed(&app, &path)?;
    let meta = fs::metadata(&file).map_err(|e| e.to_string())?;
    let mtime = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as f64).unwrap_or(0.0);
    let t0 = std::time::Instant::now();
    let bytes = fs::read(&file).map_err(|e| e.to_string())?;
    let read_ms = t0.elapsed().as_millis() as u64;
    let name = file.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let read = |rel: &str| crate::cache_path(&app, rel).ok().and_then(|f| fs::read(f).ok());
    let keys = |dir: &str, ext: &str| key(dir, &p, &c, &id, ext);
    let mut out = verify(&bytes, &name, meta.len() as f64, mtime, &read, &keys);
    if let Value::Object(m) = &mut out {
      m.insert("id".into(), json!(id));
      m.insert("name".into(), json!(name));
      m.insert("size".into(), json!(meta.len()));
      m.insert("readMs".into(), json!(read_ms));
    }
    let log = crate::cache_path(&app, "x/verify.jsonl")?;
    if let Some(d) = log.parent() { let _ = fs::create_dir_all(d); }
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(log) { let _ = writeln!(f, "{out}"); }
    Ok(out)
  }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
  use std::path::PathBuf;

  #[test]
  fn analyses_a_fixture_like_the_website() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests");
    let bytes = std::fs::read(root.join("fixtures/flac-96k-24.flac")).unwrap();
    let a = glue_audio::analyse(&bytes, "flac-96k-24.flac", bytes.len() as f64, 0.0, String::new()).unwrap();
    let want: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(root.join("golden/flac-96k-24.flac/summary.json")).unwrap()).unwrap();
    assert_eq!(a.summary.label, want["label"].as_str().unwrap());
    assert_eq!(a.summary.headline, want["headline"].as_str().unwrap());
    assert!(super::ENGINE.starts_with("glue-audio "));
  }

  /// A song's stored files made from its own native analysis compare as the same; a changed byte doesn't.
  #[test]
  fn verify_compares_with_the_stored_files() {
    use std::collections::HashMap;
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests");
    let bytes = std::fs::read(root.join("fixtures/flac-96k-24.flac")).unwrap();
    let (size, mtime) = (bytes.len() as f64, 1_700_000_000_000.0);
    let a = glue_audio::analyse(&bytes, "x.flac", size, mtime, String::new()).unwrap();
    let mut files: HashMap<String, Vec<u8>> = HashMap::new();
    files.insert("s.json".into(), serde_json::to_vec(&a.analysed(size, mtime)).unwrap());
    files.insert("t.bin".into(), a.thumb.clone());
    files.insert("w.bin".into(), a.wave.clone());
    files.insert("d.json".into(), serde_json::to_vec(&a.details.0).unwrap());
    files.insert("d.bin".into(), glue_audio::out::files::zlib(&a.details.1));
    files.insert("p.bin".into(), a.fingerprint.clone());
    let keys = |d: &str, e: &str| format!("{d}.{e}");
    let run = |files: &HashMap<String, Vec<u8>>| super::verify(&bytes, "x.flac", size, mtime, &|k| files.get(k).cloned(), &keys);
    assert_eq!(run(&files)["kind"], "same", "{}", run(&files));
    files.get_mut("t.bin").unwrap()[10] ^= 0x40;
    assert_eq!(run(&files)["kind"], "differs");
    files.remove("s.json");
    assert_eq!(run(&files)["kind"], "skipped");
  }
}
