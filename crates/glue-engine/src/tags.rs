//! A song's info from its tags, read without its audio or its pictures (ADR 0135): what GLUE shows for a song until
//! it's analysed. Read by the analysis queue as a song's first step, inside the same "songs at a time" (ADR 0157), and
//! by GLUE Home's `/fs/read-tags` for websites from before it. The website's rules (src/core/library/tags.ts): a field
//! is filled from the tags only when it's empty and wasn't edited in GLUE; a song with no title takes its file's name
//! ("Artist - Title.ext").
use glue_store::project::INFO_FIELDS;
use lofty::config::ParseOptions;
use lofty::prelude::*;
use lofty::probe::Probe;
use regex::Regex;
use serde_json::{json, Value};
use std::path::Path;
use std::sync::LazyLock;

/// The info in a song's tags (`title`, `artist`, `album`, `genre`, `comment`, `label`, `year`, `grouping`), or None
/// when they can't be read (the name will do).
pub fn read_info(path: &Path) -> Option<Value> {
  let tagged = Probe::open(path).ok()?.options(ParseOptions::new().read_properties(false).read_cover_art(false)).read().ok()?;
  let tag = tagged.primary_tag().or_else(|| tagged.first_tag())?;
  let s = |v: Option<std::borrow::Cow<'_, str>>| v.map(|x| x.trim().to_string()).unwrap_or_default();
  let k = |key: ItemKey| tag.get_string(key).map(|x| x.trim().to_string()).unwrap_or_default();
  let year = { let d = k(ItemKey::RecordingDate); if d.is_empty() { k(ItemKey::Year) } else { d } };
  Some(json!({
    "title": s(tag.title()), "artist": s(tag.artist()), "album": s(tag.album()), "genre": s(tag.genre()),
    "comment": s(tag.comment()), "label": k(ItemKey::Label), "year": year, "grouping": k(ItemKey::ContentGroup),
  }))
}

/// Many songs' info at once, `threads` files at a time (GLUE Home's `/fs/read-tags`, for websites from before 0.56).
pub fn read_many(paths: &[std::path::PathBuf], threads: usize) -> Vec<Option<Value>> {
  use std::sync::atomic::{AtomicUsize, Ordering};
  let next = AtomicUsize::new(0);
  let out: Vec<std::sync::Mutex<Option<Value>>> = paths.iter().map(|_| std::sync::Mutex::new(None)).collect();
  std::thread::scope(|sc| {
    for _ in 0..threads.max(1).min(paths.len().max(1)) {
      sc.spawn(|| loop {
        let i = next.fetch_add(1, Ordering::Relaxed);
        if i >= paths.len() { break; }
        *out[i].lock().unwrap() = read_info(&paths[i]);
      });
    }
  });
  out.into_iter().map(|m| m.into_inner().unwrap()).collect()
}

// JavaScript's \d is ASCII only.
static LEADING_NUMBER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[0-9]{1,3}[\s._-]+([^0-9])").unwrap());
static ARTIST_TITLE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(.+?)\s+[-–]\s+(.+)$").unwrap());
/// tags.ts `nameFields`: "Artist - Title.ext" (a leading track number left out) → artist and title; else the name is
/// the title.
pub fn name_fields(file_name: &str) -> (String, String) {
  // `.replace(/.[^.]+$/, '')`: the extension, when something follows the dot.
  let stem = match file_name.rfind('.') { Some(i) if i + 1 < file_name.len() => &file_name[..i], _ => file_name };
  let stem = LEADING_NUMBER.replace(stem, "$1");
  match ARTIST_TITLE.captures(&stem) {
    Some(m) => (m[1].trim().to_string(), m[2].trim().to_string()),
    None => (String::new(), stem.trim().to_string()),
  }
}

/// The song with its tags' info (tags.ts `fillInfo`, folders.ts `withTags`): only empty fields that weren't edited,
/// then the file's name for a song still without a title.
pub fn with_tags(t: &Value, info: Option<&Value>) -> Value {
  let mut out = t.clone();
  let edited: Vec<String> = t["edited"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
  let empty = |o: &Value, k: &str| o.get(k).and_then(|v| v.as_str()).is_none_or(|s| s.is_empty());
  if let Some(f) = info {
    for k in INFO_FIELDS {
      if let Some(v) = f.get(k).and_then(|v| v.as_str()).filter(|v| !v.is_empty()) {
        if empty(&out, k) && !edited.iter().any(|e| e == k) { out[k] = json!(v); }
      }
    }
  }
  if empty(&out, "title") {
    let (artist, title) = name_fields(out["fileName"].as_str().unwrap_or(""));
    out["title"] = json!(title);
    if empty(&out, "artist") { out["artist"] = json!(artist); }
  }
  out
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn names_and_tags_as_the_website_fills_them() {
    assert_eq!(name_fields("01 Daft Punk - One More Time.mp3"), ("Daft Punk".into(), "One More Time".into()));
    assert_eq!(name_fields("Intro.flac"), (String::new(), "Intro".into()));
    assert_eq!(name_fields("2 Unlimited.mp3"), (String::new(), "Unlimited".into()), "as the website does: a leading number goes");
    assert_eq!(name_fields("abc."), (String::new(), "abc.".into()));
    assert_eq!(name_fields(".hidden"), (String::new(), String::new()));
    let t = json!({ "id": "a", "fileName": "x - y.mp3", "title": "", "artist": "", "album": "Mine", "edited": ["genre"] });
    let got = with_tags(&t, Some(&json!({ "title": "T", "artist": "A", "album": "Theirs", "genre": "Rock" })));
    assert_eq!((got["title"].clone(), got["artist"].clone(), got["album"].clone(), got.get("genre").cloned()), (json!("T"), json!("A"), json!("Mine"), None));
    let named = with_tags(&t, None);
    assert_eq!((named["artist"].clone(), named["title"].clone()), (json!("x"), json!("y")));
  }
  #[test]
  fn reads_a_songs_tags_only() {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures");
    let got = read_many(&[root.join("mp3-cover.mp3"), root.join("not-there.mp3"), root.join("flac-cover.flac")], 2);
    assert!(got[0].is_some() && got[1].is_none() && got[2].is_some());
    for k in ["title", "artist", "album", "genre", "label", "year", "comment", "grouping"] { assert!(got[0].as_ref().unwrap().get(k).is_some(), "{k}"); }
  }
}
