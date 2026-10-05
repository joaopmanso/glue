//! One song analysed natively (crates/glue-audio, ADR 0147, 0148) and its parts written to GLUE Home's cache: `t`
//! (mini spectrogram), `w` (waveform), `d` (the full analysis), the cover's `a` and `c`, `p` (the fingerprint), then `s`
//! last (the result: a result has all its parts). Moved from home/src-tauri/src/analysis.rs so GLUE Home's queue and the
//! e2e tests' engine analyse alike (ADR 0154).
use serde_json::{json, Value};
use std::time::{Duration, Instant};

/// How long a song's analysis may take (ADR 0144): 2 minutes, or a second a MB.
pub fn time_for(size: u64) -> Duration { Duration::from_millis(120_000u64.max((size as f64 / 1e6).round() as u64 * 1000)) }

pub fn now_iso() -> String {
  let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
  glue_audio::out::summary::iso(ms)
}

/// A song's cache file (cache.ts's keys): `<dir>/<profile>/<collection>/<shard>/<id>.<ext>`.
pub fn key(dir: &str, p: &str, c: &str, id: &str, ext: &str) -> String { format!("{dir}/{p}/{c}/{}/{id}.{ext}", &id[..id.len().min(2)]) }

/// Writes a cache file.
pub type Put<'a> = dyn Fn(String, &[u8]) -> Result<(), String> + 'a;

/// A song's bytes analysed, and its cache files written through `put` (`k`: a part's cache key). A song that can't be
/// analysed is saved as such (`failed` in the answer: said once, not tried again until the file changes); Err is a
/// passing failure (out of time), not saved.
pub fn analyse_into(bytes: Vec<u8>, name: &str, mtime: f64, k: &dyn Fn(&str, &str) -> String, put: &Put) -> Result<Value, String> {
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

/// Run `f` on a thread of its own with room for a big song (16 MB of stack), and wait for it.
pub fn on_own_thread<T: Send + 'static>(name: &str, f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
  let t = std::thread::Builder::new().name(name.into()).stack_size(16 << 20).spawn(f).map_err(|e| e.to_string())?;
  t.join().map_err(|_| "Its analysis worker stopped (the native engine failed on it).".to_string())
}

/// A song's file read whole (the host may give way to songs being played). `read only part`: a folder that dropped
/// mid-file (passing: tried again later, never analysed from a part).
pub fn read_whole(file: &std::path::Path, name: &str, mut r: impl std::io::Read) -> Result<Vec<u8>, String> {
  let size = std::fs::metadata(file).map_err(|e| format!("{name} could not be read ({e})"))?.len();
  let mut bytes = Vec::with_capacity(size as usize);
  if let Err(e) = r.read_to_end(&mut bytes) { if bytes.len() as u64 >= size { return Err(format!("{name} could not be read ({e})")); } }
  if (bytes.len() as u64) < size { return Err(format!("GLUE Home read only part of {name} ({} of {size} bytes): its folder isn’t reachable right now", bytes.len())); }
  Ok(bytes)
}
