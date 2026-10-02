//! DSD (DSF and DSDIFF), which a browser can't decode (B5 of ADR 0147, ADR 0149): the 1-bit stream converted to PCM
//! at 88.2 kHz (96 kHz for the 48 kHz family), the conversion GLUE's message has always advised ("24-bit / 88.2 kHz
//! FLAC or WAV first"), by two linear-phase low-pass filters: ÷16 through a table per byte, then ÷2 (÷4, ÷8 for
//! DSD128, DSD256). A bit is ±1, so a full-scale DSD signal is ±1 in PCM (SACD's 0 dB, half modulation, is −6 dB).
//! DST-compressed DSDIFF isn't decoded.

/// Where a DSD file's samples are and how they're laid out.
#[derive(Debug, Clone, PartialEq)]
pub struct Dsd {
  /// The 1-bit rate (2,822,400 for DSD64).
  pub rate: u32,
  pub channels: usize,
  /// Samples (bits) per channel.
  pub frames: u64,
  layout: Layout,
}

#[derive(Debug, Clone, PartialEq)]
enum Layout {
  /// DSF: per channel blocks of `block` bytes in turn; `lsb`: a byte's first sample is its lowest bit.
  Dsf { data: usize, block: usize, lsb: bool },
  /// DSDIFF: one byte of each channel in turn, the first sample the highest bit.
  Dff { data: usize, len: usize },
}

fn u32le(b: &[u8], o: usize) -> Option<u32> { b.get(o..o + 4).map(|x| u32::from_le_bytes(x.try_into().unwrap())) }
fn u64le(b: &[u8], o: usize) -> Option<u64> { b.get(o..o + 8).map(|x| u64::from_le_bytes(x.try_into().unwrap())) }
fn u32be(b: &[u8], o: usize) -> Option<u32> { b.get(o..o + 4).map(|x| u32::from_be_bytes(x.try_into().unwrap())) }
fn u64be(b: &[u8], o: usize) -> Option<u64> { b.get(o..o + 8).map(|x| u64::from_be_bytes(x.try_into().unwrap())) }

/// A DSF or DSDIFF file's layout; Err with why it can't be decoded.
pub fn parse(b: &[u8]) -> Result<Dsd, String> {
  match b.get(0..4) {
    Some(b"DSD ") => parse_dsf(b),
    Some(b"FRM8") => parse_dff(b),
    _ => Err("It isn’t a DSD file.".into()),
  }
}

fn parse_dsf(b: &[u8]) -> Result<Dsd, String> {
  let bad = || "Its DSF header can’t be read.".to_string();
  let head = u64le(b, 4).ok_or_else(bad)? as usize;
  if b.get(head..head + 4) != Some(b"fmt ") { return Err(bad()); }
  let f = head + 12;
  let channels = u32le(b, f + 12).ok_or_else(bad)? as usize;
  let rate = u32le(b, f + 16).ok_or_else(bad)?;
  let bits = u32le(b, f + 20).ok_or_else(bad)?;
  let frames = u64le(b, f + 24).ok_or_else(bad)?;
  let block = u32le(b, f + 32).ok_or_else(bad)? as usize;
  let fmt_size = u64le(b, head + 4).ok_or_else(bad)? as usize;
  let d = head + fmt_size;
  if b.get(d..d + 4) != Some(b"data") || channels == 0 || channels > 8 || block == 0 || rate < 2_000_000 || !(bits == 1 || bits == 8) { return Err(bad()); }
  Ok(Dsd { rate, channels, frames, layout: Layout::Dsf { data: d + 12, block, lsb: bits == 1 } })
}

