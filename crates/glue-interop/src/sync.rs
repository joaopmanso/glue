//! A song kept in step with the main DJ library (ADR 0170): GLUE's cues, loops and grid (`Track.prep`) against the
//! library's (Engine DJ's slots), by three-way merge with what they last agreed on. Pure: GLUE Home's `djsync.rs`
//! reads both sides, and writes what this says to.
//! - A hot cue pad (A–H, a cue or a loop on it) is the library's hot cue slot (a loop as its start: Engine DJ has no
//!   hot loops); GLUE's memory loops are its saved loops, each keeping its slot; memory cues and the main cue stay
//!   each side's own (the other has no place for them).
//! - Per slot and for the grid: the same on both sides, in step; changed on one side since they agreed, that side's
//!   goes to the other; changed on both, a clash, left as it is on each side for the user to settle. Nothing agreed yet
//!   (the first time, or GLUE Home's cache lost): only what's on one side is taken, nothing is taken as removed.
//! - A song whose cues (or grid) aren't GLUE's own shows the library's: GLUE has no change of its own there.
use crate::perf::{Hot, Loop, SLOTS};
use crate::types::Grid;
use serde_json::{json, Map, Value};

/// GLUE's default hot cue colours, A–H (`HOT_COLORS`).
pub const HOT_COLORS: [&str; 8] = ["#28e214", "#fb1ab0", "#1566f6", "#ffe800", "#fb6b15", "#a51afa", "#0cc9f5", "#e91a2d"];
const MEMORY: &str = "#e91a2d";

/// One side, as the library holds it.
#[derive(Clone, Debug, PartialEq)]
pub struct Side { pub hot: Vec<Option<Hot>>, pub loops: Vec<Option<Loop>>, pub grid: Option<Grid> }
impl Default for Side { fn default() -> Self { Side { hot: vec![None; SLOTS], loops: vec![None; SLOTS], grid: None } } }

fn same_colour(a: &Option<String>, b: &Option<String>) -> bool {
  match (a, b) { (Some(x), Some(y)) => x.eq_ignore_ascii_case(y), _ => true }
}
fn same_hot(a: &Option<Hot>, b: &Option<Hot>) -> bool {
  match (a, b) { (None, None) => true, (Some(x), Some(y)) => (x.t - y.t).abs() < 0.001 && x.name == y.name && same_colour(&x.color, &y.color), _ => false }
}
fn same_place(x: &Loop, y: &Loop) -> bool { (x.a - y.a).abs() < 0.001 && (x.b - y.b).abs() < 0.001 }
fn same_loop(a: &Option<Loop>, b: &Option<Loop>) -> bool {
  match (a, b) { (None, None) => true, (Some(x), Some(y)) => same_place(x, y) && x.name == y.name && same_colour(&x.color, &y.color), _ => false }
}
pub fn same_grid(a: &Option<Grid>, b: &Option<Grid>) -> bool {
  match (a, b) { (None, None) => true, (Some(x), Some(y)) => (x.bpm - y.bpm).abs() < 0.001 && (x.beat0 - y.beat0).abs() < 0.0005 && x.bar == y.bar, _ => false }
}

/// What a song should become: the library's side, GLUE's side, what they now agree on, and the clashes ("hot 2",
/// "loop 0", "grid").
#[derive(Clone, Debug, PartialEq)]
pub struct Merged { pub app: Side, pub glue: Side, pub base: Side, pub clashes: Vec<String> }

/// One element: (the library's, GLUE's, agreed, clash).
fn one<T: Clone>(g: &T, l: &T, b: &T, same: impl Fn(&T, &T) -> bool) -> (T, T, T, bool) {
  if same(g, l) { (l.clone(), g.clone(), l.clone(), false) }
  else if same(g, b) { (l.clone(), l.clone(), l.clone(), false) }        // the library changed it
  else if same(l, b) { (g.clone(), g.clone(), g.clone(), false) }        // GLUE changed it
  else { (l.clone(), g.clone(), b.clone(), true) }                       // both: a clash
}
/// The three-way merge. `base`: what they last agreed on (None: never; each slot taken as empty).
pub fn merge(glue: &Side, app: &Side, base: Option<&Side>) -> Merged {
  let empty = Side::default();
  let b = base.unwrap_or(&empty);
  let mut m = Merged { app: Side::default(), glue: Side::default(), base: Side::default(), clashes: vec![] };
  for i in 0..SLOTS {
    let (l, g, a, c) = one(&glue.hot[i], &app.hot[i], &b.hot[i], same_hot);
    m.app.hot[i] = l; m.glue.hot[i] = g; m.base.hot[i] = a;
    if c { m.clashes.push(format!("hot {i}")); }
    let (l, g, a, c) = one(&glue.loops[i], &app.loops[i], &b.loops[i], same_loop);
    m.app.loops[i] = l; m.glue.loops[i] = g; m.base.loops[i] = a;
    if c { m.clashes.push(format!("loop {i}")); }
  }
  let (l, g, a, c) = one(&glue.grid, &app.grid, &b.grid, same_grid);
  m.app.grid = l; m.glue.grid = g; m.base.grid = a;
  if c { m.clashes.push("grid".into()); }
  m
}

