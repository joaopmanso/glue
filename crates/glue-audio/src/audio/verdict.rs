//! src/core/audio/verdict.ts: what the file claims (FileInfo) against what it holds (the analysis). The same tests in
//! the same order, and the same words (src/core/format.ts for the numbers in them).
use crate::js;
use crate::types::{Cutoff, Depth, Expected, FileInfo, Finding, Imaging, SampleStats, Severity, Verdict};

/// `fmtRate`: "44.1 kHz", "96 kHz".
pub fn fmt_rate(sr: f64) -> String { js::num_str(js::fixed_num(sr / 1000.0, 2)) + " kHz" }
/// `fmtKHz`: "16.1 kHz".
pub fn fmt_khz(hz: f64) -> String { js::to_fixed(hz / 1000.0, 1) + " kHz" }
fn rnd(x: f64) -> String { js::num_str(js::round(x)) }

/// Ascending, as `arr.sort((x, y) => x - y)` leaves numbers (NaN never occurs here).
fn sorted(v: impl IntoIterator<Item = f64>) -> Vec<f64> { let mut a: Vec<f64> = v.into_iter().collect(); a.sort_by(|x, y| x.partial_cmp(y).unwrap_or(std::cmp::Ordering::Equal)); a }
/// `a[i]` of a JavaScript array: undefined (NaN in arithmetic) past its end.
fn at(a: &[f64], i: f64) -> f64 { if i >= 0.0 && (i as usize) < a.len() { a[i as usize] } else { f64::NAN } }

pub fn detect_cutoff(ltas: &[f32], bin_hz: f64, sr: f64) -> Cutoff {
  let n = ltas.len();
  let nyq = sr / 2.0;
  let mut pw = vec![0f64; n + 1];
  for k in 0..n { pw[k + 1] = pw[k] + js::pow(10.0, ltas[k] as f64 / 10.0); }
  let w = 1i64.max(js::round(75.0 / bin_hz) as i64);
  let mut sm = vec![0f32; n];
  for k in 0..n {
    let a = 0i64.max(k as i64 - w) as usize;
    let b = ((n - 1) as i64).min(k as i64 + w) as usize;
    sm[k] = js::max(-200.0, 10.0 * js::log10((pw[b + 1] - pw[a]) / (b - a + 1) as f64 + 1e-30)) as f32;
  }
  let mut ps = vec![0f64; n + 1];
  for k in 0..n { ps[k + 1] = ps[k] + sm[k] as f64; }
  let bin = |f: f64| -> usize { 0f64.max(((n - 1) as f64).min(js::round(f / bin_hz))) as usize };
  let mean = |f0: f64, f1: f64| -> f64 { let (a, b) = (bin(f0), bin(f1)); if b < a { f64::NAN } else { (ps[b + 1] - ps[a]) / (b - a + 1) as f64 } };
  let pct = |f0: f64, f1: f64, q: f64| -> f64 {
    let (a, b) = (bin(f0), bin(f1));
    let arr = if b >= a { sorted(sm[a..=b].iter().map(|&v| v as f64)) } else { vec![] };
    at(&arr, (q * (arr.len() as f64 - 1.0)).floor())
  };
  let global_floor = pct(1000.0, nyq * 0.995, 0.05);
  let reference = pct(200.0, (nyq * 0.8).min(12000.0), 0.5);

  let mut wall: Option<(f64, f64)> = None;
  let step = 1i64.max(js::round(50.0 / bin_hz) as i64);
  let mut k = bin(nyq - 950.0) as i64;
  let lo = bin(2000.0) as i64;
  while k >= lo {
    let f = k as f64 * bin_hz;
    let below = mean(f - 900.0, f - 300.0);
    let above = mean(f + 300.0, f + 900.0);
    let skip = below - above < 18.0 || mean(f + 300.0, (nyq * 0.995).min(f + 4000.0)) > global_floor + 12.0;
    if !skip {
      let mid = (below + above) / 2.0;
      let mut fc = f;
      let mut j = bin(f + 900.0) as i64;
      let jlo = bin(f - 900.0) as i64;
      while j >= jlo { if sm[j as usize] as f64 >= mid { fc = j as f64 * bin_hz; break; } j -= 1; }
      let b2 = mean(fc - 1200.0, fc - 400.0);
      let a2 = mean(fc + 400.0, (nyq * 0.995).min(fc + 1200.0));
      wall = Some((fc, b2 - a2));
      break;
    }
    k -= step;
  }
  // Natural roll-offs sink into the floor gently, so any sustained lift above it counts as content.
  let thresh = global_floor + 6.0;
  let need = 2i64.max(js::round(400.0 / bin_hz) as i64);
  let (mut run, mut fade) = (0i64, 0f64);
  for k in (0..n).rev() {
    if sm[k] as f64 > thresh { run += 1; if run >= need { fade = (k as i64 + need - 1) as f64 * bin_hz; break; } } else { run = 0; }
  }
  let fc = wall.map(|w| w.0).unwrap_or(fade);
  let full = fc >= 0.93 * nyq;
  let mut rising = false;
  if nyq > 40000.0 { rising = mean(nyq * 0.75, nyq * 0.95) > mean(24000.0, 30000.0) + 6.0; }

  let mut imaging = None;
  if sr >= 88200.0 && !rising {
    for r in [44100.0f64, 48000.0] {
      let m = r / 2.0;
      let span = (m * 0.7).min(nyq - m - 500.0);
      if span < 3000.0 { continue; }
      let (mut sx, mut sy, mut sxx, mut syy, mut sxy, mut cnt, mut sad) = (0f64, 0f64, 0f64, 0f64, 0f64, 0f64, 0f64);
      let dstep = bin_hz.max(span / 300.0);
      let mut d = 1000f64;
      while d <= span {
        let (x, y) = (sm[bin(m - d)] as f64, sm[bin(m + d)] as f64);
        sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sad += (x - y).abs(); cnt += 1.0;
        d += dstep;
      }
      let cov = sxy / cnt - (sx / cnt) * (sy / cnt);
      let vx = sxx / cnt - (sx / cnt) * (sx / cnt);
      let vy = syy / cnt - (sy / cnt) * (sy / cnt);
      let corr = if vx > 0.0 && vy > 0.0 { cov / (vx * vy).sqrt() } else { 0.0 };
      if corr > 0.85 && sad / cnt < 8.0 && mean(m + 1000.0, m + span) > global_floor + 10.0 { imaging = Some(Imaging { r, corr }); break; }
    }
  }
  Cutoff { fc, wall: wall.is_some(), drop: wall.map(|w| w.1).unwrap_or(0.0), full, fade, global_floor, reference, rising, imaging, sm, reach: None }
}

