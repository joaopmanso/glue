// The drag dock (ADR 0054): a small GLUE Home window holding the songs selected on the website on
// this computer, to drag from into Engine DJ, Rekordbox or Explorer. A web page can't hand a DJ app
// a file (research/drag-to-dj-apps.md); a native window can. The website says which songs (each as a
// music folder and a path inside it); GLUE Home turns them into real files, inside folders it knows.
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

static DOCK: Mutex<Option<serde_json::Value>> = Mutex::new(None);

/// What the dock holds now: { title, paths, names }.
pub(crate) fn current() -> serde_json::Value {
    DOCK.lock().unwrap().clone().unwrap_or_else(|| serde_json::json!({ "title": "", "paths": [], "names": [] }))
}

/// The website's selection: { title, items: [{ root: folder id | "incoming", path }] }. Songs whose
/// file isn't there, or isn't inside a folder GLUE Home knows, are left out. Returns how many are in.
pub(crate) fn set(app: &AppHandle, body: &str) -> Result<usize, String> {
    let v: serde_json::Value = serde_json::from_str(body).map_err(|e| format!("bad request: {e}"))?;
    let cfg = crate::get_config_impl(app.clone());
    let folder = |id: &str| -> Option<std::path::PathBuf> {
        if id == "incoming" { return Some(crate::incoming_dir(app)); }
        cfg.as_ref()?.get("folders")?.get(id)?.as_str().map(std::path::PathBuf::from)
    };
    let (mut paths, mut names) = (Vec::new(), Vec::new());
    for it in v.get("items").and_then(|x| x.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) {
        let (Some(root), Some(rel)) = (it.get("root").and_then(|x| x.as_str()), it.get("path").and_then(|x| x.as_str())) else { continue };
        let Some(base) = folder(root).and_then(|b| std::fs::canonicalize(b).ok()) else { continue };
        let Ok(p) = crate::disk::inside(&base, rel) else { continue };
        if crate::disk::check(&base, &p).is_err() || !p.is_file() { continue; }
        names.push(p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default());
        paths.push(p.to_string_lossy().into_owned());
    }
    let n = paths.len();
    let title = v.get("title").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let state = serde_json::json!({ "title": title, "paths": paths, "names": names });
    *DOCK.lock().unwrap() = Some(state.clone());
    let _ = app.emit_to("dock", "dock", state);
    Ok(n)
}

/// Show the dock (the website's "Drag dock" button, or the tray).
pub(crate) fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("dock") {
        let _ = w.show();
        let _ = w.unminimize();
    }
}

/// The dock page asks what it holds when it opens.
#[tauri::command]
pub fn dock_items() -> serde_json::Value {
    current()
}

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
