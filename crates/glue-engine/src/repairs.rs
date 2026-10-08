//! The repairs a collection gets when it opens (ADR 0166; the website's `openCollection` and `joinCopies`, which skip
//! them while GLUE Home runs, ADR 0162): songs naming an import that's gone lose it, songs without a file whose file is
//! here fold into the song that has it, and in a shared collection this computer's song that's another computer's song,
//! the same file, joins it. Once a collection a run, and again for the songs a sync brings.
use crate::{key, text, Engine, Host};
use glue_store::dir::{read_json, Dir, FsDir};
use glue_store::store::Store;

impl<H: Host> Engine<H> {
  /// The repairs, once a collection a run, when no tab is the writer (one that is does them itself).
  pub(crate) fn tidy_once(&self, p: &str, c: &str) {
    if self.host.lease_held() || !self.tidied.lock().unwrap().insert((p.to_string(), c.to_string())) { return; }
    if let Err(x) = self.tidy(p, c) { eprintln!("GLUE Home: couldn’t tidy the collection: {x}"); }
  }

  /// The repairs themselves: (songs tidied away, songs linked to their file, songs joined with another computer's).
  pub fn tidy(&self, p: &str, c: &str) -> Result<(usize, usize, usize), String> {
    let s = self.store(p, c)?;
    let mut st = s.lock().unwrap();
    if self.host.lease_held() { return Ok((0, 0, 0)); }
    let (_, dropped, relinked) = st.tidy_tracks();
    let joined = self.join(&mut st, p)?;
    self.flush_edit(&mut st, p, c)?;
    let name = text(&st.meta, "name");
    drop(st);
    if dropped > 0 || relinked > 0 {
      let n = |k: usize, one: &str, many: &str| format!("{k} {}", if k == 1 { one } else { many });
      let parts: Vec<String> = [(dropped, n(dropped, "leftover song of a removed import gone", "leftover songs of removed imports gone")), (relinked, n(relinked, "song linked to its file", "songs linked to their file"))]
        .into_iter().filter(|(k, _)| *k > 0).map(|(_, t)| t).collect();
      self.event(&format!("Tidied “{name}”: {}", parts.join(", ")));
    }
    Ok((dropped, relinked, joined))
  }

  /// Songs a sync brought: one another computer has may be one this computer has too (`onReloaded`).
  pub(crate) fn join_after_sync(&self, p: &str, c: &str) {
    let Some(s) = self.stores.lock().unwrap().get(&key(p, c)).cloned() else { return };
    let mut st = s.lock().unwrap();
    if self.host.lease_held() { return; }
    let r = self.join(&mut st, p).and_then(|_| self.flush_edit(&mut st, p, c));
    if let Err(x) = r { eprintln!("GLUE Home: couldn’t join the songs: {x}"); }
  }

  /// This computer's songs that are another computer's song, the same file, joined (`joinCopies`); many at once (the
  /// first open after this came) backed up first. How many.
  fn join(&self, st: &mut Store<FsDir>, p: &str) -> Result<usize, String> {
    let pairs = st.copies_to_join();
    if pairs.is_empty() { return Ok(0); }
    if pairs.len() > 10 {
      let profile = read_json(&self.dir(), &format!("profiles/{p}/profile.json")).ok().flatten().ok_or("no profile")?;
      let (_, at) = self.host.now();
      let zip = glue_store::backup::build_backup(&self.dir(), &profile, false, &at)?;
      self.dir().write_bytes(&format!("backups/pre-join-copies-{}-{}.zip", &at[..10], text(&profile, "id")), &zip)?;
    }
    let n = st.join_copies(&pairs);
    if n > 0 { self.event(&format!("Joined {n} song{} with the same song on another computer", if n == 1 { "" } else { "s" })); }
    Ok(n)
  }
}
