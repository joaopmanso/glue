//! The set's mixer (ADR 0199, 0201): `src/core/sets/mixer.ts`, line for line. Fixed hops counted from the set's start
//! (blocks of any size give the same samples); each song read where its beats are (varispeed, or WSOLA with key lock),
//! trimmed, through the isolator, filter and echo of its hand-overs, the decks summed with equal-power headroom into a
//! limiter.
use crate::automation::{controls_at, Ctl};
use crate::dsp::{cubic_at, Echo, Isolator, Limiter, OneKnob, Wsola, LOOK, WSOLA_H};
use crate::tempo::{tempo_of, TempoMap};
use crate::types::{FxStyle, SetItem, SetPlan, MIX_RATE};
use glue_audio::js;
use std::collections::HashMap;

/// A song's audio at the mix rate.
pub struct Pcm { pub l: Vec<f32>, pub r: Vec<f32> }
/// The songs' audio, when it's there (None: not yet, or not decodable: silence).
pub trait Sources { fn get(&self, id: &str) -> Option<&Pcm>; }

const H: usize = WSOLA_H;
const TAIL: f64 = 3.0;

struct Deck { ws: Wsola, iso_l: Isolator, iso_r: Isolator, f_l: OneKnob, f_r: OneKnob, e_l: Echo, e_r: Echo }
fn deck(sr: f64) -> Deck { Deck { ws: Wsola::new(), iso_l: Isolator::new(sr), iso_r: Isolator::new(sr), f_l: OneKnob::default(), f_r: OneKnob::default(), e_l: Echo::new(sr), e_r: Echo::new(sr) } }

pub struct Mixer {
  pub sr: f64,
  pub items: Vec<SetItem>,
  pub tempo: TempoMap,
  /// The set's length in frames.
  pub length: usize,
  t0: Vec<f64>, t1: Vec<f64>, tail: Vec<f64>,
  decks: HashMap<usize, Deck>,
  lim: Limiter,
  hop: usize,
  buf_l: Vec<f32>, buf_r: Vec<f32>, pos: usize,
  skip: usize,
  dry_l: Vec<f32>, dry_r: Vec<f32>,
  mix_l: Vec<f32>, mix_r: Vec<f32>,
}

impl Mixer {
  pub fn new(plan: &SetPlan) -> Self {
    let sr = MIX_RATE;
    let items = plan.items.clone();
    let tempo = tempo_of(plan);
    let t0: Vec<f64> = items.iter().map(|it| tempo.time(it.start)).collect();
    let t1: Vec<f64> = items.iter().map(|it| tempo.time(it.start + it.beats)).collect();
    let tail: Vec<f64> = items.iter().map(|it| if it.fx.as_ref().map(|f| f.style) == Some(FxStyle::Echo) { TAIL } else { 0.0 }).collect();
    let mut end = 0.0f64;
    for (i, t) in t1.iter().enumerate() { end = js::max(end, t + tail[i]); }
    let length = (end * sr).ceil() as usize;
    let mut m = Mixer { sr, items, tempo, length, t0, t1, tail, decks: HashMap::new(), lim: Limiter::new(sr), hop: 0,
      buf_l: vec![0.0; H], buf_r: vec![0.0; H], pos: H, skip: 0, dry_l: vec![0.0; H], dry_r: vec![0.0; H], mix_l: vec![0.0; H], mix_r: vec![0.0; H] };
    m.seek(0);
    m
  }

  /// The songs sounding between two frames (and a second either side): the ones to have decoded.
  pub fn needed(&self, f0: usize, f1: usize) -> Vec<String> {
    let a = f0 as f64 / self.sr - 1.0;
    let b = f1 as f64 / self.sr + 1.0;
    self.items.iter().enumerate().filter(|(i, _)| self.t0[*i] < b && self.t1[*i] + self.tail[*i] > a).map(|(_, it)| it.id.clone()).collect()
  }

  /// Start again at a frame.
  pub fn seek(&mut self, frame: usize) {
    let f = frame;
    self.hop = f / H;
    self.decks.clear();
    self.lim = Limiter::new(self.sr);
    self.pos = H;
    // The limiter delays by LOOK: drop that, and the hop's frames before `f`.
    self.skip = f - self.hop * H + LOOK;
  }

  /// Up to `n` frames into l and r from `off`; how many (fewer at the end).
  pub fn render(&mut self, src: &dyn Sources, l: &mut [f32], r: &mut [f32], n: usize, off: usize) -> usize {
    let mut done = 0;
    while done < n {
      if self.pos >= H { self.next(src); self.pos = 0; }
      if self.skip > 0 { let k = self.skip.min(H - self.pos); self.skip -= k; self.pos += k; continue; }
      let out_frame = (self.hop * H + self.pos) as i64 - H as i64 - LOOK as i64;
      if out_frame >= self.length as i64 { break; }
      let k = (n - done).min(H - self.pos).min((self.length as i64 - out_frame) as usize);
      l[off + done..off + done + k].copy_from_slice(&self.buf_l[self.pos..self.pos + k]);
      r[off + done..off + done + k].copy_from_slice(&self.buf_r[self.pos..self.pos + k]);
      self.pos += k; done += k;
    }
    done
  }

