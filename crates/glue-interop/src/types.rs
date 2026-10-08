//! What every library importer produces (`core/interop/types.ts`), and the helpers they share, with JavaScript's
//! behaviour where it shows: `Number(…)`, `String(…)`, `decodeURIComponent`, `toISOString`, `TextDecoder`.
use indexmap::IndexMap;
use serde_json::{json, Value};

/// A cue point or loop from a DJ app (seconds). num: hot cue slot 0–7 (A–H), None for a memory cue.
#[derive(Clone, Debug, PartialEq)]
pub struct CuePoint { pub t: f64, pub kind: String, pub num: Option<f64>, pub name: String, pub color: Option<String>, pub end: Option<f64> }

#[derive(Clone, Debug, PartialEq)]
pub struct ImportedTrack {
  pub external_id: String,
  /// Absolute (or library-relative) path, '/'-separated.
  pub path: String,
  pub title: String, pub artist: String, pub album: String, pub genre: String, pub label: String, pub comment: String, pub year: String,
  pub grouping: String,
  pub duration: Option<f64>,
  pub bpm: Option<f64>,
  pub key: Option<String>,
  pub rating: Option<f64>,
  pub play_count: Option<f64>,
  pub date_added: Option<String>,
  pub cues: usize,
  pub cue_list: Vec<CuePoint>,
  pub size: Option<f64>,
  /// The app's beat grid, where the format has one.
  pub grid: Option<Grid>,
}

/// A beat grid as Prepare keeps one (`core/library/grid`): the tempo, the first beat's time (s), which of each four beats
/// is a bar's first (0–3). A DJ app's is its first tempo.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Grid { pub bpm: f64, pub beat0: f64, pub bar: f64 }
impl Grid {
  pub fn to_json(&self) -> Value { json!({ "bpm": num_value(self.bpm), "beat0": num_value(self.beat0), "bar": num_value(self.bar) }) }
  pub fn from_json(v: &Value) -> Option<Grid> { Some(Grid { bpm: v.get("bpm")?.as_f64()?, beat0: v.get("beat0")?.as_f64()?, bar: v.get("bar")?.as_f64()? }) }
}
/// Above 0 (not NaN).
pub fn positive(x: f64) -> bool { x > 0.0 }
/// `gridAt`: a grid from its tempo and a bar's first beat (before the start or after it): the first beat in the song,
/// and where the bar starts.
pub fn grid_at(bpm: f64, down: f64) -> Option<Grid> {
  if !positive(bpm) || !bpm.is_finite() || !down.is_finite() { return None; }
  let spb = 60.0 / bpm;
  let k = (down / spb).floor();
  Some(Grid { bpm, beat0: down - k * spb, bar: ((k % 4.0) + 4.0) % 4.0 })
}