fn parse_dff(b: &[u8]) -> Result<Dsd, String> {
  let bad = || "Its DSDIFF header can’t be read.".to_string();
  if b.get(12..16) != Some(b"DSD ") { return Err(bad()); }
  let end = (12 + u64be(b, 4).ok_or_else(bad)? as usize).min(b.len());
  let (mut rate, mut channels, mut dsd, mut o) = (0u32, 0usize, None, 16usize);
  while o + 12 <= end {
    let (id, size) = (&b[o..o + 4], u64be(b, o + 4).ok_or_else(bad)? as usize);
    let body = o + 12;
    match id {
      b"PROP" if b.get(body..body + 4) == Some(b"SND ") => {
        let (mut p, pend) = (body + 4, (body + size).min(end));
        while p + 12 <= pend {
          let (pid, psize) = (&b[p..p + 4], u64be(b, p + 4).ok_or_else(bad)? as usize);
          match pid {
            b"FS  " => rate = u32be(b, p + 12).ok_or_else(bad)?,
            b"CHNL" => channels = b.get(p + 12..p + 14).map(|x| u16::from_be_bytes([x[0], x[1]]) as usize).ok_or_else(bad)?,
            b"CMPR" if b.get(p + 12..p + 16) != Some(b"DSD ") => return Err("Its DSD is DST-compressed, which GLUE doesn’t decode yet.".into()),
            _ => {}
          }
          p += 12 + psize + (psize & 1);
        }
      }
      b"DSD " => dsd = Some((body, size.min(end.saturating_sub(body)))),
      b"DST " => return Err("Its DSD is DST-compressed, which GLUE doesn’t decode yet.".into()),
      _ => {}
    }
    o = body + size + (size & 1);
  }
  let (data, len) = dsd.ok_or_else(bad)?;
  if channels == 0 || channels > 8 || rate < 2_000_000 { return Err(bad()); }
  Ok(Dsd { rate, channels, frames: (len / channels) as u64 * 8, layout: Layout::Dff { data, len } })
}

/// The PCM rate a DSD file is analysed at: 88.2 kHz for the 44.1 kHz family, 96 kHz for the 48 kHz one.
pub fn pcm_rate(rate: u32) -> u32 { rate / (32 * factor(rate)) }
/// DSD64 1, DSD128 2, DSD256 4…
fn factor(rate: u32) -> u32 { ((rate as f64 / 2_822_400.0).round() as u32).max(1) }

/// "DSD64", "DSD128"…: its rate as a multiple of 44.1 kHz.
pub fn name(rate: u32) -> String { format!("DSD{}", (rate as f64 / 44_100.0).round()) }

/// Windowed-sinc low-pass (Blackman), `n` taps, cut-off `fc` (Hz) at rate `fs`, DC gain 1.
fn lowpass(n: usize, fc: f64, fs: f64) -> Vec<f64> {
  let m = (n - 1) as f64;
  let mut h: Vec<f64> = (0..n).map(|i| {
    let x = i as f64 - m / 2.0;
    let sinc = if x == 0.0 { 2.0 * fc / fs } else { (2.0 * std::f64::consts::PI * fc / fs * x).sin() / (std::f64::consts::PI * x) };
    let w = 0.42 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / m).cos() + 0.08 * (4.0 * std::f64::consts::PI * i as f64 / m).cos();
    sinc * w
  }).collect();
  let s: f64 = h.iter().sum();
  for v in &mut h { *v /= s; }
  h
}

/// Stage one's taps (bytes of 8 bits each).
const BYTES1: usize = 32;
/// DSD silence (an idle pattern with as many 1s as 0s): what's before and after the samples.
const IDLE: u8 = 0x69;

/// The samples of one channel as bytes in time order, the first sample the highest bit.
fn channel_bytes(b: &[u8], d: &Dsd, ch: usize) -> Vec<u8> {
  let n = (d.frames / 8) as usize;
  let mut out = Vec::with_capacity(n);
  match d.layout {
    Layout::Dsf { data, block, lsb } => {
      let mut k = 0;
      while out.len() < n {
        let at = data + (k * d.channels + ch) * block;
        let Some(blk) = b.get(at..(at + block).min(b.len())) else { break };
        if blk.is_empty() { break; }
        let take = blk.len().min(n - out.len());
        out.extend(blk[..take].iter().map(|&x| if lsb { x.reverse_bits() } else { x }));
        k += 1;
      }
    }
    Layout::Dff { data, len } => {
      let end = (data + len).min(b.len());
      let mut at = data + ch;
      while at < end && out.len() < n { out.push(b[at]); at += d.channels; }
    }
  }
  out
}

