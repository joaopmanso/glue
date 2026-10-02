//! src/core/formats/parse.ts: what a file claims to be (container, codec, rate, bits, tags, where its PCM is).
//! JavaScript's reading rules are kept: a byte past the end is 0 in bit arithmetic (`u8[i]` is undefined), a
//! `DataView` read past the end throws (here `Err`, and the whole parse falls back to `blankInfo`, as the worker does).
use crate::js;
use crate::types::{FileInfo, PcmLayout};
use encoding_rs::{UTF_16BE, UTF_16LE, UTF_8, WINDOWS_1252};
use indexmap::IndexMap;

pub type R<T> = Result<T, ()>;

/// The bytes, read as `parse.ts` reads them.
#[derive(Clone, Copy)]
pub struct Bytes<'a>(pub &'a [u8]);
impl<'a> Bytes<'a> {
  pub fn len(&self) -> usize { self.0.len() }
  pub fn is_empty(&self) -> bool { self.0.is_empty() }
  /// `u8[i]` in bit arithmetic: 0 past the end.
  pub fn b(&self, i: usize) -> u32 { *self.0.get(i).unwrap_or(&0) as u32 }
  pub fn has(&self, i: usize) -> bool { i < self.0.len() }
  fn arr<const N: usize>(&self, o: usize) -> R<[u8; N]> { self.0.get(o..o.checked_add(N).ok_or(())?).map(|s| s.try_into().unwrap()).ok_or(()) }
  pub fn u16(&self, o: usize, le: bool) -> R<u32> { let a = self.arr::<2>(o)?; Ok(if le { u16::from_le_bytes(a) } else { u16::from_be_bytes(a) } as u32) }
  pub fn i16(&self, o: usize, le: bool) -> R<f64> { let a = self.arr::<2>(o)?; Ok(if le { i16::from_le_bytes(a) } else { i16::from_be_bytes(a) } as f64) }
  pub fn u32(&self, o: usize, le: bool) -> R<f64> { let a = self.arr::<4>(o)?; Ok(if le { u32::from_le_bytes(a) } else { u32::from_be_bytes(a) } as f64) }
  pub fn i32(&self, o: usize, le: bool) -> R<f64> { let a = self.arr::<4>(o)?; Ok(if le { i32::from_le_bytes(a) } else { i32::from_be_bytes(a) } as f64) }
  pub fn f32be(&self, o: usize) -> R<f64> { Ok(f32::from_be_bytes(self.arr::<4>(o)?) as f64) }
  pub fn f64be(&self, o: usize) -> R<f64> { Ok(f64::from_be_bytes(self.arr::<8>(o)?)) }
  /// `subarray(a, b)`, clamped to the array.
  pub fn sub(&self, a: usize, b: usize) -> &'a [u8] { let b = b.min(self.0.len()); if a >= b { &[] } else { &self.0[a..b] } }
}

/// `readStr`: each byte as the character with its code (true Latin-1).
pub fn read_str(u8: &Bytes, o: usize, n: usize) -> String { u8.sub(o, o.saturating_add(n)).iter().map(|&c| c as char).collect() }
/// `new TextDecoder('utf-8').decode(...)`, then trailing NULs removed: a BOM dropped, bad bytes as U+FFFD.
fn utf8(u8: &Bytes, a: usize, b: usize) -> String { let s = UTF_8.decode_with_bom_removal(u8.sub(a, b)).0.into_owned(); s.trim_end_matches('\u{0}').to_string() }
/// `TextDecoder('latin1')`, which is windows-1252 (0x80–0x9F aren't Latin-1's control codes).
pub fn latin1(bytes: &[u8]) -> String { WINDOWS_1252.decode_without_bom_handling(bytes).0.into_owned() }
fn syncsafe(u8: &Bytes, o: usize) -> u32 { ((u8.b(o) & 127) << 21) | ((u8.b(o + 1) & 127) << 14) | ((u8.b(o + 2) & 127) << 7) | (u8.b(o + 3) & 127) }
fn add_tag(tags: &mut IndexMap<String, String>, k: &str, v: &str) {
  let s = js::trim(v);
  if s.is_empty() { return; }
  match tags.get_mut(k) { Some(t) if !t.is_empty() => { t.push_str(" · "); t.push_str(s); } _ => { tags.insert(k.to_string(), s.to_string()); } }
}

/// `mp3Gapless`: an MP3's gapless trim (ADR 0060) from its LAME/Lavc/Lavf tag: skip `start`, stop at `until`.
pub fn mp3_gapless(u8: &[u8]) -> Option<(f64, Option<f64>)> {
  let u8 = Bytes(u8);
  let off = if read_str(&u8, 0, 3) == "ID3" { 10 + syncsafe(&u8, 6) as usize + if u8.b(5) & 0x10 != 0 { 10 } else { 0 } } else { 0 };
  let lim = (u8.len() as i64 - 4).min((off + (1 << 20)) as i64);
  let mut p = off as i64;
  let mut h = None;
  while p < lim {
    if let Some(x) = mp3_header(&u8, p as usize) { if let Some(n) = mp3_header(&u8, p as usize + x.len) { if n.sr == x.sr && n.layer == x.layer { h = Some(x); break; } } }
    p += 1;
  }
  let h = h?;
  let p = p as usize;
  let side = if h.v1 { if h.ch == 1 { 17 } else { 32 } } else if h.ch == 1 { 9 } else { 17 };
  let x = p + 4 + side;
  let tag = read_str(&u8, x, 4);
  if (tag != "Xing" && tag != "Info") || x + 8 > u8.len() { return None; }
  let fl = u8.u32(x + 4, false).ok()? as u32;
  let mut q = x + 8;
  let mut frames = 0f64;
  if fl & 1 != 0 { frames = u8.u32(q, false).ok()?; q += 4; }
  if fl & 2 != 0 { q += 4; }
  if fl & 4 != 0 { q += 100; }
  if fl & 8 != 0 { q += 4; }
  if q + 24 > u8.len() || !matches!(read_str(&u8, q, 4).as_str(), "LAME" | "Lavc" | "Lavf") { return None; }
  let delay = (u8.b(q + 21) << 4) | (u8.b(q + 22) >> 4);
  let padding = ((u8.b(q + 22) & 15) << 8) | u8.b(q + 23);
  Some((delay as f64 + 529.0, if frames != 0.0 { Some(frames * h.spf as f64 - padding as f64 + 529.0) } else { None }))
}

