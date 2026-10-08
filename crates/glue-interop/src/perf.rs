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
/// The loops that have a start and an end (num 0–7).
pub fn loops(raw: &[u8], sr: f64) -> Vec<CuePoint> {
  let mut out = vec![];
  let mut rd = Reader::new(raw);
  let mut go = || -> Option<()> {
    let n = rd.i64(true)?;
    let mut i = 0;
    while i < n {
      let (name, a, b, a_set, b_set, color) = (rd.text()?, rd.f64(true)?, rd.f64(true)?, rd.u8()?, rd.u8()?, rd.colour()?);
      if a_set != 0 && b_set != 0 && a >= 0.0 && b > a { out.push(CuePoint { t: a / sr, kind: "loop".into(), num: Some(i as f64), name, color, end: Some(b / sr) }); }
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
