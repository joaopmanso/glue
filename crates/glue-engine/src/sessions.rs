//! Who may open a session with GLUE Home (ADR 0133), home/ui/sessions.ts in Rust (ADR 0157).
//! - One session per device's tab: the same tab connecting again replaces its own (it reconnected).
//! - At most `max`: a new one when full is refused, with why; nobody connected is dropped for it.
//! - A tab disconnected in the settings is refused until its time is up (it would only connect again).
//! - This computer's own browser (`own`) is always let in and never counted: the limit is for other devices (the user,
//!   2026-10-01). It normally uses the direct link on 127.0.0.1 anyway.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Admit { Ok { replaces: bool }, Full, Refused }

/// `has`: a session with this key is open; `others`: the sessions the limit counts (other devices').
pub fn admit(has: bool, others: usize, max: usize, refused_until: Option<i64>, now: i64, own: bool) -> Admit {
  if refused_until.unwrap_or(0) > now { return Admit::Refused; }
  if has { return Admit::Ok { replaces: true }; }
  if !own && others >= max { return Admit::Full; }
  Admit::Ok { replaces: false }
}

/// A session's key: its device and its tab. An older website sends no tab: each of its connections is its own.
pub fn session_key(from: &str, tab: Option<&str>, id: &str) -> String { format!("{from}/{}", tab.filter(|t| !t.is_empty()).unwrap_or(id)) }

/// The most at once, from the settings: 5 unless set, 1 to 50.
pub fn max_of(set: Option<f64>) -> usize {
  let n = set.filter(|n| *n != 0.0 && n.is_finite()).unwrap_or(5.0).round();
  n.clamp(1.0, 50.0) as usize
}

#[cfg(test)]
mod tests {
  use super::*;
  // Moved from tests/homeSessions.test.ts.
  #[test]
  fn who_may_open_a_session() {
    assert_eq!(admit(false, 1, 5, None, 0, false), Admit::Ok { replaces: false }, "a new tab while there is room");
    assert_eq!(admit(true, 2, 2, None, 0, false), Admit::Ok { replaces: true }, "the same tab again replaces its own, even when full");
    assert_eq!(admit(false, 2, 2, None, 0, false), Admit::Full);
    assert_eq!(admit(false, 0, 5, Some(1000), 999, false), Admit::Refused, "disconnected in the settings: until its hour is up");
    assert_eq!(admit(false, 0, 5, Some(1000), 1001, false), Admit::Ok { replaces: false });
    assert_eq!(admit(false, 2, 2, None, 0, true), Admit::Ok { replaces: false }, "this computer's own browser is always let in");
  }
  #[test]
  fn keys_and_the_most_at_once() {
    assert_eq!(session_key("ph", Some("tab1"), "h1"), "ph/tab1");
    assert_eq!(session_key("ph", None, "h1"), "ph/h1");
    assert_eq!(max_of(None), 5);
    assert_eq!(max_of(Some(0.0)), 5);
    assert_eq!(max_of(Some(1.0)), 1);
    assert_eq!(max_of(Some(500.0)), 50);
  }
}