/// `parseContainer`. `Err` where JavaScript would throw (the worker then uses a blank info).
pub fn parse_container(data: &[u8]) -> R<FileInfo> {
  let u8 = Bytes(data);
  let mut info = FileInfo::blank();
  let s4 = read_str(&u8, 0, 4);
  if (s4 == "RIFF" || s4 == "RF64") && read_str(&u8, 8, 4) == "WAVE" { parse_wav(&u8, &mut info)?; }
  else if s4 == "FORM" && matches!(read_str(&u8, 8, 4).as_str(), "AIFF" | "AIFC") { parse_aiff(&u8, &mut info)?; }
  else if read_str(&u8, 4, 4) == "ftyp" { parse_mp4(&u8, &mut info)?; }
  else if s4 == "OggS" { parse_ogg(&u8, &mut info)?; }
  else if u8.b(0) == 0x1A && u8.b(1) == 0x45 && u8.b(2) == 0xDF && u8.b(3) == 0xA3 { parse_webm(&u8, &mut info)?; }
  else if s4 == "DSD " || s4 == "FRM8" {
    info.container = if s4 == "DSD " { "DSF".into() } else { "DSDIFF".into() }; info.codec = "DSD".into(); info.lossless = Some(true);
    info.unsupported = Some("DSD files can’t be decoded in a browser. Convert to 24-bit / 88.2 kHz FLAC or WAV first (foobar2000 or ffmpeg can do this).".into());
  }
  else if s4 == "wvpk" { info.container = "WavPack".into(); info.codec = "WavPack".into(); info.unsupported = Some("WavPack can’t be decoded in a browser. Convert to FLAC or WAV first.".into()); }
  else if s4 == "MAC " { info.container = "Monkey’s Audio".into(); info.codec = "APE".into(); info.unsupported = Some("Monkey’s Audio (APE) can’t be decoded in a browser. Convert to FLAC or WAV first.".into()); }
  else {
    let mut off = 0usize;
    if read_str(&u8, 0, 3) == "ID3" { off = parse_id3v2(&u8, &mut info.tags)?; }
    if read_str(&u8, off, 4) == "fLaC" { parse_flac(&u8, &mut info, off); }
    else if u8.b(off) == 0xFF && (u8.b(off + 1) & 0xF6) == 0xF0 { parse_adts(&u8, &mut info, off); }
    else { parse_mp3(&u8, &mut info, off)?; }
  }
  Ok(info)
}

fn is_id(s: &str) -> bool { s.len() == 4 && s.bytes().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()) }

fn parse_id3v2(u8: &Bytes, tags: &mut IndexMap<String, String>) -> R<usize> {
  if read_str(u8, 0, 3) != "ID3" { return Ok(0); }
  let (ver, flags, size) = (u8.b(3), u8.b(5), syncsafe(u8, 6) as usize);
  let end = u8.len().min(10 + size);
  let mut p = 10usize;
  if flags & 0x40 != 0 { p += if ver == 4 { syncsafe(u8, 10) as usize } else { u8.u32(10, false)? as usize + 4 }; }
  if ver >= 3 {
    while p + 10 <= end {
      let id = read_str(u8, p, 4);
      if !is_id(&id) { break; }
      let fs = if ver == 4 { syncsafe(u8, p + 4) as usize } else { u8.u32(p + 4, false)? as usize };
      let b = p + 10;
      if fs == 0 || b + fs > end { break; }
      let first = id.as_bytes()[0];
      if id != "APIC" && (first == b'T' || first == b'W' || id == "COMM") {
        let t = decode_id3_text(u8, b, fs, &id);
        add_tag(tags, &id, &t);
      }
      p = b + fs;
    }
  }
  Ok(10 + size + if flags & 0x10 != 0 { 10 } else { 0 })
}

fn decode_id3_text(u8: &Bytes, b: usize, len: usize, id: &str) -> String {
  if id.starts_with('W') && id != "WXXX" { return read_str(u8, b, len).replace('\u{0}', ""); }
  let enc = u8.b(b);
  let mut s = b + 1;
  if id == "COMM" { s += 3; }
  let bytes = u8.sub(s, b + len);
  let text = match enc {
    1 => {
      let le = bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE;
      let be = bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF;
      let rest = if le || be { &bytes[2..] } else { bytes };
      (if be { UTF_16BE } else { UTF_16LE }).decode_with_bom_removal(rest).0.into_owned()
    }
    2 => UTF_16BE.decode_with_bom_removal(bytes).0.into_owned(),
    3 => UTF_8.decode_with_bom_removal(bytes).0.into_owned(),
    _ => latin1(bytes),
  };
  let text = text.replace('\u{FEFF}', "");
  let parts: Vec<&str> = text.split('\u{0}').map(js::trim).filter(|x| !x.is_empty()).collect();
  parts.join(if id == "TXXX" || id == "WXXX" { ": " } else { " · " })
}

/// A chunk's own bytes, as `parseId3v2(u8.subarray(b, b + size), new DataView(…, Math.min(size, u8.length - b)))` sees them.
fn id3_chunk(u8: &Bytes, b: usize, size: usize, tags: &mut IndexMap<String, String>) -> R<()> {
  if b > u8.len() { return Err(()); }   // a DataView of negative length throws
  parse_id3v2(&Bytes(u8.sub(b, b + size)), tags)?;
  Ok(())
}

