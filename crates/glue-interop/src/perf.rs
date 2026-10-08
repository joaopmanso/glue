//! Engine DJ's cues, loops and beat grid (`PerformanceData`; `core/interop/enginePerf.ts`, ADR 0168,
//! vault/research/engine-dj-write-back.md). Positions are samples; seconds are samples / the sample rate.
use crate::types::{grid_at, positive, utf8, CuePoint, Grid};

/// qCompress: a 4-byte big-endian length, then a zlib stream. None: not one.
pub fn unq(b: Option<&[u8]>) -> Option<Vec<u8>> {
  let b = b.filter(|b| b.len() > 4)?;
  let mut out = vec![];
  std::io::Read::read_to_end(&mut flate2::read::ZlibDecoder::new(&b[4..]), &mut out).ok()?;
  Some(out)
}

/// Reads a blob front to back; None once past its end.
struct Reader<'a> { b: &'a [u8], p: usize }
impl<'a> Reader<'a> {
  fn new(b: &'a [u8]) -> Self { Reader { b, p: 0 } }
  fn take(&mut self, n: usize) -> Option<&'a [u8]> { let s = self.b.get(self.p..self.p.checked_add(n)?)?; self.p += n; Some(s) }
  fn u8(&mut self) -> Option<u8> { self.take(1).map(|s| s[0]) }
  fn arr8(&mut self) -> Option<[u8; 8]> { self.take(8).map(|s| s.try_into().unwrap()) }
  fn f64(&mut self, le: bool) -> Option<f64> { self.arr8().map(|a| if le { f64::from_le_bytes(a) } else { f64::from_be_bytes(a) }) }
  fn i64(&mut self, le: bool) -> Option<i64> { self.arr8().map(|a| if le { i64::from_le_bytes(a) } else { i64::from_be_bytes(a) }) }
  fn i32(&mut self) -> Option<i32> { self.take(4).map(|s| i32::from_le_bytes(s.try_into().unwrap())) }
  fn text(&mut self) -> Option<String> { let n = self.u8()? as usize; self.take(n).map(utf8) }
  /// A colour, or none where all four channels are 0 (not set).
  fn colour(&mut self) -> Option<Option<String>> {
    let c = self.take(4)?;
    Some((c.iter().any(|&x| x != 0)).then(|| format!("#{:02x}{:02x}{:02x}", c[1], c[2], c[3])))
  }
}

/// The hot cues (num 0–7) and the main cue where it was moved (a 'load' cue). What could be read, if cut short.
pub fn quick_cues(raw: &[u8], sr: f64) -> Vec<CuePoint> {
  let mut out = vec![];
  let mut rd = Reader::new(raw);
  let mut go = || -> Option<()> {
    let n = rd.i64(false)?;
    let mut i = 0;
    while i < n {
      let (name, at, color) = (rd.text()?, rd.f64(false)?, rd.colour()?);
      if at >= 0.0 { out.push(CuePoint { t: at / sr, kind: "cue".into(), num: Some(i as f64), name, color, end: None }); }
      i += 1;
    }
    let (main, moved) = (rd.f64(false)?, rd.u8()?);
    if moved != 0 && main >= 0.0 { out.push(CuePoint { t: main / sr, kind: "load".into(), num: None, name: String::new(), color: None, end: None }); }
    Some(())
  };
  let _ = go();
  out
}
/// The saved loops that have a start and an end: GLUE's memory loops (Engine DJ has no hot loops; ADR 0170).
pub fn loops(raw: &[u8], sr: f64) -> Vec<CuePoint> {
  let mut out = vec![];
  let mut rd = Reader::new(raw);
  let mut go = || -> Option<()> {
    let n = rd.i64(true)?;
    let mut i = 0;
    while i < n {
      let (name, a, b, a_set, b_set, color) = (rd.text()?, rd.f64(true)?, rd.f64(true)?, rd.u8()?, rd.u8()?, rd.colour()?);
      if a_set != 0 && b_set != 0 && a >= 0.0 && b > a { out.push(CuePoint { t: a / sr, kind: "loop".into(), num: None, name, color, end: Some(b / sr) }); }
      i += 1;
    }
    Some(())
  };
  let _ = go();
  out
}
/// The sample rate, and the grid (the adjusted one where it has two markers, else the analysed one).
pub fn beat_data(raw: &[u8]) -> Option<(f64, Option<Grid>)> {
  let mut rd = Reader::new(raw);
  let sr = rd.f64(false)?;
  rd.f64(false)?;
  rd.u8()?;
  let mut markers = || -> Option<Vec<(f64, f64)>> {
    let n = rd.i64(false)?;
    let mut m = vec![];
    let mut i = 0;
    while i < n { let at = rd.f64(true)?; let beat = rd.i64(true)? as f64; rd.i32()?; rd.i32()?; m.push((at, beat)); i += 1; }
    Some(m)
  };
  let def = markers()?;
  let adj = markers()?;
  let m = if adj.len() >= 2 { adj } else { def };
  let mut grid = None;
  if m.len() >= 2 && m[1].1 != m[0].1 && sr > 0.0 {
    let spb = (m[1].0 - m[0].0) / (m[1].1 - m[0].1);
    grid = grid_at(60.0 * sr / spb, (m[0].0 - m[0].1 * spb) / sr);
  }
  Some((sr, grid))
}
/// The sample rate from trackData (its first number).
pub fn track_rate(raw: &[u8]) -> f64 { Reader::new(raw).f64(false).unwrap_or(0.0) }

/// A song's cues and loops (in time order) and grid, from its PerformanceData row.
pub fn performance(quick: Option<&[u8]>, loops_raw: Option<&[u8]>, beats: Option<&[u8]>, track: Option<&[u8]>) -> (Vec<CuePoint>, Option<Grid>) {
  let bd = unq(beats).and_then(|b| beat_data(&b));
  let mut sr = bd.map_or(0.0, |b| b.0);
  if !positive(sr) { sr = unq(track).map_or(0.0, |t| track_rate(&t)); }
  if !positive(sr) { return (vec![], None); }
  let mut cues = unq(quick).map(|q| quick_cues(&q, sr)).unwrap_or_default();
  if let Some(l) = loops_raw { cues.extend(loops(l, sr)); }
  cues.sort_by(|a, b| a.t.partial_cmp(&b.t).unwrap_or(std::cmp::Ordering::Equal));
  (cues, bd.and_then(|b| b.1))
}

// ---- Engine DJ's cues by slot, and writing them (ADR 0170) ----------------------------------------------------------

/// A hot cue (seconds).
#[derive(Clone, Debug, PartialEq)]
pub struct Hot { pub t: f64, pub name: String, pub color: Option<String> }
/// A saved loop (seconds).
#[derive(Clone, Debug, PartialEq)]
pub struct Loop { pub a: f64, pub b: f64, pub name: String, pub color: Option<String> }
/// Engine DJ's slots: 8 hot cues and 8 saved loops.
pub const SLOTS: usize = 8;

/// The hot cues by slot (`quickCues`, uncompressed). None where not set, or not readable.
pub fn hot_slots(raw: Option<&[u8]>, sr: f64) -> Vec<Option<Hot>> {
  let mut out = vec![None; SLOTS];
  let Some(raw) = raw else { return out };
  let mut rd = Reader::new(raw);
  let mut go = || -> Option<()> {
    let n = rd.i64(false)?;
    let mut i = 0;
    while (i as i64) < n {
      let (name, at, color) = (rd.text()?, rd.f64(false)?, rd.colour()?);
      if at >= 0.0 && i < SLOTS { out[i] = Some(Hot { t: at / sr, name, color }); }
      i += 1;
    }
    Some(())
  };
  let _ = go();
  out
}
/// The saved loops by slot (`loops`, not compressed).
pub fn loop_slots(raw: Option<&[u8]>, sr: f64) -> Vec<Option<Loop>> {
  let mut out = vec![None; SLOTS];
  let Some(raw) = raw else { return out };
  let mut rd = Reader::new(raw);
  let mut go = || -> Option<()> {
    let n = rd.i64(true)?;
    let mut i = 0;
    while (i as i64) < n {
      let (name, a, b, a_set, b_set, color) = (rd.text()?, rd.f64(true)?, rd.f64(true)?, rd.u8()?, rd.u8()?, rd.colour()?);
      if a_set != 0 && b_set != 0 && a >= 0.0 && b > a && i < SLOTS { out[i] = Some(Loop { a: a / sr, b: b / sr, name, color }); }
      i += 1;
    }
    Some(())
  };
  let _ = go();
  out
}

/// qCompress: the length (4 bytes, big-endian), then zlib.
pub fn qcompress(raw: &[u8]) -> Vec<u8> {
  let mut e = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
  std::io::Write::write_all(&mut e, raw).expect("zlib in memory");
  let z = e.finish().expect("zlib in memory");
  let mut out = (raw.len() as u32).to_be_bytes().to_vec();
  out.extend(z);
  out
}
/// A label as Engine DJ keeps it: its length (one byte), then its bytes (at most 255, cut at a character).
fn label(s: &str) -> Vec<u8> {
  let mut end = s.len().min(255);
  while !s.is_char_boundary(end) { end -= 1; }
  let mut out = vec![end as u8];
  out.extend_from_slice(&s.as_bytes()[..end]);
  out
}
/// A colour as A R G B (#rrggbb, opaque); none: 0 0 0 0.
fn argb(c: &Option<String>) -> [u8; 4] {
  let Some(h) = c.as_deref().and_then(|c| c.strip_prefix('#')).filter(|h| h.len() == 6 && h.is_ascii()) else { return [0; 4] };
  let p = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).unwrap_or(0);
  [255, p(0), p(2), p(4)]
}
/// Past the slots of a blob (its main cue and extra bytes follow).
fn skip_slots(rd: &mut Reader, le: bool, looped: bool) -> Option<()> {
  let n = rd.i64(le)?;
  for _ in 0..n.max(0) { rd.text()?; rd.f64(le)?; if looped { rd.f64(le)?; rd.u8()?; rd.u8()?; } rd.take(4)?; }
  Some(())
}