fn expected_table(fam: &str) -> &'static [(f64, f64)] {
  match fam {
    "MP3" => &[(64.0, 11000.0), (80.0, 13500.0), (96.0, 15100.0), (112.0, 15600.0), (128.0, 17000.0), (160.0, 17500.0), (192.0, 18600.0), (224.0, 19400.0), (256.0, 19700.0), (320.0, 20500.0)],
    "AAC" => &[(64.0, 13000.0), (96.0, 15000.0), (128.0, 16000.0), (160.0, 17000.0), (192.0, 18000.0), (256.0, 19500.0), (320.0, 20000.0)],
    "Vorbis" => &[(96.0, 15000.0), (128.0, 16500.0), (160.0, 18000.0), (192.0, 19000.0), (256.0, 20000.0), (320.0, 21000.0)],
    _ => &[(24.0, 12000.0), (40.0, 20000.0)],
  }
}

pub fn expected_cutoff(info: &FileInfo) -> Option<Expected> {
  if let Some(lp) = info.lame_lowpass.filter(|&v| v != 0.0) { return Some(Expected { hz: lp, why: "lowpass stored in the LAME header".into() }); }
  let c = info.codec.as_str();
  if c.contains("HE-AAC") { return None; }
  let fam = if c.starts_with("MP3") { "MP3" } else if c.starts_with("AAC") { "AAC" } else if c == "Vorbis" { "Vorbis" } else if c == "Opus" { "Opus" } else { return None };
  let br = if info.bitrate != 0.0 && !info.bitrate.is_nan() { info.bitrate } else { info.nominal_bitrate.unwrap_or(0.0) };
  if br == 0.0 || br.is_nan() { return None; }
  let eff = if info.channels == 1.0 { br * 1.6 } else { br };
  let t = expected_table(fam);
  let mut hz = t[0].1;
  for &(b, f) in t { if eff >= b * 0.93 { hz = f; } }
  let half = info.sample_rate / 2.0;
  Some(Expected { hz: hz.min(if half != 0.0 && !half.is_nan() { half } else { hz }), why: format!("typical for {fam} at {} kbps", rnd(br)) })
}

pub struct Guess { pub short: &'static str, pub text: &'static str }
pub fn lossy_guess(fc: f64, yt: bool) -> Guess {
  if fc < 11500.0 { return Guess { short: "Very low bitrate lossy", text: "very low bitrate lossy audio (64 kbps or less), or a 22 kHz source" }; }
  if fc < 14500.0 { return Guess { short: "Low bitrate MP3/AAC", text: "low bitrate MP3 or AAC (about 64–96 kbps): old downloads, previews or voice-grade rips" }; }
  if fc < 16600.0 { return Guess { short: if yt { "YouTube AAC rip" } else { "128 kbps MP3/AAC" }, text: "128 kbps AAC or MP3, the classic cutoff of YouTube’s AAC stream (format 140), SoundCloud MP3s and older Fraunhofer encoders" }; }
  if fc < 17600.0 { return Guess { short: "128–160 kbps MP3", text: "MP3 at about 128–160 kbps (LAME lowpasses at 17.0–17.5 kHz for these rates)" }; }
  if fc < 18900.0 { return Guess { short: "~192 kbps MP3/AAC", text: "MP3 or AAC at about 192 kbps (LAME lowpasses at 18.6 kHz)" }; }
  if fc < 19600.0 { return Guess { short: "224–256 kbps MP3/AAC", text: "MP3 at 224–256 kbps or LAME V0, or 256 kbps AAC as sold by iTunes / Apple Music" }; }
  if fc < 20300.0 { return Guess { short: if yt { "YouTube Opus rip" } else { "Opus or MP3 320" }, text: "Opus, which always stops at 20 kHz (as in YouTube’s Opus stream, format 251), or a 320 kbps MP3 / 256 kbps AAC" }; }
  Guess { short: "320 kbps MP3", text: "MP3 at 320 kbps (LAME lowpasses at about 20.5 kHz) or high-quality AAC/Vorbis" }
}

pub const ROLL_OFF_OK: f64 = 17000.0;
const SOFT_WALL_HZ: f64 = 18500.0;
const SOFT_WALL_DROP: f64 = 30.0;

pub fn find_resample(cut: &Cutoff, sr: f64) -> Option<f64> {
  if cut.full { return None; }
  let mut best: Option<(f64, f64)> = None;
  for r in [22050.0, 24000.0, 32000.0, 44100.0, 48000.0, 88200.0, 96000.0] {
    if r > sr * 0.6 { continue; }
    let ratio = cut.fc / (r / 2.0);
    if (0.86..=1.01).contains(&ratio) {
      let d = (ratio - 0.955).abs();
      if best.map_or(true, |b| d < b.1) { best = Some((r, d)); }
    }
  }
  best.map(|b| b.0)
}

