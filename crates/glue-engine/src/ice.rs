//! Where WebRTC looks for a way to another device (ADR 0037, 0081), src/core/ice.ts for GLUE Home in Rust (ADR 0157):
//! the public STUN servers, plus GLUE Cloud's relay when the account's owner set one up (`/v1/turn`, asked with this
//! GLUE Home's credential). The answer is kept until an hour before the relay's credentials end, or 10 minutes without
//! one; the public servers when the ask fails.
use serde_json::{json, Value};
use std::sync::Mutex;

/// transfer.ts `ICE_SERVERS`.
pub fn public_servers() -> Vec<Value> { vec![json!({ "urls": ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] })] }

#[derive(Default)]
pub struct IceCache { known: Mutex<Option<(Vec<Value>, bool, i64)>> }

impl IceCache {
  /// The servers known now, without asking (None: ask).
  pub fn now(&self, at: i64) -> Option<Vec<Value>> { self.known.lock().unwrap().as_ref().filter(|k| k.2 > at).map(|k| k.0.clone()) }
  /// Is there a relay for connections that can't be direct?
  pub fn relay(&self) -> bool { self.known.lock().unwrap().as_ref().is_some_and(|k| k.1) }
  /// The servers: known, or asked for with `ask` (`/v1/turn`'s answer, `{ iceServers, ttl }`).
  pub fn get(&self, at: i64, ask: impl FnOnce() -> Result<String, String>) -> Vec<Value> {
    if let Some(s) = self.now(at) { return s; }
    let Ok(r) = ask().and_then(|t| serde_json::from_str::<Value>(&t).map_err(|e| e.to_string())) else { return public_servers() };
    let relays: Vec<Value> = r["iceServers"].as_array().into_iter().flatten().filter(|s| s["username"].as_str().is_some_and(|u| !u.is_empty())).cloned().collect();
    let ttl = r["ttl"].as_f64().unwrap_or(0.0);
    let secs = if relays.is_empty() { 600.0 } else { (ttl - 3600.0).max(600.0) };
    let mut servers = public_servers();
    let relay = !relays.is_empty();
    servers.extend(relays);
    *self.known.lock().unwrap() = Some((servers.clone(), relay, at + (secs * 1000.0) as i64));
    servers
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn kept_until_the_relay_ends_or_ten_minutes() {
    let c = IceCache::default();
    let turn = r#"{"iceServers":[{"urls":["turn:r.example:3478"],"username":"u","credential":"c"},{"urls":["stun:x"]}],"ttl":86400}"#;
    let s = c.get(0, || Ok(turn.into()));
    assert_eq!(s.len(), 2, "the public servers, and the relay (one without credentials left out)");
    assert!(c.relay());
    assert!(c.now((86400 - 3600) * 1000 - 1).is_some() && c.now((86400 - 3600) * 1000).is_none());
    let c = IceCache::default();
    assert_eq!(c.get(0, || Err("offline".into())), public_servers(), "the public ones when the ask fails");
    assert!(c.now(0).is_none(), "and asked again next time");
    assert_eq!(c.get(0, || Ok("{}".into())).len(), 1);
    assert!(c.now(599_999).is_some() && c.now(600_000).is_none() && !c.relay());
  }
}
