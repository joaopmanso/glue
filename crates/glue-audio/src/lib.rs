//! GLUE's audio analysis in Rust (ADR 0147): the same steps and the same numbers as the TypeScript in `src/core`, so
//! GLUE Home's results match what the website makes. Each module mirrors one TypeScript file:
//! - `formats::{parse, clues, flac}`: src/core/formats/{parse,clues,flac}.ts
//! - `decode`: src/workers/decode.ts + src/core/audio/trim.ts (Symphonia for what isn't PCM or FLAC)
//! - `audio::{analyze, verdict, fingerprint}`: src/core/audio/{analyze,verdict,fingerprint}.ts
//! - `out::summary`: src/core/library/summary.ts; `out::files`: the stored forms (details, thumbnails, fingerprint
//!   file, tag fields, `Analysed`); `out::cover`: src/workers/cover.ts
//! - `js`: JavaScript's numbers; `fft`: src/core/audio/fft.ts

// The code mirrors the TypeScript it ports, line for line (index loops, `if`s side by side, the same branches), so a
// review can hold the two side by side; these lints would rewrite that shape.
#![allow(clippy::needless_range_loop, clippy::result_unit_err, clippy::type_complexity, clippy::suspicious_else_formatting,
  clippy::if_same_then_else, clippy::manual_clamp, clippy::collapsible_match, clippy::manual_is_multiple_of,
  clippy::unnecessary_unwrap, clippy::manual_unwrap_or, clippy::unnecessary_map_or, clippy::manual_unwrap_or_default, clippy::neg_cmp_op_on_partial_ord)]
pub mod control;
pub mod decode;
pub mod fft;
pub mod js;
pub mod types;

pub mod audio {
  pub mod analyze;
  pub mod fingerprint;
  pub mod verdict;
}
pub mod formats {
  pub mod clues;
  pub mod dsd;
  pub mod flac;
  pub mod parse;
}
pub mod out {
  pub mod cover;
  pub mod files;
  pub mod summary;
}

use audio::analyze::{run_job, Job};
use audio::verdict::{classify, VerdictInput};
use serde_json::Value;
use types::{AnalysisResult, AnalysisSummary, FileInfo, Verdict};

/// Everything one song's analysis makes: the record for the collection, and the files GLUE Home keeps (ADR 0103).
pub struct Analysis {
  pub info: FileInfo,
  pub result: AnalysisResult,
  pub verdict: Verdict,
  pub summary: AnalysisSummary,
  /// `d/…json` (the header) and the uncompressed block of `d/…bin` (`out::files::zlib` it before storing).
  pub details: (Value, Vec<u8>),
  /// `t/…bin`, `w/…bin`, `p/…bin`.
  pub thumb: Vec<u8>,
  pub wave: Vec<u8>,
  pub fingerprint: Vec<u8>,
  /// The cover: None when it couldn't be read (not looked for), Some(None) for none.
  pub cover: Option<Option<out::cover::Cover>>,
  /// What decoded it: "pcm", "flac" (GLUE's own), "symphonia" or "dsd"; and why GLUE's FLAC decoder gave a FLAC to
  /// Symphonia, if it did (for the native engine check).
  pub decoder: &'static str,
  pub flac_error: Option<String>,
}

impl Analysis {
  /// `s/…json`: the `Analysed` record (its duration is the container's, as `pool.ts` gives it).
  pub fn analysed(&self, size: f64, mtime: f64) -> Value {
    let art = self.cover.as_ref().map(|c| c.as_ref().map(|c| c.hash.as_str()).unwrap_or(""));
    out::files::analysed(&self.summary, &self.info, self.info.duration, art, size, mtime)
  }
}

/// Why a song wasn't analysed.
#[derive(Debug, Clone, PartialEq)]
pub enum Failure {
  /// The format can't be analysed (DSD, WavPack, a video-only MP4…): the message says so.
  Unsupported(String),
  /// It couldn't be decoded: kept as the song's ("Couldn't analyse", with why).
  Broken(String),
}
impl std::fmt::Display for Failure {
  fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result { match self { Failure::Unsupported(m) | Failure::Broken(m) => f.write_str(m) } }
}

/// The file's info as the analysis worker makes it (analysis.worker.ts `materialize`): parsed (blank if that fails),
/// with its name, size and clues.
pub fn file_info(bytes: &[u8], file_name: &str) -> FileInfo {
  let mut info = formats::parse::parse_container(bytes).unwrap_or_else(|_| FileInfo::blank());
  info.file_name = Some(file_name.to_string());
  info.file_size = Some(bytes.len() as f64);
  info.clues = Some(formats::clues::scan_clues(bytes, &info));
  info
}

fn ext_of(name: &str) -> String { name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default() }

