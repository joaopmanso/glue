// The drag dock (ADR 0054): a small GLUE Home window holding a queue of songs to drag into Engine DJ,
// Rekordbox or Explorer. A web page can't hand a DJ app a file (research/drag-to-dj-apps.md); a
// native window can. The website adds songs (each as a music folder and a path inside it); GLUE Home
// turns them into real files, inside folders it knows. The dock removes and clears them.
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

/// The queue: each song's file and name, in the order added.
static DOCK: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());

fn state() -> serde_json::Value {
    let q = DOCK.lock().unwrap();
    serde_json::json!({ "paths": q.iter().map(|x| &x.0).collect::<Vec<_>>(), "names": q.iter().map(|x| &x.1).collect::<Vec<_>>() })
}
fn changed(app: &AppHandle) -> usize {
    let _ = app.emit_to("dock", "dock", state());
    DOCK.lock().unwrap().len()
}

/// Songs from the website: { mode: "add" | "replace", items: [{ root: folder id | "incoming", path }] }.
/// Songs whose file isn't there, or isn't inside a folder GLUE Home knows, are left out; a song already
/// queued isn't added twice. Returns how many are queued.
pub(crate) fn set(app: &AppHandle, body: &str) -> Result<usize, String> {
    let v: serde_json::Value = serde_json::from_str(body).map_err(|e| format!("bad request: {e}"))?;
    let cfg = crate::get_config_impl(app.clone());
    let folder = |id: &str| -> Option<std::path::PathBuf> {
        if id == "incoming" { return Some(crate::incoming_dir(app)); }
        cfg.as_ref()?.get("folders")?.get(id)?.as_str().map(std::path::PathBuf::from)
    };
    let mut add = Vec::new();
    for it in v.get("items").and_then(|x| x.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) {
        let (Some(root), Some(rel)) = (it.get("root").and_then(|x| x.as_str()), it.get("path").and_then(|x| x.as_str())) else { continue };
        let Some(base) = folder(root).and_then(|b| std::fs::canonicalize(b).ok()) else { continue };
        let Ok(p) = crate::disk::inside(&base, rel) else { continue };
        if crate::disk::check(&base, &p).is_err() || !p.is_file() { continue; }
        add.push((p.to_string_lossy().into_owned(), p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()));
    }
    {
        let mut q = DOCK.lock().unwrap();
        if v.get("mode").and_then(|x| x.as_str()) != Some("add") { q.clear(); }
        for a in add { if !q.iter().any(|x| x.0 == a.0) { q.push(a); } }
    }
    Ok(changed(app))
}

/// Songs dragged in the website and let go outside its window (ADR 0061): { x, y, items }, the point in
/// the browser's screen coordinates (device-independent pixels). Added when that point is on the dock
/// window (a few pixels of slack); None when it isn't (the drag was let go somewhere else).
pub(crate) fn drop_at(app: &AppHandle, body: &str) -> Result<Option<usize>, String> {
    let mut v: serde_json::Value = serde_json::from_str(body).map_err(|e| format!("bad request: {e}"))?;
    let (Some(x), Some(y)) = (v.get("x").and_then(|x| x.as_f64()), v.get("y").and_then(|x| x.as_f64())) else { return Err("x and y are needed".into()) };
    let Some(w) = app.get_webview_window("dock") else { return Ok(None) };
    if !w.is_visible().unwrap_or(false) || w.is_minimized().unwrap_or(false) { return Ok(None); }
    let (Ok(p), Ok(s), Ok(sf)) = (w.outer_position(), w.outer_size(), w.scale_factor()) else { return Ok(None) };
    // The window's position and size are physical pixels; the browser's point isn't.
    let (l, t) = (p.x as f64 / sf, p.y as f64 / sf);
    let (r, b) = (l + s.width as f64 / sf, t + s.height as f64 / sf);
    const SLACK: f64 = 8.0;
    if x < l - SLACK || x > r + SLACK || y < t - SLACK || y > b + SLACK { return Ok(None); }
    v["mode"] = "add".into();
    set(app, &v.to_string()).map(Some)
}

pub(crate) fn clear(app: &AppHandle) { DOCK.lock().unwrap().clear(); changed(app); }

/// Show the dock (the website's "Drag dock" button, or the tray).
pub(crate) fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("dock") {
        let _ = w.show();
        let _ = w.unminimize();
    }
}

/// The dock page asks what it holds when it opens.
#[tauri::command]
pub fn dock_items() -> serde_json::Value { state() }

/// A playlist dropped on the dock window (the website's drag carries its songs, ADR 0056).
#[tauri::command]
pub fn dock_add(app: AppHandle, body: String) -> Result<usize, String> {
    let v: serde_json::Value = serde_json::from_str(&body).map_err(|e| format!("bad drop: {e}"))?;
    let mut v = v;
    v["mode"] = "add".into();
    set(&app, &v.to_string())
}

pub(crate) fn current() -> serde_json::Value { state() }

/// The dock's own buttons: take one song out, or all of them.
#[tauri::command]
pub fn dock_remove(app: AppHandle, index: usize) { { let mut q = DOCK.lock().unwrap(); if index < q.len() { q.remove(index); } } changed(&app); }
#[tauri::command]
pub fn dock_clear(app: AppHandle) { clear(&app); }

/// The picture under the pointer while dragging: GLUE Home's icon, written once to its cache folder.
#[tauri::command]
pub fn drag_icon(app: AppHandle) -> Result<String, String> {
    let p = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("drag-icon.png");
    if !p.is_file() {
        std::fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
        std::fs::write(&p, include_bytes!("../icons/128x128.png")).map_err(|e| e.to_string())?;
    }
    Ok(p.to_string_lossy().into_owned())
}