fn parse_wav(u8: &Bytes, info: &mut FileInfo) -> R<()> {
  info.container = if read_str(u8, 0, 4) == "RF64" { "WAV (RF64)".into() } else { "WAV".into() };
  info.codec = "PCM".into(); info.lossless = Some(true);
  let mut off = 12usize;
  let mut ds64: Option<f64> = None;
  struct Fmt { tag: u32, ch: f64, sr: f64, block_align: f64, bps: f64, valid: f64 }
  let mut fmt: Option<Fmt> = None;
  let mut data: Option<(f64, f64)> = None;
  while off + 8 <= u8.len() {
    let id = read_str(u8, off, 4);
    let size = u8.u32(off + 4, true)?;
    let b = off + 8;
    if id == "ds64" { ds64 = Some(u8.u32(b + 8, true)? + u8.u32(b + 12, true)? * 4294967296.0); }
    else if id == "fmt " {
      let mut tag = u8.u16(b, true)?;
      let (ch, sr, block_align, bps) = (u8.u16(b + 2, true)? as f64, u8.u32(b + 4, true)?, u8.u16(b + 12, true)? as f64, u8.u16(b + 14, true)? as f64);
      let mut valid = bps;
      if tag == 0xFFFE && size >= 40.0 { let v = u8.u16(b + 18, true)? as f64; valid = if v != 0.0 { v } else { bps }; tag = u8.u16(b + 24, true)?; }
      fmt = Some(Fmt { tag, ch, sr, block_align, bps, valid });
    } else if id == "data" {
      let mut len = size;
      if size == 4294967295.0 { if let Some(d) = ds64 { len = d; } }
      len = len.min((u8.len() - b) as f64);
      data = Some((b as f64, len));
      off = b + len as usize + (len as u64 & 1) as usize;
      continue;
    } else if id == "LIST" && read_str(u8, b, 4) == "INFO" {
      let mut q = b + 4;
      while (q + 8) as f64 <= b as f64 + size {
        let sid = read_str(u8, q, 4);
        let ss = u8.u32(q + 4, true)? as usize;
        let name = match sid.as_str() { "ISFT" => "Software", "INAM" => "Title", "IART" => "Artist", "IPRD" => "Album", "ICMT" => "Comment", "IENG" => "Engineer", "ISRC" => "Source", s => s }.to_string();
        let v = utf8(u8, q + 8, q + 8 + ss);
        add_tag(&mut info.tags, &name, &v);
        q += 8 + ss + (ss & 1);
      }
    } else if id == "bext" {
      let d = utf8(u8, b, b + 256); add_tag(&mut info.tags, "BWF description", &d);
      let o = utf8(u8, b + 256, b + 288); add_tag(&mut info.tags, "BWF originator", &o);
    } else if id == "id3 " || id == "ID3 " {
      id3_chunk(u8, b, size as usize, &mut info.tags)?;
    }
    if size == 0.0 && id != "data" { break; }
    off = b + size as usize + (size as u64 & 1) as usize;
  }
  let Some(f) = fmt else { return Ok(()); };
  info.sample_rate = f.sr; info.channels = f.ch; info.bits = f.valid;
  let bb = f.block_align / f.ch;
  info.codec = match f.tag { 1 => "PCM".into(), 3 => "PCM (float)".into(), 6 => "A-law".into(), 7 => "µ-law".into(), 0x11 => "IMA ADPCM".into(), 0x55 => "MP3 (inside WAV)".into(), 0xFF => "AAC (inside WAV)".into(), 0x2000 => "AC-3 (inside WAV)".into(), t => format!("Format 0x{t:x}") };
  if f.tag == 3 { info.bits_label = Some(format!("{}-bit float", js::num_str(f.bps))); }
  if matches!(f.tag, 0x55 | 0xFF | 0x2000 | 0x11) { info.lossless = Some(false); }
  if let Some((doff, dlen)) = data {
    info.duration = dlen / f.block_align / f.sr;
    if f.tag == 1 && (1.0..=4.0).contains(&bb) && bb.fract() == 0.0 {
      info.pcm = Some(PcmLayout { fmt: "int".into(), le: true, off: doff, len: dlen, ch: f.ch, block_align: f.block_align, unsigned8: Some(bb == 1.0) });
    } else if f.tag == 3 && (bb == 4.0 || bb == 8.0) {
      info.pcm = Some(PcmLayout { fmt: "float".into(), le: true, off: doff, len: dlen, ch: f.ch, block_align: f.block_align, unsigned8: None });
    }
  }
  info.bitrate = f.sr * f.bps * f.ch / 1000.0;
  Ok(())
}

fn ext80(u8: &Bytes, o: usize) -> R<f64> {
  let se = u8.u16(o, false)?;
  let e = se & 0x7fff;
  let (hi, lo) = (u8.u32(o + 2, false)?, u8.u32(o + 6, false)?);
  if e == 0 && hi == 0.0 && lo == 0.0 { return Ok(0.0); }
  Ok((if se >> 15 != 0 { -1.0 } else { 1.0 }) * (hi * 4294967296.0 + lo) * js::pow(2.0, e as f64 - 16383.0 - 63.0))
}

