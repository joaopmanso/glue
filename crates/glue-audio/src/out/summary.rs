//! src/core/library/summary.ts: the small record kept per analysed song (ADR 0019).
use crate::js;
use crate::types::{AnalysisResult, AnalysisSummary, FileInfo, Severity, SummaryFinding, SummaryKey, Verdict};

/// `ANALYSIS_VERSION` and `VERDICT_VERSION` (src/store/types.ts): a native result is the same analysis.
pub const ANALYSIS_VERSION: f64 = 3.0;
pub const VERDICT_VERSION: f64 = 8.0;
/// What a native result says made it (`AnalysisSummary.engine`).
pub const ENGINE: &str = concat!("glue-audio ", env!("CARGO_PKG_VERSION"));

pub fn summarize(info: &FileInfo, res: &AnalysisResult, v: &Verdict, size: f64, mtime: f64, at: String) -> AnalysisSummary {
  let k = res.music.key.as_ref();
  AnalysisSummary {
    v: ANALYSIS_VERSION, at,
    grade: v.grade, label: v.label.clone(), headline: v.headline.clone(),
    fc: js::round(v.cut.fc), wall: v.cut.wall, full: v.cut.full,
    eff_bits: v.depth.as_ref().map(|d| d.eff), declared_bits: if info.bits != 0.0 && !info.bits.is_nan() { info.bits } else { 0.0 },
    origin: v.origin.clone(),
    bpm: res.music.bpm.filter(|&b| b != 0.0 && !b.is_nan()).map(|b| js::round(b * 100.0) / 100.0),
    key: k.map(|k| SummaryKey { tonic: k.tonic, mode: k.mode, margin: js::round(k.margin * 1000.0) / 1000.0, tuning: js::round(k.tuning) }),
    findings: v.findings.iter().map(|f| SummaryFinding { sev: f.sev, title: f.title.clone() }).collect(),
    file_size: size, file_mtime: mtime, error: None, fp: None, vv: Some(VERDICT_VERSION), engine: Some(ENGINE.into()),
  }
}

/// `failed`: a song that couldn't be analysed, with why.
pub fn failed(message: &str, size: f64, mtime: f64, at: String) -> AnalysisSummary {
  AnalysisSummary {
    v: ANALYSIS_VERSION, at, grade: Severity::Info, label: "Not analysed".into(), headline: message.into(),
    fc: 0.0, wall: false, full: false, eff_bits: None, declared_bits: 0.0, origin: String::new(), bpm: None, key: None, findings: vec![],
    file_size: size, file_mtime: mtime, error: Some(message.into()), fp: None, vv: None, engine: Some(ENGINE.into()),
  }
}

/// `new Date().toISOString()`: "2026-10-02T18:30:00.000Z".
pub fn now_iso() -> String {
  let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
  iso(ms)
}
pub fn iso(ms: i64) -> String {
  let (days, rem) = (ms.div_euclid(86_400_000), ms.rem_euclid(86_400_000));
  // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
  let z = days + 719_468;
  let era = z.div_euclid(146_097);
  let doe = z - era * 146_097;
  let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let d = doy - (153 * mp + 2) / 5 + 1;
  let m = if mp < 10 { mp + 3 } else { mp - 9 };
  let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
  format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z", rem / 3_600_000, rem / 60_000 % 60, rem / 1000 % 60, rem % 1000)
}

#[cfg(test)]
mod tests {
  #[test]
  fn iso_like_js() {
    assert_eq!(super::iso(1_700_000_000_000), "2023-11-14T22:13:20.000Z");
    assert_eq!(super::iso(0), "1970-01-01T00:00:00.000Z");
  }
}
