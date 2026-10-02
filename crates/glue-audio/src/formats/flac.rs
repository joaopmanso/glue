//! src/core/formats/flac.ts (ADR 0144): FLAC decoded exactly, at the file's own rate, read a part at a time. The
//! arithmetic is JavaScript's: Int32Array stores wrap (ToInt32), the LPC sum runs in doubles.
use crate::js;

pub struct FlacInfo { pub sample_rate: u32, pub channels: usize, pub bits: u32, pub total: f64, pub max_frame: u32 }
pub struct FlacPcm { pub sample_rate: u32, pub bits: u32, pub channels: Vec<Vec<f32>> }

/// The stream's bits, MSB first, from a window of the file refilled as it's used up.
struct Bits { b: Vec<u8>, pos: usize, base: usize, bits: u32 }

impl Bits {
  fn at(&self, i: usize) -> u32 { *self.b.get(i).unwrap_or(&0) as u32 }
  /// 32 bits from the position (zeros past the end).
  fn peek32(&self) -> u32 {
    let (i, s) = (self.pos >> 3, (self.pos & 7) as u32);
    let w = (self.at(i) << 24) | (self.at(i + 1) << 16) | (self.at(i + 2) << 8) | self.at(i + 3);
    if s != 0 { (w << s) | (self.at(i + 4) >> (8 - s)) } else { w }
  }
  fn read(&mut self, n: u32) -> u32 {
    if n == 0 { return 0; }
    let w = self.peek32();
    let v = if n == 32 { w } else { w >> (32 - n) };
    self.pos += n as usize;
    v
  }
  fn signed(&mut self, n: u32) -> i32 {
    let v = self.read(n);
    if n == 0 { 0 } else if n == 32 { v as i32 } else { ((v << (32 - n)) as i32) >> (32 - n) }
  }
  fn unary(&mut self) -> Result<u32, String> {
    let mut n = 0u32;
    loop {
      let w = self.peek32();
      if w != 0 { let z = w.leading_zeros(); self.pos += z as usize + 1; return Ok(n + z); }
      n += 32; self.pos += 32;
      if (self.pos >> 3) > self.b.len() { return Err("FLAC: a residual runs past the end".into()); }
    }
  }
  fn align(&mut self) { self.pos = (self.pos + 7) & !7; }
  fn left(&self) -> i64 { self.b.len() as i64 - (self.pos >> 3) as i64 }
}

