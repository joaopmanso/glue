//! Decoding what isn't raw PCM or FLAC (src/workers/decode.ts): MP3, AAC-LC, ALAC, Vorbis and the rest Symphonia reads,
//! trimmed the way the browser's decoder trims (src/core/audio/trim.ts `keepRange`): an MP3's LAME-tag trim
//! (`mp3Gapless`), an Ogg stream's exact length; an MP4's priming and padding by Symphonia's gapless reading.
use crate::formats::parse::mp3_gapless;
use crate::js;
use crate::types::FileInfo;
use symphonia::core::audio::{AudioBuffer, AudioBufferRef, Signal};
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymErr;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

pub struct Decoded { pub channels: Vec<Vec<f32>>, pub sr: f64 }

/// An MP4's sound track edit (what mediabunny trims by): the first sample's time (s, negative for the priming an edit
/// skips) and the track's duration after the edit (s).
pub fn mp4_edit(b: &[u8]) -> Option<(f64, f64)> {
  let u32at = |o: usize| -> Option<u64> { b.get(o..o + 4).map(|x| u32::from_be_bytes(x.try_into().unwrap()) as u64) };
  let u64at = |o: usize| -> Option<u64> { b.get(o..o + 8).map(|x| u64::from_be_bytes(x.try_into().unwrap())) };
  // The boxes under [start, end): (type, body start, end).
  let boxes = |start: usize, end: usize| -> Vec<(String, usize, usize)> {
    let mut out = vec![];
    let mut o = start;
    while o + 8 <= end {
      let Some(mut size) = u32at(o) else { break };
      let ty = String::from_utf8_lossy(&b[o + 4..o + 8]).to_string();
      let mut hdr = 8;
      if size == 1 { let Some(s) = u64at(o + 8) else { break }; size = s; hdr = 16; } else if size == 0 { size = (end - o) as u64; }
      if size < hdr as u64 { break; }
      let e = end.min(o.saturating_add(size as usize));
      out.push((ty, o + hdr, e));
      o = o.saturating_add(size as usize);
    }
    out
  };
  let moov = boxes(0, b.len()).into_iter().find(|x| x.0 == "moov")?;
  let kids = boxes(moov.1, moov.2);
  let mvhd = kids.iter().find(|x| x.0 == "mvhd")?;
  let movie_ts = if b[mvhd.1] == 1 { u32at(mvhd.1 + 20)? } else { u32at(mvhd.1 + 12)? } as f64;
  for trak in kids.iter().filter(|x| x.0 == "trak") {
    let tk = boxes(trak.1, trak.2);
    let Some(mdia) = tk.iter().find(|x| x.0 == "mdia") else { continue };
    let md = boxes(mdia.1, mdia.2);
    let Some(hdlr) = md.iter().find(|x| x.0 == "hdlr") else { continue };
    if b.get(hdlr.1 + 8..hdlr.1 + 12) != Some(b"soun") { continue; }
    let mdhd = md.iter().find(|x| x.0 == "mdhd")?;
    let (ts, dur) = if b[mdhd.1] == 1 { (u32at(mdhd.1 + 20)?, u64at(mdhd.1 + 24)?) } else { (u32at(mdhd.1 + 12)?, u32at(mdhd.1 + 16)?) };
    let (ts, dur) = (ts as f64, dur as f64);
    let elst = tk.iter().find(|x| x.0 == "edts").and_then(|e| boxes(e.1, e.2).into_iter().find(|x| x.0 == "elst"));
    let Some(elst) = elst else { return Some((0.0, dur / ts)) };
    let v1 = b[elst.1] == 1;
    let n = u32at(elst.1 + 4)?;
    let mut o = elst.1 + 8;
    for _ in 0..n {
      let (seg, media) = if v1 { (u64at(o)?, u64at(o + 8)? as i64) } else { (u32at(o)?, u32at(o + 4)? as u32 as i32 as i64) };
      o += if v1 { 20 } else { 12 };
      if media < 0 { continue; }   // an empty edit
      let first = -(media as f64) / ts;
      let d = if seg > 0 && movie_ts > 0.0 { seg as f64 / movie_ts } else { (dur - media as f64) / ts };
      return Some((first, d));
    }
    return Some((0.0, dur / ts));
  }
  None
}

/// `keepRange`: [first, end) frames to keep.
pub fn keep_range(total: usize, sr: f64, first_ts: f64, duration: Option<f64>, mp3: Option<(f64, Option<f64>)>, exact: Option<f64>) -> (usize, usize) {
  let t = total as f64;
  if let Some((start, until)) = mp3 {
    let a = t.min(start);
    let b = match until { None => t, Some(u) => t.min(a.max(u)) };
    return (a as usize, b as usize);
  }
  let a = t.min(if first_ts < 0.0 { js::round(-first_ts * sr) } else { 0.0 });
  let mut b = match duration { Some(d) if d > 0.0 => t.min(a + js::round(d * sr)), _ => t };
  if let Some(e) = exact.filter(|&e| e > 0.0) { b = b.min(a + js::round(e * sr)); }
  (a as usize, a.max(b) as usize)
}

