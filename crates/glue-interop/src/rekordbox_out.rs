//! A rekordbox XML written (ADR 0195): GLUE's playlists for Engine DJ (its rekordbox library) and rekordbox, the inverse
//! of `rekordbox::parse_rekordbox_xml`. Pure: the songs and the tree in, the file's text out.
use crate::types::{CuePoint, Grid};
use std::fmt::Write;

/// A song as the file has it. `path` is its absolute path on this computer.
#[derive(Clone, Debug, Default)]
pub struct XmlTrack {
  pub id: u64,
  pub path: String,
  pub name: String, pub artist: String, pub album: String, pub genre: String, pub label: String, pub comment: String, pub year: String,
  /// Seconds.
  pub duration: Option<f64>,
  pub size: Option<f64>,
  /// kbps.
  pub bitrate: Option<f64>,
  pub sample_rate: Option<f64>,
  /// GLUE's stars, 0.5–5.
  pub rating: Option<f64>,
  pub bpm: Option<f64>,
  /// As rekordbox writes keys: "Am", "F#".
  pub key: Option<String>,
  /// YYYY-MM-DD.
  pub date_added: Option<String>,
  pub grid: Option<Grid>,
  pub cues: Vec<CuePoint>,
}

/// The playlists' tree: a folder, or a playlist of songs (their `XmlTrack::id`).
#[derive(Clone, Debug)]
pub enum XmlNode { Folder { name: String, children: Vec<XmlNode> }, Playlist { name: String, tracks: Vec<u64> } }

fn esc(s: &str) -> String {
  let mut o = String::with_capacity(s.len());
  for c in s.chars() {
    match c {
      '&' => o.push_str("&amp;"), '<' => o.push_str("&lt;"), '>' => o.push_str("&gt;"), '"' => o.push_str("&quot;"), '\'' => o.push_str("&apos;"),
      // XML 1.0 has no other control characters.
      c if (c as u32) < 0x20 && !matches!(c, '\t' | '\n' | '\r') => {}
      c => o.push(c),
    }
  }
  o
}

/// `file://localhost/C:/Music/a%20b.mp3`, as rekordbox writes a song's place.
pub fn path_to_file_url(path: &str) -> String {
  let p = path.replace('\\', "/");
  let mut o = String::from("file://localhost");
  if !p.starts_with('/') { o.push('/'); }
  for b in p.bytes() {
    if b.is_ascii_alphanumeric() || b"/:-._~!$'()*+,;=@".contains(&b) { o.push(b as char); } else { let _ = write!(o, "%{b:02X}"); }
  }
  o
}

/// "Am", "F#", "C#m" from the analysis' key (tonic 0 = C).
pub fn key_text(tonic: i64, minor: bool) -> Option<String> {
  const NAMES: [&str; 12] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  // rekordbox's spelling: flats for these majors and minors as its own analysis writes them.
  const MAJOR: [&str; 12] = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  let i = usize::try_from(tonic).ok().filter(|&i| i < 12)?;
  Some(if minor { format!("{}m", NAMES[i]) } else { MAJOR[i].to_string() })
}

fn kind_of(path: &str) -> &'static str {
  match path.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
    "mp3" => "MP3 File", "wav" | "wave" => "WAV File", "aif" | "aiff" => "AIFF File", "flac" => "FLAC File",
    "m4a" | "mp4" | "aac" => "M4A File", "ogg" | "opus" => "OGG File", _ => "",
  }
}

fn n2(x: f64) -> String { format!("{:.2}", x) }
fn n3(x: f64) -> String { format!("{:.3}", x) }

