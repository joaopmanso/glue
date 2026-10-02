//! The engine from the command line (ADR 0147):
//!   glue-audio analyse <file>…     each file's summary, as JSON lines
//!   glue-audio header <file>…      each file's details header (d/…json), its date taken as 5
//!   glue-audio bench <folder> [n]  analyses up to n songs under the folder (all by default), one at a time, and says
//!                                  how fast: songs a minute, MB/s, the slowest
use std::path::{Path, PathBuf};
use std::time::Instant;

const AUDIO: &[&str] = &["flac", "wav", "aif", "aiff", "mp3", "m4a", "mp4", "aac", "alac", "ogg", "oga", "opus", "wv", "dsf", "dff"];

fn songs(dir: &Path, out: &mut Vec<PathBuf>) {
  let Ok(d) = std::fs::read_dir(dir) else { return };
  let mut d: Vec<_> = d.flatten().map(|e| e.path()).collect();
  d.sort();
  for p in d {
    if p.is_dir() { songs(&p, out); }
    else if p.extension().and_then(|e| e.to_str()).is_some_and(|e| AUDIO.contains(&e.to_ascii_lowercase().as_str())) { out.push(p); }
  }
}

fn one(p: &Path) -> (Result<glue_audio::Analysis, String>, u64, u128) {
  let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
  let Ok(bytes) = std::fs::read(p) else { return (Err("can't be read".into()), 0, 0) };
  let t0 = Instant::now();
  let r = std::panic::catch_unwind(|| glue_audio::analyse(&bytes, &name, bytes.len() as f64, 0.0, String::new()))
    .map_err(|_| "panicked".to_string()).and_then(|r| r.map_err(|e| e.to_string()));
  (r, bytes.len() as u64, t0.elapsed().as_millis())
}

fn main() {
  let args: Vec<String> = std::env::args().skip(1).collect();
  match args.first().map(String::as_str) {
    Some("analyse") => for f in &args[1..] {
      let (r, _, ms) = one(Path::new(f));
      let line = match r { Ok(a) => serde_json::json!({ "file": f, "ms": ms, "summary": a.summary, "info": a.info }), Err(e) => serde_json::json!({ "file": f, "ms": ms, "error": e }) };
      println!("{line}");
    },
    // The details header (`d/…json`) as GLUE Home stores it, the file's date taken as 5 (to compare with the website's).
    Some("header") => for f in &args[1..] {
      let b = std::fs::read(f).unwrap_or_default();
      let name = Path::new(f).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
      match glue_audio::analyse(&b, &name, b.len() as f64, 5.0, String::new()) { Ok(a) => println!("{}", serde_json::json!({ "file": f, "header": a.details.0 })), Err(e) => println!("{}", serde_json::json!({ "file": f, "error": e.to_string() })) }
    },
    Some("bench") if args.len() > 1 => {
      let mut all = vec![];
      songs(Path::new(&args[1]), &mut all);
      let n = args.get(2).and_then(|n| n.parse().ok()).unwrap_or(all.len());
      all.truncate(n);
      let (t0, mut bytes, mut failed, mut slow) = (Instant::now(), 0u64, 0, vec![]);
      for (i, p) in all.iter().enumerate() {
        let (r, b, ms) = one(p);
        bytes += b;
        if let Err(e) = &r { failed += 1; eprintln!("{}: {e}", p.display()); }
        slow.push((ms, p.display().to_string()));
        if (i + 1) % 25 == 0 { eprintln!("{} of {}…", i + 1, all.len()); }
      }
      let s = t0.elapsed().as_secs_f64();
      slow.sort_by_key(|s| std::cmp::Reverse(s.0));
      println!("{} songs in {s:.1} s: {:.1} songs a minute, {:.1} MB/s, {failed} couldn't be analysed", all.len(), all.len() as f64 / s * 60.0, bytes as f64 / 1e6 / s);
      for (ms, p) in slow.iter().take(5) { println!("  {ms} ms  {p}"); }
    }
    _ => { eprintln!("glue-audio analyse <file>…  |  glue-audio bench <folder> [n]"); std::process::exit(2); }
  }
}
