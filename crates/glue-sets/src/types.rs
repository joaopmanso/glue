//! A set (ADR 0199): `src/core/sets/types.ts`. Every song on one clock of mix beats: song j at mix beat b is at
//! `in + (b − start) · 60 / bpm` seconds into its file.
use serde::{Deserialize, Serialize};

/// The mix's sample rate: every song is resampled to it.
pub const MIX_RATE: f64 = 44100.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum FxStyle { #[default] Blend, BassSwap, Filter, Echo, Cut, Double, Layer }

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum BassChoice { #[default] Auto, Out, In, Both }

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Fx {
  pub style: FxStyle,
  #[serde(default, skip_serializing_if = "Option::is_none")] pub drop: Option<f64>,
  #[serde(default, skip_serializing_if = "Option::is_none")] pub bass: Option<BassChoice>,
  #[serde(default, skip_serializing_if = "Option::is_none")] pub swap: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetItem {
  pub id: String,
  pub deck: u32,
  pub bpm: f64,
  pub beat0: f64,
  #[serde(rename = "in")] pub in_: f64,
  pub start: f64,
  pub beats: f64,
  pub key_lock: bool,
  #[serde(default, skip_serializing_if = "Option::is_none")] pub trim: Option<f64>,
  #[serde(default, skip_serializing_if = "Option::is_none")] pub fx: Option<Fx>,
  #[serde(default, skip_serializing_if = "Option::is_none")] pub guessed: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Tempo {
  /// "songs" or "fixed".
  pub mode: String,
  #[serde(default, skip_serializing_if = "Option::is_none")] pub bpm: Option<f64>,
}

/// What the mixer needs of a plan (its other fields are the page's).
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct SetPlan {
  pub tempo: Tempo,
  pub items: Vec<SetItem>,
}
