//! A store opened as this computer's own writes nothing once its collection became shared (ADR 0161).
use glue_store::dir::{Dir, MemDir};
use glue_store::store::{LoadOpts, Store, OUTDATED};
use serde_json::json;

#[test]
fn a_store_opened_as_its_own_writes_nothing_into_a_shared_collection() {
  let base = "profiles/p1/collections/c1";
  let meta = json!({ "schemaVersion": 1, "id": "c1", "name": "Mine", "createdAt": "2026-01-01T00:00:00.000Z", "roots": [] });
  let dir = MemDir::with([(format!("{base}/collection.json"), meta.to_string())]);
  let clock = Box::new(|| (1_700_000_000_000i64, "2023-11-14T22:13:20.000Z".to_string()));
  let mut s = Store::load(dir, "p1", "c1", LoadOpts { me: None, name: None, shown_only: false }, clock).unwrap();
  s.apply(&json!({ "m": "tracks", "ts": [{ "id": "ab01", "status": "unlinked", "rootId": null, "relPath": null, "importPath": "D:/x.mp3", "title": "Song" }] }));
  // Made shared under it (the website, in the middle of a save).
  let shared = json!({ "schemaVersion": 1, "id": "c1", "name": "Mine", "createdAt": "2026-01-01T00:00:00.000Z", "shared": true, "rootsBy": {}, "members": { "desk": { "profile": "p1", "name": "Desktop" } } });
  s.root.write(&format!("{base}/collection.json"), &shared.to_string()).unwrap();
  let before = s.root.snapshot();
  assert_eq!(s.flush(), Err(OUTDATED.to_string()));
  assert_eq!(s.root.snapshot(), before);
  assert!(!s.has_pending());
}
