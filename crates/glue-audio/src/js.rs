//! JavaScript's numbers and strings, as the TypeScript this crate ports sees them: `Math` (libm: within 2 ulp of V8,
//! tests/jsmath.rs), `Math.round`, `toFixed`, number-to-string, `ToInt32`, `String.prototype.trim`.

pub fn cos(x: f64) -> f64 { libm::cos(x) }
pub fn sin(x: f64) -> f64 { libm::sin(x) }
pub fn log(x: f64) -> f64 { libm::log(x) }
pub fn log2(x: f64) -> f64 { libm::log2(x) }
pub fn log10(x: f64) -> f64 { libm::log10(x) }
pub fn exp(x: f64) -> f64 { libm::exp(x) }
/// `Math.pow`; `x ** 2` and `pow(x, 2)` are `x * x` in V8 (fdlibm's special case), so callers square directly.
pub fn pow(x: f64, y: f64) -> f64 { libm::pow(x, y) }
pub fn atan2(y: f64, x: f64) -> f64 { libm::atan2(y, x) }
pub fn sqrt(x: f64) -> f64 { x.sqrt() }

/// `Math.round`: halves go up (towards +∞); -0.5..-0 gives -0.
pub fn round(x: f64) -> f64 {
  if !x.is_finite() { return x; }
  let f = x.floor();
  let r = if x - f >= 0.5 { f + 1.0 } else { f };
  if r == 0.0 && x.is_sign_negative() { -0.0 } else { r }
}

/// `Math.max(a, b)` / `Math.min(a, b)`: NaN if either is.
pub fn max(a: f64, b: f64) -> f64 { if a.is_nan() || b.is_nan() { f64::NAN } else if a > b || (a == b && !a.is_sign_negative()) { a } else { b } }
pub fn min(a: f64, b: f64) -> f64 { if a.is_nan() || b.is_nan() { f64::NAN } else if a < b || (a == b && a.is_sign_negative()) { a } else { b } }

/// ECMAScript ToInt32: what `x | 0`, `x << n` and an `Int32Array` store do to a number.
pub fn to_int32(x: f64) -> i32 {
  if !x.is_finite() { return 0; }
  let t = x.trunc();
  (t.rem_euclid(4294967296.0) as u64 as u32) as i32
}

/// `Number.prototype.toFixed(d)`: the exact decimal value of the double, rounded half up at `d` places.
pub fn to_fixed(x: f64, d: usize) -> String {
  if x.is_nan() { return "NaN".into(); }
  if x.abs() >= 1e21 || x.is_infinite() { return num_str(x); }
  let neg = x < 0.0;
  // Rust prints a double's exact decimal expansion with enough places (1100 covers every double).
  let s = format!("{:.1100}", x.abs());
  let (int, frac) = s.split_once('.').unwrap();
  let mut digits: Vec<u8> = int.bytes().chain(frac.bytes().take(d)).collect();
  let next = frac.as_bytes().get(d).copied().unwrap_or(b'0');
  if next >= b'5' {
    let mut i = digits.len();
    loop {
      if i == 0 { digits.insert(0, b'1'); break; }
      i -= 1;
      if digits[i] == b'9' { digits[i] = b'0'; } else { digits[i] += 1; break; }
    }
  }
  let il = digits.len() - d;
  let mut out = String::new();
  if neg { out.push('-'); }   // the spec keeps the sign of any x < 0: (-0.04).toFixed(1) is "-0.0"
  out.push_str(std::str::from_utf8(&digits[..il]).unwrap());
  if d > 0 { out.push('.'); out.push_str(std::str::from_utf8(&digits[il..]).unwrap()); }
  out
}

/// A number as JavaScript prints it (`String(x)`, `'' + x`), for the values the verdict's text uses.
pub fn num_str(x: f64) -> String {
  if x.is_nan() { return "NaN".into(); }
  if x.is_infinite() { return if x > 0.0 { "Infinity".into() } else { "-Infinity".into() }; }
  if x == 0.0 { return "0".into(); }
  if x.fract() == 0.0 && x.abs() < 1e21 { return format!("{}", x as i128); }
  let a = x.abs();
  if (1e-6..1e21).contains(&a) { return format!("{x}"); }
  // Exponent form (rare here): shortest digits, as JavaScript writes them (1e-7, 1.5e+21).
  let s = format!("{x:e}");
  let (m, e) = s.split_once('e').unwrap();
  let e: i32 = e.parse().unwrap();
  format!("{m}e{}{}", if e < 0 { "-" } else { "+" }, e.abs())
}

/// `+x.toFixed(d)`: the number the rounded text stands for.
pub fn fixed_num(x: f64, d: usize) -> f64 { to_fixed(x, d).parse().unwrap_or(f64::NAN) }

/// `toLocaleString('en-US')` for a whole number: 12,345.
pub fn grouped(n: i64) -> String {
  let s = n.abs().to_string();
  let mut out = String::new();
  for (i, c) in s.chars().enumerate() { if i > 0 && (s.len() - i) % 3 == 0 { out.push(','); } out.push(c); }
  if n < 0 { format!("-{out}") } else { out }
}

/// JavaScript's whitespace (`String.prototype.trim`), which isn't Rust's: U+FEFF is, U+0085 isn't.
pub fn is_space(c: char) -> bool {
  matches!(c, '\u{9}'..='\u{D}' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}
pub fn trim(s: &str) -> &str { s.trim_matches(is_space) }

/// `s.slice(0, n)` counted in UTF-16 units, as JavaScript counts (a split surrogate pair is dropped).
pub fn slice_utf16(s: &str, n: usize) -> &str {
  let mut units = 0;
  for (i, c) in s.char_indices() {
    let w = c.len_utf16();
    if units + w > n { return &s[..i]; }
    units += w;
  }
  s
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn fixed_like_js() {
    assert_eq!(to_fixed(2.25, 1), "2.3");        // the exact value is 2.25: half goes up (Rust would say 2.2)
    assert_eq!(to_fixed(1.005, 2), "1.00");      // 1.00499999…
    assert_eq!(to_fixed(16.1375, 1), "16.1");
    assert_eq!(to_fixed(-0.04, 1), "-0.0");
    assert_eq!(to_fixed(-0.0, 1), "0.0");
    assert_eq!(to_fixed(0.9999, 2), "1.00");
    assert_eq!(to_fixed(44.1, 2), "44.10");
    assert_eq!(fixed_num(44.1, 2), 44.1);
  }
  #[test]
  fn strings_like_js() {
    assert_eq!(num_str(96.0), "96");
    assert_eq!(num_str(44.1), "44.1");
    assert_eq!(num_str(-0.0), "0");
    assert_eq!(grouped(1234567), "1,234,567");
    assert_eq!(trim("\u{FEFF} a \u{85}"), "a \u{85}");
    assert_eq!(to_int32(4294967297.0), 1);
    assert_eq!(to_int32(-1.5), -1);
    assert_eq!(to_int32(2147483648.0), -2147483648);
  }
}