/// One song, analysed: the worker's `summary` job (analysis.worker.ts) with every stored output. `at`: the summary's
/// time (ISO); `size`/`mtime`: the file's, as the collection knows them.
pub fn analyse(bytes: &[u8], file_name: &str, size: f64, mtime: f64, at: String) -> Result<Analysis, Failure> {
  let mut info = file_info(bytes, file_name);
  // DSD, which the website can't decode (ADR 0149): analysed as its 88.2 kHz PCM, as a converter would make it.
  let dsd = if info.codec == "DSD" {
    let d = formats::dsd::parse(bytes).map_err(Failure::Unsupported)?;
    info.unsupported = None;
    info.sample_rate = d.rate as f64; info.channels = d.channels as f64; info.duration = d.frames as f64 / d.rate as f64;
    info.bits_label = Some("1-bit".into());
    Some(d)
  } else { None };
  if let Some(u) = &info.unsupported { return Err(Failure::Unsupported(u.clone())); }
  let (mut decoder, mut flac_error) = ("pcm", None);
  let job = if let Some(d) = &dsd {
    decoder = "dsd";
    let (channels, sr) = formats::dsd::decode(bytes, d).map_err(Failure::Broken)?;
    Job::Float { channels, sr, bits: 0.0 }
  } else if let Some(pcm) = info.pcm.clone() {
    Job::Pcm { bytes, pcm, sr: info.sample_rate }
  } else {
    let bits = if info.lossless == Some(true) { info.bits } else { 0.0 };
    // FLAC, GLUE's own decoder (ADR 0144); anything else, or a FLAC it can't read, through Symphonia.
    let flac = if info.container == "FLAC" {
      match formats::flac::decode_flac(bytes.len(), &mut |a, b| Ok(bytes[a.min(bytes.len())..b.min(bytes.len())].to_vec())) {
        Ok(d) if d.channels.first().is_some_and(|c| !c.is_empty()) => Some(d),
        Ok(_) => { flac_error = Some("no samples".to_string()); None }
        Err(e) => { flac_error = Some(e); None }
      }
    } else { None };
    let (channels, sr) = match flac {
      Some(d) => { decoder = "flac"; (d.channels, d.sample_rate as f64) }
      None => { decoder = "symphonia"; control::check().map_err(Failure::Broken)?; let d = decode::decode(bytes, &info, &ext_of(file_name)).map_err(Failure::Broken)?; (d.channels, d.sr) }
    };
    if info.channels == 0.0 || info.channels.is_nan() { info.channels = channels.len() as f64; }
    Job::Float { channels, sr, bits }
  };
  let result = run_job(job, true).map_err(Failure::Broken)?;
  control::check().map_err(Failure::Broken)?;
  if info.sample_rate == 0.0 || info.sample_rate.is_nan() { info.sample_rate = result.sr; }
  let mut verdict = classify(&info, &VerdictInput {
    sr: result.sr, stats: &result.stats, ltas: &result.ltas, bin_hz: result.bin_hz, container_bits: result.container_bits,
    spec: Some((&result.spec, result.cols, result.rows)),
  });
  if let Some(d) = &dsd {
    verdict.findings.push(types::Finding { sev: types::Severity::Info, title: "Analysed from DSD".into(), detail: format!(
      "GLUE Home converted this {} file ({} MHz, 1-bit) to {} kHz PCM to analyse it, as a DSD converter would. Rising noise above about 25 kHz is DSD’s own noise shaping.",
      formats::dsd::name(d.rate), js::num_str(d.rate as f64 / 1e6), js::num_str(result.sr / 1000.0)) });
  }
  let mut summary = out::summary::summarize(&info, &result, &verdict, size, mtime, at);
  summary.fp = Some(result.fp.is_some());
  let details = out::files::details(&info, &result, size, mtime);
  let thumb = out::files::thumb(&result.spec, result.cols, result.rows);
  let wave = out::files::wave(&result.spec, result.cols, result.rows, result.sr);
  let fingerprint = result.fp.as_ref().map(out::files::fingerprint_file).unwrap_or_default();
  let cover = match out::cover::picture(bytes) { None => Some(None), Some(p) => out::cover::from_image(&p).ok().map(Some) };
  // What src/lib/pool.ts fills in afterwards, for the song's record: the length, and a lossy file's bitrate from its size.
  if info.channels == 0.0 || info.channels.is_nan() { info.channels = result.channels as f64; }
  if info.duration == 0.0 || info.duration.is_nan() { info.duration = result.duration; }
  if (info.bitrate == 0.0 || info.bitrate.is_nan()) && info.duration != 0.0 && !info.duration.is_nan() && info.lossless == Some(false) { info.bitrate = bytes.len() as f64 * 8.0 / info.duration / 1000.0; }
  Ok(Analysis { info, result, verdict, summary, details, thumb, wave, fingerprint, cover, decoder, flac_error })
}

/// The built-in example (analyze.ts `synthDemo`), analysed: the parity canary.
pub fn analyse_demo() -> (AnalysisResult, Verdict, AnalysisSummary, FileInfo) {
  let mut info = FileInfo::blank();
  info.container = "Example".into(); info.codec = "PCM".into(); info.lossless = Some(true);
  info.sample_rate = 96000.0; info.bits = 24.0; info.channels = 2.0; info.example = Some(true);
  let result = run_job(Job::Demo, false).expect("the demo has samples");
  let verdict = classify(&info, &VerdictInput { sr: result.sr, stats: &result.stats, ltas: &result.ltas, bin_hz: result.bin_hz, container_bits: result.container_bits, spec: Some((&result.spec, result.cols, result.rows)) });
  let summary = out::summary::summarize(&info, &result, &verdict, 0.0, 1_700_000_000_000.0, out::summary::iso(0));
  (result, verdict, summary, info)
}