/// `quickCues` (uncompressed) with these hot cues: the main cue and any extra bytes of `prev` kept.
pub fn encode_hot(prev: Option<&[u8]>, hot: &[Option<Hot>], sr: f64) -> Vec<u8> {
  // What follows the slots: the main cue (adjusted, moved, default) and extra bytes; Engine DJ's empty one if none.
  let tail = prev.and_then(|p| { let mut rd = Reader::new(p); skip_slots(&mut rd, false, false)?; Some(p[rd.p..].to_vec()) }).filter(|t| t.len() >= 17)
    .unwrap_or_else(|| { let mut t = 0f64.to_be_bytes().to_vec(); t.push(0); t.extend(0f64.to_be_bytes()); t });
  let mut out = (SLOTS as i64).to_be_bytes().to_vec();
  for i in 0..SLOTS {
    match hot.get(i).and_then(|h| h.as_ref()) {
      Some(h) => { out.extend(label(&h.name)); out.extend((h.t * sr).to_be_bytes()); out.extend(argb(&h.color)); }
      None => { out.push(0); out.extend((-1f64).to_be_bytes()); out.extend([0; 4]); }
    }
  }
  out.extend(tail);
  out
}
/// `loops` with these saved loops: any extra bytes of `prev` kept.
pub fn encode_loops(prev: Option<&[u8]>, loops: &[Option<Loop>], sr: f64) -> Vec<u8> {
  let tail = prev.and_then(|p| { let mut rd = Reader::new(p); skip_slots(&mut rd, true, true)?; Some(p[rd.p..].to_vec()) }).unwrap_or_default();
  let mut out = (SLOTS as i64).to_le_bytes().to_vec();
  for i in 0..SLOTS {
    match loops.get(i).and_then(|l| l.as_ref()) {
      Some(l) => { out.extend(label(&l.name)); out.extend((l.a * sr).to_le_bytes()); out.extend((l.b * sr).to_le_bytes()); out.extend([1, 1]); out.extend(argb(&l.color)); }
      None => { out.push(0); out.extend((-1f64).to_le_bytes()); out.extend((-1f64).to_le_bytes()); out.extend([0, 0, 0, 0, 0, 0]); }
    }
  }
  out.extend(tail);
  out
}
/// `beatData` (uncompressed) with this grid as its adjusted grid: two markers, beat −4 (beat 0 a bar's first) and the
/// last whole beat; the analysed grid, the rest and any extra bytes of `prev` kept. None: `prev` can't be read (its
/// length in samples is needed).
pub fn encode_grid(prev: &[u8], g: &Grid) -> Option<Vec<u8>> {
  let mut rd = Reader::new(prev);
  let sr = rd.f64(false)?;
  let samples = rd.f64(false)?;
  rd.u8()?;
  let head = prev[..rd.p].to_vec();
  let grid = |rd: &mut Reader| -> Option<Vec<i32>> { let n = rd.i64(false)?; let mut unk = vec![]; for _ in 0..n.max(0) { rd.f64(true)?; rd.i64(true)?; rd.i32()?; unk.push(rd.i32()?); } Some(unk) };
  let d0 = rd.p;
  grid(&mut rd)?;
  let default = prev[d0..rd.p].to_vec();
  let unk = grid(&mut rd)?;
  let extra = prev[rd.p..].to_vec();
  if !positive(sr) || !positive(g.bpm) { return None; }
  let spb = 60.0 / g.bpm;
  let down = g.beat0 + g.bar * spb;
  let last = ((samples / sr - down) / spb).floor().max(1.0) as i64;
  let u = |i: usize| unk.get(i).copied().unwrap_or(0);
  let mut out = head;
  out.extend(default);
  out.extend(2i64.to_be_bytes());
  out.extend(((down - 4.0 * spb) * sr).to_le_bytes()); out.extend((-4i64).to_le_bytes()); out.extend(((last + 4) as i32).to_le_bytes()); out.extend(u(0).to_le_bytes());
  out.extend(((down + last as f64 * spb) * sr).to_le_bytes()); out.extend(last.to_le_bytes()); out.extend(0i32.to_le_bytes()); out.extend(u(1).to_le_bytes());
  out.extend(extra);
  Some(out)
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn slots_written_read_back_with_what_glue_doesnt_know_kept() {
    let sr = 44100.0;
    let hot = vec![Some(Hot { t: 1.5, name: "Drop".into(), color: Some("#28e214".into()) }), None, Some(Hot { t: 64.25, name: "Ünï".into(), color: None }), None, None, None, None, None];
    // Engine DJ's own: a moved main cue and two extra bytes, kept.
    let mut prev = encode_hot(None, &[], sr);
    let n = prev.len();
    prev[n - 17..n - 9].copy_from_slice(&22050f64.to_be_bytes());
    prev[n - 9] = 1;
    prev.extend([7, 7]);
    let raw = encode_hot(Some(&prev), &hot, sr);
    assert_eq!(hot_slots(Some(&raw), sr), hot);
    assert_eq!(&raw[raw.len() - 19..], &prev[prev.len() - 19..], "main cue and extra bytes as they were");
    assert!(quick_cues(&raw, sr).iter().any(|c| c.kind == "load" && (c.t - 0.5).abs() < 1e-9));
    let loops = vec![None, Some(Loop { a: 96.0, b: 98.0, name: "Roll".into(), color: Some("#ff8000".into()) }), None, None, None, None, None, None];
    let mut lprev = encode_loops(None, &[], sr);
    lprev.push(9);
    let lraw = encode_loops(Some(&lprev), &loops, sr);
    assert_eq!(loop_slots(Some(&lraw), sr), loops);
    assert_eq!(*lraw.last().unwrap(), 9);
    // Packed as Engine DJ packs it, and read as the website reads it.
    assert_eq!(unq(Some(&qcompress(&raw))).unwrap(), raw);
  }
  #[test]
  fn a_grid_written_reads_back_the_same() {
    // Engine DJ's own beatData for a 321 s song (sample rate, length, set, the analysed grid, an adjusted one, extra).
    let mut prev = 44100f64.to_be_bytes().to_vec();
    prev.extend(14_155_000f64.to_be_bytes());
    prev.push(1);
    for _ in 0..2 {
      prev.extend(2i64.to_be_bytes());
      for (at, beat, n) in [(-31414.5f64, -4i64, 858i32), (14_131_000.25, 854, 0)] { prev.extend(at.to_le_bytes()); prev.extend(beat.to_le_bytes()); prev.extend(n.to_le_bytes()); prev.extend(63i32.to_le_bytes()); }
    }
    prev.extend([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    let g = Grid { bpm: 124.0, beat0: 0.12, bar: 3.0 };
    let raw = encode_grid(&prev, &g).unwrap();
    let (sr, back) = beat_data(&raw).unwrap();
    let back = back.unwrap();
    assert_eq!(sr, 44100.0);
    assert!((back.bpm - 124.0).abs() < 1e-9 && (back.beat0 - 0.12).abs() < 1e-9 && back.bar == 3.0, "{back:?}");
    assert_eq!(&raw[..17 + 8 + 48], &prev[..17 + 8 + 48], "the analysed grid as it was");
    assert_eq!(&raw[raw.len() - 9..], &[1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
}
