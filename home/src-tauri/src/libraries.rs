// DJ libraries on this computer that the website follows live (ADR 0065):
// - the ones imported with GLUE Home's file dialog (remembered in its settings, "libraries");
// - the ones found where the apps keep them: Engine DJ's "Engine Library" on every drive and in Music,
//   Traktor's collection in Documents/Native Instruments (the newest version's).
// Their folders are roots of the website's disk (/fs/*) for reading only; a folder that's nothing else
// can't be written through /fs (Engine DJ gets its own, careful way in, ADR 0064).
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, UNIX_EPOCH};

use tauri::AppHandle;

#[derive(Clone)]
pub(crate) struct Found { pub kind: &'static str, pub dir: PathBuf, pub file: String }

static CACHE: Mutex<Option<(Instant, Vec<Found>)>> = Mutex::new(None);

fn home() -> Option<PathBuf> { std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from) }

/// Every drive's root (Windows), or every mounted volume (macOS).
fn places() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if cfg!(windows) {
        for l in b'C'..=b'Z' {
            let p = PathBuf::from(format!("{}:\\", l as char));
            if p.exists() { out.push(p); }
        }
    } else if let Ok(rd) = std::fs::read_dir("/Volumes") {
        out.extend(rd.flatten().map(|e| e.path()));
    }
    out
}

/// Where the apps keep their libraries.
fn look() -> Vec<Found> {
    let mut found: Vec<Found> = Vec::new();
    let mut engine = |dir: PathBuf| {
        if dir.join("Database2").join("m.db").is_file() && !found.iter().any(|f| f.dir == dir) {
            found.push(Found { kind: "engine", dir, file: "Database2/m.db".into() });
        }
    };
    if let Some(h) = home() { engine(h.join("Music").join("Engine Library")); }
    for p in places() { engine(p.join("Engine Library")); }
    // Traktor: each version keeps its own folder; the collection the newest one saved is the one in use.
    if let Some(ni) = home().map(|h| h.join("Documents").join("Native Instruments")) {
        let newest = std::fs::read_dir(&ni).into_iter().flatten().flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with("Traktor"))
            .map(|e| e.path().join("collection.nml"))
            .filter(|p| p.is_file())
            .max_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).unwrap_or(UNIX_EPOCH));
        if let Some(nml) = newest {
            found.push(Found { kind: "traktor", dir: nml.parent().unwrap_or(Path::new("")).to_path_buf(), file: "collection.nml".into() });
        }
    }
    found
}

/// Library files imported with GLUE Home's dialog.
fn picked(app: &AppHandle) -> Vec<Found> {
    let cfg = crate::get_config_impl(app.clone());
    let paths = cfg.as_ref().and_then(|c| c.get("libraries")).and_then(|v| v.as_array()).cloned().unwrap_or_default();
    paths.iter().filter_map(|v| {
        let p = PathBuf::from(v.as_str()?);
        let file = p.file_name()?.to_string_lossy().into_owned();
        p.is_file().then(|| Found { kind: "picked", dir: p.parent().unwrap_or(Path::new("")).to_path_buf(), file })
    }).collect()
}

/// Remember a library file chosen in GLUE Home's dialog (followed live from now on).
pub(crate) fn remember(app: &AppHandle, path: &Path) -> Result<(), String> {
    let mut cfg = crate::get_config_impl(app.clone()).unwrap_or_else(|| serde_json::json!({}));
    let text = path.to_string_lossy().into_owned();
    let mut list = cfg.get("libraries").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    if !list.iter().any(|v| v.as_str() == Some(&text)) { list.push(text.into()); }
    cfg["libraries"] = serde_json::Value::Array(list);
    crate::set_config_impl(app.clone(), cfg)?;
    *CACHE.lock().unwrap() = None;
    Ok(())
}

/// The libraries (looked for again at most once a minute: drives come and go).
pub(crate) fn find(app: &AppHandle) -> Vec<Found> {
    let mut c = CACHE.lock().unwrap();
    if let Some((at, list)) = c.as_ref() {
        if at.elapsed() < Duration::from_secs(60) { return list.clone(); }
    }
    let mut list = picked(app);
    for f in look() { if !list.iter().any(|x| x.dir == f.dir && x.file == f.file) { list.push(f); } }
    *c = Some((Instant::now(), list.clone()));
    list
}

/// Is this (resolved) folder one of the libraries' folders?
pub(crate) fn is_library(app: &AppHandle, dir: &Path) -> bool {
    find(app).iter().any(|f| crate::resolved(&f.dir).is_some_and(|c| c == dir))
}

pub(crate) fn json(app: &AppHandle) -> serde_json::Value {
    serde_json::Value::Array(find(app).into_iter().map(|f| serde_json::json!({ "kind": f.kind, "dir": f.dir.to_string_lossy(), "file": f.file })).collect())
}
