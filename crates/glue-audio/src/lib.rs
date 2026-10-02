//! GLUE's audio analysis in Rust (ADR 0147): the same steps and the same numbers as the TypeScript in `src/core`, so
//! GLUE Home's results match what the website makes. Each module mirrors one TypeScript file:
//! - `formats::{parse, clues, flac}`: src/core/formats/{parse,clues,flac}.ts
//! - `audio::{analyze, verdict, fingerprint}`: src/core/audio/{analyze,verdict,fingerprint}.ts
//! - `out::summary`: src/core/library/summary.ts
//! - `js`: JavaScript's numbers; `fft`: src/core/audio/fft.ts
// The code mirrors the TypeScript it ports, line for line (index loops, `if`s side by side, the same branches), so a
// review can hold the two side by side; these lints would rewrite that shape.
#![allow(clippy::needless_range_loop, clippy::result_unit_err, clippy::type_complexity, clippy::suspicious_else_formatting,
  clippy::if_same_then_else, clippy::manual_clamp, clippy::collapsible_match, clippy::manual_is_multiple_of,
  clippy::unnecessary_unwrap, clippy::manual_unwrap_or, clippy::unnecessary_map_or, clippy::manual_unwrap_or_default)]
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
  pub mod flac;
  pub mod parse;
}
pub mod out {
  pub mod summary;
}

use audio::analyze::{run_job, Job};
use audio::verdict::{classify, VerdictInput};
use types::{AnalysisResult, AnalysisSummary, FileInfo, Verdict};

/// Everything one song's analysis makes.
pub struct Analysis { pub info: FileInfo, pub result: AnalysisResult, pub verdict: Verdict, pub summary: AnalysisSummary }

/// Why a song wasn't analysed.
#[derive(Debug, Clone, PartialEq)]
pub enum Failure {
  /// The format can't be analysed (DSD, WavPack, a video-only MP4…): the message says so.
  Unsupported(String),
  /// A codec this engine doesn't decode yet.
  NoDecoder(String),
  /// The file couldn't be read as what it claims to be.
  Broken(String),
}
impl std::fmt::Display for Failure {
  fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result { match self { Failure::Unsupported(m) | Failure::NoDecoder(m) | Failure::Broken(m) => f.write_str(m) } }
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

/// One song, analysed: the worker's `summary` job (analysis.worker.ts), with the fingerprint. `at`: the summary's time.
pub fn analyse(bytes: &[u8], file_name: &str, size: f64, mtime: f64, at: String) -> Result<Analysis, Failure> {
  let mut info = file_info(bytes, file_name);
  if let Some(u) = &info.unsupported { return Err(Failure::Unsupported(u.clone())); }
  let job = if let Some(pcm) = info.pcm.clone() {
    Job::Pcm { bytes, pcm, sr: info.sample_rate }
  } else if info.container == "FLAC" {
    let d = formats::flac::decode_flac(bytes.len(), &mut |a, b| Ok(bytes[a.min(bytes.len())..b.min(bytes.len())].to_vec())).map_err(Failure::Broken)?;
    if info.channels == 0.0 || info.channels.is_nan() { info.channels = d.channels.len() as f64; }
    let bits = if info.lossless == Some(true) { info.bits } else { 0.0 };
    Job::Float { channels: d.channels, sr: d.sample_rate as f64, bits }
  } else {
    return Err(Failure::NoDecoder(format!("{} isn’t decoded natively yet.", info.codec)));
  };
  let result = run_job(job, true).map_err(Failure::Broken)?;
  if info.sample_rate == 0.0 || info.sample_rate.is_nan() { info.sample_rate = result.sr; }
  let verdict = classify(&info, &VerdictInput {
    sr: result.sr, stats: &result.stats, ltas: &result.ltas, bin_hz: result.bin_hz, container_bits: result.container_bits,
    spec: Some((&result.spec, result.cols, result.rows)),
  });
  let mut summary = out::summary::summarize(&info, &result, &verdict, size, mtime, at);
  summary.fp = Some(result.fp.is_some());
  Ok(Analysis { info, result, verdict, summary })
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
