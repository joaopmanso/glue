//! src/core/types.ts and src/store/types.ts, as JSON: the same field names, absent where JavaScript leaves a field
//! undefined (`skip_serializing_if`), `null` where it's null. Numbers are f64, as in JavaScript.
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PcmLayout {
  pub fmt: String,
  pub le: bool,
  pub off: f64,
  pub len: f64,
  pub ch: f64,
  pub block_align: f64,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub unsigned8: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Clue { pub kind: String, pub label: String, #[serde(rename = "match")] pub matched: String }

/// What the container says about a file (formats/parse).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
  pub container: String,
  pub codec: String,
  pub lossless: Option<bool>,
  pub sample_rate: f64,
  pub bits: f64,
  pub channels: f64,
  pub duration: f64,
  pub bitrate: f64,
  pub bitrate_mode: String,
  pub encoder: String,
  pub vendor: String,
  pub tags: IndexMap<String, String>,
  pub notes: Vec<String>,
  #[serde(skip)]
  pub pcm: Option<PcmLayout>,
  #[serde(skip_serializing_if = "Option::is_none")] pub unsupported: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")] pub bits_label: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")] pub decode_rate: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")] pub brand: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")] pub compat_brands: Option<Vec<String>>,
  #[serde(skip_serializing_if = "Option::is_none")] pub lame_lowpass: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")] pub lame_method: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")] pub opus_input_rate: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")] pub nominal_bitrate: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")] pub channel_mode: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")] pub webm: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")] pub clues: Option<Vec<Clue>>,
  #[serde(skip_serializing_if = "Option::is_none")] pub file_name: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")] pub file_size: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")] pub example: Option<bool>,
}

impl FileInfo {
  /// `blankInfo()`.
  pub fn blank() -> FileInfo {
    FileInfo {
      container: "Unknown".into(), codec: "Unknown".into(), lossless: None, sample_rate: 0.0, bits: 0.0, channels: 0.0, duration: 0.0,
      bitrate: 0.0, bitrate_mode: String::new(), encoder: String::new(), vendor: String::new(), tags: IndexMap::new(), notes: vec![],
      pcm: None, unsupported: None, bits_label: None, decode_rate: None, brand: None, compat_brands: None, lame_lowpass: None,
      lame_method: None, opus_input_rate: None, nominal_bitrate: None, channel_mode: None, webm: None, clues: None, file_name: None,
      file_size: None, example: None,
    }
  }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SampleStats {
  pub peak: f64,
  pub rms: f64,
  pub clip_runs: f64,
  pub wasted: Option<f64>,
  pub assessed: bool,
  pub non_int: f64,
  pub float_fmt: bool,
  pub on16: f64,
  pub on24: f64,
  pub lr_identical: bool,
  pub lr_corr: Option<f64>,
  pub silent: bool,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode { Major, Minor }

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub struct Key { pub tonic: f64, pub mode: Mode }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KeyResult { pub tonic: f64, pub mode: Mode, pub r: f64, pub margin: f64, pub runner_up: Key, pub tuning: f64 }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MusicResult { pub bpm: Option<f64>, pub bpm_conf: f64, pub key: Option<KeyResult> }

/// An acoustic fingerprint (src/core/audio/fingerprint.ts).
#[derive(Clone, Debug, PartialEq)]
pub struct Fingerprint { pub words: Vec<u32>, pub loud: Vec<u8> }

/// `AnalysisResult`: what `runJob` returns.
#[derive(Clone, Debug)]
pub struct AnalysisResult {
  pub spec: Vec<f32>,
  pub cols: usize,
  pub rows: usize,
  pub ltas: Vec<f32>,
  pub n: usize,
  pub bin_hz: f64,
  pub music: MusicResult,
  pub stats: SampleStats,
  pub sr: f64,
  pub duration: f64,
  pub channels: usize,
  pub container_bits: f64,
  pub fp: Option<Fingerprint>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Severity { Bad, Warn, Ok, Info }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Finding { pub sev: Severity, pub title: String, pub detail: String }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Imaging { pub r: f64, pub corr: f64 }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Cutoff {
  pub fc: f64,
  pub wall: bool,
  pub drop: f64,
  pub full: bool,
  pub fade: f64,
  pub global_floor: f64,
  #[serde(rename = "ref")]
  pub reference: f64,
  pub rising: bool,
  pub imaging: Option<Imaging>,
  #[serde(skip)]
  pub sm: Vec<f32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub reach: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Depth { pub eff: f64, pub declared: f64, #[serde(skip_serializing_if = "Option::is_none")] pub float: Option<bool> }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Expected { pub hz: f64, pub why: String }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Verdict {
  pub grade: Severity,
  pub label: String,
  pub headline: String,
  pub sub: String,
  pub findings: Vec<Finding>,
  pub cut: Cutoff,
  pub depth: Option<Depth>,
  pub bw_tone: String,
  pub origin: String,
  pub expected: Option<Expected>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct SummaryKey { pub tonic: f64, pub mode: Mode, pub margin: f64, pub tuning: f64 }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct SummaryFinding { pub sev: Severity, pub title: String }

/// `AnalysisSummary` (src/store/types.ts): the small record kept per analysed song.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisSummary {
  pub v: f64,
  pub at: String,
  pub grade: Severity,
  pub label: String,
  pub headline: String,
  pub fc: f64,
  pub wall: bool,
  pub full: bool,
  pub eff_bits: Option<f64>,
  pub declared_bits: f64,
  pub origin: String,
  pub bpm: Option<f64>,
  pub key: Option<SummaryKey>,
  pub findings: Vec<SummaryFinding>,
  pub file_size: f64,
  pub file_mtime: f64,
  #[serde(skip_serializing_if = "Option::is_none")] pub error: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")] pub fp: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")] pub vv: Option<f64>,
  /// Which engine made it (ADR 0147); absent for the website's JavaScript.
  #[serde(skip_serializing_if = "Option::is_none")] pub engine: Option<String>,
}