fn num(v: &Value, k: &str) -> Option<f64> { v.get(k).and_then(Value::as_f64) }
fn text(v: &Value, k: &str) -> String { v.get(k).and_then(Value::as_str).unwrap_or("").to_string() }
fn colour(v: &Value) -> Option<String> { v.get("color").and_then(Value::as_str).map(String::from) }

/// GLUE's side of a song from its `prep`, given the library's (where GLUE has nothing of its own, it shows the
/// library's) and what they last agreed on (its memory loops keep the slots they had). Also which memory loop went
/// in which slot (its place in `prep.cues`).
pub fn glue_side(prep: Option<&Value>, app: &Side, base: Option<&Side>) -> (Side, Vec<Option<usize>>) {
  let mut s = Side { grid: app.grid, ..app.clone() };
  let mut placed = vec![None; SLOTS];
  // The grid: GLUE's own when it has a whole one (a BPM and its first beat).
  if let Some(p) = prep { if let (Some(bpm), Some(beat0)) = (num(p, "bpm"), num(p, "beat0")) { s.grid = Some(Grid { bpm, beat0, bar: num(p, "bar").unwrap_or(0.0) }); } }
  let Some(cues) = prep.and_then(|p| p.get("cues")).and_then(Value::as_array) else { return (s, placed) };
  s.hot = vec![None; SLOTS];
  s.loops = vec![None; SLOTS];
  let mut loops: Vec<(usize, Loop)> = vec![];
  for (k, c) in cues.iter().enumerate() {
    let (t, end) = (num(c, "t").unwrap_or(0.0), num(c, "end"));
    match num(c, "num") {
      Some(n) if (0.0..SLOTS as f64).contains(&n) && n.fract() == 0.0 => s.hot[n as usize] = Some(Hot { t, name: text(c, "name"), color: colour(c) }),
      None if end.is_some() => loops.push((k, Loop { a: t, b: end.unwrap(), name: text(c, "name"), color: colour(c) })),
      _ => {}
    }
  }
  // Slots: where it was agreed, else where the library has it, else the first free one, in time order.
  loops.sort_by(|x, y| x.1.a.partial_cmp(&y.1.a).unwrap_or(std::cmp::Ordering::Equal));
  let mut rest = vec![];
  for (k, l) in loops {
    let at = (0..SLOTS).find(|&i| s.loops[i].is_none() && base.and_then(|b| b.loops[i].as_ref()).is_some_and(|x| same_place(x, &l)))
      .or_else(|| (0..SLOTS).find(|&i| s.loops[i].is_none() && app.loops[i].as_ref().is_some_and(|x| same_place(x, &l))));
    match at { Some(i) => { s.loops[i] = Some(l); placed[i] = Some(k); } None => rest.push((k, l)) }
  }
  for (k, l) in rest {
    let free = (0..SLOTS).find(|&i| s.loops[i].is_none() && app.loops[i].is_none() && base.is_none_or(|b| b.loops[i].is_none()))
      .or_else(|| (0..SLOTS).find(|&i| s.loops[i].is_none()));
    if let Some(i) = free { s.loops[i] = Some(l); placed[i] = Some(k); }   // (more than 8: the rest stay GLUE's own)
  }
  (s, placed)
}

