//! Covers looked up on public services for songs whose tags have none (ADR 0086), as src/core/library/coverSearch.ts
//! and home/ui/lookup.ts did it in GLUE Home's service page (ADR 0156): Deezer, then iTunes, then MusicBrainz's Cover
//! Art Archive, one look-up at a time and gently (MusicBrainz asks for at most one request a second). A pick needs the
//! same artist and the same album (or song), so a search that finds something else gives no cover rather than a wrong
//! one. What's found is kept like any cover (`a/<hash>-<px>.jpg`); per album (or song) the result in
//! `f/<key hash>.txt`: the cover's hash, '' when nothing matched (asked again after a month), or 'x' when the user
//! said it was the wrong one (never again). Only the artist and album or title go out. tests/golden/covers.json holds
//! it to the website's.
use crate::names::bare;
use crate::{Engine, Host};
use glue_store::dir::Dir;
use regex::Regex;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashSet, VecDeque};
use std::sync::{LazyLock, Mutex};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Query { pub artist: String, pub album: String, pub title: String }
impl Query {
  pub fn from_json(v: &Value) -> Query {
    let s = |k: &str| v[k].as_str().unwrap_or("").to_string();
    Query { artist: s("artist"), album: s("album"), title: s("title") }
  }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Service { Deezer, Itunes, Musicbrainz }
pub const SERVICES: [Service; 3] = [Service::Deezer, Service::Itunes, Service::Musicbrainz];
impl Service { pub fn name(self) -> &'static str { match self { Service::Deezer => "deezer", Service::Itunes => "itunes", Service::Musicbrainz => "musicbrainz" } } }

static WITH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r" with .*$").unwrap());
static ARTISTS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\s*(?:,|&|(?-u:\b)and(?-u:\b)|(?-u:\b)x(?-u:\b)|(?-u:\b)vs(?-u:\b)\.?)\s*").unwrap());
static ART_SIZE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"/\d+x\d+bb\.").unwrap());

/// The shared name (`bare`), also without a "with …" tail or a leading "the", and no spaces.
pub fn norm(s: &str) -> String {
  let b = WITH.replace(&bare(s), "").into_owned();
  b.strip_prefix("the ").unwrap_or(&b).replace(' ', "")
}
/// JavaScript's string length (UTF-16 code units).
fn js_len(s: &str) -> usize { s.encode_utf16().count() }
/// The same name, give or take extra words on one side ("Album" vs "Album Deluxe Edition").
pub fn same(a: &str, b: &str) -> bool {
  let (x, y) = (norm(a), norm(b));
  if x.is_empty() || y.is_empty() { return false; }
  x == y || (js_len(&x).min(js_len(&y)) >= 4 && (x.contains(&y) || y.contains(&x)))
}
/// One of the artists matches ("A & B" finds "A").
fn same_artist(want: &str, got: &str) -> bool {
  let parts = |s: &str| -> Vec<String> { ARTISTS.split(s).filter(|p| !p.is_empty()).map(String::from).collect() };
  same(want, got) || parts(want).iter().any(|w| parts(got).iter().any(|g| same(w, g)))
}

/// What is searched for: its album when it has one, else the song. None: not enough to search.
pub fn query_of(q: &Query) -> Option<(bool, String, String)> {
  let (artist, album, title) = (q.artist.trim(), q.album.trim(), q.title.trim());
  if artist.is_empty() { return None; }
  if !album.is_empty() { return Some((true, artist.into(), album.into())); }
  (!title.is_empty()).then(|| (false, artist.into(), title.into()))
}
/// The key a look-up is kept under: an album's songs share one.
pub fn lookup_key(q: &Query) -> Option<String> {
  let (album, artist, name) = query_of(q)?;
  Some(format!("{}:{}|{}", if album { "album" } else { "song" }, norm(&artist), norm(&name)))
}
/// Where a look-up's result is kept (lookup.ts `fKey`).
pub fn kept_at(key: &str) -> String {
  let h = Sha256::digest(key.as_bytes());
  format!("f/{}.txt", &h.iter().map(|b| format!("{b:02x}")).collect::<String>()[..32])
}

