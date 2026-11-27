//! How fast the mixer renders: two key-locked songs blended over three minutes (`cargo run --release --example bench`).
use glue_sets::{Mixer, Pcm, SetPlan, Sources, MIX_RATE};
use std::collections::HashMap;

struct Songs(HashMap<String, Pcm>);
impl Sources for Songs { fn get(&self, id: &str) -> Option<&Pcm> { self.0.get(id) } }

fn tone(f: f64, secs: f64) -> Pcm {
  let n = (secs * MIX_RATE) as usize;
  let v: Vec<f32> = (0..n).map(|i| (0.3 * (i as f64 * f * std::f64::consts::TAU / MIX_RATE).sin()) as f32).collect();
  Pcm { l: v.clone(), r: v }
}

fn main() {
  let plan: SetPlan = serde_json::from_str(r#"{"tempo":{"mode":"songs"},"items":[
    {"id":"a","deck":0,"bpm":124,"beat0":0,"in":0,"start":0,"beats":256,"keyLock":true,"fx":{"style":"bassSwap"}},
    {"id":"b","deck":1,"bpm":127,"beat0":0,"in":0,"start":192,"beats":256,"keyLock":true}]}"#).unwrap();
  let songs = Songs([("a".to_string(), tone(110.0, 200.0)), ("b".to_string(), tone(147.0, 200.0))].into_iter().collect());
  let mut m = Mixer::new(&plan);
  let (mut l, mut r) = (vec![0f32; 4096], vec![0f32; 4096]);
  let t = std::time::Instant::now();
  let mut f = 0;
  loop { let n = m.render(&songs, &mut l, &mut r, 4096, 0); if n == 0 { break; } f += n; }
  let (secs, took) = (f as f64 / MIX_RATE, t.elapsed().as_secs_f64());
  println!("{secs:.0} s of mix in {took:.2} s: {:.0}x real time", secs / took);
}
