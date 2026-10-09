//! Puts back the playlist entries GLUE Home 0.68–0.69's playlist sync removed from an Engine DJ library (ADR 0173):
//! the songs of databases it hadn't read (drives not plugged in), taken from another copy of the playlists (another
//! drive's database, which holds the whole tree as it was when that drive was last in, or an older copy of the library).
//!
//! cargo run --release --example restore_lists --manifest-path crates/glue-interop/Cargo.toml -- \
//!   --into <the library's m.db> --known <uuid,uuid…> [--from <m.db>]… [--write --backup <file>]
//!
//! `--known`: the databases GLUE read (their entries weren't touched; none of theirs are put back). Each playlist is
//! found by its folder path; an entry missing from it goes back after the one it followed in the copy. Without
//! `--write` it only reports. Engine DJ must be closed.
use glue_interop::enginedb::{self, EList};
use rusqlite::{Connection, OpenFlags};
use std::collections::{HashMap, HashSet};

fn own(db: &Connection) -> String { db.query_row("SELECT uuid FROM Information LIMIT 1", [], |r| r.get(0)).unwrap_or_default() }

/// A copy's playlists, also from a damaged one (a copy made while Engine DJ wrote): the entries read one by one through
/// the order index, the ones it can't read left out.
fn lists_of(db: &Connection) -> (Vec<EList>, usize) {
  let u = own(db);
  if let Ok(l) = enginedb::read_lists(db, &u) { return (l, 0); }
  let mut lists: Vec<EList> = db.prepare("SELECT id, title, parentListId, nextListId FROM Playlist").unwrap()
    .query_map([], |r| Ok(EList { id: r.get(0)?, title: r.get::<_, Option<String>>(1)?.unwrap_or_default(), parent: r.get::<_, Option<i64>>(2)?.unwrap_or(0), items: vec![], next: r.get::<_, Option<i64>>(3)?.unwrap_or(0) }))
    .unwrap().filter_map(Result::ok).collect();
  let ids: Vec<i64> = db.prepare("SELECT id FROM PlaylistEntity INDEXED BY index_PlaylistEntity_nextEntityId_listId WHERE nextEntityId > -1").unwrap()
    .query_map([], |r| r.get(0)).unwrap().filter_map(Result::ok).collect();
  let mut q = db.prepare("SELECT listId, trackId, databaseUuid, nextEntityId FROM PlaylistEntity WHERE id = ?1").unwrap();
  let mut ents: HashMap<i64, Vec<(i64, i64, String)>> = HashMap::new();
  let mut lost = 0;
  for id in ids {
    match q.query_row([id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, Option<i64>>(3)?.unwrap_or(0)))) {
      Ok((list, track, uuid, next)) => ents.entry(list).or_default().push((id, next, format!("{}/{track}", uuid.filter(|x| !x.is_empty()).unwrap_or_else(|| u.clone())))),
      Err(_) => lost += 1,
    }
  }
  for l in &mut lists {
    let Some(es) = ents.get(&l.id) else { continue };
    let by: HashMap<i64, &(i64, i64, String)> = es.iter().map(|x| (x.0, x)).collect();
    let pointed: HashSet<i64> = es.iter().map(|x| x.1).collect();
    let mut done: HashSet<i64> = HashSet::new();
    // Each piece of the chain from its start, in order; the pieces one after another.
    for head in es.iter().filter(|x| !pointed.contains(&x.0)) {
      let mut cur = Some(head);
      while let Some(x) = cur { if !done.insert(x.0) { break; } l.items.push(x.2.clone()); cur = by.get(&x.1).copied(); }
    }
    for x in es { if done.insert(x.0) { l.items.push(x.2.clone()); } }
  }
  (lists, lost)
}

