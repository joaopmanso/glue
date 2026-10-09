//! A song's info kept in step both ways with the main Engine DJ library (ADR 0179), with its cues (`djsync.rs`): its
//! title, artist, album, genre, comment, label, year and rating.
//! - Each side is compared with what it was when they last agreed, kept per record in GLUE Home's cache (`info`: each
//!   side's own, since they needn't be the same: a song read from its file and Engine DJ's record of it can differ from
//!   the start, and that alone changes neither).
//! - A field changed on one side goes to the other; changed on both, GLUE's goes.
//! - Into GLUE: GLUE Home's own edit, the field marked edited (ADR 0071) so a new read of the file doesn't put the old one
//!   back. The rating is Engine DJ's 0–100, GLUE's 0.5–5 stars (20 a star).
use crate::text;
use serde_json::{json, Map, Value};

pub const FIELDS: [&str; 8] = ["title", "artist", "album", "genre", "comment", "label", "year", "rating"];

/// GLUE's song as Engine DJ would keep it: each field as text, the year its first four digits, the rating 0–100.
pub fn glue_info(t: &Value) -> Map<String, Value> {
  let mut m = Map::new();
  for f in FIELDS {
    let v = match f {
      "rating" => t.get("rating").and_then(Value::as_f64).filter(|r| *r > 0.0).map_or(0, |r| (r * 20.0).round() as i64).to_string(),
      "year" => { let y = text(t, "year"); let d: String = y.trim().chars().take(4).collect(); if d.len() == 4 && d.chars().all(|c| c.is_ascii_digit()) { d } else { String::new() } }
      _ => text(t, f).trim().to_string(),
    };
    m.insert(f.into(), json!(v));
  }
  m
}
/// Engine DJ's record (its `Track` row's columns, as read) as text.
pub fn app_info(row: &[(&str, Option<String>)]) -> Map<String, Value> {
  let mut m = Map::new();
  for (f, v) in row {
    let v = v.clone().unwrap_or_default();
    let v = match *f { "rating" => v.trim().parse::<f64>().map_or(0, |r| r.round() as i64).to_string(), "year" => v.trim().parse::<i64>().ok().filter(|y| *y > 0).map_or(String::new(), |y| y.to_string()), _ => v.trim().to_string() };
    m.insert((*f).into(), json!(v));
  }
  m
}

/// What a merge gives: the fields to write into Engine DJ, the ones to take into GLUE, and what they agree on now.
pub struct InfoMerge { pub to_app: Map<String, Value>, pub to_glue: Map<String, Value>, pub base: Value }
/// GLUE's and Engine DJ's info against what they were (`base`: `{ g, a }`; none: they agree as they are, nothing moves).
pub fn merge_info(g: &Map<String, Value>, a: &Map<String, Value>, base: Option<&Value>) -> InfoMerge {
  let (mut to_app, mut to_glue) = (Map::new(), Map::new());
  let (mut g2, mut a2) = (g.clone(), a.clone());
  if let Some(b) = base.filter(|b| b["g"].is_object() && b["a"].is_object()) {
    for f in FIELDS {
      let (gv, av) = (&g[f], &a[f]);
      if gv == av { continue; }
      let (gch, ach) = (b["g"].get(f) != Some(gv), b["a"].get(f) != Some(av));
      if gch { to_app.insert(f.into(), gv.clone()); a2.insert(f.into(), gv.clone()); }
      else if ach { to_glue.insert(f.into(), av.clone()); g2.insert(f.into(), av.clone()); }
    }
  }
  InfoMerge { to_app, to_glue, base: json!({ "g": g2, "a": a2 }) }
}

/// The fields taken into GLUE's song (`t`), marked edited (the rating isn't song info: it's the user's own).
pub fn into_glue(t: &mut Value, fields: &Map<String, Value>) {
  let mut edited: Vec<Value> = t.get("edited").and_then(Value::as_array).cloned().unwrap_or_default();
  for (f, v) in fields {
    let s = v.as_str().unwrap_or("");
    if f == "rating" {
      let r = s.parse::<f64>().unwrap_or(0.0) / 20.0;
      t["rating"] = if r > 0.0 { json!(r) } else { Value::Null };
      continue;
    }
    t[f.as_str()] = json!(s);
    if !edited.iter().any(|e| e == f.as_str()) { edited.push(json!(f)); }
  }
  if !edited.is_empty() { t["edited"] = Value::Array(edited); }
}
/// A field's value for Engine DJ's column: the year and rating as numbers, an empty text as nothing (the title stays).
pub fn app_value(f: &str, v: &Value) -> rusqlite::types::Value {
  use rusqlite::types::Value as V;
  let s = v.as_str().unwrap_or("");
  match f {
    "rating" => V::Integer(s.parse().unwrap_or(0)),
    "year" => s.parse::<i64>().map_or(V::Null, V::Integer),
    "title" => V::Text(s.into()),
    _ if s.is_empty() => V::Null,
    _ => V::Text(s.into()),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  fn info(pairs: &[(&str, &str)]) -> Map<String, Value> { let mut m = Map::new(); for f in FIELDS { m.insert(f.into(), json!("")); } for (k, v) in pairs { m.insert((*k).into(), json!(v)); } m }

  #[test]
  fn each_sides_change_goes_to_the_other() {
    let g = info(&[("title", "One"), ("rating", "60")]);
    let a = info(&[("title", "One (Original Mix)"), ("rating", "60")]);
    // First time: they differ, nothing moves.
    let m = merge_info(&g, &a, None);
    assert!(m.to_app.is_empty() && m.to_glue.is_empty());
    // GLUE renamed it, Engine DJ rated it.
    let g2 = info(&[("title", "One!"), ("rating", "60")]);
    let a2 = info(&[("title", "One (Original Mix)"), ("rating", "80")]);
    let m = merge_info(&g2, &a2, Some(&m.base));
    assert_eq!(m.to_app.get("title"), Some(&json!("One!")));
    assert_eq!(m.to_glue.get("rating"), Some(&json!("80")));
    // In step now: nothing moves.
    let g3 = info(&[("title", "One!"), ("rating", "80")]);
    let a3 = info(&[("title", "One!"), ("rating", "80")]);
    let m2 = merge_info(&g3, &a3, Some(&m.base));
    assert!(m2.to_app.is_empty() && m2.to_glue.is_empty());
    // Both changed the genre: GLUE's goes.
    let m3 = merge_info(&info(&[("title", "One!"), ("rating", "80"), ("genre", "House")]), &info(&[("title", "One!"), ("rating", "80"), ("genre", "Techno")]), Some(&m2.base));
    assert_eq!(m3.to_app.get("genre"), Some(&json!("House")));
  }

  #[test]
  fn glue_and_engine_djs_forms() {
    let g = glue_info(&json!({ "title": " A ", "year": "2019-05-01", "rating": 3.5 }));
    assert_eq!((g["title"].clone(), g["year"].clone(), g["rating"].clone()), (json!("A"), json!("2019"), json!("70")));
    let a = app_info(&[("title", Some("A".into())), ("year", Some("0".into())), ("rating", None)]);
    assert_eq!((a["year"].clone(), a["rating"].clone()), (json!(""), json!("0")));
    let mut t = json!({ "title": "A", "rating": 3.5 });
    into_glue(&mut t, &info(&[("title", "B"), ("rating", "0")]).into_iter().filter(|(k, _)| k == "title" || k == "rating").collect());
    assert_eq!((t["title"].clone(), t["rating"].clone(), t["edited"].clone()), (json!("B"), Value::Null, json!(["title"])));
  }
}
