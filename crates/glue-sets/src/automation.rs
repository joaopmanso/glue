//! What each deck's controls do over a hand-over (ADR 0199, 0203, 0205): `src/core/sets/automation.ts`.
use crate::types::{BassChoice, FxStyle, SetItem};
use glue_audio::js;
use std::f64::consts::PI;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ctl { pub gain: f64, pub low: f64, pub mid: f64, pub high: f64, pub filter: f64, pub echo: f64 }
pub const FLAT: Ctl = Ctl { gain: 1.0, low: 1.0, mid: 1.0, high: 1.0, filter: 0.0, echo: 0.0 };
pub const SILENT: Ctl = Ctl { gain: 0.0, ..FLAT };

#[inline] fn clamp(x: f64) -> f64 { js::max(0.0, js::min(1.0, x)) }
#[inline] fn up(u: f64) -> f64 { js::sin(clamp(u) * PI / 2.0) }
#[inline] fn down(u: f64) -> f64 { js::cos(clamp(u) * PI / 2.0) }

#[derive(Clone, Copy, PartialEq)]
pub enum Side { Out, In }

/// The outgoing or incoming song's controls at beat `b` of a hand-over [s, e) (`handOver`).
#[allow(clippy::too_many_arguments)]
pub fn hand_over(style: FxStyle, side: Side, b: f64, s: f64, e: f64, drop: Option<f64>, bass: BassChoice, swap: Option<f64>) -> Ctl {
  let mut c = styled(style, side, b, s, e, drop, swap);
  match bass {
    BassChoice::Both => c.low = 1.0,
    BassChoice::Out => c.low = if side == Side::Out { 1.0 } else { 0.0 },
    BassChoice::In => c.low = if side == Side::In { 1.0 } else { 0.0 },
    BassChoice::Auto => if let Some(sw) = swap { c.low = if (b < s + sw) == (side == Side::Out) { 1.0 } else { 0.0 }; },
  }
  c
}

#[allow(clippy::too_many_arguments)]
fn styled(style: FxStyle, side: Side, b: f64, s: f64, e: f64, drop: Option<f64>, swap: Option<f64>) -> Ctl {
  let len = e - s;
  let u = if len > 0.0 { (b - s) / len } else { 1.0 };
  let mut c = FLAT;
  // Where a bass swap turns: the swap point when it's set, else the bar line nearest half way.
  let mid = match swap { Some(sw) => s + js::max(0.0, js::min(len, sw)), None => s + js::round(len / 8.0) * 4.0 };
  let out = side == Side::Out;
  match style {
    FxStyle::Cut => { c.gain = if out { if b < e { 1.0 } else { 0.0 } } else if b < e { 0.0 } else { 1.0 }; }
    FxStyle::Blend => { c.gain = if out { down(u) } else { up(u) }; }
    FxStyle::BassSwap => {
      if !out { c.gain = up((b - s) / js::max(1.0, mid - s)); c.low = if b < mid { 0.0 } else { 1.0 }; }
      else { c.low = if b < mid { 1.0 } else { 0.0 }; c.gain = if b < mid { 1.0 } else { down((b - mid) / js::max(1.0, e - mid)) }; }
    }
    FxStyle::Filter => {
      if out { c.filter = 0.85 * clamp(u); c.gain = if u < 0.75 { 1.0 } else { down((u - 0.75) / 0.25) }; }
      else { c.filter = -0.85 * (1.0 - clamp(u / 0.5)); c.gain = up(u / 0.25); }
    }
    FxStyle::Echo => {
      if !out { c.gain = up(u / 0.25); }
      else { c.echo = clamp((b - (e - 4.0)) / 4.0); c.gain = if b < e - 1.0 { 1.0 } else { clamp(e - b) }; }
    }
    FxStyle::Layer => {
      let sw = if swap.is_some() || len < 128.0 { mid } else { e - 64.0 };
      if !out { c.gain = up((b - s) / 32.0); c.low = if b < sw { 0.0 } else { 1.0 }; }
      else { c.low = if b < sw { 1.0 } else { 0.0 }; c.gain = if b < sw { 1.0 } else { down((b - sw) / js::max(1.0, e - sw)) }; }
    }
    FxStyle::Double => {
      let d = s + drop.unwrap_or_else(|| js::min(len, 16.0));
      if !out { c.gain = up((b - s) / js::max(1.0, js::min(16.0, d - s))); c.low = if b < d { 0.0 } else { 1.0 }; }
      else { c.low = if b < d { 1.0 } else { 0.0 }; c.gain = if b < e - 8.0 { 1.0 } else { down((b - (e - 8.0)) / 8.0) }; }
    }
  }
  c
}

fn fx_of(it: &SetItem) -> (FxStyle, Option<f64>, BassChoice, Option<f64>) {
  match &it.fx { Some(f) => (f.style, f.drop, f.bass.unwrap_or_default(), f.swap), None => (FxStyle::Blend, None, BassChoice::Auto, None) }
}

/// Song `i`'s controls at mix beat `b` (`controlsAt`), then its bass as cut or opened by hand there.
pub fn controls_at(items: &[SetItem], i: usize, b: f64) -> Ctl {
  let it = &items[i];
  let end = it.start + it.beats;
  if b < it.start || b >= end { return SILENT; }
  let mut c = FLAT;
  let mut flat = true;
  if i > 0 {
    let prev = &items[i - 1];
    if b < prev.start + prev.beats {
      let (st, dr, bs, sw) = fx_of(prev);
      c = hand_over(st, Side::In, b, it.start, prev.start + prev.beats, dr, bs, sw);
      flat = false;
    }
  }
  if let Some(next) = items.get(i + 1) {
    if b >= next.start {
      let (st, dr, bs, sw) = fx_of(it);
      let k = hand_over(st, Side::Out, b, next.start, end, dr, bs, sw);
      c = if flat { k } else {
        Ctl { gain: c.gain * k.gain, low: js::min(c.low, k.low), mid: js::min(c.mid, k.mid), high: js::min(c.high, k.high),
          filter: if k.filter.abs() > c.filter.abs() { k.filter } else { c.filter }, echo: js::max(c.echo, k.echo) }
      };
    }
  }
  if let Some(r) = it.lows.as_ref().and_then(|l| l.iter().find(|r| b >= it.start + r.from && b < it.start + r.to)) {
    c.low = if r.on { 1.0 } else { 0.0 };
  }
  c
}