/// Each playlist by its folder path ("Sets / Friday").
fn by_path(lists: &[EList]) -> HashMap<String, usize> {
  let ix: HashMap<i64, usize> = lists.iter().enumerate().map(|(i, l)| (l.id, i)).collect();
  let mut out = HashMap::new();
  for (i, l) in lists.iter().enumerate() {
    let mut parts = vec![l.title.clone()];
    let (mut cur, mut guard) = (l.parent, 0);
    while let Some(&p) = ix.get(&cur) { parts.push(lists[p].title.clone()); cur = lists[p].parent; guard += 1; if guard > 64 { break; } }
    parts.reverse();
    out.entry(parts.join(" / ")).or_insert(i);
  }
  out
}

fn main() {
  let args: Vec<String> = std::env::args().skip(1).collect();
  let arg = |k: &str| args.iter().position(|a| a == k).and_then(|i| args.get(i + 1)).cloned();
  let into = arg("--into").expect("--into <m.db>");
  let known: HashSet<String> = arg("--known").expect("--known <uuid,…>").split(',').map(|s| s.trim().to_string()).collect();
  let froms: Vec<String> = args.windows(2).filter(|w| w[0] == "--from").map(|w| w[1].clone()).collect();
  let write = args.iter().any(|a| a == "--write");
  let backup = arg("--backup");
  if write && backup.is_none() { panic!("--write needs --backup <file>"); }

  let mut db = Connection::open(&into).expect("the library");
  let me = own(&db);
  let mut lists = enginedb::read_lists(&db, &me).expect("the library's playlists");
  let paths = by_path(&lists);
  let mut changed: HashSet<usize> = HashSet::new();
  let mut total: HashMap<String, usize> = HashMap::new();
  for from in &froms {
    let src = Connection::open_with_flags(from, OpenFlags::SQLITE_OPEN_READ_ONLY).expect("a copy");
    let (theirs, unread) = lists_of(&src);
    let mut n: HashMap<String, usize> = HashMap::new();
    let mut not_here = 0;
    for (path, &j) in &by_path(&theirs) {
      let Some(&i) = paths.get(path) else { if theirs[j].items.iter().any(|x| !known.contains(x.split('/').next().unwrap_or(""))) { not_here += 1; } continue };
      let mut items = lists[i].items.clone();
      let mut have: HashSet<String> = items.iter().cloned().collect();
      let mut at = 0;   // after the last of the copy's entries found in the list
      for x in &theirs[j].items {
        if let Some(p) = items.iter().position(|y| y == x) { at = p + 1; continue; }
        let u = x.split('/').next().unwrap_or("");
        if known.contains(u) || u == me || !have.insert(x.clone()) { continue; }
        items.insert(at, x.clone());
        at += 1;
        *n.entry(u.to_string()).or_default() += 1;
      }
      if items != lists[i].items { lists[i].items = items; changed.insert(i); }
    }
    println!("{from}: {} entries to put back {n:?}{}{}", n.values().sum::<usize>(), if unread > 0 { format!(", {unread} entries of the copy unreadable") } else { String::new() }, if not_here > 0 { format!(", {not_here} of its playlists not in the library") } else { String::new() });
    for (u, k) in n { *total.entry(u).or_default() += k; }
  }
  println!("In all: {} entries into {} playlists {total:?}", total.values().sum::<usize>(), changed.len());
  if !write { println!("(Nothing written: --write --backup <file> to put them back.)"); return; }
  std::fs::copy(&into, backup.as_ref().unwrap()).expect("the backup");
  let tx = db.transaction().unwrap();
  for &i in &changed { enginedb::set_items(&tx, lists[i].id, &lists[i].items).expect("writing"); }
  tx.commit().unwrap();
  let check = enginedb::read_lists(&db, &me).unwrap();
  let bad = changed.iter().filter(|&&i| check.iter().find(|l| l.id == lists[i].id).map(|l| &l.items) != Some(&lists[i].items)).count();
  println!("Written. Backup: {}. Playlists not as intended: {bad}.", backup.unwrap());
}
