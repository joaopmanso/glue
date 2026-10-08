//! GLUE's DJ libraries in Rust (ADR 0167): the files of rekordbox, Traktor, Apple Music, Serato, Engine DJ and M3U
//! read as the website reads them (`src/core/interop`, `src/lib/imports.ts`), held to it by tests/golden/interop.
pub mod apple;
pub mod engine;
pub mod linked;
pub mod m3u;
pub mod merge;
pub mod perf;
pub mod rekordbox;
pub mod serato;
pub mod sync;
pub mod traktor;
pub mod types;
pub mod xml;

use types::{utf8, windows1252, ImportedLibrary};

/// What the files chosen together are (`parseLibraryFiles`): the libraries, each with the file it came from, and the
/// files that aren't one (with why). A Serato "database V2" takes the .crate files alongside; Engine DJ libraries
/// chosen together are one set.
pub fn parse_library_files(files: &[(String, Vec<u8>)]) -> (Vec<(ImportedLibrary, String)>, Vec<String>) {
  let (mut libs, mut skipped, mut engines) = (vec![], vec![], vec![]);
  let is_crate = |n: &str| n.to_ascii_lowercase().ends_with(".crate");
  let crates: Vec<(String, Vec<u8>)> = files.iter().filter(|f| is_crate(&f.0)).cloned().collect();
  for (name, bytes) in files {
    if is_crate(name) { continue; }
    let head = utf8(&bytes[..bytes.len().min(4096)]);
    let low = name.to_ascii_lowercase();
    let r: Result<Option<ImportedLibrary>, String> = (|| {
      if engine::is_sqlite(bytes) { engines.push(engine::parse_engine_db(bytes, name)?); return Ok(None); }
      if serato::is_serato_database(bytes) { return serato::build_serato_library(bytes, &crates).map(Some); }
      if rekordbox::is_rekordbox_xml(&head) { return rekordbox::parse_rekordbox_xml(&utf8(bytes), name).map(Some); }
      if traktor::is_traktor_nml(&head) { return traktor::parse_traktor_nml(&utf8(bytes), name).map(Some); }
      if apple::is_apple_library(&head) { return apple::parse_apple_library(&utf8(bytes), name).map(Some); }
      if low.ends_with(".m3u") || low.ends_with(".m3u8") || head.starts_with("#EXTM3U") {
        // Old .m3u files are often Windows-1252.
        let u = utf8(bytes);
        return Ok(Some(m3u::parse_m3u(&if u.contains('\u{FFFD}') && low.ends_with(".m3u") { windows1252(bytes) } else { u }, name)));
      }
      Err(String::new())
    })();
    match r {
      Ok(Some(l)) => libs.push((l, name.clone())),
      Ok(None) => {}
      Err(e) if e.is_empty() => skipped.push(name.clone()),
      Err(e) => skipped.push(format!("{name} ({e})")),
    }
  }
  if !engines.is_empty() { libs.push((engine::combine_engine(engines), "m.db".into())); }
  if !crates.is_empty() && !libs.iter().any(|l| l.0.app == "serato") { skipped.extend(crates.iter().map(|c| format!("{} (needs Serato’s “database V2” too)", c.0))); }
  (libs, skipped)
}