/// `prep` with the merge's GLUE side where it differs from what GLUE had: pads and memory loops replaced slot by slot,
/// the grid taken whole (rounded as Prepare saves it). None: nothing changes.
pub fn glue_prep(prep: Option<&Value>, had: &Side, placed: &[Option<usize>], now: &Side) -> Option<Value> {
  let mut p = prep.and_then(Value::as_object).cloned().unwrap_or_default();
  let mut changed = false;
  if !crate::sync::same_grid(&had.grid, &now.grid) {
    if let Some(g) = now.grid {
      p.insert("bpm".into(), json!((g.bpm * 1000.0).round() / 1000.0));
      p.insert("beat0".into(), json!((g.beat0 * 100000.0).round() / 100000.0));
      p.insert("bar".into(), json!(g.bar));
      changed = true;
    }
  }
  if let Some(cues) = prep.and_then(|p| p.get("cues")).and_then(Value::as_array) {
    let mut drop: Vec<usize> = vec![];
    let mut add: Vec<Value> = vec![];
    for i in 0..SLOTS {
      if !same_hot(&had.hot[i], &now.hot[i]) || had.hot[i].is_some() != now.hot[i].is_some() {
        drop.extend(cues.iter().enumerate().filter(|(_, c)| num(c, "num") == Some(i as f64)).map(|(k, _)| k));
        if let Some(h) = &now.hot[i] { add.push(json!({ "t": h.t, "kind": "cue", "num": i, "name": h.name, "color": h.color.clone().unwrap_or_else(|| HOT_COLORS[i].into()), "end": null })); }
      }
      if !same_loop(&had.loops[i], &now.loops[i]) || had.loops[i].is_some() != now.loops[i].is_some() {
        if let Some(k) = placed[i] { drop.push(k); }
        if let Some(l) = &now.loops[i] { add.push(json!({ "t": l.a, "kind": "loop", "num": null, "name": l.name, "color": l.color.clone().unwrap_or_else(|| MEMORY.into()), "end": l.b })); }
      }
    }
    if !drop.is_empty() || !add.is_empty() {
      let mut next: Vec<Value> = cues.iter().enumerate().filter(|(k, _)| !drop.contains(k)).map(|(_, c)| c.clone()).chain(add).collect();
      next.sort_by(|a, b| {
        let (ta, tb) = (num(a, "t").unwrap_or(0.0), num(b, "t").unwrap_or(0.0));
        ta.partial_cmp(&tb).unwrap_or(std::cmp::Ordering::Equal).then((num(a, "num").unwrap_or(-1.0)).partial_cmp(&num(b, "num").unwrap_or(-1.0)).unwrap_or(std::cmp::Ordering::Equal))
      });
      if next.is_empty() { p.shift_remove("cues"); } else { p.insert("cues".into(), Value::Array(next)); }
      changed = true;
    }
  }
  changed.then_some(Value::Object(p))
}

// ---- what was agreed, kept in GLUE Home's cache --------------------------------------------------------------------
fn hot_json(h: &Option<Hot>) -> Value { h.as_ref().map_or(Value::Null, |h| json!({ "t": h.t, "name": h.name, "color": h.color })) }
fn loop_json(l: &Option<Loop>) -> Value { l.as_ref().map_or(Value::Null, |l| json!({ "a": l.a, "b": l.b, "name": l.name, "color": l.color })) }
impl Side {
  pub fn to_json(&self) -> Value {
    json!({ "hot": self.hot.iter().map(hot_json).collect::<Vec<_>>(), "loops": self.loops.iter().map(loop_json).collect::<Vec<_>>(), "grid": self.grid.map_or(Value::Null, |g| g.to_json()) })
  }
  pub fn from_json(v: &Value) -> Side {
    let arr = |k: &str| v.get(k).and_then(Value::as_array).cloned().unwrap_or_default();
    let mut s = Side::default();
    for (i, h) in arr("hot").iter().enumerate().take(SLOTS) { if h.is_object() { s.hot[i] = Some(Hot { t: num(h, "t").unwrap_or(0.0), name: text(h, "name"), color: colour(h) }); } }
    for (i, l) in arr("loops").iter().enumerate().take(SLOTS) { if l.is_object() { s.loops[i] = Some(Loop { a: num(l, "a").unwrap_or(0.0), b: num(l, "b").unwrap_or(0.0), name: text(l, "name"), color: colour(l) }); } }
    s.grid = v.get("grid").and_then(Grid::from_json);
    s
  }
}
/// A clash, as the page shows it: what ("hot 2", "loop 0", "grid") and each side's.
pub fn clash_json(what: &str, glue: &Side, app: &Side) -> Value {
  let pick = |s: &Side| -> Value {
    match what.split_once(' ') {
      Some(("hot", i)) => i.parse::<usize>().ok().map_or(Value::Null, |i| hot_json(&s.hot[i])),
      Some(("loop", i)) => i.parse::<usize>().ok().map_or(Value::Null, |i| loop_json(&s.loops[i])),
      _ => s.grid.map_or(Value::Null, |g| g.to_json()),
    }
  };
  let mut o = Map::new();
  o.insert("what".into(), json!(what)); o.insert("glue".into(), pick(glue)); o.insert("app".into(), pick(app));
  Value::Object(o)
}