  /// One hop of the mix into the buffer.
  fn next(&mut self, src: &dyn Sources) {
    let sr = self.sr;
    let f0 = self.hop * H;
    let ta = f0 as f64 / sr;
    let tb = (f0 + H) as f64 / sr;
    let b0 = self.tempo.beat(ta);
    let b1 = self.tempo.beat(tb);
    self.mix_l.fill(0.0); self.mix_r.fill(0.0);
    let mut on: Vec<(usize, Ctl, Ctl)> = Vec::new();
    let (mut p0, mut p1) = (0.0f64, 0.0f64);
    for i in 0..self.items.len() {
      if !(self.t0[i] < tb + 0.05 && self.t1[i] + self.tail[i] > ta) { self.decks.remove(&i); continue; }
      self.decks.entry(i).or_insert_with(|| deck(sr));
      let c0 = controls_at(&self.items, i, b0);
      let c1 = controls_at(&self.items, i, b1);
      p0 += c0.gain * c0.gain; p1 += c1.gain * c1.gain;
      on.push((i, c0, c1));
    }
    let n0 = 1.0 / js::sqrt(js::max(1.0, p0));
    let n1 = 1.0 / js::sqrt(js::max(1.0, p1));
    for (i, c0, c1) in on {
      let it = self.items[i].clone();
      let mut d = self.decks.remove(&i).expect("deck");
      self.dry(src, &it, &mut d, b0, b1);
      let trim = js::pow(10.0, it.trim.unwrap_or(0.0) / 20.0);
      let delay = 0.75 * 60.0 / self.tempo.bpm_at(b0) * sr;
      let g0 = c0.gain * n0;
      let g1 = c1.gain * n1;
      d.f_l.set(c0.filter, sr); d.f_r.set(c0.filter, sr);
      for j in 0..H {
        let u = j as f64 / H as f64;
        let g = g0 + (g1 - g0) * u;
        let lo = c0.low + (c1.low - c0.low) * u;
        let mi = c0.mid + (c1.mid - c0.mid) * u;
        let hi = c0.high + (c1.high - c0.high) * u;
        let ec = c0.echo + (c1.echo - c0.echo) * u;
        let xl = d.f_l.run(d.iso_l.run(self.dry_l[j] as f64 * trim, lo, mi, hi));
        let xr = d.f_r.run(d.iso_r.run(self.dry_r[j] as f64 * trim, lo, mi, hi));
        let el = d.e_l.run(xl * g, ec, delay);
        self.mix_l[j] = (self.mix_l[j] as f64 + (xl * g + el)) as f32;
        let er = d.e_r.run(xr * g, ec, delay);
        self.mix_r[j] = (self.mix_r[j] as f64 + (xr * g + er)) as f32;
      }
      self.decks.insert(i, d);
    }
    self.lim.run(&mut self.mix_l, &mut self.mix_r, 0, H);
    self.buf_l.copy_from_slice(&self.mix_l); self.buf_r.copy_from_slice(&self.mix_r);
    self.hop += 1;
  }

  /// The song's own sound over the hop: read where its beats are (silent outside its span).
  fn dry(&mut self, src: &dyn Sources, it: &SetItem, d: &mut Deck, b0: f64, b1: f64) {
    let sr = self.sr;
    let end = it.start + it.beats;
    self.dry_l.fill(0.0); self.dry_r.fill(0.0);
    let pcm = match src.get(&it.id) { Some(p) if !(b1 <= it.start || b0 >= end) => p, _ => { d.ws.reset(); return; } };
    let p = |b: f64| (it.in_ + (b - it.start) * 60.0 / it.bpm) * sr;
    let (pa, pb) = (p(b0), p(b1));
    if it.key_lock { d.ws.hop(&pcm.l, &pcm.r, pa, &mut self.dry_l, &mut self.dry_r, 0); }
    else {
      for j in 0..H {
        let q = pa + (pb - pa) * j as f64 / H as f64;
        self.dry_l[j] = cubic_at(&pcm.l, q) as f32; self.dry_r[j] = cubic_at(&pcm.r, q) as f32;
      }
    }
    // Nothing before its start or after its end (within the hop).
    for j in 0..H {
      let b = b0 + (b1 - b0) * j as f64 / H as f64;
      if b < it.start || b >= end { self.dry_l[j] = 0.0; self.dry_r[j] = 0.0; }
    }
  }
}