/// `peakReach`: how far real content reaches in the louder moments (fixed bands, ADR 0033).
pub fn peak_reach(spec: &[f32], cols: usize, rows: usize, sr: f64) -> Option<f64> {
  if spec.is_empty() || cols == 0 || rows < 64 { return None; }
  const B: usize = 128;
  let nyq = sr / 2.0;
  let per = rows as f64 / B as f64;
  let (mut p, mut q) = (vec![0f32; B], vec![0f32; B]);
  let mut col = vec![0f32; cols];
  for b in 0..B {
    let r0 = (b as f64 * per).floor() as usize;
    let r1 = (r0 + 1).max(((b + 1) as f64 * per).floor() as usize);
    for c in 0..cols { let mut m = f64::NEG_INFINITY; for r in r0..r1 { m = js::max(m, spec[c * rows + r] as f64); } col[c] = m as f32; }
    col.sort_by(|x, y| x.partial_cmp(y).unwrap_or(std::cmp::Ordering::Equal));
    p[b] = col[(0.95 * (cols - 1) as f64).floor() as usize];
    q[b] = col[(0.2 * (cols - 1) as f64).floor() as usize];
  }
  let b1 = (1000.0 / nyq * B as f64).ceil() as usize;
  let mut floor = f64::INFINITY;
  let mut b = b1;
  while b + 2 < B { floor = js::min(floor, (q[b] as f64 + q[b + 1] as f64 + q[b + 2] as f64) / 3.0); b += 1; }
  let on = |b: usize| p[b] as f64 > floor + 10.0 && p[b] as f64 > q[b] as f64 + 6.0;
  let mut b = B - 1;
  while b > b1 { if on(b) && on(b - 1) { return Some((b + 1) as f64 * nyq / B as f64); } b -= 1; }
  Some(b1 as f64 * nyq / B as f64)
}

pub struct Beyond { pub level: f64, pub below: f64, pub corr: f64, pub content: bool }

/// `beyondWall`: above a wall, in the loud moments: how loud, how far under the music, and whether it follows it.
pub fn beyond_wall(spec: &[f32], cols: usize, rows: usize, sr: f64, cut: &Cutoff) -> Option<Beyond> {
  let nyq = sr / 2.0;
  let bin_hz = nyq / rows as f64;
  let (f0, f1) = (cut.fc + 700.0, (cut.fc + 3500.0).min(nyq * 0.98));
  if spec.is_empty() || cols == 0 || rows < 64 || !cut.wall || f1 - f0 < 500.0 || cols < 8 { return None; }
  let row = |f: f64| -> usize { 0f64.max(((rows - 1) as f64).min(js::round(f / bin_hz))) as usize };
  let band = |a: f64, b: f64| -> (Vec<f64>, Vec<f64>) {
    let r0 = row(a); let r1 = (r0 + 1).max(row(b));
    let (mut peak, mut mean) = (vec![0f64; cols], vec![0f64; cols]);
    for c in 0..cols {
      let (mut m, mut p) = (f64::NEG_INFINITY, 0f64);
      for r in r0..r1 { let v = spec[c * rows + r] as f64; if v > m { m = v; } p += js::pow(10.0, v / 10.0); }
      peak[c] = m; mean[c] = 10.0 * js::log10(p / (r1 - r0) as f64 + 1e-30);
    }
    (peak, mean)
  };
  let up = band(f0, f1);
  let under = band(cut.fc - 2000.0, cut.fc - 500.0);
  let level = sorted(up.0.iter().copied())[(0.99 * (cols - 1) as f64).floor() as usize];
  let (a, b) = (&under.1, &up.1);
  let (mut ma, mut mb) = (0f64, 0f64);
  for i in 0..cols { ma += a[i]; mb += b[i]; }
  ma /= cols as f64; mb /= cols as f64;
  let (mut sab, mut saa, mut sbb) = (0f64, 0f64, 0f64);
  for i in 0..cols { let x = a[i] - ma; let y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  let corr = sab / (saa * sbb + 1e-30).sqrt();
  Some(Beyond { level, below: cut.reference - level, corr, content: level >= (cut.reference - 45.0).max(cut.global_floor + 12.0) && corr >= 0.3 })
}

/// `holesUnderWall`: the share of loud moments where the band under the wall falls to the empty level above it.
pub fn holes_under_wall(spec: &[f32], cols: usize, rows: usize, sr: f64, cut: &Cutoff) -> Option<f64> {
  let nyq = sr / 2.0;
  let bin_hz = nyq / rows as f64;
  let (e0, e1) = ((cut.fc + 600.0).min(nyq * 0.95), nyq * 0.985);
  if spec.is_empty() || cols == 0 || rows < 64 || !cut.wall || cols < 16 || e1 - e0 < 200.0 { return None; }
  let row = |f: f64| -> usize { 0f64.max(((rows - 1) as f64).min(js::round(f / bin_hz))) as usize };
  let band = |a: f64, b: f64| -> Vec<f64> {
    let r0 = row(a); let r1 = (r0 + 1).max(row(b));
    (0..cols).map(|c| { let mut p = 0f64; for r in r0..r1 { p += js::pow(10.0, spec[c * rows + r] as f64 / 10.0); } 10.0 * js::log10(p / (r1 - r0) as f64 + 1e-30) }).collect()
  };
  let median = |a: &[f64]| -> f64 { let s = sorted(a.iter().copied()); s[(a.len() - 1) / 2] };
  let music = band(1000.0, 8000.0);
  let loud = median(&music);
  let under = band(cut.fc - 2000.0, cut.fc - 500.0);
  let empty = median(&band(e0, e1));
  let (mut n, mut holes) = (0f64, 0f64);
  for c in 0..cols { if music[c] >= loud { n += 1.0; if under[c] <= empty + 6.0 { holes += 1.0; } } }
  if n != 0.0 { Some(holes / n) } else { None }
}

pub struct Ultra { pub reach: f64, pub over_silence: f64, pub under: f64, pub from: Option<f64>, pub real: bool }

/// `ultrasonic`: how far a hi-res file's content reaches above digital silence (2026-09-30).
pub fn ultrasonic(cut: &Cutoff, bin_hz: f64, sr: f64, bits: f64) -> Option<Ultra> {
  let nyq = sr / 2.0;
  let sm = &cut.sm;
  let n = sm.len();
  if sr <= 48000.0 || nyq < 30000.0 || n == 0 { return None; }
  let silence = -130.0 - 6.02 * (16f64.max(if bits != 0.0 && !bits.is_nan() { bits } else { 24.0 }) - 16.0);
  let over = (silence + 30.0).max(cut.reference - 80.0);
  let need = 2i64.max(js::round(400.0 / bin_hz) as i64);
  let (mut reach, mut run) = (0f64, 0i64);
  let mut k = ((n - 1) as f64).min((nyq * 0.97 / bin_hz).floor()) as i64;
  while k >= 0 {
    if sm[k as usize] as f64 > over { run += 1; if run >= need { reach = (k + need - 1) as f64 * bin_hz; break; } } else { run = 0; }
    k -= 1;
  }
  let sub = |a: f64, b: f64| -> Vec<f64> {
    // Float32Array.subarray(a, b): clamped to the array, empty when b <= a.
    let a = (a.max(0.0) as usize).min(n);
    let b = (b.max(0.0) as usize).min(n);
    if b > a { sorted(sm[a..b].iter().map(|&v| v as f64)) } else { vec![] }
  };
  let a = js::round(25000.0 / bin_hz);
  let b = ((n - 1) as f64).min(js::round(nyq * 0.95 / bin_hz));
  let arr = sub(a, b + 1.0);
  let over_silence = at(&arr, ((arr.len() as f64 - 1.0) / 2.0).floor()) - silence;
  let up = sub(a, ((n - 1) as f64).min(js::round(30000.0 / bin_hz)) + 1.0);
  let under = cut.reference - at(&up, ((up.len() as f64 - 1.0) / 2.0).floor());
  let at_f = |f: f64| sm[0f64.max(((n - 1) as f64).min(js::round(f / bin_hz))) as usize] as f64;
  let past = sub(js::round((reach + 500.0) / bin_hz), js::round((reach + 2500.0) / bin_hz) + 1.0);
  let cliff = if !past.is_empty() { at_f(reach - 1000.0) - past[(past.len() - 1) / 2] } else { 0.0 };
  let mut from = None;
  if !cut.rising && (19000.0..=28500.0).contains(&reach) && cliff >= 30.0 {
    let near: Vec<f64> = [44100.0, 48000.0].into_iter().filter(|r| reach >= r / 2.0 - 800.0 && reach <= r / 2.0 + 800.0).collect();
    from = Some(if near.len() == 1 { near[0] } else { 0.0 });
  }
  Some(Ultra { reach, over_silence, under, from, real: reach >= 30000.0 && !cut.rising && cut.imaging.is_none() })
}

fn specks(w: &Option<Beyond>, floor: f64) -> String {
  match w {
    Some(w) if !w.content && w.level > floor + 12.0 => format!(" Specks above it, around {} dB ({} dB under the music), are the decoder’s rounding, not content: they show when the spectrogram’s floor is set very low.", rnd(w.level), rnd(w.below)),
    _ => String::new(),
  }
}

/// What the verdict needs from the analysis (the spectrogram is optional: it refines gentle fades).
pub struct VerdictInput<'a> { pub sr: f64, pub stats: &'a SampleStats, pub ltas: &'a [f32], pub bin_hz: f64, pub container_bits: f64, pub spec: Option<(&'a [f32], usize, usize)> }