const BLOCK: [u32; 16] = [0, 192, 576, 1152, 2304, 4608, 0, 0, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
const SIZE: [u32; 8] = [0, 8, 12, 0, 16, 20, 24, 32];

/// `flacHeader`: STREAMINFO, and where the first frame starts.
pub fn flac_header(head: &[u8]) -> Option<(FlacInfo, usize)> {
  if head.len() < 42 || &head[..4] != b"fLaC" { return None; }
  let mut at = 4usize;
  let mut info = None;
  loop {
    if at + 4 > head.len() { return None; }
    let (last, ty) = (head[at] & 0x80, head[at] & 0x7f);
    let len = ((head[at + 1] as usize) << 16) | ((head[at + 2] as usize) << 8) | head[at + 3] as usize;
    if ty == 0 {
      let end = (at + 4 + len).min(head.len());
      let mut r = Bits { b: head[at + 4..end].to_vec(), pos: 0, base: 0, bits: 16 };
      r.read(16); r.read(16); r.read(24);
      let max_frame = r.read(24);
      let sample_rate = r.read(20);
      let channels = r.read(3) as usize + 1;
      let bits = r.read(5) + 1;
      let total = r.read(4) as f64 * 4294967296.0 + r.read(32) as f64;
      info = Some(FlacInfo { sample_rate, channels, bits, total, max_frame });
    }
    at += 4 + len;
    if last != 0 { return info.map(|i| (i, at)); }
  }
}

/// `decodeFlac`: the samples of a FLAC file of `size` bytes, read with `read(start, end)` (end exclusive).
pub fn decode_flac(size: usize, read: &mut dyn FnMut(usize, usize) -> Result<Vec<u8>, String>) -> Result<FlacPcm, String> {
  let mut head = read(0, size.min(1 << 16))?;
  let mut h = flac_header(&head);
  let mut want: usize = 1 << 20;
  while h.is_none() && want < size * 2 && head.len() < size { head = read(0, size.min(want))?; h = flac_header(&head); want *= 4; }
  let (info, start) = h.ok_or("FLAC: no stream header")?;
  let nch = info.channels;
  let chunk = 8usize << 20;
  let margin = (1i64 << 20).max(info.max_frame as i64 * 2);
  let mut cap = info.total as usize;
  let mut total = 0usize;
  let mut out: Vec<Vec<f32>> = (0..nch).map(|_| vec![0f32; cap]).collect();
  let first = read(start, size.min(start + chunk))?;
  let mut r = Bits { b: first, pos: 0, base: start, bits: 16 };
  let mut block: Vec<Vec<i32>> = (0..nch).map(|_| vec![0i32; 65536]).collect();
  let mut more = |r: &mut Bits| -> Result<bool, String> {
    let keep = r.pos >> 3;
    let next = read(r.base + r.b.len(), size.min(r.base + r.b.len() + chunk))?;
    let got = !next.is_empty();
    let mut b = r.b[keep..].to_vec();
    b.extend_from_slice(&next);
    r.base += keep; r.pos &= 7; r.b = b;
    Ok(got)
  };
  loop {
    // The next frame's sync code, then a whole frame's worth ahead of it in the window. Anything before it is skipped:
    // a tag at the end, a damaged part, or the 17 MB of zeros after the metadata of the user's Blue Train FLACs.
    loop {
      r.align();
      let mut i = r.pos >> 3;
      while i + 1 < r.b.len() && !(r.b[i] == 0xff && (r.b[i + 1] & 0xfe) == 0xf8) { i += 1; }
      r.pos = i * 8;
      if (r.left() >= margin && i + 1 < r.b.len()) || r.base + r.b.len() >= size || !more(&mut r)? { break; }
    }
    if r.left() < 4 { break; }
    let n = frame(&mut r, &info, &mut block)?;
    if n == 0 { break; }
    if total + n > cap {
      cap = ((total + n) as f64 * 1.25).ceil() as usize + 65536;
      for c in out.iter_mut() { c.resize(cap, 0.0); }
    }
    let scale = 1.0 / 2f64.powi(r.bits as i32 - 1);
    for c in 0..nch { let (src, dst) = (&block[c], &mut out[c]); for i in 0..n { dst[total + i] = (src[i] as f64 * scale) as f32; } }
    total += n;
  }
  for c in out.iter_mut() { c.truncate(total); }
  Ok(FlacPcm { sample_rate: info.sample_rate, bits: info.bits, channels: out })
}

/// One frame into `block` (one per channel): its number of samples.
fn frame(r: &mut Bits, info: &FlacInfo, block: &mut [Vec<i32>]) -> Result<usize, String> {
  r.read(15); r.read(1);
  let (bs_code, sr_code, ch_code, ss_code) = (r.read(4), r.read(4), r.read(4), r.read(3));
  r.read(1);
  let first = r.read(8);
  let extra = if first >= 0xfe { 6 } else if first >= 0xfc { 5 } else if first >= 0xf8 { 4 } else if first >= 0xf0 { 3 } else if first >= 0xe0 { 2 } else if first >= 0xc0 { 1 } else { 0 };
  for _ in 0..extra { r.read(8); }
  let mut n = BLOCK[bs_code as usize] as usize;
  if bs_code == 6 { n = r.read(8) as usize + 1; } else if bs_code == 7 { n = r.read(16) as usize + 1; }
  if sr_code == 12 { r.read(8); } else if sr_code == 13 || sr_code == 14 { r.read(16); }
  r.read(8);
  let bits = if ss_code == 0 { info.bits } else { SIZE[ss_code as usize] };
  if n == 0 || bits == 0 { return Err("FLAC: a frame header that can’t be read".into()); }
  r.bits = bits;
  let nch = if ch_code < 8 { ch_code as usize + 1 } else { 2 };
  if nch != info.channels { return Err("FLAC: the channels change mid-stream".into()); }
  for c in 0..nch {
    let side = (ch_code == 8 && c == 1) || (ch_code == 9 && c == 0) || (ch_code == 10 && c == 1);
    subframe(r, &mut block[c], n, bits + side as u32)?;
  }
  if nch >= 2 {
    let (a, b) = block.split_at_mut(1);
    let (a, b) = (&mut a[0], &mut b[0]);
    match ch_code {
      8 => for i in 0..n { b[i] = a[i].wrapping_sub(b[i]); },
      9 => for i in 0..n { a[i] = a[i].wrapping_add(b[i]); },
      10 => for i in 0..n {
        let s = b[i];
        let m = a[i].wrapping_mul(2) | (s & 1);
        a[i] = ((m as i64 + s as i64) as i32) >> 1;
        b[i] = ((m as i64 - s as i64) as i32) >> 1;
      },
      _ => {}
    }
  }
  r.align();
  r.read(16);
  Ok(n)
}

fn put(s: &mut [i32], i: usize, v: i32) { if let Some(x) = s.get_mut(i) { *x = v; } }   // past an Int32Array's end: ignored

fn subframe(r: &mut Bits, s: &mut [i32], n: usize, bits: u32) -> Result<(), String> {
  if r.read(1) != 0 { return Err("FLAC: a subframe that can’t be read".into()); }
  let ty = r.read(6);
  let mut wasted = 0u32;
  if r.read(1) != 0 { wasted = r.unary()? + 1; }
  let b = bits.wrapping_sub(wasted);
  let b = if (b as i32) < 0 { 0 } else { b };
  if ty == 0 { let v = r.signed(b); for x in s.iter_mut().take(n) { *x = v; } }
  else if ty == 1 { for i in 0..n { let v = r.signed(b); put(s, i, v); } }
  else if (8..=12).contains(&ty) {
    let order = (ty - 8) as usize;
    for i in 0..order { let v = r.signed(b); put(s, i, v); }
    residual(r, s, n, order)?;
    fixed(s, n, order);
  } else if ty >= 32 {
    let order = (ty - 31) as usize;
    for i in 0..order { let v = r.signed(b); put(s, i, v); }
    let precision = r.read(4) + 1;
    if precision == 16 { return Err("FLAC: a bad LPC precision".into()); }
    let shift = r.signed(5);
    let coef: Vec<f64> = (0..order).map(|_| r.signed(precision) as f64).collect();
    residual(r, s, n, order)?;
    lpc(s, n, order, &coef, shift);
  } else { return Err("FLAC: a reserved subframe type".into()); }
  if wasted != 0 { for x in s.iter_mut().take(n) { *x = js::to_int32(*x as f64 * 2f64.powi(wasted as i32)); } }
  Ok(())
}

/// The residual (partitioned Rice), into s[order…n).
fn residual(r: &mut Bits, s: &mut [i32], n: usize, order: usize) -> Result<(), String> {
  let method = r.read(2);
  if method > 1 { return Err("FLAC: a reserved residual coding".into()); }
  let (pbits, escape) = if method != 0 { (5, 31) } else { (4, 15) };
  let porder = r.read(4);
  let parts = 1usize << porder;
  let mut i = order;
  for p in 0..parts {
    let count = (n >> porder) as i64 - if p == 0 { order as i64 } else { 0 };
    let k = r.read(pbits);
    if k == escape {
      let raw = r.read(5);
      for _ in 0..count.max(0) { let v = if raw != 0 { r.signed(raw) } else { 0 }; put(s, i, v); i += 1; }
      continue;
    }
    for _ in 0..count.max(0) {
      let q = r.unary()? as f64;
      let u = q * 2f64.powi(k as i32) + r.read(k) as f64;
      // Zigzag: 0, -1, 1, -2, 2…
      let v = if u % 2.0 != 0.0 { -(u + 1.0) / 2.0 } else { u / 2.0 };
      put(s, i, js::to_int32(v)); i += 1;
    }
  }
  Ok(())
}

fn fixed(s: &mut [i32], n: usize, order: usize) {
  let n = n.min(s.len());
  let g = |s: &[i32], i: usize| s[i] as f64;
  match order {
    1 => for i in 1..n { s[i] = js::to_int32(g(s, i) + g(s, i - 1)); },
    2 => for i in 2..n { s[i] = js::to_int32(g(s, i) + (2.0 * g(s, i - 1) - g(s, i - 2))); },
    3 => for i in 3..n { s[i] = js::to_int32(g(s, i) + (3.0 * g(s, i - 1) - 3.0 * g(s, i - 2) + g(s, i - 3))); },
    4 => for i in 4..n { s[i] = js::to_int32(g(s, i) + (4.0 * g(s, i - 1) - 6.0 * g(s, i - 2) + 4.0 * g(s, i - 3) - g(s, i - 4))); },
    _ => {}
  }
}

/// The prediction, in doubles: 32 coefficients of 15 bits on 24-bit samples stay exact (under 2^53).
fn lpc(s: &mut [i32], n: usize, order: usize, coef: &[f64], shift: i32) {
  let inv = 2f64.powi(-shift);
  for i in order..n.min(s.len()) {
    let mut sum = 0f64;
    for j in 0..order { sum += coef[j] * s[i - 1 - j] as f64; }
    s[i] = js::to_int32(s[i] as f64 + (sum * inv).floor());
  }
}
