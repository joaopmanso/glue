//! GLUE Home's incoming folder (ADR 0048): songs sent from the account's other devices land here, and wait in
//! TO BE SORTED until moved into a music folder. GLUE Home's local link and the answers to other devices use these.
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

/// The songs in the incoming folder (not the ones still arriving, `.part`, or hidden ones): name, size, date, path.
pub fn list(dir: &Path) -> Vec<Value> {
  let Ok(d) = fs::read_dir(dir) else { return vec![] };
  d.flatten().filter_map(|e| {
    let m = e.metadata().ok()?;
    let name = e.file_name().to_string_lossy().into_owned();
    if !m.is_file() || name.ends_with(".part") || name.starts_with('.') { return None; }
    let mtime = m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
    Some(json!({ "name": name, "size": m.len(), "mtime": mtime, "path": e.path().to_string_lossy() }))
  }).collect()
}

/// A file name that's safe on every system: no folder, no characters Windows refuses, not a device's name, not empty,
/// cut to 170 characters when it's over 180.
pub fn safe_name(name: &str) -> String {
  let base = name.rsplit(['/', '\\']).next().unwrap_or("");
  let mut n: String = base.chars().map(|c| if c.is_control() || "<>:\"|?*".contains(c) { '_' } else { c }).collect();
  n = n.trim().trim_end_matches(['.', ' ']).to_string();
  let stem = n.split('.').next().unwrap_or("").to_ascii_lowercase();
  if ["con", "prn", "aux", "nul"].contains(&stem.as_str()) || ((stem.starts_with("com") || stem.starts_with("lpt")) && stem.len() == 4) { n = format!("_{n}"); }
  if n.is_empty() || n == "." || n == ".." { n = "song".into(); }
  if n.chars().count() > 180 { n = n.chars().take(170).collect(); }
  n
}
/// "Song (2).mp3" for the second "Song.mp3".
pub fn with_number(name: &str, i: u32) -> String {
  match name.rfind('.') { Some(d) if d > 0 => format!("{} ({}){}", &name[..d], i, &name[d..]), _ => format!("{name} ({i})") }
}

/// A song moved from the incoming folder into a music folder (`to`, one GLUE Home knows), never overwriting: its new
/// path. Another drive: copied, then removed.
pub fn move_to(incoming: &Path, name: &str, to: &Path) -> Result<String, String> {
  let clean = safe_name(name);
  let from = incoming.join(&clean);
  if !from.is_file() { return Err("that song isn't in the incoming folder any more".into()); }
  if !to.is_dir() { return Err("that music folder isn't reachable right now".into()); }
  let (mut fin, mut i) = (clean.clone(), 2);
  while to.join(&fin).exists() { fin = with_number(&clean, i); i += 1; }
  let target = to.join(&fin);
  if fs::rename(&from, &target).is_err() {
    fs::copy(&from, &target).map_err(|e| e.to_string())?;
    fs::remove_file(&from).map_err(|e| e.to_string())?;
  }
  Ok(target.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn names_safe_everywhere() {
    assert_eq!(safe_name("a/b\\Song?.mp3"), "Song_.mp3");
    assert_eq!(safe_name("con.mp3"), "_con.mp3");
    assert_eq!(safe_name("..."), "song");
    assert_eq!(with_number("Song.mp3", 2), "Song (2).mp3");
    assert_eq!(with_number(".hidden", 3), ".hidden (3)");
  }
  #[test]
  fn moves_without_overwriting() {
    let t = std::env::temp_dir().join(format!("glue-incoming-{}", std::process::id()));
    let (inc, music) = (t.join("in"), t.join("music"));
    fs::create_dir_all(&inc).unwrap(); fs::create_dir_all(&music).unwrap();
    fs::write(inc.join("Song.mp3"), b"new").unwrap(); fs::write(inc.join("x.part"), b"").unwrap(); fs::write(music.join("Song.mp3"), b"old").unwrap();
    assert_eq!(list(&inc).len(), 1);
    let p = move_to(&inc, "Song.mp3", &music).unwrap();
    assert!(p.ends_with("Song (2).mp3"));
    assert_eq!(fs::read(music.join("Song.mp3")).unwrap(), b"old");
    assert!(move_to(&inc, "Song.mp3", &music).is_err());
    fs::remove_dir_all(&t).unwrap();
  }
}
