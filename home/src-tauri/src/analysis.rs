//! The native analysis engine in GLUE Home (crates/glue-audio, ADR 0147, 0148). `analyse_song`: GLUE Home's queue
//! (home/ui/analysis.ts) hands it a song; it reads the file, analyses it and writes every cache file, in Rust.
//! `verify_song` analyses a song natively, saves nothing, and compares with what the service page made of it before.
//! The rest of GLUE Home's audio work is here too (ADR 0147's batch 4): songs arriving in the incoming folder
//! (`analyse_incoming`), covers (`cover_hash`, `cover_from_image`) and waveforms from kept details
//! (`wave_from_details`); the service page has no audio code of its own.
use serde_json::{json, Value};
use std::fs;
use std::io::{Read, Write};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

/// What GLUE Home's native results say made them (`AnalysisSummary.engine`).
#[allow(dead_code)]
pub const ENGINE: &str = glue_audio::out::summary::ENGINE;

/// How long a song's analysis may take (cache.ts `timeFor`, ADR 0144): 2 minutes, or a second a MB.
fn time_for(size: u64) -> std::time::Duration { std::time::Duration::from_millis(120_000u64.max((size as f64 / 1e6).round() as u64 * 1000)) }

fn now_iso() -> String {
  let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
  glue_audio::out::summary::iso(ms)
}

/// Run `f` on a thread of its own with room for a big song (16 MB of stack), and wait for it without holding up
/// GLUE Home's other work.
async fn on_own_thread<T: Send + 'static>(name: &str, f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
  let t = std::thread::Builder::new().name(name.into()).stack_size(16 << 20).spawn(f).map_err(|e| e.to_string())?;
  match tauri::async_runtime::spawn_blocking(move || t.join()).await {
    Ok(Ok(v)) => Ok(v),
    Ok(Err(_)) | Err(_) => Err("Its analysis worker stopped (the native engine failed on it).".into()),
  }
}

/// A song's file, read whole, giving way to songs being played (`Paced`, ADR 0138). `read only part`: a network folder
/// that dropped mid-file (passing: tried again later, never analysed from a part).
fn read_song(file: &std::path::Path, name: &str) -> Result<Vec<u8>, String> {
  let size = fs::metadata(file).map_err(|e| format!("{name} could not be read ({e})"))?.len();
  let f = fs::File::open(file).map_err(|e| format!("{name} could not be read ({e})"))?;
  let mut r = crate::local::Paced { inner: std::io::BufReader::with_capacity(1 << 20, f), pri: crate::local::Pri::Analysis, busy: crate::local::playing_now };
  let mut bytes = Vec::with_capacity(size as usize);
  if let Err(e) = r.read_to_end(&mut bytes) { if bytes.len() as u64 >= size { return Err(format!("{name} could not be read ({e})")); } }
  if (bytes.len() as u64) < size { return Err(format!("GLUE Home read only part of {name} ({} of {size} bytes): its folder isn’t reachable right now", bytes.len())); }
  Ok(bytes)
}

/// One song of a shared collection, analysed here (ADR 0148): read, decoded and analysed natively; its files written
/// to GLUE Home's cache (`t`, `w`, `d`, the cover's `a` and `c`, `p`, then `s` last: a result has all its parts).
/// `mtime`: the song's, as the collection knows it. A song that can't be analysed is saved as such (`failed` in the
/// answer); Err is a passing failure (unreadable now, out of time), not saved. The service page is told when the
/// reading is done (`analysis-step`), for its meter.
#[tauri::command]
pub async fn analyse_song(app: AppHandle, path: String, p: String, c: String, id: String, mtime: f64) -> Result<Value, String> {
  if [&p, &c, &id].iter().any(|s| s.is_empty() || s.contains(['/', '\\', '.'])) { return Err("bad song".into()); }
  let file = crate::allowed(&app, &path)?;
  let name = file.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
  let app2 = app.clone();
  on_own_thread("glue-analysis", move || -> Result<Value, String> {
    let t0 = Instant::now();
    let bytes = read_song(&file, &name)?;
    let read_ms = t0.elapsed().as_millis() as u64;
    let _ = app2.emit_to("service", "analysis-step", format!("{p}/{c}/{id}"));
    let k = |dir: &str, ext: &str| key(dir, &p, &c, &id, ext);
    let mut out = analyse_into(bytes, &name, mtime, &k, &|rel, data| crate::cache_put(&app2, &rel, data))?;
    out["readMs"] = json!(read_ms);
    Ok(out)
  }).await?
}