fn track(o: &mut String, t: &XmlTrack) {
  let _ = write!(o, "    <TRACK TrackID=\"{}\" Name=\"{}\" Artist=\"{}\" Album=\"{}\" Genre=\"{}\" Label=\"{}\" Comments=\"{}\"", t.id, esc(&t.name), esc(&t.artist), esc(&t.album), esc(&t.genre), esc(&t.label), esc(&t.comment));
  let kind = kind_of(&t.path);
  if !kind.is_empty() { let _ = write!(o, " Kind=\"{kind}\""); }
  if let Some(s) = t.size.filter(|s| *s > 0.0) { let _ = write!(o, " Size=\"{}\"", s.round() as u64); }
  if let Some(d) = t.duration.filter(|d| *d > 0.0) { let _ = write!(o, " TotalTime=\"{}\"", d.round() as u64); }
  if !t.year.is_empty() { let _ = write!(o, " Year=\"{}\"", esc(&t.year)); }
  if let Some(b) = t.bpm.filter(|b| *b > 0.0) { let _ = write!(o, " AverageBpm=\"{}\"", n2(b)); }
  if let Some(d) = &t.date_added { let _ = write!(o, " DateAdded=\"{}\"", esc(d)); }
  if let Some(b) = t.bitrate.filter(|b| *b > 0.0) { let _ = write!(o, " BitRate=\"{}\"", b.round() as u64); }
  if let Some(s) = t.sample_rate.filter(|s| *s > 0.0) { let _ = write!(o, " SampleRate=\"{}\"", s.round() as u64); }
  if let Some(r) = t.rating { let _ = write!(o, " Rating=\"{}\"", (r.round().clamp(0.0, 5.0) * 51.0) as u64); }
  if let Some(k) = &t.key { let _ = write!(o, " Tonality=\"{}\"", esc(k)); }
  let _ = write!(o, " Location=\"{}\"", esc(&path_to_file_url(&t.path)));
  let mut cues: Vec<&CuePoint> = t.cues.iter().filter(|c| c.t.is_finite() && c.t >= 0.0).collect();
  cues.sort_by(|a, b| a.t.partial_cmp(&b.t).unwrap_or(std::cmp::Ordering::Equal));
  if t.grid.is_none() && cues.is_empty() { o.push_str("/>\n"); return; }
  o.push_str(">\n");
  if let Some(g) = t.grid.filter(|g| g.bpm > 0.0 && g.bpm.is_finite() && g.beat0.is_finite()) {
    // Its first beat is beat Battito (1–4) of a bar: GLUE's `bar` is which of each four beats starts one.
    let battito = ((4 - (g.bar.round() as i64).rem_euclid(4)) % 4) + 1;
    let _ = writeln!(o, "      <TEMPO Inizio=\"{}\" Bpm=\"{}\" Metro=\"4/4\" Battito=\"{battito}\"/>", n3(g.beat0), n2(g.bpm));
  }
  for c in cues {
    let end = c.end.filter(|e| e.is_finite() && *e > c.t);
    let ty = if end.is_some() { "4" } else { match c.kind.as_str() { "load" => "3", _ => "0" } };
    let slot = c.num.filter(|n| (0.0..8.0).contains(n) && n.fract() == 0.0).map(|n| n as i64).unwrap_or(-1);
    let _ = write!(o, "      <POSITION_MARK Name=\"{}\" Type=\"{ty}\" Start=\"{}\"", esc(&c.name), n3(c.t));
    if let Some(e) = end { let _ = write!(o, " End=\"{}\"", n3(e)); }
    let _ = write!(o, " Num=\"{slot}\"");
    if let Some((r, g, b)) = c.color.as_deref().and_then(rgb) { let _ = write!(o, " Red=\"{r}\" Green=\"{g}\" Blue=\"{b}\""); }
    o.push_str("/>\n");
  }
  o.push_str("    </TRACK>\n");
}

fn rgb(hex: &str) -> Option<(u8, u8, u8)> {
  let h = hex.strip_prefix('#')?;
  if h.len() != 6 { return None; }
  let p = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).ok();
  Some((p(0)?, p(2)?, p(4)?))
}

fn node(o: &mut String, n: &XmlNode, depth: usize) {
  let pad = "  ".repeat(depth);
  match n {
    XmlNode::Folder { name, children } => {
      let _ = writeln!(o, "{pad}<NODE Type=\"0\" Name=\"{}\" Count=\"{}\">", esc(name), children.len());
      for c in children { node(o, c, depth + 1); }
      let _ = writeln!(o, "{pad}</NODE>");
    }
    XmlNode::Playlist { name, tracks } => {
      let _ = write!(o, "{pad}<NODE Type=\"1\" Name=\"{}\" KeyType=\"0\" Entries=\"{}\"", esc(name), tracks.len());
      if tracks.is_empty() { o.push_str("/>\n"); return; }
      o.push_str(">\n");
      for t in tracks { let _ = writeln!(o, "{pad}  <TRACK Key=\"{t}\"/>"); }
      let _ = writeln!(o, "{pad}</NODE>");
    }
  }
}