/// JavaScript's `encodeURIComponent`.
fn enc(s: &str) -> String {
  let mut out = String::new();
  for b in s.bytes() {
    if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) { out.push(b as char) } else { out.push_str(&format!("%{b:02X}")) }
  }
  out
}
fn quote(s: &str) -> String { format!("\"{}\"", s.replace('"', "")) }
pub fn search_url(service: Service, q: &Query) -> Option<String> {
  let (album, artist, name) = query_of(q)?;
  Some(match service {
    Service::Deezer if album => format!("https://api.deezer.com/search/album?limit=10&q={}", enc(&format!("artist:{} album:{}", quote(&artist), quote(&name)))),
    Service::Deezer => format!("https://api.deezer.com/search?limit=10&q={}", enc(&format!("artist:{} track:{}", quote(&artist), quote(&name)))),
    Service::Itunes => format!("https://itunes.apple.com/search?limit=15&media=music&entity={}&term={}", if album { "album" } else { "song" }, enc(&format!("{artist} {name}"))),
    Service::Musicbrainz => format!("https://musicbrainz.org/ws/2/{}/?fmt=json&limit=10&query={}", if album { "release" } else { "recording" },
      enc(&format!("artist:{} AND {}{}", quote(&artist), if album { "release:" } else { "recording:" }, quote(&name)))),
  })
}

/// From a service's answer: the address of the matching cover's picture (MusicBrainz: the Cover Art Archive's, which
/// may have none), or None.
pub fn pick(service: Service, q: &Query, answer: &Value) -> Option<String> {
  let (album, artist, name) = query_of(q)?;
  let s = |v: &Value| v.as_str().unwrap_or("").to_string();
  let items = |k: &str| answer.get(k).and_then(|x| x.as_array()).cloned().unwrap_or_default();
  match service {
    Service::Deezer => items("data").into_iter().find_map(|it| {
      let cover = if album { it.get("cover_xl").filter(|c| !c.is_null()).or(it.get("cover_big")) } else { it["album"].get("cover_xl").filter(|c| !c.is_null()).or(it["album"].get("cover_big")) };
      let cover = cover.and_then(|c| c.as_str()).filter(|c| !c.is_empty())?;
      (same_artist(&artist, &s(&it["artist"]["name"])) && same(&name, &s(&it["title"]))).then(|| cover.to_string())
    }),
    Service::Itunes => items("results").into_iter().find_map(|it| {
      let art = it["artworkUrl100"].as_str().filter(|a| !a.is_empty())?;
      let n = s(&it[if album { "collectionName" } else { "trackName" }]);
      (same_artist(&artist, &s(&it["artistName"])) && same(&name, &n)).then(|| ART_SIZE.replace(art, "/600x600bb.").into_owned())
    }),
    Service::Musicbrainz => items(if album { "releases" } else { "recordings" }).into_iter().find_map(|it| {
      let credit = it["artist-credit"].as_array().map(|a| a.iter().map(|c| s(&c["name"])).collect::<Vec<_>>().join(" & ")).unwrap_or_default();
      if !same_artist(&artist, &credit) || !same(&name, &s(&it["title"])) { return None; }
      let release = if album { s(&it["id"]) } else { s(&it["releases"][0]["id"]) };
      (!release.is_empty()).then(|| format!("https://coverartarchive.org/release/{release}/front-500"))
    }),
  }
}

const RETRY_AFTER: i64 = 30 * 86_400_000;
const GAP: [i64; 3] = [250, 400, 1100];

/// The look-ups waiting, one running at a time; when each service was last asked.
#[derive(Default)]
pub struct Lookups { q: Mutex<(VecDeque<Query>, HashSet<String>, bool)>, last: Mutex<[i64; 3]>, pub counts: Mutex<(u32, u32)> }