#[derive(Clone, Debug, PartialEq)]
pub struct ImportedList { pub external_id: String, pub kind: &'static str, pub name: String, pub parent: Option<String>, pub items: Vec<String> }

/// Engine DJ: playlist entries read and found; entries of libraries not imported; entries whose song is gone.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Stats { pub entries: usize, pub matched: usize, pub other_libraries: usize, pub missing_libraries: usize, pub gone: usize, pub libraries: usize }

/// Engine DJ: the libraries (database uuids) this import holds, and every playlist's entries as "uuid/trackId".
#[derive(Clone, Debug, Default, PartialEq)]
pub struct EngineSet { pub uuids: Vec<String>, pub entries: IndexMap<String, Vec<String>> }

#[derive(Clone, Debug, PartialEq)]
pub struct ImportedLibrary { pub app: &'static str, pub name: String, pub tracks: Vec<ImportedTrack>, pub lists: Vec<ImportedList>, pub stats: Option<Stats>, pub engine: Option<EngineSet> }

pub fn blank_track(external_id: String, path: String) -> ImportedTrack {
  ImportedTrack {
    external_id, path, title: String::new(), artist: String::new(), album: String::new(), genre: String::new(), label: String::new(),
    comment: String::new(), year: String::new(), grouping: String::new(), duration: None, bpm: None, key: None, rating: None, play_count: None,
    date_added: None, cues: 0, cue_list: vec![], size: None, grid: None,
  }
}

fn n(x: Option<f64>) -> Value { x.map_or(Value::Null, num_value) }
/// A number as JSON keeps it: whole numbers as integers (as JavaScript writes them).
pub fn num_value(x: f64) -> Value {
  if x.fract() == 0.0 && x.abs() < 9.007_199_254_740_992e15 && !(x == 0.0 && x.is_sign_negative()) { json!(x as i64) } else { serde_json::Number::from_f64(x).map_or(Value::Null, Value::Number) }
}
fn s(x: &Option<String>) -> Value { x.as_ref().map_or(Value::Null, |v| json!(v)) }

impl CuePoint {
  pub fn to_json(&self) -> Value { json!({ "t": num_value(self.t), "kind": self.kind, "num": n(self.num), "name": self.name, "color": s(&self.color), "end": n(self.end) }) }
}
impl ImportedTrack {
  /// As the website sends it (`ImportedTrack`), its fields in its order.
  pub fn to_json(&self) -> Value {
    json!({
      "externalId": self.external_id, "path": self.path, "title": self.title, "artist": self.artist, "album": self.album, "genre": self.genre,
      "label": self.label, "comment": self.comment, "year": self.year, "grouping": self.grouping, "duration": n(self.duration), "bpm": n(self.bpm),
      "key": s(&self.key), "rating": n(self.rating), "playCount": n(self.play_count), "dateAdded": s(&self.date_added), "cues": self.cues,
      "cueList": self.cue_list.iter().map(CuePoint::to_json).collect::<Vec<_>>(), "size": n(self.size), "grid": self.grid.map_or(Value::Null, |g| g.to_json()),
    })
  }
}
impl ImportedList {
  pub fn to_json(&self) -> Value { json!({ "externalId": self.external_id, "kind": self.kind, "name": self.name, "parent": s(&self.parent), "items": self.items }) }
}
impl ImportedLibrary {
  pub fn to_json(&self) -> Value {
    let mut o = serde_json::Map::new();
    o.insert("app".into(), json!(self.app));
    o.insert("name".into(), json!(self.name));
    o.insert("tracks".into(), Value::Array(self.tracks.iter().map(ImportedTrack::to_json).collect()));
    o.insert("lists".into(), Value::Array(self.lists.iter().map(ImportedList::to_json).collect()));
    if let Some(e) = &self.engine {
      // A Map sent as an object: JavaScript puts its numeric keys first, in order.
      let mut entries = serde_json::Map::new();
      for k in js_key_order(e.entries.keys()) { entries.insert(k.clone(), json!(e.entries[k])); }
      o.insert("engine".into(), json!({ "uuids": e.uuids, "entries": entries }));
    }
    if let Some(st) = &self.stats {
      o.insert("stats".into(), json!({ "entries": st.entries, "matched": st.matched, "otherLibraries": st.other_libraries, "missingLibraries": st.missing_libraries, "gone": st.gone, "libraries": st.libraries }));
    }
    Value::Object(o)
  }
}

/// An object's keys in JavaScript's order: array indices (canonical, below 2³² − 1) first, ascending, then the rest as
/// they came.
pub fn js_key_order<'a>(keys: impl Iterator<Item = &'a String>) -> Vec<&'a String> {
  let (mut idx, mut rest): (Vec<(u64, &String)>, Vec<&String>) = (vec![], vec![]);
  for k in keys { match array_index(k) { Some(i) => idx.push((i, k)), None => rest.push(k) } }
  idx.sort_by_key(|x| x.0);
  idx.into_iter().map(|x| x.1).chain(rest).collect()
}
fn array_index(k: &str) -> Option<u64> {
  if k.is_empty() || k.len() > 10 || !k.bytes().all(|b| b.is_ascii_digit()) || (k.len() > 1 && k.starts_with('0')) { return None; }
  k.parse::<u64>().ok().filter(|&i| i < 4_294_967_295)
}