/// The file: every song once in COLLECTION, the tree under PLAYLISTS' ROOT.
pub fn write_rekordbox_xml(tracks: &[XmlTrack], tree: &[XmlNode], version: &str) -> String {
  let mut o = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<DJ_PLAYLISTS Version=\"1.0.0\">\n");
  let _ = writeln!(o, "  <PRODUCT Name=\"GLUE\" Version=\"{}\" Company=\"GLUE\"/>", esc(version));
  let _ = writeln!(o, "  <COLLECTION Entries=\"{}\">", tracks.len());
  for t in tracks { track(&mut o, t); }
  o.push_str("  </COLLECTION>\n  <PLAYLISTS>\n");
  let _ = writeln!(o, "    <NODE Type=\"0\" Name=\"ROOT\" Count=\"{}\">", tree.len());
  for n in tree { node(&mut o, n, 3); }
  o.push_str("    </NODE>\n  </PLAYLISTS>\n</DJ_PLAYLISTS>\n");
  o
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::rekordbox::parse_rekordbox_xml;
  use crate::types::grid_at;

  fn song(id: u64, path: &str) -> XmlTrack { XmlTrack { id, path: path.into(), name: format!("Song {id}"), artist: "A & B".into(), ..Default::default() } }

  #[test]
  fn what_it_writes_reads_back_the_same() {
    let mut a = song(1, r"C:\Music\Dub & Bass\01 <Intro> é.mp3");
    a.album = "Album \"x\"".into(); a.genre = "Dubstep".into(); a.label = "Label".into(); a.comment = "c'mon".into(); a.year = "2024".into();
    a.duration = Some(301.4); a.size = Some(1234567.0); a.bitrate = Some(320.0); a.sample_rate = Some(44100.0); a.rating = Some(4.0);
    a.bpm = Some(140.0); a.key = key_text(9, true); a.date_added = Some("2026-11-26".into());
    a.grid = grid_at(140.0, 0.25 + 3.0 * 60.0 / 140.0);
    a.cues = vec![
      CuePoint { t: 10.0, kind: "cue".into(), num: Some(0.0), name: "Drop".into(), color: Some("#ff0000".into()), end: None },
      CuePoint { t: 5.5, kind: "cue".into(), num: None, name: "".into(), color: None, end: None },
      CuePoint { t: 20.0, kind: "loop".into(), num: None, name: "Roll".into(), color: None, end: Some(21.714) },
    ];
    let b = song(2, "/Volumes/Drive/b.wav");
    let tree = vec![XmlNode::Folder { name: "GLUE".into(), children: vec![
      XmlNode::Playlist { name: "Set 1".into(), tracks: vec![2, 1] },
      XmlNode::Folder { name: "Inner".into(), children: vec![XmlNode::Playlist { name: "Empty".into(), tracks: vec![] }] },
    ] }];
    let xml = write_rekordbox_xml(&[a.clone(), b], &tree, "0.81.0");
    let lib = parse_rekordbox_xml(&xml, "GLUE.xml").unwrap();
    let t = &lib.tracks[0];
    assert_eq!(t.path, "C:/Music/Dub & Bass/01 <Intro> é.mp3");
    assert_eq!((t.title.as_str(), t.artist.as_str(), t.album.as_str(), t.comment.as_str(), t.year.as_str()), ("Song 1", "A & B", "Album \"x\"", "c'mon", "2024"));
    assert_eq!((t.duration, t.bpm, t.key.as_deref(), t.rating, t.size), (Some(301.0), Some(140.0), Some("Am"), Some(4.0), Some(1234567.0)));
    let g = t.grid.unwrap();
    let want = a.grid.unwrap();
    assert!((g.beat0 - want.beat0).abs() < 0.001 && g.bar == want.bar && g.bpm == want.bpm, "{g:?} vs {want:?}");
    assert_eq!(t.cue_list.len(), 3);
    assert_eq!((t.cue_list[0].t, t.cue_list[0].num), (5.5, None));
    assert_eq!((t.cue_list[1].num, t.cue_list[1].name.as_str(), t.cue_list[1].color.as_deref()), (Some(0.0), "Drop", Some("#ff0000")));
    assert_eq!((t.cue_list[2].kind.as_str(), t.cue_list[2].end), ("loop", Some(21.714)));
    assert_eq!(lib.tracks[1].path, "/Volumes/Drive/b.wav");
    let names: Vec<(&str, &str)> = lib.lists.iter().map(|l| (l.kind, l.name.as_str())).collect();
    assert_eq!(names, vec![("folder", "GLUE"), ("playlist", "Set 1"), ("folder", "Inner"), ("playlist", "Empty")]);
    assert_eq!(lib.lists[1].items, vec!["2", "1"]);
  }

  #[test]
  fn every_bar_position_comes_back() {
    for bar in 0..4 {
      let g = Grid { bpm: 128.0, beat0: 0.1, bar: bar as f64 };
      let mut t = song(1, "C:/a.mp3"); t.grid = Some(g);
      let back = parse_rekordbox_xml(&write_rekordbox_xml(&[t], &[], "x"), "x").unwrap().tracks[0].grid.unwrap();
      assert_eq!(back.bar, bar as f64);
      assert!((back.beat0 - 0.1).abs() < 1e-9);
    }
  }

  #[test]
  fn keys_and_places() {
    assert_eq!(key_text(0, false).as_deref(), Some("C"));
    assert_eq!(key_text(1, true).as_deref(), Some("C#m"));
    assert_eq!(key_text(10, false).as_deref(), Some("Bb"));
    assert_eq!(key_text(12, false), None);
    assert_eq!(path_to_file_url(r"C:\a b\ç#.mp3"), "file://localhost/C:/a%20b/%C3%A7%23.mp3");
    assert_eq!(path_to_file_url("/Users/x/a.mp3"), "file://localhost/Users/x/a.mp3");
  }
}