fn push(buf: &AudioBufferRef, out: &mut [Vec<f32>]) {
  let mut f = AudioBuffer::<f32>::new(buf.capacity() as u64, *buf.spec());
  buf.convert(&mut f);
  for (c, o) in out.iter_mut().enumerate() { if c < f.spec().channels.count() { o.extend_from_slice(f.chan(c)); } }
}

/// Decode `bytes` (the whole file) to planar floats at the stream's own rate.
pub fn decode(bytes: &[u8], info: &FileInfo, ext: &str) -> Result<Decoded, String> {
  let mp3 = info.codec.starts_with("MP3") && info.container == "MPEG audio";
  let ogg = info.container == "Ogg";
  let mp4 = info.container.starts_with("MPEG-4");
  let mss = MediaSourceStream::new(Box::new(std::io::Cursor::new(bytes.to_vec())), Default::default());
  let mut hint = Hint::new();
  if !ext.is_empty() { hint.with_extension(ext); }
  // Trimmed here, as the browser does: an MP3 by its LAME tag, an Ogg stream by its last granule, an MP4 by its edit list.
  let gapless = !mp3 && !ogg && !mp4;
  let probed = symphonia::default::get_probe()
    .format(&hint, mss, &FormatOptions { enable_gapless: gapless, ..Default::default() }, &MetadataOptions::default())
    .map_err(|e| format!("It couldn’t be read ({e})."))?;
  let mut format = probed.format;
  let track = format.tracks().iter().find(|t| t.codec_params.codec != CODEC_TYPE_NULL).ok_or("It has no audio track.")?.clone();
  let mut dec = symphonia::default::get_codecs().make(&track.codec_params, &DecoderOptions::default()).map_err(|e| format!("Its codec can’t be decoded ({e})."))?;
  let nch = track.codec_params.channels.map(|c| c.count()).unwrap_or(0);
  let mut sr = track.codec_params.sample_rate.unwrap_or(0) as f64;
  let mut out: Vec<Vec<f32>> = vec![Vec::new(); nch.max(1)];
  loop {
    crate::control::check()?;
    let p = match format.next_packet() {
      Ok(p) => p,
      Err(SymErr::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
      Err(SymErr::ResetRequired) => break,
      Err(e) => return Err(format!("It couldn’t be decoded ({e}).")),
    };
    if p.track_id() != track.id { continue; }
    match dec.decode(&p) {
      Ok(buf) => {
        let spec = *buf.spec();
        if sr == 0.0 { sr = spec.rate as f64; }
        if spec.rate as f64 != sr || spec.channels.count() != out.len() {
          if out.iter().all(|c| c.is_empty()) { out = vec![Vec::new(); spec.channels.count()]; sr = spec.rate as f64; }
          else { return Err("Its rate or channels change mid-stream.".into()); }
        }
        push(&buf, &mut out);
      }
      // A damaged packet (an MP3 joined or cut mid-stream: "invalid main_data offset"): silence for as long as it
      // lasts, as the browser's decoder keeps its time; skipping it shifted the rest of the song (the desktop's check,
      // 2026-10-02: Donna Lee, Deftones).
      Err(SymErr::DecodeError(_)) => { if p.dur() > 0 && out.iter().any(|c| !c.is_empty()) { for c in out.iter_mut() { c.resize(c.len() + p.dur() as usize, 0.0); } } }
      Err(e) => return Err(format!("It couldn’t be decoded ({e})."))
    }
  }
  let total = out.first().map(|c| c.len()).unwrap_or(0);
  if total == 0 { return Err("It couldn’t be decoded.".into()); }
  // The page decoder decodes at the file's own rate (or the HE-AAC rate): a different rate can't be what the website gets.
  let want = info.decode_rate.filter(|&r| r != 0.0).unwrap_or(info.sample_rate);
  if want != 0.0 && want != sr { return Err(format!("It decodes at {} where the file says {} (HE-AAC isn’t decoded natively yet).", js::num_str(sr), js::num_str(want))); }
  let edit = if mp4 { mp4_edit(bytes) } else { None };
  let (a, b) = keep_range(total, sr, edit.map(|e| e.0).unwrap_or(0.0), edit.map(|e| e.1), if mp3 { mp3_gapless(bytes) } else { None }, if ogg { Some(info.duration) } else { None });
  Ok(Decoded { channels: out.into_iter().map(|c| c[a..b].to_vec()).collect(), sr })
}