/// A song that arrived in the incoming folder (ADR 0048), analysed at once so it's ready when the website shows it in
/// TO BE SORTED: `i/<name>.thumb.bin`, `.wave.bin`, `.details.bin` + `.json`, and `.summary.json` last (the summary
/// with the file's format and length). Already analysed: nothing to do.
#[tauri::command]
pub async fn analyse_incoming(app: AppHandle, name: String, path: String) -> Result<(), String> {
  if name.is_empty() || name.contains(['/', '\\']) || name.starts_with('.') { return Err("bad name".into()); }
  if crate::cache_path(&app, &format!("i/{name}.summary.json")).is_ok_and(|p| p.is_file()) { return Ok(()); }
  let file = crate::allowed(&app, &path)?;
  on_own_thread("glue-incoming", move || -> Result<(), String> {
    let k = |what: &str| format!("i/{name}.{what}");
    let bytes = read_song(&file, &name)?;
    glue_audio::control::set_deadline(Some(Instant::now() + time_for(bytes.len() as u64)));
    let r = glue_audio::analyse(&bytes, &name, bytes.len() as f64, 0.0, now_iso());
    glue_audio::control::set_deadline(None);
    let a = r.map_err(|e| e.to_string())?;
    let put = |rel: String, data: &[u8]| crate::cache_put(&app, &rel, data);
    if !a.thumb.is_empty() { put(k("thumb.bin"), &a.thumb)?; }
    if !a.wave.is_empty() { put(k("wave.bin"), &a.wave)?; }
    put(k("details.bin"), &glue_audio::out::files::zlib(&a.details.1))?;
    put(k("details.json"), &serde_json::to_vec(&a.details.0).unwrap_or_default())?;
    let mut s = serde_json::to_value(&a.summary).unwrap_or(Value::Null);
    s["format"] = if a.info.container.is_empty() { Value::Null } else { serde_json::to_value(glue_audio::out::files::format_of(&a.info)).unwrap_or(Value::Null) };
    s["duration"] = json!(a.info.duration);
    put(k("summary.json"), &serde_json::to_vec(&s).unwrap_or_default())
  }).await?
}

/// A cover's two JPEGs kept (`a/<hash>-64.jpg`, `-320.jpg`), an album's songs sharing them.
fn keep_cover(app: &AppHandle, c: &glue_audio::out::cover::Cover) -> Result<(), String> {
  crate::cache_put(app, &format!("a/{}-64.jpg", c.hash), &c.small)?;
  crate::cache_put(app, &format!("a/{}-320.jpg", c.hash), &c.large)
}

/// A song's cover hash ('' for none), read from its tags (only them: the file isn't read whole), its JPEGs kept and the
/// hash remembered for the song (`c/…txt`, ADR 0082).
#[tauri::command]
pub async fn cover_hash(app: AppHandle, path: String, p: String, c: String, id: String) -> Result<String, String> {
  if [&p, &c, &id].iter().any(|s| s.is_empty() || s.contains(['/', '\\', '.'])) { return Err("bad song".into()); }
  let file = crate::allowed(&app, &path)?;
  on_own_thread("glue-cover", move || -> Result<String, String> {
    let f = fs::File::open(&file).map_err(|e| e.to_string())?;
    let cover = glue_audio::out::cover::picture_from(std::io::BufReader::new(f)).and_then(|pic| glue_audio::out::cover::from_image(&pic).ok());
    if let Some(cv) = &cover { keep_cover(&app, cv)?; }
    let hash = cover.map(|c| c.hash).unwrap_or_default();
    crate::cache_put(&app, &key("c", &p, &c, &id, "txt"), hash.as_bytes())?;
    Ok(hash)
  }).await?
}

