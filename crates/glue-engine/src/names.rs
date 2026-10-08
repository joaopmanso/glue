//! Names as src/core/library/names.ts judges them, for the cover look-up (`bare`, ADR 0086, 0156): the same keys as the
//! website's, since they name what's kept (`f/<hash>.txt`). Held to it by tests/golden/covers.json.
//! JavaScript's order is kept: lowercase first, then NFKD (so "™" comes out "TM"), its `\b` ASCII-only.
use regex::Regex;
use std::sync::LazyLock;
use unicode_normalization::UnicodeNormalization;

static AND: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"&|(?-u:\b)and(?-u:\b)").unwrap());
static NOT_WORD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[^\p{L}\p{N}]+").unwrap());
static FEATURING: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?-u:\b)(feat|ft|featuring)(?-u:\b)\.?[^()\[\]]*").unwrap());
static BRACKETS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\([^)]*\)|\[[^\]]*\]").unwrap());

/// Lowercase, decomposed, without combining accents (U+0300–U+036F).
fn lower(s: &str) -> String { s.to_lowercase().nfkd().filter(|c| !('\u{300}'..='\u{36f}').contains(c)).collect() }
/// Letters and digits of any script, one space apart, without "&" or "and".
fn spaced(s: &str) -> String { NOT_WORD.replace_all(&AND.replace_all(s, " "), " ").trim().to_string() }
/// `fold`: lowercase letters and digits of any script, one space apart, without accents, "&" or "and".
pub fn fold(s: &str) -> String { spaced(&lower(s)) }
/// Words that make another version of a song (`MARK`), read from the title's (…) and […] parts and what follows " - ".
static MARK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?-u:\b)(instrumental|inst|a ?cappella|acappella|acapella|live|unplugged|remix|dub|vip|bootleg|acoustic|demo|extended|radio edit|radio version|edit|rework|flip|mashup|karaoke|reprise|clean version|clean)(?-u:\b)").unwrap());
static PARTS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[(\[]([^)\]]*)[)\]]").unwrap());
static DASH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s[-–—]\s").unwrap());
static SPACES: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+").unwrap());
static LIVE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?-u:\b)live(?-u:\b)").unwrap());
/// A song's version (`versionOf`): its version words, the same spelled one way, sorted, comma-joined ("" none).
pub fn version_of(title: &str, album: &str) -> String {
  let t = title.to_lowercase();
  let parts = PARTS.captures_iter(&t).map(|c| c[1].to_string()).collect::<Vec<_>>().join(" ") + " " + &DASH.split(&t).skip(1).collect::<Vec<_>>().join(" ");
  let mut marks: Vec<String> = vec![];
  for m in MARK.captures_iter(&parts) {
    let w = SPACES.replace_all(&m[1], " ").to_string();
    let w = match w.as_str() { "inst" => "instrumental", "a cappella" | "acappella" => "acapella", "radio edit" | "radio version" => "edit", "clean version" => "clean", x => x }.to_string();
    if !marks.contains(&w) { marks.push(w); }
  }
  if LIVE.is_match(&album.to_lowercase()) && !marks.iter().any(|m| m == "live") { marks.push("live".into()); }
  marks.sort_by(|a, b| glue_store::json::utf16_cmp(a, b));
  marks.join(",")
}

/// What a (…) part may say without naming another recording (`RELEASE`), besides the version words.
static RELEASE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?-u:\b)(album|version|original|mix|single|lp|ep|mono|stereo|re ?master(ed)?|digital(ly)?|mastered|explicit|bonus|track|deluxe|edition|anniversary|expanded)(?-u:\b)").unwrap());
static WITH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*(feat|ft|featuring|with)(?-u:\b)").unwrap());
static NOT_LETTER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[^\p{L}]+").unwrap());
static SQUARE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\[[^\]]*\]").unwrap());
static ROUND: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\(([^)]*)\)").unwrap());
fn says_nothing(inside: &str) -> bool {
  WITH.is_match(inside) || NOT_LETTER.replace_all(&RELEASE.replace_all(&MARK.replace_all(inside, " "), " "), "").is_empty()
}
/// A song's or an artist's name as GLUE compares it (`songName`, ADR 0145): `fold`, without […] parts, a featuring
/// credit, or (…) parts that only say the release or the version; other (…) parts are part of the name.
pub fn song_name(s: &str) -> String {
  let l = lower(s);
  let t = FEATURING.replace_all(&l, " ");
  let t = SQUARE.replace_all(&t, " ");
  let t = ROUND.replace_all(&t, |c: &regex::Captures| if says_nothing(&c[1]) { " ".to_string() } else { c[0].to_string() });
  let r = spaced(&t);
  if r.is_empty() { fold(s) } else { r }
}

/// `bare`: without any (…) or […] part or a featuring credit (a name that's all of those: itself, folded).
pub fn bare(s: &str) -> String {
  let l = lower(s);
  let b = spaced(&BRACKETS.replace_all(&FEATURING.replace_all(&l, " "), " "));
  if b.is_empty() { fold(s) } else { b }
}