fn now() -> i64 { crate::now().0 }

impl<H: Host> Engine<H> {
  /// What's known for this song's album: a cover hash, '' nothing (for now), 'x' refused, or None (not looked up yet,
  /// or long enough ago to look again).
  pub fn cover_known(&self, q: &Query) -> Option<String> {
    let Some(key) = lookup_key(q) else { return Some(String::new()) };
    let b = self.cache_dir().read_bytes(&kept_at(&key)).ok().flatten()?;
    let t = String::from_utf8_lossy(&b).into_owned();
    let (hash, at) = t.split_once('\n').unwrap_or((&t, ""));
    if hash.is_empty() && now() - at.parse::<i64>().unwrap_or(0) > RETRY_AFTER { return None; }
    Some(hash.to_string())
  }
  fn cover_remember(&self, q: &Query, hash: &str) {
    if let Some(key) = lookup_key(q) { let _ = self.cache_dir().write_bytes(&kept_at(&key), format!("{hash}\n{}", now()).as_bytes()); }
  }
  /// The user said this album's found cover is wrong: not shown, and not looked for again.
  pub fn cover_refuse(&self, q: &Query) { self.cover_remember(q, "x"); }
  /// Look this song's album up soon (once, however many songs of it ask).
  pub fn cover_want(&self, q: Query) {
    let Some(key) = lookup_key(&q) else { return };
    {
      let mut g = self.devices.lookups.q.lock().unwrap();
      if !g.1.insert(key) { return; }
      g.0.push_back(q);
      if std::mem::replace(&mut g.2, true) { return; }
    }
    let Some(me) = self.arc() else { return };
    std::thread::spawn(move || loop {
      let next = { let mut g = me.devices.lookups.q.lock().unwrap(); match g.0.pop_front() { Some(q) => q, None => { g.2 = false; return; } } };
      if me.cover_known(&next).is_none() { let h = me.cover_find(&next); me.cover_remember(&next, &h); }
      if let Some(k) = lookup_key(&next) { me.devices.lookups.q.lock().unwrap().1.remove(&k); }
    });
  }
  fn cover_ask(&self, service: Service, url: &str) -> Result<Vec<u8>, String> {
    let i = service as usize;
    let wait = { self.devices.lookups.last.lock().unwrap()[i] + GAP[i] - now() };
    if wait > 0 { std::thread::sleep(std::time::Duration::from_millis(wait as u64)); }
    self.devices.lookups.last.lock().unwrap()[i] = now();
    self.host.web_get(url)
  }
  /// Each service in turn; the first matching picture becomes the cover (made and kept): its hash, '' none.
  fn cover_find(&self, q: &Query) -> String {
    self.devices.lookups.counts.lock().unwrap().0 += 1;
    for s in SERVICES {
      let Some(url) = search_url(s, q) else { return String::new() };
      let found = self.cover_ask(s, &url).ok().and_then(|b| serde_json::from_slice::<Value>(&b).ok()).and_then(|a| pick(s, q, &a));
      let Some(found) = found else { continue };
      // The Cover Art Archive answers 404 when a release has no front.
      let Ok(img) = self.cover_ask(s, &found) else { continue };
      let Ok(c) = glue_audio::out::cover::from_image(&img) else { continue };
      if self.keep_cover(&c).is_err() { continue; }
      self.devices.lookups.counts.lock().unwrap().1 += 1;
      return c.hash;
    }
    String::new()
  }
  /// A cover's two JPEGs kept (`a/<hash>-64.jpg`, `-320.jpg`), an album's songs sharing them.
  pub fn keep_cover(&self, c: &glue_audio::out::cover::Cover) -> Result<(), String> {
    self.cache_dir().write_bytes(&format!("a/{}-64.jpg", c.hash), &c.small)?;
    self.cache_dir().write_bytes(&format!("a/{}-320.jpg", c.hash), &c.large)
  }
}
