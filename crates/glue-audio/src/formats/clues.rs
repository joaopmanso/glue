//! src/core/formats/clues.ts: strings that rippers, encoders and downloaders leave in files. The patterns are ASCII, so
//! they run on the bytes with ASCII-only classes, as JavaScript's (non-unicode) regular expressions match them.
use crate::types::{Clue, FileInfo};
use regex::bytes::Regex;
use std::sync::OnceLock;

const CLUES: &[(&str, &str, &str)] = &[
  ("yt", r"(?i)(?:youtube\.com/watch\?v=|youtu\.be/|music\.youtube\.com)[\w\-=?&]{4,}", "YouTube URL embedded in the tags"),
  ("yt", r"(?i)yt-dlp|youtube-dl", "Downloaded with yt-dlp / youtube-dl"),
  ("yt", r"(?i)google/video-file", "Google video-file muxer (YouTube)"),
  ("yt", r"(?i)4K Video Downloader|ClipGrab|MediaHuman|Freemake|Any Video Converter|y2mate|ytmp3|savefrom|onlinevideoconverter", "Video downloader / converter"),
  ("stream", r"soundcloud\.com|SoundCloud", "SoundCloud"),
  ("stream", r"Audials|Streamripper|Deezloader|deemix|spotdl|SpotDL|Soundiiz", "Stream recorder / downloader"),
  ("store", r"Qobuz|HDtracks|7digital|TIDAL|Tidal|Deezer|Beatport|Bandcamp|bandcamp\.com|Spotify|Amazon Music", "Store or streaming service"),
  ("mp3", r"LAME ?3\.\d{2,3}|LAME3\.\d+|Lame 3\.\d+", "LAME MP3 encoder"),
  ("mp3", r"Fraunhofer|FhG IIS", "Fraunhofer MP3/AAC encoder"),
  ("lossy", r"Xiph\.Org libVorbis|libvorbis", "libVorbis encoder"),
  ("lossy", r"libopus \d", "libopus encoder"),
  ("lossy", r"Nero AAC|Nero Digital", "Nero AAC encoder"),
  ("ffmpeg", r"Lavf\d+\.\d+\.\d+", "FFmpeg muxer (libavformat)"),
  ("ffmpeg", r"Lavc\d+\.\d+\.\d+", "FFmpeg encoder (libavcodec)"),
  ("apple", r"iTunes \d|iTunNORM|Apple Music", "iTunes / Apple Music"),
  ("rip", r"Exact Audio Copy|EAC V\d", "Exact Audio Copy (CD ripper)"),
  ("rip", r"X Lossless Decoder|XLD \d", "XLD (CD ripper)"),
  ("rip", r"CUERipper|CUETools|whipper|morituri|Rubyripper|cdparanoia", "CD ripper"),
  ("rip", r"dBpoweramp", "dBpoweramp (ripper / converter)"),
  ("tool", r"(?i)foobar2000", "foobar2000"),
  ("tool", r"Audacity", "Audacity"),
  ("tool", r"\bSoX\b|libsoxr", "SoX resampler"),
  ("tool", r"Adobe Audition|iZotope|Sonic Studio|Saracon|Weiss", "Mastering / resampling software"),
  ("flac", r"reference libFLAC [\d.]+", "libFLAC encoder"),
];

fn patterns() -> &'static Vec<Regex> {
  static P: OnceLock<Vec<Regex>> = OnceLock::new();
  // (?-u): ASCII \w, \d and \b, and case folding only within ASCII, as JavaScript without the u flag.
  P.get_or_init(|| CLUES.iter().map(|(_, re, _)| Regex::new(&format!("(?-u){re}")).unwrap()).collect())
}

pub fn scan_clues(u8: &[u8], info: &FileInfo) -> Vec<Clue> {
  const H: usize = 1 << 20;
  let head = &u8[..u8.len().min(H)];
  let tail: &[u8] = if u8.len() > H { &u8[H.max(u8.len().saturating_sub(262144))..] } else { &[] };
  // The text JavaScript searches: [head, tail, the tags, vendor, encoder].join('\n'). Head and tail are windows-1252
  // there (one character a byte); non-ASCII never matches these patterns, so the bytes stand in for them.
  let mut text = Vec::with_capacity(head.len() + tail.len() + 1024);
  text.extend_from_slice(head); text.push(b'\n');
  text.extend_from_slice(tail); text.push(b'\n');
  let tags: Vec<&str> = info.tags.values().map(|s| s.as_str()).collect();
  text.extend_from_slice(tags.join("\n").as_bytes()); text.push(b'\n');
  text.extend_from_slice(info.vendor.as_bytes()); text.push(b'\n');
  text.extend_from_slice(info.encoder.as_bytes());
  let mut found = Vec::new();
  for ((kind, _, label), re) in CLUES.iter().zip(patterns()) {
    if let Some(m) = re.find(&text) {
      let printable: String = m.as_bytes().iter().filter(|&&c| (0x20..=0x7e).contains(&c)).map(|&c| c as char).take(70).collect();
      found.push(Clue { kind: (*kind).into(), label: (*label).into(), matched: printable });
    }
  }
  if info.brand.as_deref() == Some("dash") || info.compat_brands.as_ref().is_some_and(|c| c.iter().any(|b| b == "dash")) {
    found.push(Clue { kind: "yt".into(), label: "MP4 “dash” brand: DASH audio as YouTube streams it".into(), matched: "ftyp dash".into() });
  }
  if info.webm == Some(true) { found.push(Clue { kind: "web".into(), label: "WebM container, the way YouTube serves Opus".into(), matched: format!("{} / {}", info.container, info.codec) }); }
  found
}