/// A cover found by a cover service (ADR 0086, the picture as the request's body), made into its JPEGs and kept: its hash.
#[tauri::command]
pub async fn cover_from_image(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
  let tauri::ipc::InvokeBody::Raw(data) = request.body() else { return Err("expected bytes".into()) };
  let data = data.clone();
  on_own_thread("glue-cover", move || -> Result<String, String> {
    let cv = glue_audio::out::cover::from_image(&data)?;
    keep_cover(&app, &cv)?;
    Ok(cv.hash)
  }).await?
}

/// A song's waveform made from its kept details (no need to read the song again), kept, and answered; empty when its
/// details aren't kept (or are of another version).
#[tauri::command]
pub async fn wave_from_details(app: AppHandle, p: String, c: String, id: String) -> Result<tauri::ipc::Response, String> {
  if [&p, &c, &id].iter().any(|s| s.is_empty() || s.contains(['/', '\\', '.'])) { return Err("bad song".into()); }
  let w = on_own_thread("glue-wave", move || -> Result<Vec<u8>, String> {
    let read = |ext: &str| crate::cache_path(&app, &key("d", &p, &c, &id, ext)).ok().and_then(|f| fs::read(f).ok());
    let (Some(h), Some(bin)) = (read("json"), read("bin")) else { return Ok(vec![]) };
    let w = wave_of(&h, &bin);
    if !w.is_empty() { crate::cache_put(&app, &key("w", &p, &c, &id, "bin"), &w)?; }
    Ok(w)
  }).await??;
  Ok(tauri::ipc::Response::new(w))
}

/// The waveform of a kept analysis (`d/…json` + `.bin`): empty for one of another version or that can't be read.
fn wave_of(header: &[u8], bin: &[u8]) -> Vec<u8> {
  let Ok(h) = serde_json::from_slice::<Value>(header) else { return vec![] };
  if h["v"].as_f64() != Some(glue_audio::out::files::DETAILS_VERSION) { return vec![]; }
  let Ok(raw) = glue_audio::out::files::unzlib(bin) else { return vec![] };
  let Some((spec, _, cols, rows)) = glue_audio::out::files::decode_details(&h, &raw) else { return vec![] };
  glue_audio::out::files::wave(&spec, cols, rows, h["res"]["sr"].as_f64().unwrap_or(0.0))
}

/// A song's bytes analysed, and its cache files written through `put` (`k`: a part's cache key).
fn analyse_into(bytes: Vec<u8>, name: &str, mtime: f64, k: &dyn Fn(&str, &str) -> String, put: &dyn Fn(String, &[u8]) -> Result<(), String>) -> Result<Value, String> {
    let t0 = Instant::now();
    let size = bytes.len() as f64;
    glue_audio::control::set_deadline(Some(Instant::now() + time_for(bytes.len() as u64)));
    let r = glue_audio::analyse(&bytes, name, size, mtime, now_iso());
    glue_audio::control::set_deadline(None);
    drop(bytes);
    let analyse_ms = t0.elapsed().as_millis() as u64;
    let a = match r {
      Ok(a) => a,
      Err(glue_audio::Failure::Broken(m)) if m.contains("took too long") => return Err(m),
      Err(e) => {
        // Said once, like a GLUE tab says it: not tried again until the file changes.
        let msg = e.to_string();
        let s = glue_audio::out::summary::failed(&msg, size, mtime, now_iso());
        put(k("s", "json"), &serde_json::to_vec(&glue_audio::out::files::analysed_failed(&s, size, mtime)).unwrap_or_default())?;
        return Ok(json!({ "failed": msg, "bytes": size, "analyseMs": analyse_ms }));
      }
    };
    if !a.thumb.is_empty() { put(k("t", "bin"), &a.thumb)?; }
    if !a.wave.is_empty() { put(k("w", "bin"), &a.wave)?; }
    put(k("d", "bin"), &glue_audio::out::files::zlib(&a.details.1))?;
    put(k("d", "json"), &serde_json::to_vec(&a.details.0).unwrap_or_default())?;   // last: a header always has its data
    if let Some(cover) = &a.cover {
      if let Some(cv) = cover { put(format!("a/{}-64.jpg", cv.hash), &cv.small)?; put(format!("a/{}-320.jpg", cv.hash), &cv.large)?; }
      put(k("c", "txt"), cover.as_ref().map(|c| c.hash.as_bytes()).unwrap_or(b""))?;
    }
    if !a.fingerprint.is_empty() { put(k("p", "bin"), &a.fingerprint)?; }
    put(k("s", "json"), &serde_json::to_vec(&a.analysed(size, mtime)).unwrap_or_default())?;
    Ok(json!({ "bytes": size, "analyseMs": analyse_ms, "label": a.summary.label }))
}