fn parse_aiff(u8: &Bytes, info: &mut FileInfo) -> R<()> {
  let aifc = read_str(u8, 8, 4) == "AIFC";
  info.container = if aifc { "AIFF-C".into() } else { "AIFF".into() }; info.codec = "PCM".into(); info.lossless = Some(true);
  let mut p = 12usize;
  struct Comm { ch: f64, frames: f64, ss: f64, sr: f64, comp: String }
  let mut comm: Option<Comm> = None;
  let mut ssnd: Option<(f64, f64)> = None;
  while p + 8 <= u8.len() {
    let id = read_str(u8, p, 4);
    let size = u8.u32(p + 4, false)?;
    let b = p + 8;
    if id == "COMM" {
      comm = Some(Comm { ch: u8.i16(b, false)?, frames: u8.u32(b + 2, false)?, ss: u8.i16(b + 6, false)?, sr: ext80(u8, b + 8)?, comp: if aifc && size >= 22.0 { read_str(u8, b + 18, 4) } else { "NONE".into() } });
    } else if id == "SSND" {
      let o = u8.u32(b, false)?;
      let start = b as f64 + 8.0 + o;
      ssnd = Some((start, (size - 8.0 - o).min(u8.len() as f64 - start)));
    } else if matches!(id.as_str(), "NAME" | "AUTH" | "ANNO" | "(c) ") {
      let label = match id.as_str() { "NAME" => "Title", "AUTH" => "Author", "ANNO" => "Annotation", _ => "Copyright" };
      let v = latin1(u8.sub(b, b + size as usize));
      add_tag(&mut info.tags, label, &v);
    } else if id == "ID3 " || id == "id3 " {
      id3_chunk(u8, b, size as usize, &mut info.tags)?;
    }
    if size == 0.0 && id != "SSND" { break; }
    p = b + size as usize + (size as u64 & 1) as usize;
  }
  let Some(c) = comm else { return Ok(()); };
  info.sample_rate = js::round(c.sr); info.channels = c.ch; info.bits = c.ss;
  info.duration = c.frames / c.sr;
  info.bitrate = c.sr * c.ss * c.ch / 1000.0;
  let comp = c.comp.as_str();
  let (mut fmt, mut le, mut bytes): (Option<&str>, bool, f64) = (None, false, (c.ss / 8.0).ceil());
  if matches!(comp, "NONE" | "twos" | "in24" | "in32") { fmt = Some("int"); }
  else if comp == "sowt" { fmt = Some("int"); le = true; }
  else if comp == "fl32" || comp == "FL32" { fmt = Some("float"); bytes = 4.0; info.bits_label = Some("32-bit float".into()); }
  else if comp == "fl64" || comp == "FL64" { fmt = Some("float"); bytes = 8.0; info.bits_label = Some("64-bit float".into()); }
  else {
    info.codec = format!("AIFF-C {}", js::trim(comp));
    let l = comp.to_ascii_lowercase();
    if l.contains("alaw") || l.contains("ulaw") || l.contains("ima4") || l.contains("mac") { info.lossless = Some(false); }
  }
  if comp == "in24" { bytes = 3.0; }
  if comp == "in32" { bytes = 4.0; }
  if let (Some(f), Some((off, len))) = (fmt, ssnd) {
    if (1.0..=8.0).contains(&bytes) { info.pcm = Some(PcmLayout { fmt: f.into(), le, off, len, ch: c.ch, block_align: c.ch * bytes, unsigned8: None }); }
  }
  Ok(())
}

pub struct StreamInfo { pub sample_rate: f64, pub channels: f64, pub bits: f64, pub duration: Option<f64> }
fn stream_info(u8: &Bytes, b: usize) -> R<StreamInfo> {
  let sample_rate = ((u8.b(b + 10) << 12) | (u8.b(b + 11) << 4) | (u8.b(b + 12) >> 4)) as f64;
  let channels = (((u8.b(b + 12) >> 1) & 7) + 1) as f64;
  let bits = ((((u8.b(b + 12) & 1) << 4) | (u8.b(b + 13) >> 4)) + 1) as f64;
  let total = (u8.b(b + 13) & 15) as f64 * 4294967296.0 + u8.u32(b + 14, false)?;
  Ok(StreamInfo { sample_rate, channels, bits, duration: if total != 0.0 && sample_rate != 0.0 { Some(total / sample_rate) } else { None } })
}
fn apply_stream_info(info: &mut FileInfo, s: StreamInfo) {
  info.sample_rate = s.sample_rate; info.channels = s.channels; info.bits = s.bits;
  if let Some(d) = s.duration { info.duration = d; }
}

fn parse_vorbis_comment(u8: &Bytes, mut p: usize, info: &mut FileInfo) -> R<()> {
  let vl = u8.u32(p, true)? as usize;
  if vl > 4096 || p + 4 + vl > u8.len() { return Ok(()); }
  info.vendor = utf8(u8, p + 4, p + 4 + vl);
  p += 4 + vl;
  let n = u8.u32(p, true)? as usize; p += 4;
  for _ in 0..n.min(300) {
    let l = u8.u32(p, true)? as usize; p += 4;
    if l > 200000 || p + l > u8.len() { break; }
    let s = utf8(u8, p, p + l); p += l;
    if let Some(eq) = s.find('=').filter(|&e| e > 0) {
      let k = s[..eq].to_uppercase();
      if k != "METADATA_BLOCK_PICTURE" && k != "COVERART" { let v = js::slice_utf16(&s[eq + 1..], 400).to_string(); add_tag(&mut info.tags, &k, &v); }
    }
  }
  Ok(())
}

fn parse_flac(u8: &Bytes, info: &mut FileInfo, off: usize) {
  info.container = "FLAC".into(); info.codec = "FLAC".into(); info.lossless = Some(true);
  let mut p = off + 4;
  while p + 4 <= u8.len() {
    let h = u8.b(p);
    let ty = h & 0x7f;
    let len = ((u8.b(p + 1) << 16) | (u8.b(p + 2) << 8) | u8.b(p + 3)) as usize;
    let b = p + 4;
    // A damaged block is skipped (JavaScript's try/catch).
    if ty == 0 { if let Ok(s) = stream_info(u8, b) { apply_stream_info(info, s); } }
    else if ty == 4 { let _ = parse_vorbis_comment(u8, b, info); }
    p = b + len;
    if h & 0x80 != 0 { break; }
  }
}

