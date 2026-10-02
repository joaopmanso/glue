//! The stored forms, byte for byte as the website writes them:
//! - details (src/store/details.ts): the header JSON, and the zlib block of [ltas f32 LE][spectrogram, 1 byte a cell];
//! - the mini spectrogram and the mini waveform (src/core/library/thumb.ts);
//! - the fingerprint file (src/store/fingerprints.ts);
//! - the tag fields, the format and the `Analysed` record (src/core/library/{tags,analysed}.ts).
use crate::js;
use crate::types::{AnalysisResult, AnalysisSummary, FileInfo, Fingerprint};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{Read, Write};

pub const DETAILS_VERSION: f64 = 2.0;
const Q_STEP: f64 = 0.8;
const Q_FLOOR: f64 = -204.0;
pub const MAX_ROWS: usize = 512;

/// `encodeDetails`: the header (JSON) and the uncompressed block (`zlib` compresses it, as `CompressionStream('deflate')`).
pub fn details(info: &FileInfo, res: &AnalysisResult, size: f64, mtime: f64) -> (Value, Vec<u8>) {
  let f = 1usize.max(res.rows.div_ceil(MAX_ROWS));
  let rows = res.rows.div_ceil(f);
  let cols = res.cols;
  let mut raw = Vec::with_capacity(res.ltas.len() * 4 + cols * rows);
  for v in &res.ltas { raw.extend_from_slice(&v.to_le_bytes()); }
  for c in 0..cols {
    let mut prev = 0i32;
    for r in 0..rows {
      let mut m = f64::NEG_INFINITY;
      for k in r * f..res.rows.min(r * f + f) { m = js::max(m, res.spec[c * res.rows + k] as f64); }
      let v = 0f64.max(255f64.min(js::round((m - Q_FLOOR) / Q_STEP))) as i32;
      raw.push(((v - prev) & 255) as u8);
      prev = v;
    }
  }
  let header = json!({
    "v": DETAILS_VERSION, "fileSize": size, "fileMtime": mtime, "info": info,
    "res": { "music": res.music, "cols": res.cols, "rows": rows, "N": res.n, "binHz": res.bin_hz, "stats": res.stats, "sr": res.sr,
      "duration": res.duration, "channels": res.channels, "containerBits": res.container_bits },
    "ltasLen": res.ltas.len(), "specLen": cols * rows,
  });
  (header, raw)
}

pub fn zlib(raw: &[u8]) -> Vec<u8> {
  let mut e = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
  e.write_all(raw).unwrap();
  e.finish().unwrap()
}
pub fn unzlib(bin: &[u8]) -> std::io::Result<Vec<u8>> {
  let mut out = Vec::new();
  flate2::read::ZlibDecoder::new(bin).read_to_end(&mut out)?;
  Ok(out)
}

/// `decodeDetails`'s spectrogram: the stored cells back to dB (cols × rows, column-major), and the average spectrum.
pub fn decode_details(header: &Value, raw: &[u8]) -> Option<(Vec<f32>, Vec<f32>, usize, usize)> {
  let ltas_len = header["ltasLen"].as_u64()? as usize;
  let spec_len = header["specLen"].as_u64()? as usize;
  let (cols, rows) = (header["res"]["cols"].as_u64()? as usize, header["res"]["rows"].as_u64()? as usize);
  if raw.len() < ltas_len * 4 + spec_len { return None; }
  let ltas = raw[..ltas_len * 4].chunks(4).map(|c| f32::from_le_bytes(c.try_into().unwrap())).collect();
  let q = &raw[ltas_len * 4..];
  let mut spec = vec![0f32; spec_len];
  for c in 0..cols {
    let mut v = 0u32;
    for r in 0..rows { v = (v + q[c * rows + r] as u32) & 255; spec[c * rows + r] = (v as f64 * Q_STEP + Q_FLOOR) as f32; }
  }
  Some((spec, ltas, cols, rows))
}