/// JavaScript's whitespace (`trim`, `\s`).
pub fn is_space(c: char) -> bool {
  matches!(c, '\u{9}'..='\u{D}' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}
pub fn trim(s: &str) -> &str { s.trim_matches(is_space) }

/// `Number(s)` for a string.
pub fn js_number(s: &str) -> f64 {
  let t = trim(s);
  if t.is_empty() { return 0.0; }
  let radix = |digits: &str, r: u32| -> f64 {
    if digits.is_empty() { return f64::NAN; }
    let mut v = 0.0f64;
    for c in digits.chars() { match c.to_digit(r) { Some(d) => v = v * r as f64 + d as f64, None => return f64::NAN } }
    v
  };
  let lower = t.get(..2).map(|p| p.to_ascii_lowercase());
  match lower.as_deref() {
    Some("0x") => return radix(&t[2..], 16),
    Some("0o") => return radix(&t[2..], 8),
    Some("0b") => return radix(&t[2..], 2),
    _ => {}
  }
  let body = t.strip_prefix(['+', '-']).unwrap_or(t);
  if body == "Infinity" { return if t.starts_with('-') { f64::NEG_INFINITY } else { f64::INFINITY }; }
  // A decimal literal: digits, an optional point and fraction (one side at least), an optional exponent.
  let b = body.as_bytes();
  let mut i = 0;
  while i < b.len() && b[i].is_ascii_digit() { i += 1; }
  let int = i;
  if i < b.len() && b[i] == b'.' { i += 1; }
  let frac0 = i;
  while i < b.len() && b[i].is_ascii_digit() { i += 1; }
  if int == 0 && i == frac0 { return f64::NAN; }
  if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
    i += 1;
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') { i += 1; }
    let e0 = i;
    while i < b.len() && b[i].is_ascii_digit() { i += 1; }
    if i == e0 { return f64::NAN; }
  }
  if i != b.len() { return f64::NAN; }
  t.parse::<f64>().unwrap_or(f64::NAN)
}
/// `num(s)` (types.ts): a finite number, or None for nothing, '' and what isn't one.
pub fn num(s: Option<&str>) -> Option<f64> { let s = s?; if s.is_empty() { return None; } let v = js_number(s); v.is_finite().then_some(v) }

/// `Math.round`.
pub fn round(x: f64) -> f64 {
  if !x.is_finite() { return x; }
  let f = x.floor();
  let r = if x - f >= 0.5 { f + 1.0 } else { f };
  if r == 0.0 && x.is_sign_negative() { -0.0 } else { r }
}
/// `String(x)` for a number.
pub fn num_str(x: f64) -> String { glue_store::json::num_str(x) }

/// `decodeURIComponent`: None where it throws (a broken escape, bytes that aren't UTF-8).
pub fn decode_uri_component(s: &str) -> Option<String> {
  let b = s.as_bytes();
  let mut out: Vec<u8> = Vec::with_capacity(b.len());
  let hex = |i: usize| -> Option<u8> { if i + 2 < b.len() && b[i] == b'%' { let h = std::str::from_utf8(b.get(i + 1..i + 3)?).ok()?; u8::from_str_radix(h, 16).ok().filter(|_| h.bytes().all(|c| c.is_ascii_hexdigit())) } else { None } };
  let mut i = 0;
  while i < b.len() {
    if b[i] != b'%' { out.push(b[i]); i += 1; continue; }
    let first = hex(i)?;
    i += 3;
    if first < 0x80 { out.push(first); continue; }
    let n = first.leading_ones() as usize;
    if !(2..=4).contains(&n) { return None; }
    let mut seq = vec![first];
    for _ in 1..n { let c = hex(i)?; if c & 0xC0 != 0x80 { return None; } seq.push(c); i += 3; }
    std::str::from_utf8(&seq).ok()?;
    out.extend(seq);
  }
  String::from_utf8(out).ok()
}