const V1L1: [f64; 15] = [0.0, 32.0, 64.0, 96.0, 128.0, 160.0, 192.0, 224.0, 256.0, 288.0, 320.0, 352.0, 384.0, 416.0, 448.0];
const V1L2: [f64; 15] = [0.0, 32.0, 48.0, 56.0, 64.0, 80.0, 96.0, 112.0, 128.0, 160.0, 192.0, 224.0, 256.0, 320.0, 384.0];
const V1L3: [f64; 15] = [0.0, 32.0, 40.0, 48.0, 56.0, 64.0, 80.0, 96.0, 112.0, 128.0, 160.0, 192.0, 224.0, 256.0, 320.0];
const V2L1: [f64; 15] = [0.0, 32.0, 48.0, 56.0, 64.0, 80.0, 96.0, 112.0, 128.0, 144.0, 160.0, 176.0, 192.0, 224.0, 256.0];
const V2L23: [f64; 15] = [0.0, 8.0, 16.0, 24.0, 32.0, 40.0, 48.0, 56.0, 64.0, 80.0, 96.0, 112.0, 128.0, 144.0, 160.0];

#[derive(Clone, Copy)]
pub struct Mp3Header { pub v1: bool, pub layer: u32, pub br: f64, pub sr: f64, pub spf: u32, pub len: usize, pub mode: u32, pub ch: u32 }
pub fn mp3_header(u8: &Bytes, p: usize) -> Option<Mp3Header> {
  if p + 4 > u8.len() || u8.b(p) != 0xFF || (u8.b(p + 1) & 0xE0) != 0xE0 { return None; }
  let (vb, lb, bi, si, pad, mode) = ((u8.b(p + 1) >> 3) & 3, (u8.b(p + 1) >> 1) & 3, u8.b(p + 2) >> 4, (u8.b(p + 2) >> 2) & 3, (u8.b(p + 2) >> 1) & 1, u8.b(p + 3) >> 6);
  if vb == 1 || lb == 0 || bi == 0 || bi == 15 || si == 3 { return None; }
  let v1 = vb == 3;
  let layer = 4 - lb;
  let sr = [44100.0, 48000.0, 32000.0][si as usize] / if vb == 3 { 1.0 } else if vb == 2 { 2.0 } else { 4.0 };
  let table = if v1 { match layer { 1 => &V1L1, 2 => &V1L2, _ => &V1L3 } } else if layer == 1 { &V2L1 } else { &V2L23 };
  let br = table[bi as usize];
  let spf = if layer == 1 { 384 } else if layer == 2 { 1152 } else if v1 { 1152 } else { 576 };
  let len = if layer == 1 { ((12.0 * br * 1000.0 / sr).floor() + pad as f64) * 4.0 } else { (spf as f64 / 8.0 * br * 1000.0 / sr).floor() + pad as f64 };
  if len < 16.0 { return None; }
  Some(Mp3Header { v1, layer, br, sr, spf, len: len as usize, mode, ch: if mode == 3 { 1 } else { 2 } })
}

fn parse_mp3(u8: &Bytes, info: &mut FileInfo, start: usize) -> R<()> {
  let lim = (u8.len() as i64 - 4).min((start + (1 << 20)) as i64);
  let mut p = start as i64;
  let mut h = None;
  while p < lim {
    if let Some(x) = mp3_header(u8, p as usize) { if let Some(n) = mp3_header(u8, p as usize + x.len) { if n.sr == x.sr && n.layer == x.layer { h = Some(x); break; } } }
    p += 1;
  }
  let Some(h) = h else { return Ok(()); };
  let p = p as usize;
  info.container = "MPEG audio".into();
  info.codec = if h.layer == 3 { "MP3".into() } else { format!("MPEG Layer {}", h.layer) };
  info.lossless = Some(false); info.sample_rate = h.sr; info.channels = h.ch as f64;
  info.channel_mode = Some(["Stereo", "Joint stereo", "Dual channel", "Mono"][h.mode as usize].into());
  let side = if h.v1 { if h.ch == 1 { 17 } else { 32 } } else if h.ch == 1 { 9 } else { 17 };
  let x = p + 4 + side;
  let tag = read_str(u8, x, 4);
  let (mut frames, mut bytes, mut first_is_tag) = (0f64, 0f64, false);
  if tag == "Xing" || tag == "Info" {
    first_is_tag = true;
    let fl = u8.u32(x + 4, false)? as u32;
    let mut q = x + 8;
    if fl & 1 != 0 { frames = u8.u32(q, false)?; q += 4; }
    if fl & 2 != 0 { bytes = u8.u32(q, false)?; q += 4; }
    if fl & 4 != 0 { q += 100; }
    if fl & 8 != 0 { q += 4; }
    let raw: String = read_str(u8, q, 9).chars().filter(|c| (' '..='~').contains(c)).collect();
    let enc = js::trim(&raw).to_string();
    if ["LAME", "Lavc", "Lavf", "GOGO", "L3.9"].iter().any(|s| enc.starts_with(s)) {
      info.encoder = enc;
      info.lame_method = Some(match u8.b(q + 9) & 15 { 1 => "CBR", 2 => "ABR", 3..=6 => "VBR", 8 => "CBR (2-pass)", 9 => "ABR (2-pass)", _ => "" }.into());
      let lp = u8.b(q + 10) as f64 * 100.0;
      if lp != 0.0 { info.lame_lowpass = Some(lp); }
    }
    info.bitrate_mode = if tag == "Info" { "CBR".into() } else { "VBR".into() };
  } else if read_str(u8, p + 36, 4) == "VBRI" {
    first_is_tag = true;
    bytes = u8.u32(p + 46, false)?; frames = u8.u32(p + 50, false)?;
    info.bitrate_mode = "VBR".into(); info.encoder = "Fraunhofer (VBRI header)".into();
  }
  let mut q = if first_is_tag { p + h.len } else { p };
  let (mut cnt, mut sum, mut min_b, mut max_b) = (0f64, 0f64, 1e9f64, 0f64);
  while q + 4 <= u8.len() {
    let Some(f) = mp3_header(u8, q) else { break };
    cnt += 1.0; sum += f.br;
    if f.br < min_b { min_b = f.br; }
    if f.br > max_b { max_b = f.br; }
    q += f.len;
  }
  if frames == 0.0 { frames = cnt; }
  info.duration = frames * h.spf as f64 / h.sr;
  if bytes != 0.0 && info.duration != 0.0 { info.bitrate = bytes * 8.0 / info.duration / 1000.0; }
  else if cnt != 0.0 { info.bitrate = sum / cnt; }
  if info.bitrate_mode.is_empty() { info.bitrate_mode = if min_b == max_b { "CBR".into() } else { "VBR".into() }; }
  if let Some(m) = info.lame_method.clone().filter(|m| !m.is_empty()) { info.bitrate_mode = m; }
  Ok(())
}