/// The DSD stream as PCM: planar f32 channels at `pcm_rate(d.rate)`, the filters' delay taken out.
pub fn decode(b: &[u8], d: &Dsd) -> Result<(Vec<Vec<f32>>, f64), String> {
  let k = factor(d.rate) as usize;
  let (fs, fs2) = (d.rate as f64, d.rate as f64 / 16.0);
  // Stage one, 2.8224 MHz (×k) → 176.4 kHz (×k): 256 taps, passing up to 44 kHz; what folds back lands above 44 kHz,
  // which stage two removes.
  let h1 = lowpass(BYTES1 * 8, 44_100.0, fs);
  let mut table = vec![[0f64; 256]; BYTES1];
  for (j, t) in table.iter_mut().enumerate() {
    for (v, out) in t.iter_mut().enumerate() { *out = (0..8).map(|bit| if v & (0x80 >> bit) != 0 { h1[j * 8 + bit] } else { -h1[j * 8 + bit] }).sum(); }
  }
  // Stage two, ÷2k → 88.2 kHz: a low-pass at 40 kHz, 128 taps per 176.4 kHz.
  let (dec2, h2) = (2 * k, lowpass(128 * k + 1, 40_000.0, fs2));
  let delay2 = (h2.len() - 1) / 2;
  let mut out = Vec::with_capacity(d.channels);
  for ch in 0..d.channels {
    crate::control::check()?;
    let bytes = channel_bytes(b, d, ch);
    // Stage one: an output every 2 bytes, centred (the filter's delay, BYTES1 / 2 bytes, taken out by starting early).
    let n1 = bytes.len() / 2;
    let at = |i: isize| -> u8 { if i < 0 || i as usize >= bytes.len() { IDLE } else { bytes[i as usize] } };
    let mut s1 = vec![0f64; n1];
    for (n, y) in s1.iter_mut().enumerate() {
      let base = (2 * n) as isize - (BYTES1 / 2) as isize;
      let mut acc = 0.0;
      for j in 0..BYTES1 { acc += table[j][at(base + j as isize) as usize]; }
      *y = acc;
    }
    crate::control::check()?;
    // Stage two, centred the same way.
    let n2 = n1 / dec2;
    let mut pcm = vec![0f32; n2];
    for (n, y) in pcm.iter_mut().enumerate() {
      let base = (n * dec2) as isize - delay2 as isize;
      let mut acc = 0.0;
      for (t, &c) in h2.iter().enumerate() { let i = base + t as isize; if i >= 0 && (i as usize) < n1 { acc += c * s1[i as usize]; } }
      *y = acc as f32;
    }
    out.push(pcm);
  }
  Ok((out, pcm_rate(d.rate) as f64))
}

#[cfg(test)]
mod tests {
  use super::*;