pub const THUMB_W: usize = 192;
pub const THUMB_H: usize = 16;
pub const WAVE_BYTES: usize = THUMB_W * 4;

/// `makeThumb`: 192 × 16 bytes, row-major, the top row the highest band.
pub fn thumb(spec: &[f32], cols: usize, rows: usize) -> Vec<u8> {
  let mut out = vec![0u8; THUMB_W * THUMB_H];
  if cols == 0 || rows == 0 { return out; }
  let edge = |k: usize| -> usize { rows.min(js::round(rows as f64 * js::pow(k as f64 / THUMB_H as f64, 1.7)) as usize) };
  for x in 0..THUMB_W {
    let c0 = (x * cols) / THUMB_W;
    let c1 = (c0 + 1).max(((x + 1) * cols) / THUMB_W);
    for k in 0..THUMB_H {
      let r0 = edge(k);
      let r1 = (r0 + 1).max(edge(k + 1));
      let mut m = f64::NEG_INFINITY;
      let mut c = c0;
      while c < c1 && c < cols { let o = c * rows; let mut rr = r0; while rr < r1 && rr < rows { if spec[o + rr] as f64 > m { m = spec[o + rr] as f64; } rr += 1; } c += 1; }
      let v = 0f64.max(1f64.min((m - -110.0) / 110.0));
      out[(THUMB_H - 1 - k) * THUMB_W + x] = js::round(js::pow(v, 1.4) * 255.0) as u8;
    }
  }
  out
}

/// `makeWaveThumb`: per column the level of the lows, mids, highs and everything, each scaled to its loudest.
pub fn wave(spec: &[f32], cols: usize, rows: usize, sr: f64) -> Vec<u8> {
  let mut out = vec![0u8; WAVE_BYTES];
  if cols == 0 || rows == 0 || !(sr > 0.0) { return out; }
  let nyq = sr / 2.0;
  let e1 = 1usize.max(js::round(200.0 / nyq * rows as f64) as usize);
  let e2 = (e1 + 1).max(js::round(2500.0 / nyq * rows as f64) as usize);
  let mut bands = vec![vec![0f64; THUMB_W]; 4];
  let ln = std::f64::consts::LN_10 / 10.0;
  for x in 0..THUMB_W {
    let c0 = (x * cols) / THUMB_W;
    let c1 = (c0 + 1).max(((x + 1) * cols) / THUMB_W);
    let (mut pl, mut pm, mut ph, mut n) = (0f64, 0f64, 0f64, 0f64);
    let mut c = c0;
    while c < c1 && c < cols {
      let o = c * rows;
      for k in 1..rows { let p = js::exp(spec[o + k] as f64 * ln); if k < e1 { pl += p; } else if k < e2 { pm += p; } else { ph += p; } }
      c += 1; n += 1.0;
    }
    if n == 0.0 { continue; }
    bands[0][x] = (pl / n).sqrt(); bands[1][x] = (pm / n).sqrt(); bands[2][x] = (ph / n).sqrt(); bands[3][x] = ((pl + pm + ph) / n).sqrt();
  }
  for (k, b) in bands.iter().enumerate() {
    let mut max = 0f64;
    for &v in b { if v > max { max = v; } }
    if max > 0.0 { for x in 0..THUMB_W { out[x * 4 + k] = js::round(255.0 * js::pow(b[x] / max, 0.75)) as u8; } }
  }
  out
}

/// `encodeFingerprint`: [u32 LE n][n × u32 LE words][n × u8 loud].
pub fn fingerprint_file(fp: &Fingerprint) -> Vec<u8> {
  let n = fp.words.len();
  let mut out = Vec::with_capacity(4 + n * 5);
  out.extend_from_slice(&(n as u32).to_le_bytes());
  for w in &fp.words { out.extend_from_slice(&w.to_le_bytes()); }
  out.extend_from_slice(&fp.loud);
  out
}