struct Head { grade: Severity, label: String, headline: String, sub: String }
fn head(grade: Severity, label: &str, headline: String, sub: String) -> Option<Head> { Some(Head { grade, label: label.into(), headline, sub }) }

fn article(word: &str) -> String {
  let vowel = word.chars().next().is_some_and(|c| "AEIOUaeiou".contains(c));
  (if vowel { "an " } else { "a " }).to_string() + word
}
/// `s.replace(/^\w/, c => c.toLowerCase())`
fn lower_first(s: &str) -> String {
  let mut c = s.chars();
  match c.next() { Some(f) if f.is_ascii_alphanumeric() || f == '_' => f.to_ascii_lowercase().to_string() + c.as_str(), _ => s.to_string() }
}
fn truthy(x: f64) -> bool { x != 0.0 && !x.is_nan() }

pub fn classify(info: &FileInfo, res: &VerdictInput) -> Verdict {
  let sr = res.sr;
  let nyq = sr / 2.0;
  let st = res.stats;
  let mut cut = detect_cutoff(res.ltas, res.bin_hz, sr);
  let mut f: Vec<Finding> = Vec::new();
  let add = |f: &mut Vec<Finding>, sev: Severity, title: String, detail: String| f.push(Finding { sev, title, detail });
  let fc = cut.fc;
  let k_hz = fmt_khz(fc);
  let lossless = info.lossless == Some(true);
  let hi_res = sr > 48000.0;
  let clues = info.clues.clone().unwrap_or_default();
  let has = |k: &str| clues.iter().any(|c| c.kind == k);
  let yt = has("yt");
  let (mut hd, mut origin, mut bw_tone): (Option<Head>, Option<String>, String) = (None, None, "ok".into());

  if st.silent {
    add(&mut f, Severity::Info, "Digital silence".into(), "Every sample is zero, so there is nothing to measure.".into());
    return finish(head(Severity::Info, "Silent", "This file is silent".into(), "Every sample is zero.".into()), f, cut, info, res, None, "info".into(), None);
  }

  let lossy_sig = cut.wall && !cut.full && fc < 20800.0;
  let spec = res.spec.filter(|s| !s.0.is_empty() && s.1 != 0 && s.2 != 0);
  let beyond = if lossy_sig { spec.and_then(|(s, c, r)| beyond_wall(s, c, r, sr, &cut)) } else { None };
  let holes = if lossy_sig { spec.and_then(|(s, c, r)| holes_under_wall(s, c, r, sr, &cut)) } else { None };
  let holey = holes.is_some_and(|h| h >= 0.12);
  let resampled_from = find_resample(&cut, sr);
  let ultra = if lossless && hi_res && !lossy_sig { ultrasonic(&cut, res.bin_hz, sr, if truthy(info.bits) { info.bits } else { res.container_bits }) } else { None };
  let edge = (fc >= 19600.0 && cut.drop < 35.0) || (fc >= SOFT_WALL_HZ && cut.drop < SOFT_WALL_DROP);
  let content = beyond.as_ref().is_some_and(|b| b.content);

  if lossless {
    if lossy_sig && holes.is_some_and(|h| h <= 0.02) && fc >= 19800.0 && !content {
      origin = Some("Steep lowpass (mastering)".into());
      let extra = match &beyond { Some(b) if b.level > cut.global_floor + 12.0 => format!(" Quieter content above it, around {} dB, moves with the music.", rnd(b.level)), _ => String::new() };
      add(&mut f, Severity::Info, format!("Steep top end at {k_hz}"), format!("The spectrum drops {} dB at {k_hz}, but the band just under it carries on through every loud passage. Lossy encoders keep switching that band off moment to moment; a mastering or sample-rate-conversion lowpass doesn’t. So this is a lowpass, not a lossy source.{extra}", rnd(cut.drop)));
      hd = head(Severity::Ok, "Lossless", format!("Genuine {} lossless", fmt_rate(sr)), format!("A steep lowpass at {k_hz}, as some masters and sample-rate converters leave. The band under it never drops out the way a lossy encoder makes it."));
    } else if lossy_sig && content && !holey {
      let b = beyond.as_ref().unwrap();
      origin = Some("Steep lowpass (mastering)".into());
      let band = match holes { Some(h) => if h <= 0.02 { "never drops out".to_string() } else { format!("rarely drops out ({}% of the loud moments)", rnd(h * 100.0)) }, None => "keeps going".into() };
      add(&mut f, Severity::Info, format!("Steep top end at {k_hz}, with content beyond"), format!("The spectrum drops {} dB at {k_hz}, as a lossy encoder’s lowpass would, but content that follows the music carries on above it (about {} dB under the music), and the band just under it {band}. An encoder removes everything above its cutoff and keeps switching that band off (in a quarter to half of the loud moments), so this is a steep lowpass in the master, not a lossy source.", rnd(cut.drop), rnd(b.below)));
      hd = head(Severity::Ok, "Lossless", format!("Genuine {} lossless", fmt_rate(sr)), format!("A steep lowpass at {k_hz} with content carrying on above it: made in the master, not by a lossy encoder."));
    } else if lossy_sig {
      let g = lossy_guess(fc, yt);
      let soft = edge && !holey;
      origin = Some(g.short.into());
      bw_tone = if soft { "warn".into() } else { "bad".into() };
      let more = if holey { format!(" The band just under it also keeps switching off (in {}% of the loud moments), as lossy encoders do.", rnd(holes.unwrap() * 100.0)) } else if edge { " Some masters are lowpassed near 20 kHz on purpose, so this one is not conclusive.".into() } else { String::new() };
      add(&mut f, if soft { Severity::Warn } else { Severity::Bad }, format!("Brick-wall cutoff at {k_hz}"),
        format!("A lossless {} file can carry content up to {}. Here it drops {} dB within about a kilohertz at {k_hz}, which is what a lossy encoder’s lowpass filter leaves behind. Most likely source: {}.{more}{}", fmt_rate(sr), fmt_khz(nyq), rnd(cut.drop), g.text, specks(&beyond, cut.global_floor)));
      if !soft {
        let wrapper = if info.codec.starts_with("PCM") { info.container.split(' ').next().unwrap_or("").to_string() } else { info.codec.clone() };
        hd = head(Severity::Bad, "Transcoded", format!("Lossy audio in {} wrapper", article(&wrapper)),
          format!("The spectrum stops dead at {k_hz}, the signature of {}{}. Converting to lossless can’t restore what the encoder removed.", lower_first(g.short), if hi_res { format!(", later upsampled to {}", fmt_rate(sr)) } else { String::new() }));
      }
    } else if ultra.as_ref().is_some_and(|u| u.from.is_some()) && cut.imaging.is_none() {
      let u = ultra.as_ref().unwrap();
      let from = u.from.unwrap();
      let rate = if truthy(from) { from } else if let Some(r) = resampled_from.filter(|&r| r <= 48000.0) { r } else { 0.0 };
      let at_khz = fmt_khz(u.reach);
      let src = if truthy(rate) { fmt_rate(rate) } else { "CD or 48 kHz".into() };
      let lim = if truthy(rate) { fmt_khz(rate / 2.0) } else { "22 or 24 kHz".into() };
      bw_tone = "bad".into();
      origin = Some(format!("{src} source, upsampled"));
      add(&mut f, Severity::Bad, format!("Content stops at {at_khz}"), format!("Nothing past {at_khz} but the faint residue a resampler leaves, close to digital silence: just past the {lim} limit of {src} audio. The file was upsampled from a {src} source; the extra samples carry no extra information."));
      hd = head(Severity::Bad, "Upsampled", format!("Not hi-res: upsampled from {src}"), format!("The content ends at {at_khz}, where a {src} recording has to stop. The {} container adds size, not detail.", fmt_rate(sr)));
    } else if cut.full {
      add(&mut f, Severity::Ok, format!("Content reaches {}", fmt_khz(fc.max(cut.fade))), if hi_res { "Energy continues well past 24 kHz, beyond anything a CD (22.05 kHz) or 48 kHz master can hold.".into() } else { format!("The spectrum runs all the way to the {} limit of a {} file.", fmt_khz(nyq), fmt_rate(sr)) });
      origin = Some(if hi_res { "Hi-res master".into() } else { "Full-band master".into() });
    } else if hi_res && (resampled_from.is_some() || fc < 24500.0) && ultra.as_ref().is_some_and(|u| u.real && u.under < 20.0) {
      let u = ultra.as_ref().unwrap();
      origin = Some("Hi-res master".into());
      add(&mut f, Severity::Ok, format!("Content reaches {}", fmt_khz(u.reach)), "Energy continues well past 24 kHz, beyond anything a CD (22.05 kHz) or 48 kHz master can hold.".into());
      hd = head(Severity::Ok, "Genuine hi-res", format!("Real hi-res: content to {}", fmt_khz(u.reach)), "The spectrum extends well past what a CD or 48 kHz master can hold.".into());
    } else if hi_res && (resampled_from.is_some() || fc < 24500.0) && ultra.as_ref().is_some_and(|u| u.real) {
      let u = ultra.as_ref().unwrap();
      origin = Some("Hi-res master".into());
      add(&mut f, Severity::Ok, "Quiet content above 24 kHz".into(), format!("Most of the energy fades out by about {k_hz}, but quiet content carries on to {}, about {} dB over digital silence. An upsample from CD or 48 kHz leaves nothing past 22 or 24 kHz. That’s the recording’s own air and detail, which no CD or 48 kHz source holds. Lower the spectrogram’s floor (to about −125 dB) to see it.", fmt_khz(u.reach), rnd(u.over_silence)));
      hd = head(Severity::Ok, "Genuine hi-res", "Real hi-res, with a quiet top end".into(), format!("Quiet detail carries on above 24 kHz, up to {}, where an upsample from CD or 48 kHz would be empty.", fmt_khz(u.reach)));
    } else if hi_res && resampled_from.is_some() {
      let rf = resampled_from.unwrap();
      let bad = rf <= 48000.0;
      bw_tone = if bad { "bad".into() } else { "warn".into() };
      origin = Some(format!("{} source, upsampled", fmt_rate(rf)));
      add(&mut f, if bad { Severity::Bad } else { Severity::Warn }, format!("Content stops at {k_hz}"),
        format!("Nothing meaningful above {k_hz}, just under the {} limit of {} audio. The file was upsampled from a {} source; the extra samples carry no extra information.{}", fmt_khz(rf / 2.0), fmt_rate(rf), fmt_rate(rf), if bad { String::new() } else { format!(" It is still hi-res, just not {} hi-res.", fmt_rate(sr)) }));
      hd = head(if bad { Severity::Bad } else { Severity::Warn }, if bad { "Upsampled" } else { "Partly upsampled" }, format!("{}{}", if bad { "Not hi-res: upsampled from " } else { "Upsampled from " }, fmt_rate(rf)), format!("The spectrum ends at {k_hz}, where a {} recording has to stop. The {} container adds size, not detail.", fmt_rate(rf), fmt_rate(sr)));
    } else if hi_res && fc < 24500.0 {
      bw_tone = "warn".into();
      origin = Some("Band-limited source".into());
      add(&mut f, Severity::Warn, format!("Little content above {k_hz}"), "The spectrum fades out gradually before 24 kHz instead of hitting a wall. That fits an old or analog recording with limited bandwidth, or a CD-rate master converted with a gentle filter. Either way the hi-res sample rate adds nothing here.".into());
    } else if hi_res {
      origin = Some("Hi-res master".into());
      add(&mut f, Severity::Ok, format!("Content reaches {k_hz}"), "Real content above 24 kHz, which no CD or 48 kHz source can supply.".into());
    } else if fc >= 20800.0 {
      origin = Some(if sr == 44100.0 { "CD-quality master".into() } else { "Full-band master".into() });
      add(&mut f, Severity::Ok, format!("Full bandwidth, to {k_hz}"), format!("Normal for a lossless {} file: the top end reaches the converter’s anti-alias filter.", fmt_rate(sr)));
    } else if fc >= ROLL_OFF_OK {
      origin = Some("Rolled-off master".into());
      add(&mut f, Severity::Info, format!("Top end rolls off from about {k_hz}"), "The highest frequencies fade out gradually instead of stopping at a wall. Many masters are made this way (a gentle lowpass, dark sounds, heavy limiting). It is not a lossy fingerprint.".into());
    } else {
      cut.reach = spec.and_then(|(s, c, r)| peak_reach(s, c, r, sr));
      if cut.reach.is_some_and(|r| r >= ROLL_OFF_OK) {
        origin = Some("Rolled-off master".into());
        add(&mut f, Severity::Info, format!("Quiet content up to {}", fmt_khz(cut.reach.unwrap())), format!("Most of the energy fades out by about {k_hz}, but quieter content (cymbals, noise, thin lines) carries on up to {}. A lossy encoder removes everything above its cutoff, so nothing cut the top off here.", fmt_khz(cut.reach.unwrap())));
      } else {
        bw_tone = "warn".into();
        origin = Some("Band-limited source".into());
        add(&mut f, Severity::Warn, format!("Band-limited to about {k_hz}"), "The top end fades out gradually rather than stopping at a wall. That is typical of older recordings or dark masters, and is not a clear lossy fingerprint.".into());
      }
    }
    if let Some(im) = cut.imaging.clone() {
      add(&mut f, Severity::Bad, format!("Mirror image above {}", fmt_khz(im.r / 2.0)), format!("The spectrum above {} mirrors the spectrum below it, the mark of upsampling from {} without a proper anti-imaging filter. That “content” is an artifact.", fmt_khz(im.r / 2.0), fmt_rate(im.r)));
      if hd.is_none() { hd = head(Severity::Bad, "Upsampled", format!("Not hi-res: poorly upsampled from {}", fmt_rate(im.r)), "What looks like ultrasonic content is a mirror image of the audible band.".into()); }
      origin = Some(format!("{} source, upsampled", fmt_rate(im.r)));
    }
    if hi_res && cut.rising { add(&mut f, Severity::Info, "Rising ultrasonic noise".into(), "Noise climbs toward the top of the spectrum. That is typical of DSD-sourced or heavily noise-shaped material; the noise itself is not music.".into()); }
  } else if info.lossless == Some(false) {
    let exp = expected_cutoff(info);
    let br = if truthy(info.bitrate) { info.bitrate } else { info.nominal_bitrate.filter(|&v| truthy(v)).unwrap_or(0.0) };
    if exp.as_ref().is_some_and(|e| !cut.full && fc < e.hz - 1500.0 && cut.wall) {
      let e = exp.as_ref().unwrap();
      let g = lossy_guess(fc, yt);
      let sure = info.codec.starts_with("MP3") || info.lame_lowpass.is_some_and(truthy);
      bw_tone = if sure { "bad".into() } else { "warn".into() };
      origin = Some(if sure { format!("Re-encode of {}", g.short.to_lowercase()) } else { format!("{} encode", info.codec) });
      let w = spec.and_then(|(s, c, r)| beyond_wall(s, c, r, sr, &cut));
      add(&mut f, if sure { Severity::Bad } else { Severity::Warn }, format!("Cutoff too low for {} kbps", rnd(br)),
        format!("An encode at this bitrate would normally keep content up to about {} ({}). This one stops at {k_hz}{}{}", fmt_khz(e.hz), e.why, if sure { format!(", so it was probably re-encoded from {}.", g.text) } else { ". That can mean a re-encode of a lower-quality file, or just a conservative encoder.".into() }, specks(&w, cut.global_floor)));
      if sure { hd = head(Severity::Bad, "Fake bitrate", "Upconverted from a lower-quality file".into(), format!("Labelled {} {} kbps, but the content stops at {k_hz}, like {}. The extra bitrate stores nothing new.", info.codec, rnd(br), g.short.to_lowercase())); }
    } else {
      origin = Some(format!("{} encode", info.codec));
      add(&mut f, Severity::Ok, "Bandwidth fits the format".into(), format!("Content stops at {k_hz}{}", match &exp { Some(e) => format!("; {} is {}.", fmt_khz(e.hz), e.why), None => ".".into() }));
    }
    add(&mut f, Severity::Info, "Lossy by design".into(), format!("{} discards information to save space, so it can’t be hi-res whatever its sample rate. Converting it to FLAC or WAV won’t change that.", info.codec));
  } else {
    add(&mut f, Severity::Info, "Format not identified".into(), "The codec couldn’t be read from the container, so the verdict rests on the spectrum alone.".into());
    if lossy_sig {
      let g = lossy_guess(fc, yt);
      origin = Some(g.short.into()); bw_tone = "bad".into();
      add(&mut f, Severity::Bad, format!("Brick-wall cutoff at {k_hz}"), format!("Content drops {} dB within about a kilohertz at {k_hz}, the fingerprint of a lossy encoder. Most likely source: {}.", rnd(cut.drop), g.text));
      hd = head(Severity::Bad, "Lossy", format!("Lossy audio: content stops at {k_hz}"), format!("Whatever the container claims, this is {} quality, nowhere near hi-res.", lower_first(g.short)));
    } else if hi_res && resampled_from.is_some_and(|r| r <= 48000.0) {
      let rf = resampled_from.unwrap();
      bw_tone = "bad".into(); origin = Some(format!("{} source, upsampled", fmt_rate(rf)));
      add(&mut f, Severity::Bad, format!("Content stops at {k_hz}"), format!("Nothing meaningful above {k_hz}, the limit of {} audio, so the {} rate adds nothing.", fmt_rate(rf), fmt_rate(sr)));
    }
  }

  // Bit depth
  let declared = if truthy(info.bits) { info.bits } else { 0.0 };
  let mut depth: Option<Depth> = None;
  if st.assessed && st.wasted.is_some() && declared != 0.0 {
    let eff = declared.min(res.container_bits - st.wasted.unwrap());
    depth = Some(Depth { eff, declared, float: None });
    if eff < declared {
      let sev = if declared >= 20.0 && eff <= 16.0 { Severity::Bad } else { Severity::Warn };
      add(&mut f, sev, format!("Only {} of {} bits used", js::num_str(eff), js::num_str(declared)), format!("The lowest {} bits are zero in every sample: this is {}-bit audio padded out to {} bits. The padding carries nothing.", js::num_str(declared - eff), js::num_str(eff), js::num_str(declared)));
      if hd.is_none() && sev == Severity::Bad { hd = head(Severity::Bad, "Padded", format!("Not 24-bit: {}-bit audio padded with zeros", js::num_str(eff)), format!("Every sample’s bottom {} bits are empty. The bandwidth may be fine, but the depth is CD-grade.", js::num_str(declared - eff))); }
    } else if declared >= 20.0 {
      add(&mut f, Severity::Ok, format!("All {} bits in use", js::num_str(declared)), "The low-order bits carry signal. A 16-bit master that had gain or dither applied after conversion would also pass this test, so read it alongside the spectrum.".into());
    }
  } else if st.float_fmt {
    if st.on16 == 1.0 { depth = Some(Depth { eff: 16.0, declared: 32.0, float: Some(true) }); add(&mut f, Severity::Bad, "16-bit samples in a float file".into(), "Every sample lands exactly on the 16-bit grid, so this is 16-bit audio stored as 32-bit float.".into()); }
    else if st.on24 == 1.0 { depth = Some(Depth { eff: 24.0, declared: 32.0, float: Some(true) }); add(&mut f, Severity::Info, "24-bit samples in a float file".into(), "Every sample lands exactly on the 24-bit grid.".into()); }
  } else if lossless && declared != 0.0 && !st.assessed {
    add(&mut f, Severity::Info, "Bit depth not checked".into(), "The decoder didn’t return bit-exact samples, so the low bits couldn’t be inspected.".into());
  }

  // Provenance clues
  let matches = |kinds: &[&str]| clues.iter().filter(|c| kinds.contains(&c.kind.as_str())).map(|c| c.matched.clone()).collect::<Vec<_>>().join(", ");
  if lossless && (has("mp3") || has("lossy")) {
    add(&mut f, Severity::Bad, "Lossy-encoder tag in a lossless file".into(), format!("The file contains a lossy encoder’s signature ({}). The audio probably passed through that encoder before it was saved as {}.", matches(&["mp3", "lossy"]), info.codec));
  }
  if yt {
    add(&mut f, if lossless { Severity::Bad } else { Severity::Warn }, "YouTube fingerprints".into(), format!("The container carries marks of a YouTube download ({}). YouTube serves at best about 160 kbps Opus or 128 kbps AAC.", matches(&["yt"])));
    if origin.is_none() || lossless { origin = Some(if origin.is_some() && lossy_sig { origin.unwrap() } else { "YouTube download".into() }); }
  }
  if hi_res && has("rip") { add(&mut f, Severity::Bad, "CD-ripper tag in a hi-res file".into(), format!("A CD ripper wrote these tags. A CD holds 16-bit / 44.1 kHz audio, so this {} file was upconverted from a CD.", fmt_rate(sr))); }
  if !info.codec.is_empty() && info.codec.contains("inside WAV") { add(&mut f, Severity::Bad, info.codec.clone(), "The WAV container holds compressed audio, not PCM.".into()); }
  if let Some(r) = info.opus_input_rate.filter(|&r| truthy(r) && r != 48000.0) { add(&mut f, Severity::Info, format!("Encoder input was {}", fmt_rate(r)), "Opus always decodes at 48 kHz; its header records the rate that was fed into the encoder.".into()); }

  // Channels and level
  if st.lr_identical { add(&mut f, Severity::Warn, "Left and right are identical".into(), "This is mono presented as stereo.".into()); }
  else if let Some(c) = st.lr_corr.filter(|&c| c > 0.999) { add(&mut f, Severity::Info, "Near-mono".into(), format!("The two channels are almost identical (correlation {}).", js::to_fixed(c, 4))); }
  if st.clip_runs > 20.0 { add(&mut f, Severity::Info, format!("{} clipped passages", js::grouped(st.clip_runs as i64)), "Runs of full-scale samples: a loud, clipped master. That is a mastering choice, not a sign of a bad source.".into()); }

  finish(hd, f, cut, info, res, depth, bw_tone, origin)
}