const AAC_SR: [f64; 13] = [96000.0, 88200.0, 64000.0, 48000.0, 44100.0, 32000.0, 24000.0, 22050.0, 16000.0, 12000.0, 11025.0, 8000.0, 7350.0];
fn parse_adts(u8: &Bytes, info: &mut FileInfo, off: usize) {
  let b2 = u8.b(off + 2);
  let profile = b2 >> 6;
  let sr = *AAC_SR.get(((b2 >> 2) & 15) as usize).unwrap_or(&0.0);
  info.container = "ADTS".into(); info.codec = if profile == 1 { "AAC-LC".into() } else { "AAC".into() }; info.lossless = Some(false);
  info.sample_rate = sr; info.channels = (((b2 & 1) << 2) | (u8.b(off + 3) >> 6)) as f64;
  let (mut q, mut frames, mut bytes) = (off, 0f64, 0f64);
  while q + 7 <= u8.len() && u8.b(q) == 0xFF && (u8.b(q + 1) & 0xF6) == 0xF0 {
    let len = (((u8.b(q + 3) & 3) << 11) | (u8.b(q + 4) << 3) | (u8.b(q + 5) >> 5)) as usize;
    if len < 7 { break; }
    frames += 1.0; bytes += len as f64; q += len;
  }
  if sr != 0.0 {
    info.duration = frames * 1024.0 / sr;
    if info.duration != 0.0 { info.bitrate = bytes * 8.0 / info.duration / 1000.0; }
    if sr <= 24000.0 { info.decode_rate = Some(sr * 2.0); info.notes.push(format!("Low AAC core rate: probably HE-AAC (SBR), decoded at {}.", crate::audio::verdict::fmt_rate(sr * 2.0))); }
  }
}

#[derive(Default)]
struct Mp4Audio { fourcc: Option<String>, ch: Option<f64>, ss: Option<f64>, sr: Option<f64>, bits: Option<f64>, ts: Option<f64>, dur: Option<f64>, oti: Option<u32>, avg_br: Option<f64>, aot: Option<u32>, opus_input: Option<f64> }
fn some(x: Option<f64>) -> f64 { x.filter(|v| *v != 0.0 && !v.is_nan()).unwrap_or(0.0) }

struct Mp4<'a, 'b> { u8: &'b Bytes<'a>, tags: IndexMap<String, String>, audio: Mp4Audio, last_mdhd: Option<(f64, f64)>, handler: Option<String>, brand: Option<String>, compat: Option<Vec<String>> }