#[cfg(test)]
mod tests {
  use super::*;
  fn hot(t: f64, name: &str) -> Option<Hot> { Some(Hot { t, name: name.into(), color: None }) }
  fn side(h: &[(usize, f64)]) -> Side { let mut s = Side::default(); for &(i, t) in h { s.hot[i] = hot(t, ""); } s }
  #[test]
  fn each_sides_change_goes_to_the_other_and_both_is_a_clash() {
    let base = side(&[(0, 1.0), (1, 2.0), (2, 3.0)]);
    // GLUE moved A and removed B; Engine DJ moved C and added D; both moved... nothing else.
    let glue = side(&[(0, 1.5), (2, 3.0)]);
    let app = side(&[(0, 1.0), (1, 2.0), (2, 3.5), (3, 4.0)]);
    let m = merge(&glue, &app, Some(&base));
    assert_eq!(m.app.hot, side(&[(0, 1.5), (2, 3.5), (3, 4.0)]).hot, "GLUE's move and removal written; Engine DJ's kept");
    assert_eq!(m.glue.hot, m.app.hot, "Engine DJ's move and addition taken into GLUE");
    assert_eq!(m.base.hot, m.app.hot);
    assert!(m.clashes.is_empty());
    // Both moved A: a clash, each side as it is, the agreed one kept.
    let m = merge(&side(&[(0, 9.0)]), &side(&[(0, 8.0)]), Some(&side(&[(0, 1.0)])));
    assert_eq!((m.clashes.clone(), m.app.hot[0].clone(), m.glue.hot[0].clone(), m.base.hot[0].clone()), (vec!["hot 0".to_string()], hot(8.0, ""), hot(9.0, ""), hot(1.0, "")));
  }
  #[test]
  fn nothing_agreed_yet_takes_what_each_side_has_and_removes_nothing() {
    let m = merge(&side(&[(0, 1.0)]), &side(&[(1, 2.0)]), None);
    assert_eq!(m.app.hot, side(&[(0, 1.0), (1, 2.0)]).hot);
    assert_eq!(m.glue.hot, m.app.hot);
    let m = merge(&side(&[(0, 1.0)]), &side(&[(0, 2.0)]), None);
    assert_eq!(m.clashes, ["hot 0"]);
  }
  #[test]
  fn glues_prep_read_and_written_slot_by_slot() {
    let app = Side { loops: { let mut l = vec![None; SLOTS]; l[3] = Some(Loop { a: 10.0, b: 12.0, name: "Old".into(), color: None }); l }, ..side(&[(0, 1.0)]) };
    let prep = json!({ "bpm": 124.0, "beat0": 0.1, "bar": 1, "cues": [
      { "t": 1.0, "kind": "cue", "num": 0, "name": "", "color": "#28e214", "end": null },
      { "t": 5.0, "kind": "cue", "num": null, "name": "Mem", "color": "#e91a2d", "end": null },
      { "t": 10.0, "kind": "loop", "num": null, "name": "Old", "color": "#e91a2d", "end": 12.0 },
      { "t": 20.0, "kind": "loop", "num": null, "name": "New", "color": "#e91a2d", "end": 24.0 },
      { "t": 30.0, "kind": "loop", "num": 2, "name": "", "color": "#1566f6", "end": 32.0 } ] });
    let (g, placed) = glue_side(Some(&prep), &app, None);
    assert_eq!(g.hot[0], Some(Hot { t: 1.0, name: "".into(), color: Some("#28e214".into()) }));
    assert_eq!(g.hot[2].as_ref().map(|h| h.t), Some(30.0), "a loop on a pad: a hot cue at its start");
    assert_eq!((g.loops[3].as_ref().map(|l| l.a), g.loops[0].as_ref().map(|l| l.a)), (Some(10.0), Some(20.0)), "the library's slot kept; the new one in the first free");
    assert_eq!((placed[3], placed[0]), (Some(2), Some(3)));
    assert_eq!(g.grid, Some(Grid { bpm: 124.0, beat0: 0.1, bar: 1.0 }));
    // Engine DJ moved hot cue A and removed the loop in slot 3: GLUE's pad A and its "Old" loop follow; the rest stays.
    let mut now = g.clone();
    now.hot[0] = hot(1.25, "Cue 1");
    now.loops[3] = None;
    let p = glue_prep(Some(&prep), &g, &placed, &now).unwrap();
    let cues = p["cues"].as_array().unwrap();
    assert_eq!(cues.iter().map(|c| (c["t"].as_f64().unwrap(), c["num"].as_f64())).collect::<Vec<_>>(), [(1.25, Some(0.0)), (5.0, None), (20.0, None), (30.0, Some(2.0))]);
    assert_eq!(glue_prep(Some(&prep), &g, &placed, &g), None, "nothing to change");
    // Without cues of its own, GLUE shows the library's: no change of GLUE's.
    let (g, _) = glue_side(Some(&json!({})), &app, None);
    assert_eq!((g.hot, g.loops), (app.hot.clone(), app.loops.clone()));
  }
}
