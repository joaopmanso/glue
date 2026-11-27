//! The set's tempo map (ADR 0199): `src/core/sets/tempo.ts`. BPM as a function of the mix beat, linear between knots,
//! and the seconds of each mix beat (and back), in closed form.
use crate::types::SetPlan;
use glue_audio::js;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Knot { pub beat: f64, pub bpm: f64 }

/// The knots of a plan (`knotsOf`).
pub fn knots_of(plan: &SetPlan) -> Vec<Knot> {
  let it = &plan.items;
  if it.is_empty() { return vec![Knot { beat: 0.0, bpm: plan.tempo.bpm.filter(|b| *b != 0.0).unwrap_or(120.0) }]; }
  if plan.tempo.mode == "fixed" { return vec![Knot { beat: 0.0, bpm: plan.tempo.bpm.filter(|b| *b != 0.0).unwrap_or(it[0].bpm) }]; }
  let mut k = vec![Knot { beat: it[0].start, bpm: it[0].bpm }];
  for i in 0..it.len() - 1 {
    let (a, b) = (&it[i], &it[i + 1]);
    let s = b.start;
    let e = js::max(s, a.start + a.beats);
    if e > s { k.push(Knot { beat: s, bpm: a.bpm }); k.push(Knot { beat: e, bpm: a.bpm }); }
    else { k.push(Knot { beat: s, bpm: a.bpm }); k.push(Knot { beat: s, bpm: b.bpm }); }
  }
  let last = &it[it.len() - 1];
  k.push(Knot { beat: last.start + last.beats, bpm: last.bpm });
  // In order of beats, stably (as JavaScript's sort); the same knot twice once.
  k.sort_by(|p, q| (p.beat - q.beat).partial_cmp(&0.0).unwrap_or(std::cmp::Ordering::Equal));
  let mut out: Vec<Knot> = Vec::new();
  for x in k {
    if let Some(y) = out.last() {
      if (x.beat - y.beat).abs() < 1e-9 && (x.bpm - y.bpm).abs() < 1e-9 { continue; }
      if x.beat < y.beat { continue; }
    }
    out.push(x);
  }
  out
}

/// A tempo map: BPM at a beat, the time of a beat, the beat at a time.
pub struct TempoMap { k: Vec<Knot>, t: Vec<f64> }

impl TempoMap {
  pub fn new(knots: Vec<Knot>) -> Self {
    let k = if knots.is_empty() { vec![Knot { beat: 0.0, bpm: 120.0 }] } else { knots };
    let mut t = vec![60.0 * k[0].beat / k[0].bpm];
    for i in 1..k.len() { let v = t[i - 1] + span(k[i - 1].bpm, k[i].bpm, k[i].beat - k[i - 1].beat); t.push(v); }
    TempoMap { k, t }
  }
  fn idx(&self, beat: f64) -> usize { let mut i = 0; while i + 1 < self.k.len() && self.k[i + 1].beat <= beat { i += 1; } i }
  pub fn bpm_at(&self, beat: f64) -> f64 {
    let k = &self.k;
    let i = self.idx(beat);
    if i + 1 >= k.len() || beat < k[0].beat { return if beat < k[0].beat { k[0].bpm } else { k[k.len() - 1].bpm }; }
    let (a, b) = (k[i], k[i + 1]);
    a.bpm + (b.bpm - a.bpm) * (beat - a.beat) / (b.beat - a.beat)
  }
  /// The time (s) of a mix beat.
  pub fn time(&self, beat: f64) -> f64 {
    let k = &self.k;
    if beat < k[0].beat { return self.t[0] - 60.0 * (k[0].beat - beat) / k[0].bpm; }
    let i = self.idx(beat);
    self.t[i] + span(k[i].bpm, self.bpm_at(beat), beat - k[i].beat)
  }
  /// The mix beat at a time (s).
  pub fn beat(&self, time: f64) -> f64 {
    let (k, t) = (&self.k, &self.t);
    if time < t[0] { return k[0].beat - (t[0] - time) * k[0].bpm / 60.0; }
    let mut i = 0;
    while i + 1 < k.len() && t[i + 1] <= time { i += 1; }
    let a = k[i];
    let dt = time - t[i];
    if i + 1 >= k.len() { return a.beat + dt * a.bpm / 60.0; }
    let b = k[i + 1];
    let kk = (b.bpm - a.bpm) / (b.beat - a.beat);
    if kk.abs() < 1e-12 { return a.beat + dt * a.bpm / 60.0; }
    a.beat + a.bpm * (js::exp(kk * dt / 60.0) - 1.0) / kk
  }
}

/// Seconds to go `db` beats while the tempo goes linearly (in beats) from b0 to b1.
fn span(b0: f64, b1: f64, db: f64) -> f64 {
  if db == 0.0 { return 0.0; }
  let k = (b1 - b0) / db;
  if k.abs() < 1e-12 { 60.0 * db / b0 } else { 60.0 / k * js::log(b1 / b0) }
}

/// A plan's tempo map (`tempoOf`).
pub fn tempo_of(plan: &SetPlan) -> TempoMap { TempoMap::new(knots_of(plan)) }