/// `fileUrlToPath`: file://localhost/C:/Users/x/a%20b.mp3 → C:/Users/x/a b.mp3 ; file:///Users/x → /Users/x
pub fn file_url_to_path(url: &str) -> String {
  let mut s = trim(url).to_string();
  let low = s.to_ascii_lowercase();
  for p in ["file://localhost/", "file:///", "file://"] { if low.starts_with(p) { s = format!("/{}", &s[p.len()..]); break; } }
  if let Some(d) = decode_uri_component(&s) { s = d; }
  let b = s.as_bytes();
  if b.len() >= 4 && b[0] == b'/' && b[1].is_ascii_alphabetic() && b[2] == b':' && b[3] == b'/' { s.remove(0); }
  s
}
/// `pathId`: a list's id from its parent's and its name, numbered when siblings share a name (ADR 0063).
pub fn path_id(parent: Option<&str>, name: &str, taken: &mut indexmap::IndexSet<String>) -> String {
  let base = format!("{}/{}", parent.unwrap_or(""), name);
  let (mut id, mut k) = (base.clone(), 2);
  while taken.contains(&id) { id = format!("{base}#{k}"); k += 1; }
  taken.insert(id.clone());
  id
}
pub fn norm_path(p: &str) -> String { p.replace('\\', "/") }
pub fn base_name(p: &str) -> String { let n = norm_path(p); match n.rsplit('/').next() { Some(x) if !x.is_empty() => x.to_string(), _ => p.to_string() } }

/// `new Date(seconds * 1000).toISOString().slice(0, 10)`: Err where JavaScript throws (beyond its dates).
pub fn iso_day(seconds: f64) -> Result<String, String> {
  let ms = (seconds * 1000.0).trunc();
  if !ms.is_finite() || ms.abs() > 8.64e15 { return Err("Invalid time value".into()); }
  let days = (ms / 86_400_000.0).floor() as i64;
  // Days since 1970-01-01 to a civil date (Howard Hinnant's algorithm).
  let z = days + 719_468;
  let era = z.div_euclid(146_097);
  let doe = z.rem_euclid(146_097);
  let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let d = doy - (153 * mp + 2) / 5 + 1;
  let m = if mp < 10 { mp + 3 } else { mp - 9 };
  let y = yoe + era * 400 + i64::from(m <= 2);
  let full = if (0..=9999).contains(&y) { format!("{y:04}-{m:02}-{d:02}") } else { format!("{}{:06}-{m:02}-{d:02}", if y < 0 { '-' } else { '+' }, y.abs()) };
  Ok(full.chars().take(10).collect())
}

/// `new TextDecoder().decode(bytes)`: UTF-8, broken bytes as U+FFFD, a leading byte-order mark dropped.
pub fn utf8(b: &[u8]) -> String { String::from_utf8_lossy(b.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(b)).into_owned() }
/// `new TextDecoder('utf-16be').decode(bytes)`.
pub fn utf16be(b: &[u8]) -> String {
  let units = b.chunks(2).filter(|c| c.len() == 2).map(|c| u16::from_be_bytes([c[0], c[1]]));
  let mut s: String = char::decode_utf16(units).map(|r| r.unwrap_or('\u{FFFD}')).collect();
  if b.len() % 2 == 1 { s.push('\u{FFFD}'); }
  s.strip_prefix('\u{FEFF}').map(String::from).unwrap_or(s)
}
/// `new TextDecoder('windows-1252').decode(bytes)`.
pub fn windows1252(b: &[u8]) -> String {
  const HIGH: [u16; 32] = [
    0x20AC, 0x81, 0x201A, 0x192, 0x201E, 0x2026, 0x2020, 0x2021, 0x2C6, 0x2030, 0x160, 0x2039, 0x152, 0x8D, 0x17D, 0x8F,
    0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x2DC, 0x2122, 0x161, 0x203A, 0x153, 0x9D, 0x17E, 0x178,
  ];
  b.iter().map(|&x| if (0x80..0xA0).contains(&x) { char::from_u32(HIGH[(x - 0x80) as usize] as u32).unwrap() } else { x as char }).collect()
}

/// `s.toLowerCase()`.
pub fn lower(s: &str) -> String { s.to_lowercase() }

