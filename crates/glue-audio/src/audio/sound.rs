//! src/core/audio/sound.ts: the sound profile (ADR 0197): loudness, onsets per second, the timbre and the loudness over
//! time, from the analysis's mono mix. The same frames, sums and order as the TypeScript.
use crate::fft::Fft;
use crate::js;
use crate::types::SoundProfile;
use std::f64::consts::PI;

/// `SOUND_BANDS`.
pub const SOUND_BANDS: usize = 16;

const B64: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/// `toB64`.
pub fn to_b64(u: &[u8]) -> String {
  let mut o = String::new();
  let mut i = 0;
  while i < u.len() {
    let a = u[i] as u32;
    let b = if i + 1 < u.len() { u[i + 1] as u32 } else { 0 };
    let c = if i + 2 < u.len() { u[i + 2] as u32 } else { 0 };
    let n = (a << 16) | (b << 8) | c;
    o.push(B64[((n >> 18) & 63) as usize] as char);
    o.push(B64[((n >> 12) & 63) as usize] as char);
    o.push(if i + 1 < u.len() { B64[((n >> 6) & 63) as usize] as char } else { '=' });
    o.push(if i + 2 < u.len() { B64[(n & 63) as usize] as char } else { '=' });
    i += 3;
  }
  o
}

/// `lufsOf`: BS.1770's loudness of a mean square.
fn lufs_of(m: f64) -> f64 { -0.691 + 10.0 * js::log10(m + 1e-12) }
fn r2(x: f64) -> f64 { js::round(x * 100.0) / 100.0 }
fn r3(x: f64) -> f64 { js::round(x * 1000.0) / 1000.0 }