const PICK: &[(&str, &[&str])] = &[
  ("title", &["TIT2", "TITLE", "©nam", "Title", "NAME"]),
  ("artist", &["TPE1", "ARTIST", "©ART", "Artist", "AUTH", "TPE2", "ALBUMARTIST", "aART"]),
  ("album", &["TALB", "ALBUM", "©alb", "Album"]),
  ("genre", &["TCON", "GENRE", "©gen"]),
  ("label", &["TPUB", "LABEL", "ORGANIZATION", "PUBLISHER"]),
  ("comment", &["COMM", "COMMENT", "DESCRIPTION", "©cmt", "Comment", "ANNO"]),
  ("grouping", &["TIT1", "GRP1", "GROUPING", "©grp", "CONTENTGROUP"]),
  ("year", &["TDRC", "TYER", "DATE", "YEAR", "©day"]),
  ("bpm", &["TBPM", "BPM", "tmpo"]),
  ("key", &["TKEY", "INITIALKEY", "KEY"]),
];

/// `tagFields`: the container's tags as song fields.
pub fn tag_fields(tags: &IndexMap<String, String>) -> IndexMap<String, String> {
  // `new Map(entries.map(([k, v]) => [k.toUpperCase(), v]))`: a later key wins.
  let mut upper: IndexMap<String, &String> = IndexMap::new();
  for (k, v) in tags { upper.insert(k.to_uppercase(), v); }
  let mut out = IndexMap::new();
  for (field, keys) in PICK {
    let mut v = String::new();
    for k in *keys {
      v = tags.get(*k).or_else(|| upper.get(&k.to_uppercase()).copied()).cloned().unwrap_or_default();
      if !v.is_empty() { break; }
    }
    out.insert((*field).to_string(), js::trim(v.split(" · ").next().unwrap_or("")).to_string());
  }
  let year = out["year"].clone();
  let y = year.as_bytes().windows(4).position(|w| w.iter().all(|c| c.is_ascii_digit())).map(|i| year[i..i + 4].to_string()).unwrap_or_default();
  out.insert("year".into(), y);
  let g = out["genre"].clone();
  let numeric = g.len() > 2 && g.starts_with('(') && g.ends_with(')') && g[1..g.len() - 1].bytes().all(|c| c.is_ascii_digit());
  if numeric { out.insert("genre".into(), String::new()); }
  out
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrackFormat { pub container: String, pub codec: String, pub lossless: Option<bool>, pub sample_rate: f64, pub bits: f64, pub bitrate: f64, pub channels: f64 }

/// `formatOf`.
pub fn format_of(info: &FileInfo) -> TrackFormat {
  TrackFormat {
    container: info.container.clone(), codec: info.codec.clone(), lossless: info.lossless, sample_rate: info.sample_rate, bits: info.bits,
    bitrate: js::round(if info.bitrate.is_nan() { 0.0 } else { info.bitrate }), channels: info.channels,
  }
}

/// `Analysed` (s/ in GLUE Home's cache): what an analysis says about a song's file. `art`: None when the cover wasn't
/// looked for (the key is then absent), Some("") for none.
pub fn analysed(summary: &AnalysisSummary, info: &FileInfo, duration: f64, art: Option<&str>, size: f64, mtime: f64) -> Value {
  let mut v = json!({
    "summary": summary, "size": size, "mtime": mtime, "format": format_of(info),
    "duration": if duration != 0.0 && !duration.is_nan() { json!(duration) } else { Value::Null },
    "fields": tag_fields(&info.tags),
  });
  if let Some(a) = art { v["art"] = json!(a); }
  v
}

/// A failed song's `Analysed` (cache.ts): its summary, no format, no fields.
pub fn analysed_failed(summary: &AnalysisSummary, size: f64, mtime: f64) -> Value {
  json!({ "summary": summary, "size": size, "mtime": mtime, "format": Value::Null, "duration": Value::Null, "fields": {} })
}