impl<'a, 'b> Mp4<'a, 'b> {
  fn u64(&self, o: usize) -> R<f64> { Ok(self.u8.u32(o, false)? * 4294967296.0 + self.u8.u32(o + 4, false)?) }
  fn ilst_item(&mut self, ty: &str, b: usize, e: usize) -> R<()> {
    let u8 = self.u8;
    let (mut q, mut name) = (b, ty.to_string());
    while q + 8 <= e {
      let s = u8.u32(q, false)? as usize;
      let t = read_str(u8, q + 4, 4);
      if s < 8 { break; }
      if t == "name" { name = utf8(u8, q + 12, q + s); }
      if t == "data" && (u8.u32(q + 8, false)? as u32 & 0xffffff) == 1 { let v = utf8(u8, q + 16, q + s); add_tag(&mut self.tags, &name, js::slice_utf16(&v, 400)); }
      q += s;
    }
    Ok(())
  }
  fn esds(&mut self, mut p: usize, e: usize) -> R<()> {
    let u8 = self.u8;
    while p < e {
      if !u8.has(p) { return Ok(()); }   // undefined: the JavaScript loop ends with NaN arithmetic
      let tag = u8.b(p); p += 1;
      let mut len = 0usize;
      for _ in 0..4 { let c = u8.b(p); p += 1; len = (len << 7) | (c & 0x7f) as usize; if c & 0x80 == 0 { break; } }
      if tag == 3 {
        p += 2;
        let fl = u8.b(p); p += 1;
        if fl & 0x80 != 0 { p += 2; }
        if fl & 0x40 != 0 { if !u8.has(p) { return Ok(()); } p += 1 + u8.b(p) as usize; }
        if fl & 0x20 != 0 { p += 2; }
        continue;
      }
      if tag == 4 { self.audio.oti = Some(u8.b(p)); u8.u32(p + 5, false)?; self.audio.avg_br = Some(u8.u32(p + 9, false)?); p += 13; continue; }
      if tag == 5 { let mut aot = u8.b(p) >> 3; if aot == 31 { aot = 32 + (((u8.b(p) & 7) << 3) | (u8.b(p + 1) >> 5)); } self.audio.aot = Some(aot); p += len; continue; }
      p += len;
    }
    Ok(())
  }
  fn entry_child(&mut self, ty: &str, b: usize, e: usize) -> R<()> {
    let u8 = self.u8;
    match ty {
      "esds" => self.esds(b + 4, e)?,
      "alac" => { self.audio.bits = Some(u8.b(b + 9) as f64); self.audio.ch = Some(u8.b(b + 13) as f64); self.audio.avg_br = Some(u8.u32(b + 20, false)?); self.audio.sr = Some(u8.u32(b + 24, false)?); }
      "dOps" => self.audio.opus_input = Some(u8.u32(b + 4, false)?),
      "dfLa" => { let s = stream_info(u8, b + 8)?; self.audio.sr = Some(s.sample_rate); self.audio.bits = Some(s.bits); }
      "wave" => self.walk(b, e, "entry")?,
      _ => {}
    }
    Ok(())
  }
  fn sample_entry(&mut self, ty: &str, b: usize, e: usize) -> R<()> {
    let u8 = self.u8;
    self.audio.fourcc = Some(ty.to_string());
    let ver = u8.u16(b + 8, false)?;
    if some(self.audio.ch) == 0.0 { self.audio.ch = Some(u8.u16(b + 16, false)? as f64); }
    self.audio.ss = Some(u8.u16(b + 18, false)? as f64);
    self.audio.sr = Some(((u8.u32(b + 24, false)? as u32) >> 16) as f64);
    let mut c = b + 28;
    if ver == 1 { c += 16; }
    else if ver == 2 { self.audio.sr = Some(js::round(u8.f64be(b + 32)?)); self.audio.ch = Some(u8.u32(b + 40, false)?); self.audio.ss = Some(u8.u32(b + 48, false)?); c += 36; }
    self.walk(c, e, "entry")
  }
  fn walk(&mut self, start: usize, end: usize, parent: &str) -> R<()> {
    let u8 = self.u8;
    let mut off = start;
    while off + 8 <= end {
      let mut size = u8.u32(off, false)?;
      let mut hdr = 8.0;
      let ty = read_str(u8, off + 4, 4);
      if size == 1.0 { size = self.u64(off + 8)?; hdr = 16.0; } else if size == 0.0 { size = (end - off) as f64; }
      if size < hdr { break; }
      let b = off + hdr as usize;
      let e = end.min(off.saturating_add(size as usize));
      match parent {
        "ilst" => self.ilst_item(&ty, b, e)?,
        "stsd" => self.sample_entry(&ty, b, e)?,
        "entry" => self.entry_child(&ty, b, e)?,
        _ => match ty.as_str() {
          "ftyp" => {
            self.brand = Some(js::trim(&read_str(u8, b, 4)).to_string());
            let mut c = vec![]; let mut q = b + 8;
            while q + 4 <= e { c.push(js::trim(&read_str(u8, q, 4)).to_string()); q += 4; }
            self.compat = Some(c);
          }
          "trak" => { self.handler = None; self.walk(b, e, &ty)?; }
          "moov" | "mdia" | "minf" | "stbl" | "udta" | "edts" => self.walk(b, e, &ty)?,
          "ilst" => self.walk(b, e, "ilst")?,
          "meta" => { let s = if read_str(u8, b + 4, 4) == "hdlr" { b } else { b + 4 }; self.walk(s, e, "meta")?; }
          "mdhd" => { let v = u8.b(b); self.last_mdhd = Some(if v == 1 { (u8.u32(b + 20, false)?, self.u64(b + 24)?) } else { (u8.u32(b + 12, false)?, u8.u32(b + 16, false)?) }); }
          "hdlr" => if parent == "mdia" {
            let h = read_str(u8, b + 8, 4);
            if h == "soun" { if let Some((ts, dur)) = self.last_mdhd { if some(self.audio.ts) == 0.0 { self.audio.ts = Some(ts); self.audio.dur = Some(dur); } } }
            self.handler = Some(h);
          },
          "stsd" => if self.handler.as_deref() == Some("soun") && self.audio.fourcc.as_deref().unwrap_or("").is_empty() { self.walk(b + 8, e, "stsd")?; },
          _ => {}
        },
      }
      off = off.saturating_add(size as usize);
    }
    Ok(())
  }
}

fn parse_mp4(u8: &Bytes, info: &mut FileInfo) -> R<()> {
  info.container = "MPEG-4".into();
  let mut m = Mp4 { u8, tags: std::mem::take(&mut info.tags), audio: Mp4Audio::default(), last_mdhd: None, handler: None, brand: None, compat: None };
  let r = m.walk(0, u8.len(), "root");
  info.tags = m.tags; info.brand = m.brand; info.compat_brands = m.compat;
  r?;
  let a = m.audio;
  let fc = a.fourcc.clone().unwrap_or_default();
  if fc.is_empty() && some(a.ts) == 0.0 { info.codec = "No audio".into(); info.unsupported = Some("This MP4 has no audio track, only video.".into()); return Ok(()); }
  if fc == "mp4a" {
    info.codec = if a.oti == Some(0x69) || a.oti == Some(0x6B) { "MP3".into() } else { match a.aot { Some(1) => "AAC Main", Some(2) => "AAC-LC", Some(5) => "HE-AAC", Some(29) => "HE-AACv2", Some(42) => "xHE-AAC", _ => "AAC" }.into() };
    info.lossless = Some(false);
  } else if fc == "alac" { info.codec = "ALAC".into(); info.lossless = Some(true); }
  else if fc == "fLaC" { info.codec = "FLAC".into(); info.lossless = Some(true); }
  else if fc == "Opus" { info.codec = "Opus".into(); info.lossless = Some(false); }
  else if fc == "ac-3" || fc == "ec-3" { info.codec = if fc == "ac-3" { "Dolby Digital".into() } else { "Dolby Digital Plus".into() }; info.lossless = Some(false); }
  else if matches!(fc.as_str(), "lpcm" | "sowt" | "twos" | "ipcm" | "fpcm" | "in24" | "in32" | "fl32") { info.codec = "PCM".into(); info.lossless = Some(true); }
  else if !fc.is_empty() { info.codec = fc.clone(); }
  let ts = some(a.ts);
  let mut sr = some(a.sr).max(if (8000.0..=768000.0).contains(&ts) { ts } else { 0.0 });
  if matches!(a.aot, Some(5) | Some(29)) && sr != 0.0 && sr < 32000.0 { sr *= 2.0; }
  if info.codec == "Opus" { sr = 48000.0; if some(a.opus_input) != 0.0 { info.opus_input_rate = a.opus_input; } }
  info.sample_rate = sr;
  info.channels = some(a.ch);
  if info.lossless == Some(true) { info.bits = if some(a.bits) != 0.0 { some(a.bits) } else { some(a.ss) }; }
  if ts != 0.0 && some(a.dur) != 0.0 { info.duration = some(a.dur) / ts; }
  if some(a.avg_br) != 0.0 { info.bitrate = some(a.avg_br) / 1000.0; }
  info.encoder = info.tags.get("©too").or_else(|| info.tags.get("©enc")).cloned().unwrap_or_default();
  info.container = if info.brand.as_deref() == Some("M4A") { "MPEG-4 (M4A)".into() } else { format!("MPEG-4 ({})", info.brand.as_deref().filter(|b| !b.is_empty()).unwrap_or("?")) };
  Ok(())
}