/// `soundProfile`.
pub fn sound_profile(mono: &[f32], sr: f64) -> Option<SoundProfile> {
  let dec = 1usize.max((sr / 44100.0).floor() as usize);
  let fs = sr / dec as f64;
  let len = mono.len() / dec;
  if (len as f64) < fs * 6.0 { return None; }
  let (n, half) = (2048usize, 1024usize);
  let fft = Fft::new(n);
  let win: Vec<f64> = (0..n).map(|i| 0.5 - 0.5 * js::cos(2.0 * PI * i as f64 / n as f64)).collect();
  let bin_hz = fs / n as f64;
  let top = js::min(16000.0, fs * 0.49);
  let mut edge = [0i64; SOUND_BANDS + 1];
  for b in 0..=SOUND_BANDS {
    let lo = if b > 0 { edge[b - 1] + 1 } else { 1 };
    edge[b] = lo.max(js::round(40.0 * js::pow(top / 40.0, b as f64 / SOUND_BANDS as f64) / bin_hz) as i64);
  }
  let (mut kw, mut lgf) = (vec![0f64; half], vec![0f64; half]);
  for k in 1..half {
    let f = k as f64 * bin_hz;
    kw[k] = (if f < 60.0 { js::pow(f / 60.0, 4.0) } else { 1.0 }) * (if f > 1500.0 { 2.512 } else { 1.0 });
    lgf[k] = js::log2(f);
  }
  let (k150, k5k, k_end) = (js::round(150.0 / bin_hz) as i64, js::round(5000.0 / bin_hz) as i64, edge[SOUND_BANDS]);
  let norm = 2.0 / (n as f64 * n as f64 * 0.375);
  let frames = len / n;
  let mut ms = vec![0f64; frames];
  let mut l = vec![0f64; frames * SOUND_BANDS];
  let (mut cen, mut flat, mut lo, mut hi) = (vec![0f64; frames], vec![0f64; frames], vec![0f64; frames], vec![0f64; frames]);
  let (mut re, mut im, mut p) = (vec![0f64; n], vec![0f64; n], vec![0f64; half]);
  for f in 0..frames {
    for i in 0..n {
      let s = (f * n + i) * dec;
      let mut v = 0f64;
      for d in 0..dec { v += mono[s + d] as f64; }
      re[i] = v / dec as f64 * win[i]; im[i] = 0.0;
    }
    fft.run(&mut re, &mut im);
    let (mut w, mut tot, mut c, mut lsum_lo, mut h) = (0f64, 0f64, 0f64, 0f64, 0f64);
    for k in 1..half { let q = re[k] * re[k] + im[k] * im[k]; p[k] = q; w += q * kw[k]; }
    for k in edge[0]..k_end {
      let ku = k as usize;
      tot += p[ku]; c += p[ku] * lgf[ku];
      if k < k150 { lsum_lo += p[ku]; }
      if k >= k5k { h += p[ku]; }
    }
    ms[f] = w * norm;
    let (mut lsum, mut dsum) = (0f64, 0f64);
    for b in 0..SOUND_BANDS {
      let mut e = 0f64;
      for k in edge[b]..edge[b + 1] { e += p[k as usize]; }
      let d = e * norm / (edge[b + 1] - edge[b]) as f64;
      l[f * SOUND_BANDS + b] = 10.0 * js::log10(e * norm + 1e-12);
      lsum += js::log(d + 1e-20); dsum += d;
    }
    cen[f] = if tot > 0.0 { c / tot } else { 0.0 };
    flat[f] = if dsum > 0.0 { js::exp(lsum / SOUND_BANDS as f64) / (dsum / SOUND_BANDS as f64) } else { 0.0 };
    lo[f] = if tot > 0.0 { lsum_lo / tot } else { 0.0 };
    hi[f] = if tot > 0.0 { h / tot } else { 0.0 };
  }

  // Integrated loudness: 400 ms blocks, gated at −70 LUFS and 10 LU under the first mean.
  let fps = fs / n as f64;
  let blk = 1usize.max(js::round(0.4 * fps) as usize);
  let nb = frames / blk;
  let mut bm = vec![0f64; nb];
  for i in 0..nb { let mut s = 0f64; for j in 0..blk { s += ms[i * blk + j]; } bm[i] = s / blk as f64; }
  let (mut s1, mut n1) = (0f64, 0usize);
  for i in 0..nb { if lufs_of(bm[i]) > -70.0 { s1 += bm[i]; n1 += 1; } }
  if n1 == 0 { return None; }
  let gate = lufs_of(s1 / n1 as f64) - 10.0;
  let (mut s2, mut n2) = (0f64, 0usize);
  for i in 0..nb { let x = lufs_of(bm[i]); if x > -70.0 && x > gate { s2 += bm[i]; n2 += 1; } }
  let lufs = if n2 > 0 { lufs_of(s2 / n2 as f64) } else { lufs_of(s1 / n1 as f64) };

  // The timbre over the frames that play (within 20 LU of the song's loudness).
  let mut shape = [0f64; SOUND_BANDS];
  let mut flux = vec![0f64; frames];
  let (mut act, mut sc, mut sf, mut sl, mut sh) = (0usize, 0f64, 0f64, 0f64, 0f64);
  for f in 0..frames {
    if f > 0 {
      let mut x = 0f64;
      for b in 0..SOUND_BANDS { let d = l[f * SOUND_BANDS + b] - l[(f - 1) * SOUND_BANDS + b]; if d > 0.0 { x += d; } }
      flux[f] = x;
    }
    if !(lufs_of(ms[f]) > lufs - 20.0) { continue; }
    act += 1;
    let mut m = 0f64;
    for b in 0..SOUND_BANDS { m += l[f * SOUND_BANDS + b]; }
    m /= SOUND_BANDS as f64;
    for b in 0..SOUND_BANDS { shape[b] += l[f * SOUND_BANDS + b] - m; }
    sc += cen[f]; sf += flat[f]; sl += lo[f]; sh += hi[f];
  }
  if act == 0 { return None; }
  let a = act as f64;
  let mut timbre: Vec<f64> = (0..SOUND_BANDS).map(|b| r2(shape[b] / a)).collect();
  timbre.extend([r3(sc / a), r3(sf / a), r3(sl / a), r3(sh / a)]);

  // Onsets per second: peaks of the band flux above its mean plus half a deviation (audible frames), 2 frames apart.
  let (mut fm, mut fv, mut na) = (0f64, 0f64, 0usize);
  for f in 1..frames { if lufs_of(ms[f]) > -70.0 { fm += flux[f]; na += 1; } }
  fm /= na.max(1) as f64;
  for f in 1..frames { if lufs_of(ms[f]) > -70.0 { fv += (flux[f] - fm) * (flux[f] - fm); } }
  let thr = fm + 0.5 * js::sqrt(fv / na.max(1) as f64);
  let (mut count, mut last) = (0usize, -10i64);
  let mut f = 1usize;
  while f + 1 < frames {
    let skip = !(lufs_of(ms[f]) > -70.0) || !(flux[f] > thr) || flux[f] < flux[f - 1] || !(flux[f] > flux[f + 1]) || (f as i64) - last < 2;
    if !skip { count += 1; last = f as i64; }
    f += 1;
  }

  // Loudness over time: about every 2 s, quarter-dB steps from −60 LUFS.
  let step = 1usize.max(js::round(2.0 * fps) as usize);
  let nc = frames.div_ceil(step);
  let mut curve = vec![0u8; nc];
  for i in 0..nc {
    let (a, b) = (i * step, frames.min(i * step + step));
    let mut s = 0f64;
    for f in a..b { s += ms[f]; }
    curve[i] = js::max(0.0, js::min(255.0, js::round((lufs_of(s / (b - a) as f64) + 60.0) * 4.0))) as u8;
  }
  Some(SoundProfile {
    lufs: r2(lufs), onsets: r2(count as f64 / (frames as f64 / fps)), timbre, curve: to_b64(&curve), step: r3(step as f64 * n as f64 / fs),
  })
}

#[cfg(test)]
mod tests {
  #[test]
  fn base64_like_js() {
    assert_eq!(super::to_b64(b"Man"), "TWFu");
    assert_eq!(super::to_b64(b"Ma"), "TWE=");
    assert_eq!(super::to_b64(b"M"), "TQ==");
  }
}