/// The cache files of a song (cache.ts's keys).
fn key(dir: &str, p: &str, c: &str, id: &str, ext: &str) -> String { format!("{dir}/{p}/{c}/{}/{id}.{ext}", &id[..id.len().min(2)]) }

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
  json!({ "kind": kind, "lossy": lossy, "codec": a.info.codec, "decoder": a.decoder, "flacError": a.flac_error, "label": ns["label"], "diffs": diffs, "close": close, "ms": ms })
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

  /// A song analysed into the cache: every part, the result last; one that can't be decoded: only its failed result.
  #[test]
  fn analyses_a_song_into_the_cache() {
    use std::cell::RefCell;
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures");
    let written = RefCell::new(Vec::<(String, Vec<u8>)>::new());
    let put = |rel: String, d: &[u8]| { written.borrow_mut().push((rel, d.to_vec())); Ok(()) };
    let k = |d: &str, e: &str| super::key(d, "p1", "c1", "ab01", e);
    let r = super::analyse_into(std::fs::read(root.join("flac-cover.flac")).unwrap(), "x.flac", 5.0, &k, &put).unwrap();
    assert!(r.get("failed").is_none(), "{r}");
    let w = written.borrow();
    let names: Vec<&str> = w.iter().map(|(n, _)| n.as_str()).collect();
    for want in ["t/p1/c1/ab/ab01.bin", "w/p1/c1/ab/ab01.bin", "d/p1/c1/ab/ab01.bin", "d/p1/c1/ab/ab01.json", "c/p1/c1/ab/ab01.txt", "p/p1/c1/ab/ab01.bin"] { assert!(names.contains(&want), "{want} in {names:?}"); }
    assert!(names.iter().any(|n| n.starts_with("a/") && n.ends_with("-320.jpg")));
    assert_eq!(*names.last().unwrap(), "s/p1/c1/ab/ab01.json");
    let s: serde_json::Value = serde_json::from_slice(&w.last().unwrap().1).unwrap();
    assert_eq!(s["mtime"], 5.0);
    assert!(s["summary"]["engine"].as_str().unwrap().starts_with("glue-audio"));
    drop(w);
    written.borrow_mut().clear();
    let r = super::analyse_into(b"RIFF\x10\0\0\0WAVEjunkjunk".to_vec(), "y.wav", 5.0, &k, &put).unwrap();
    assert!(r["failed"].is_string(), "{r}");
    let w = written.borrow();
    assert_eq!(w.iter().map(|(n, _)| n.as_str()).collect::<Vec<_>>(), ["s/p1/c1/ab/ab01.json"]);
    let s: serde_json::Value = serde_json::from_slice(&w[0].1).unwrap();
    assert!(s["summary"]["error"].is_string());
  }

  /// A waveform made again from kept details; none from details of another version.
  #[test]
  fn a_wave_from_details_is_the_analysis_wave() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures");
    let bytes = std::fs::read(root.join("flac-96k-24.flac")).unwrap();
    let a = glue_audio::analyse(&bytes, "x.flac", bytes.len() as f64, 0.0, String::new()).unwrap();
    let w = super::wave_of(&serde_json::to_vec(&a.details.0).unwrap(), &glue_audio::out::files::zlib(&a.details.1));
    assert_eq!(w.len(), glue_audio::out::files::WAVE_BYTES);
    // From the stored (quantised) spectrum, as the website makes it (crates/glue-audio/tests/golden.rs holds it to the
    // website's byte for byte): not the analysis's own.
    assert!(w.iter().any(|&b| b > 0));
    assert!(super::wave_of(b"{\"v\":1}", &[]).is_empty());
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