  /// A DSF file of `secs` seconds of a sine at `hz` (amplitude `a`), from a first-order delta-sigma modulator.
  pub fn dsf_sine(hz: f64, a: f64, secs: f64, channels: usize) -> Vec<u8> {
    let rate = 2_822_400u32;
    let frames = (rate as f64 * secs) as u64;
    let block = 4096usize;
    let per = (frames as usize).div_ceil(8);
    let blocks = per.div_ceil(block);
    let mut chans = vec![vec![0u8; blocks * block]; channels];
    for (c, data) in chans.iter_mut().enumerate() {
      let mut integ = 0.0f64;
      for i in 0..frames as usize {
        let x = a * (2.0 * std::f64::consts::PI * hz * i as f64 / rate as f64 + c as f64).sin();
        let bit = integ >= 0.0;
        integ += x - if bit { 1.0 } else { -1.0 };
        if bit { data[i / 8] |= 1 << (i % 8); }   // DSF: the first sample in the lowest bit
      }
    }
    let mut b = vec![];
    let data_len = 12 + blocks * block * channels;
    let total = 28 + 52 + data_len;
    b.extend(b"DSD "); b.extend(28u64.to_le_bytes()); b.extend((total as u64).to_le_bytes()); b.extend(0u64.to_le_bytes());
    b.extend(b"fmt "); b.extend(52u64.to_le_bytes()); b.extend(1u32.to_le_bytes()); b.extend(0u32.to_le_bytes());
    b.extend((if channels == 2 { 2u32 } else { 1 }).to_le_bytes()); b.extend((channels as u32).to_le_bytes()); b.extend(rate.to_le_bytes());
    b.extend(1u32.to_le_bytes()); b.extend(frames.to_le_bytes()); b.extend((block as u32).to_le_bytes()); b.extend(0u32.to_le_bytes());
    b.extend(b"data"); b.extend((data_len as u64).to_le_bytes());
    for k in 0..blocks { for ch in &chans { b.extend(&ch[k * block..(k + 1) * block]); } }
    b
  }

  /// A DSF file is analysed like its 88.2 kHz conversion, with the DSD rate in its info and a finding that says so.
  #[test]
  fn a_dsf_file_is_analysed() {
    let f = dsf_sine(1000.0, 0.5, 3.0, 2);
    let a = crate::analyse(&f, "x.dsf", f.len() as f64, 0.0, String::new()).unwrap();
    assert_eq!((a.info.container.as_str(), a.info.sample_rate, a.info.channels), ("DSF", 2_822_400.0, 2.0));
    assert!((a.info.duration - 3.0).abs() < 1e-9);
    assert_eq!(a.result.sr, 88_200.0);
    assert!(a.verdict.findings.iter().any(|f| f.title == "Analysed from DSD" && f.detail.contains("DSD64 file (2.8224 MHz")), "{:?}", a.verdict.findings);
    assert!(!a.thumb.is_empty() && !a.fingerprint.is_empty());
    println!("{} · {}", a.summary.label, a.summary.headline);
  }

  /// A DST-compressed DSDIFF says so.
  #[test]
  fn dst_is_unsupported() {
    let mut b = b"FRM8".to_vec(); b.extend(40u64.to_be_bytes()); b.extend(b"DSD ");
    b.extend(b"DST "); b.extend(4u64.to_be_bytes()); b.extend([0u8; 4]);
    assert!(parse(&b).unwrap_err().contains("DST"));
  }

  #[test]
  fn a_dsf_sine_comes_out_as_that_sine_at_88_2_khz() {
    let f = dsf_sine(1000.0, 0.5, 0.5, 2);
    let d = parse(&f).unwrap();
    assert_eq!((d.rate, d.channels, d.frames), (2_822_400, 2, 1_411_200));
    assert_eq!(name(d.rate), "DSD64");
    let (pcm, sr) = decode(&f, &d).unwrap();
    assert_eq!(sr, 88_200.0);
    assert_eq!(pcm[0].len(), 44_100);
    // The middle: a 0.5 sine at 1 kHz (phase 0 on the left channel), within the modulator's noise.
    let mid = &pcm[0][10_000..30_000];
    let peak = mid.iter().fold(0f32, |m, v| m.max(v.abs()));
    assert!((peak - 0.5).abs() < 0.02, "{peak}");
    let err: f64 = mid.iter().enumerate().map(|(i, v)| { let t = (10_000 + i) as f64 / 88_200.0; (*v as f64 - 0.5 * (2.0 * std::f64::consts::PI * 1000.0 * t).sin()).powi(2) }).sum::<f64>() / mid.len() as f64;
    assert!(err.sqrt() < 0.01, "rms error {}", err.sqrt());
  }
}
