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
/// `bare`: without any (…) or […] part or a featuring credit (a name that's all of those: itself, folded).
pub fn bare(s: &str) -> String {
  let l = lower(s);
  let b = spaced(&BRACKETS.replace_all(&FEATURING.replace_all(&l, " "), " "));
  if b.is_empty() { fold(s) } else { b }
}