#[allow(clippy::too_many_arguments)]
fn finish(hd: Option<Head>, mut f: Vec<Finding>, cut: Cutoff, info: &FileInfo, res: &VerdictInput, depth: Option<Depth>, bw_tone: String, origin: Option<String>) -> Verdict {
  let order = |s: Severity| match s { Severity::Bad => 0, Severity::Warn => 1, Severity::Ok => 2, Severity::Info => 3 };
  f.sort_by_key(|x| order(x.sev));   // stable, as JavaScript's sort
  let sr = res.sr;
  let hi_res = sr > 48000.0;
  let k_hz = fmt_khz(cut.fc);
  let h = hd.unwrap_or_else(|| {
    let bad = f.iter().find(|x| x.sev == Severity::Bad);
    let warn = f.iter().find(|x| x.sev == Severity::Warn);
    let reach = fmt_khz(cut.fc.max(cut.fade));
    if let Some(b) = bad { Head { grade: Severity::Bad, label: "Suspect".into(), headline: b.title.clone(), sub: b.detail.clone() } }
    else if let Some(w) = warn { Head { grade: Severity::Warn, label: "Caution".into(), headline: w.title.clone(), sub: w.detail.clone() } }
    else if info.lossless.is_none() { Head { grade: Severity::Info, label: "Unverified".into(), headline: "No lossy fingerprint, format unknown".into(), sub: format!("Content reaches {reach} with no encoder wall, but the codec couldn’t be identified, so this isn’t proof the file is lossless.") } }
    else if info.lossless == Some(false) { Head { grade: Severity::Warn, label: "Lossy · not hi-res".into(), headline: format!("Lossy {}, not hi-res", info.codec), sub: format!("Content stops at {k_hz}. The bandwidth matches what {}{} should give, so it isn’t a fake, but the encoder has removed detail and no sample rate can make it hi-res.", info.codec, if truthy(info.bitrate) { format!(" at {} kbps", rnd(info.bitrate)) } else { String::new() }) } }
    else if hi_res { Head { grade: Severity::Ok, label: "Genuine hi-res".into(), headline: format!("Real hi-res: content to {reach}"), sub: format!("The spectrum extends well past what a CD or 48 kHz master can hold{}", if depth.as_ref().is_some_and(|d| d.eff >= 20.0) { ", and the low bits carry signal." } else { "." }) } }
    else if !cut.full && cut.fc < 20800.0 { Head { grade: Severity::Ok, label: "Lossless".into(), headline: format!("Genuine {} lossless", fmt_rate(sr)), sub: format!("No lossy fingerprints. The top end rolls off gently from about {k_hz}{}, as many masters do.", match cut.reach { Some(r) if r > cut.fc + 500.0 => format!(", with quieter content up to {}", fmt_khz(r)), _ => String::new() }) } }
    else { Head { grade: Severity::Ok, label: "Lossless".into(), headline: format!("Genuine {} lossless", fmt_rate(sr)), sub: "Full bandwidth with no lossy fingerprints: what you’d expect from a proper CD rip or a lossless download.".into() } }
  });
  let expected = match info.lossless { Some(true) => Some(Expected { hz: sr / 2.0, why: "Nyquist limit".into() }), Some(false) => expected_cutoff(info), None => None };
  Verdict { grade: h.grade, label: h.label, headline: h.headline, sub: h.sub, findings: f, cut, depth, bw_tone, origin: origin.filter(|o| !o.is_empty()).unwrap_or_else(|| "—".into()), expected }
}