/// `a.localeCompare(b)` as JavaScript's default collation orders the names GLUE sorts (Serato's crates): spaces and
/// punctuation first, in their own order, then digits, then letters, case and accents set aside; then accents; then
/// lower case before upper case. Characters outside these are ordered after the letters by their code.
pub fn collate(a: &str, b: &str) -> std::cmp::Ordering {
  use unicode_normalization::char::is_combining_mark;
  use unicode_normalization::UnicodeNormalization;
  const ORDER: &str = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$0123456789abcdefghijklmnopqrstuvwxyz";
  // (primary, accents, case) per base character.
  let key = |s: &str| -> (Vec<u32>, Vec<Vec<char>>, Vec<u8>) {
    let (mut p, mut acc, mut case): (Vec<u32>, Vec<Vec<char>>, Vec<u8>) = (vec![], vec![], vec![]);
    for c in s.nfd() {
      if is_combining_mark(c) { if let Some(l) = acc.last_mut() { l.push(c); } continue; }
      if c.is_control() { continue; }
      let expand: &[char] = match c { 'ß' => &['s', 's'], 'æ' => &['a', 'e'], 'Æ' => &['A', 'E'], 'œ' => &['o', 'e'], 'Œ' => &['O', 'E'], _ => &[] };
      let parts: Vec<char> = if expand.is_empty() { vec![c] } else { expand.to_vec() };
      for (k, &x) in parts.iter().enumerate() {
        let l = x.to_lowercase().next().unwrap_or(x);
        p.push(match ORDER.find(l) { Some(i) if l.is_ascii() => i as u32, _ => 0x100 + l as u32 });
        acc.push(vec![]);
        // Expanded letters count as a variant of their spelling-out (ß after ss).
        case.push(if x.is_uppercase() { 2 } else if !expand.is_empty() && k == 0 { 1 } else { 0 });
      }
    }
    (p, acc, case)
  };
  let (ka, kb) = (key(a), key(b));
  ka.0.cmp(&kb.0).then_with(|| ka.1.cmp(&kb.1)).then_with(|| ka.2.cmp(&kb.2))
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn numbers_as_javascript_reads_them() {
    for (s, want) in [(" 1e3 ", 1000.0), ("0x10", 16.0), ("0B11", 3.0), ("+5", 5.0), (".5", 0.5), ("5.", 5.0), ("", 0.0), ("124.00", 124.0)] { assert_eq!(js_number(s), want, "{s}"); }
    for s in ["-0x10", "1e", "e5", "1_000", "inf", "nan", "infinity", "1 2", "."] { assert!(js_number(s).is_nan(), "{s}"); }
    assert_eq!(js_number("-Infinity"), f64::NEG_INFINITY);
    assert_eq!(num(Some("Infinity")), None);
  }
  #[test]
  fn file_urls_and_dates() {
    assert_eq!(file_url_to_path("file://localhost/C:/A%20B/c.mp3"), "C:/A B/c.mp3");
    assert_eq!(file_url_to_path("FILE:///Users/x/a.mp3"), "/Users/x/a.mp3");
    assert_eq!(file_url_to_path("file:///x%E0%A4%A.mp3"), "/x%E0%A4%A.mp3");
    assert_eq!(file_url_to_path("file:///x%C0%80.mp3"), "/x%C0%80.mp3");   // overlong: JavaScript throws, it stays
    assert_eq!(iso_day(1_767_225_600.0).unwrap(), "2026-01-01");
    assert_eq!(iso_day(-86_400.5).unwrap(), "1969-12-30");
  }
  #[test]
  fn names_sorted_as_javascript_sorts_them() {
    let mut v = vec!["House%%Deep.crate", "B.crate", "House.crate", "a.crate", "é", "e", "f", "E", "ab", "a b", "a-b"];
    v.sort_by(|a, b| collate(a, b));
    assert_eq!(v, ["a b", "a-b", "a.crate", "ab", "B.crate", "e", "E", "é", "f", "House.crate", "House%%Deep.crate"]);
  }
}
