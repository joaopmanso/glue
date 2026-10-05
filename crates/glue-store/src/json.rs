//! JSON as JavaScript reads and writes it (`JSON.parse`, `JSON.stringify`), so the files GLUE Home writes are the
//! bytes the website would write:
//! - an object's keys in JavaScript's order: array-index keys ("0", "17"…) first, ascending, then the rest in the
//!   order they were added;
//! - numbers as JavaScript prints them (`num_str`), every number a double;
//! - strings escaped as `JSON.stringify` escapes them.
use serde_json::{Map, Value};

pub type Obj = Map<String, Value>;

/// A file's JSON (`JSON.parse`): the keys in the file's order (a repeated key keeps its first place, its last value).
pub fn parse(text: &str) -> Result<Value, String> { serde_json::from_str(text).map_err(|e| e.to_string()) }

/// `JSON.stringify(v)`.
pub fn stringify(v: &Value) -> String {
  let mut out = String::new();
  write(v, &mut out);
  out
}

/// An array index as JavaScript orders object keys: a canonical whole number below 2³² − 1.
fn index_key(k: &str) -> Option<u32> {
  if k.is_empty() || k.len() > 10 || (k.len() > 1 && k.starts_with('0')) || !k.bytes().all(|b| b.is_ascii_digit()) { return None; }
  k.parse::<u64>().ok().filter(|&n| n < u32::MAX as u64).map(|n| n as u32)
}

/// An object's keys in JavaScript's order.
pub fn js_keys(o: &Obj) -> Vec<&String> {
  let mut idx: Vec<(u32, &String)> = o.keys().filter_map(|k| index_key(k).map(|n| (n, k))).collect();
  idx.sort_by_key(|x| x.0);
  let mut out: Vec<&String> = idx.into_iter().map(|x| x.1).collect();
  out.extend(o.keys().filter(|k| index_key(k).is_none()));
  out
}

/// `JSON.stringify(v, null, indent)`: one key or item a line, `indent` spaces a level, `[]`/`{}` when empty.
pub fn stringify_pretty(v: &Value, indent: usize) -> String {
  let mut out = String::new();
  pretty(v, indent, 0, &mut out);
  out
}

fn pretty(v: &Value, indent: usize, level: usize, out: &mut String) {
  let pad = |n: usize, out: &mut String| { out.push('\n'); out.push_str(&" ".repeat(n * indent)); };
  match v {
    Value::Array(a) if !a.is_empty() => {
      out.push('[');
      for (i, x) in a.iter().enumerate() { if i > 0 { out.push(','); } pad(level + 1, out); pretty(x, indent, level + 1, out); }
      pad(level, out); out.push(']');
    }
    Value::Object(o) if !o.is_empty() => {
      out.push('{');
      for (i, k) in js_keys(o).into_iter().enumerate() { if i > 0 { out.push(','); } pad(level + 1, out); quote(k, out); out.push_str(": "); pretty(&o[k], indent, level + 1, out); }
      pad(level, out); out.push('}');
    }
    _ => write(v, out),
  }
}

fn write(v: &Value, out: &mut String) {
  match v {
    Value::Null => out.push_str("null"),
    Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
    Value::Number(n) => {
      let x = n.as_f64().unwrap_or(f64::NAN);
      // JSON.stringify writes what isn't finite as null.
      if x.is_finite() { out.push_str(&num_str(x)) } else { out.push_str("null") }
    }
    Value::String(s) => quote(s, out),
    Value::Array(a) => {
      out.push('[');
      for (i, x) in a.iter().enumerate() { if i > 0 { out.push(','); } write(x, out); }
      out.push(']');
    }
    Value::Object(o) => {
      out.push('{');
      for (i, k) in js_keys(o).into_iter().enumerate() {
        if i > 0 { out.push(','); }
        quote(k, out);
        out.push(':');
        write(&o[k], out);
      }
      out.push('}');
    }
  }
}

fn quote(s: &str, out: &mut String) {
  out.push('"');
  for c in s.chars() {
    match c {
      '"' => out.push_str("\\\""),
      '\\' => out.push_str("\\\\"),
      '\u{8}' => out.push_str("\\b"),
      '\u{c}' => out.push_str("\\f"),
      '\n' => out.push_str("\\n"),
      '\r' => out.push_str("\\r"),
      '\t' => out.push_str("\\t"),
      c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
      c => out.push(c),
    }
  }
  out.push('"');
}

/// A number as JavaScript prints it (`String(x)`).
pub fn num_str(x: f64) -> String {
  if x.is_nan() { return "NaN".into(); }
  if x.is_infinite() { return if x > 0.0 { "Infinity".into() } else { "-Infinity".into() }; }
  if x == 0.0 { return "0".into(); }
  // Rust prints a double with its shortest digits, as JavaScript does (12345678901234567000, 0.1, 5).
  let a = x.abs();
  if (1e-6..1e21).contains(&a) { return format!("{x}"); }
  let s = format!("{x:e}");
  let (m, e) = s.split_once('e').unwrap();
  let e: i32 = e.parse().unwrap();
  format!("{m}e{}{}", if e < 0 { "-" } else { "+" }, e.abs())
}

/// JavaScript's `a > b` for two values that are strings or absent (absent compares as 0: false against a string).
pub fn js_gt(a: Option<&Value>, b: Option<&Value>) -> bool {
  match (a.and_then(|v| v.as_str()), b.and_then(|v| v.as_str())) {
    (Some(x), Some(y)) => utf16_cmp(x, y) == std::cmp::Ordering::Greater,
    _ => match (a.and_then(|v| v.as_f64()), b.and_then(|v| v.as_f64())) { (Some(x), Some(y)) => x > y, _ => false },
  }
}

/// Strings compared as JavaScript compares them (`<`, the default `sort`): by UTF-16 code units.
pub fn utf16_cmp(a: &str, b: &str) -> std::cmp::Ordering { a.encode_utf16().cmp(b.encode_utf16()) }

/// `a.localeCompare(b)` for the strings GLUE sorts (dates, ids): letters by their case-folded form first, lower case
/// before upper case when they're otherwise the same, as the default collation orders them.
pub fn locale_cmp(a: &str, b: &str) -> std::cmp::Ordering {
  let fold = |s: &str| s.chars().flat_map(|c| c.to_lowercase()).collect::<Vec<char>>();
  fold(a).cmp(&fold(b)).then_with(|| {
    // Same letters: lower case first (a < A).
    for (x, y) in a.chars().zip(b.chars()) {
      if x != y { return if x.is_lowercase() && y.is_uppercase() { std::cmp::Ordering::Less } else if x.is_uppercase() && y.is_lowercase() { std::cmp::Ordering::Greater } else { x.cmp(&y) }; }
    }
    a.len().cmp(&b.len())
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn writes_as_javascript_does() {
    let v = parse(r#"{"b":1,"10":2,"a":[1.5,0.000001,1e-7,1e21,-0,null,true],"2":"x\u0001\n\"é","01":3}"#).unwrap();
    assert_eq!(stringify(&v), r#"{"2":"x\u0001\n\"é","10":2,"b":1,"a":[1.5,0.000001,1e-7,1e+21,0,null,true],"01":3}"#);
    assert_eq!(stringify(&parse("12345678901234567890").unwrap()), "12345678901234567000");
  }
}
