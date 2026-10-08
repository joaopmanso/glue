//! M3U / M3U8 playlists (`core/interop/m3u.ts`): one playlist, its songs by path; #EXTINF gives the length and
//! "Artist - Title".
use crate::types::*;
use regex::Regex;
use std::sync::LazyLock;

// `.` in JavaScript stops at any line end.
static EXTINF: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^#EXTINF:(-?[0-9]+(?:\.[0-9]+)?)[^,]*,([^\n\r\x{2028}\x{2029}]*)$").unwrap());

pub fn parse_m3u(text: &str, file_name: &str) -> ImportedLibrary {
  let (mut tracks, mut items) = (vec![], vec![]);
  let mut pending: Option<(Option<f64>, String, String)> = None;
  let body = text.strip_prefix('\u{FEFF}').unwrap_or(text);
  for raw in body.split('\n') {
    let line = trim(raw.strip_suffix('\r').unwrap_or(raw));
    if line.is_empty() { continue; }
    if line.starts_with("#EXTINF:") {
      let m = EXTINF.captures(line);
      let label = m.as_ref().map_or("", |m| m.get(2).unwrap().as_str());
      let dur = m.as_ref().map(|m| js_number(&m[1])).filter(|&d| d > 0.0);
      pending = Some(match label.find(" - ").filter(|&d| d > 0) { Some(d) => (dur, label[..d].into(), label[d + 3..].into()), None => (dur, String::new(), label.into()) });
      continue;
    }
    if line.starts_with('#') { continue; }
    let path = if line.get(..5).is_some_and(|p| p.eq_ignore_ascii_case("file:")) { file_url_to_path(line) } else { norm_path(line) };
    let mut t = blank_track(lower(&path), path);
    if let Some((dur, artist, title)) = pending.take() { t.duration = dur; t.artist = artist; t.title = title; }
    items.push(t.external_id.clone());
    tracks.push(t);
  }
  let low = file_name.to_ascii_lowercase();
  let name = if low.ends_with(".m3u8") { &file_name[..file_name.len() - 5] } else if low.ends_with(".m3u") { &file_name[..file_name.len() - 4] } else { file_name };
  let lists = vec![ImportedList { external_id: format!("m3u:{file_name}"), kind: "playlist", name: name.into(), parent: None, items }];
  ImportedLibrary { app: "m3u", name: format!("Playlist ({file_name})"), tracks, lists, stats: None, engine: None }
}