fn find(hay: &[u8], needle: &[u8]) -> Option<usize> { hay.windows(needle.len()).position(|w| w == needle) }

fn parse_ogg(u8: &Bytes, info: &mut FileInfo) -> R<()> {
  info.container = "Ogg".into();
  let mut preskip = 0f64;
  if u8.has(26) {
    let pk = 27 + u8.b(26) as usize;
    if read_str(u8, pk, 7) == "\u{1}vorbis" {
      info.codec = "Vorbis".into(); info.lossless = Some(false); info.channels = u8.b(pk + 11) as f64; info.sample_rate = u8.u32(pk + 12, true)?;
      let nom = u8.i32(pk + 20, true)?;
      if nom > 0.0 { info.nominal_bitrate = Some(nom / 1000.0); }
    } else if read_str(u8, pk, 8) == "OpusHead" {
      info.codec = "Opus".into(); info.lossless = Some(false); info.channels = u8.b(pk + 9) as f64; info.sample_rate = 48000.0;
      preskip = u8.u16(pk + 10, true)? as f64;
      info.opus_input_rate = Some(u8.u32(pk + 12, true)?);
    } else if read_str(u8, pk, 5) == "\u{7f}FLAC" {
      info.codec = "FLAC".into(); info.lossless = Some(true);
      let s = stream_info(u8, pk + 17)?; apply_stream_info(info, s);
    }
  }
  let head = u8.sub(0, 1 << 19);
  // The comment packet can span pages: a failure here is ignored (JavaScript's try/catch).
  if let Some(i) = find(head, b"OpusTags") { let _ = parse_vorbis_comment(u8, i + 8, info); }
  else if let Some(i) = find(head, b"\x03vorbis") { let _ = parse_vorbis_comment(u8, i + 7, info); }
  let len = u8.len() as i64;
  let mut q = len - 14;
  while q >= 0i64.max(len - 131072) {
    let qu = q as usize;
    if u8.b(qu) == 0x4F && u8.b(qu + 1) == 0x67 && u8.b(qu + 2) == 0x67 && u8.b(qu + 3) == 0x53 {
      let g = u8.u32(qu + 6, true)? + u8.u32(qu + 10, true)? * 4294967296.0;
      if info.codec == "Opus" { info.duration = (g - preskip) / 48000.0; } else if info.sample_rate != 0.0 { info.duration = g / info.sample_rate; }
      break;
    }
    q -= 1;
  }
  Ok(())
}

fn parse_webm(u8: &Bytes, info: &mut FileInfo) -> R<()> {
  info.webm = Some(true);
  let head = u8.sub(0, 1 << 18);
  info.container = if find(head, b"webm").is_some() { "WebM".into() } else { "Matroska".into() };
  let codecs: [(&[u8], &str, bool); 7] = [(b"A_OPUS", "Opus", false), (b"A_VORBIS", "Vorbis", false), (b"A_AAC", "AAC", false), (b"A_FLAC", "FLAC", true), (b"A_MPEG/L3", "MP3", false), (b"A_PCM", "PCM", true), (b"A_ALAC", "ALAC", true)];
  let mut at: Option<usize> = None;
  for (id, name, ll) in codecs { if let Some(i) = find(head, id) { info.codec = name.into(); info.lossless = Some(ll); at = Some(i); break; } }
  if let Some(at) = at {
    let end = (u8.len() as i64 - 10).min(at as i64 + 600);
    let mut i = at as i64;
    while i < end {
      let iu = i as usize;
      if u8.b(iu) == 0xB5 && u8.b(iu + 1) == 0x88 { let v = u8.f64be(iu + 2)?; if (8000.0..=768000.0).contains(&v) { info.sample_rate = js::round(v); break; } }
      if u8.b(iu) == 0xB5 && u8.b(iu + 1) == 0x84 { let v = u8.f32be(iu + 2)?; if (8000.0..=768000.0).contains(&v) { info.sample_rate = js::round(v); break; } }
      i += 1;
    }
    let end = (u8.len() as i64 - 4).min(at as i64 + 600);
    let mut i = at as i64;
    while i < end {
      let iu = i as usize;
      if u8.b(iu) == 0x62 && u8.b(iu + 1) == 0x64 && u8.b(iu + 2) == 0x81 { info.bits = u8.b(iu + 3) as f64; break; }
      i += 1;
    }
  }
  if info.codec == "Opus" { info.sample_rate = 48000.0; }
  if info.lossless != Some(true) { info.bits = 0.0; }
  Ok(())
}
