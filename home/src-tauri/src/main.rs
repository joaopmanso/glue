// GLUE Home (ADR 0044): an icon next to the clock; a settings window; GLUE in a window of its own (ADR 0151). Its
// work is its engine's (crates/glue-engine: the library, the analysis, the sync, other devices, and its service:
// status, timers, Start / Stop, ADR 0160). This Rust side keeps the settings file, the local link, the connections,
// the tray menu, and the drag dock.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::fs::{self, File};
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent, Wry};
use tauri_plugin_opener::OpenerExt;

mod disk;
mod dock;
mod dupes;
mod tags;
mod libraries;
mod local;
mod ws;
mod activity;
mod web;
mod analysis;
mod rtc;
mod signal;
mod engine;
mod window;

/// The GLUE library in the browser. `open=home`: a GLUE tab that's open already comes forward instead.
const LIBRARY_URL: &str = "https://joaopmanso.github.io/glue/?open=home#/";


/// The tray menu items that change with the service's state.
struct Tray {
    status: MenuItem<Wry>,
    start: MenuItem<Wry>,
    stop: MenuItem<Wry>,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map(|d| d.join("config.json")).map_err(|e| e.to_string())
}

/// The settings (account, device credential, incoming folder), or none before the first setup.
#[tauri::command]
fn get_config(app: AppHandle) -> Option<serde_json::Value> {
    get_config_impl(app)
}

/// The settings as last read, with the file's date and size then: read again only when the file
/// changed (every request of the local link and every file read asks for them; the user's report,
/// 2026-09-28, of GLUE Home using the CPU while idle).
static CONFIG: Mutex<Option<(std::time::SystemTime, u64, serde_json::Value)>> = Mutex::new(None);

pub(crate) fn get_config_impl(app: AppHandle) -> Option<serde_json::Value> {
    let p = config_path(&app).ok()?;
    let m = fs::metadata(&p).ok()?;
    let (at, len) = (m.modified().ok()?, m.len());
    if let Some((a, l, v)) = CONFIG.lock().unwrap().as_ref() {
        if *a == at && *l == len {
            return Some(v.clone());
        }
    }
    let v: serde_json::Value = serde_json::from_str(&fs::read_to_string(&p).ok()?).ok()?;
    *CONFIG.lock().unwrap() = Some((at, len, v.clone()));
    Some(v)
}

/// Save the settings (readable by this user only) and tell both windows.
#[tauri::command]
fn set_config(app: AppHandle, config: serde_json::Value) -> Result<(), String> {
    set_config_impl(app, config)
}

pub(crate) fn set_config_impl(app: AppHandle, config: serde_json::Value) -> Result<(), String> {
    let before = get_config_impl(app.clone()).unwrap_or(serde_json::Value::Null);
    let p = config_path(&app)?;
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600));
    }
    fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    *CONFIG.lock().unwrap() = None;   // read again next time (its date may not have moved)
    let _ = app.emit("config", &config);
    // The service acts on new settings (ADR 0160): online again when the account or Stop changed, the music folders
    // found again when the GLUE folder or the folders did.
    if before != config {
        let (a, after) = (app.clone(), config.clone());
        std::thread::spawn(move || { if let Ok(e) = engine::current(&a) { e.config_changed(&before, &after); } });
    }
    Ok(())
}

/// Music/GLUE Incoming, the suggested incoming folder.
#[tauri::command]
fn default_incoming(app: AppHandle) -> String {
    let base = app.path().audio_dir().or_else(|_| app.path().home_dir()).unwrap_or_else(|_| PathBuf::from("."));
    base.join("GLUE Incoming").to_string_lossy().into_owned()
}

/// This computer's name, to show in the account's device list.
#[tauri::command]
fn device_name() -> String {
    if let Ok(n) = std::env::var("COMPUTERNAME") {
        return n;
    }
    #[cfg(target_os = "macos")]
    if let Ok(o) = std::process::Command::new("scutil").args(["--get", "ComputerName"]).output() {
        let n = String::from_utf8_lossy(&o.stdout).trim().to_string();
        if !n.is_empty() {
            return n;
        }
    }
    std::env::var("HOSTNAME").unwrap_or_else(|_| "GLUE Home".into())
}

/// A file name that is safe on Windows and macOS (the website sends only the name, never a path), and "Song (2).mp3":
/// the engine's rules (ADR 0156).
pub(crate) use glue_engine::incoming::{safe_name, with_number};

pub(crate) fn incoming_dir(app: &AppHandle) -> PathBuf {
    get_config(app.clone())
        .and_then(|c| c.get("incoming").and_then(|v| v.as_str()).map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from(default_incoming(app.clone())))
}

/// A song starts: a `.part` file in the incoming folder, under a name that isn't taken (the file, its `.part` path, its
/// final path, its final name).
pub(crate) fn incoming_part(app: &AppHandle, name: &str) -> Result<(File, PathBuf, PathBuf, String), String> {
    let dir = incoming_dir(app);
    fs::create_dir_all(&dir).map_err(|e| format!("can't use the incoming folder {}: {e}", dir.display()))?;
    let clean = safe_name(name);
    let (mut fin, mut i) = (clean.clone(), 2);
    while dir.join(&fin).exists() || dir.join(format!("{fin}.part")).exists() {
        fin = with_number(&clean, i);
        i += 1;
    }
    let part = dir.join(format!("{fin}.part"));
    let f = File::create(&part).map_err(|e| e.to_string())?;
    Ok((f, part, dir.join(&fin), fin))
}

// ---- this computer's GLUE library (ADR 0045): read-only; the website stays its only writer ----------

fn cfg_str(c: &Option<serde_json::Value>, key: &str) -> Option<PathBuf> {
    c.as_ref().and_then(|c| c.get(key)).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(PathBuf::from)
}

/// Where the website keeps its GLUE folder, if it's in a usual place (it has an mco.json).
#[tauri::command]
fn find_glue_folder(app: AppHandle) -> Option<String> { find_glue(app) }
/// The website's GLUE folder in a usual place (Documents, the home folder, Music, the desktop), if there's one.
pub(crate) fn find_glue(app: AppHandle) -> Option<String> {
    let p = app.path();
    let bases = [p.document_dir(), p.home_dir(), p.audio_dir(), p.desktop_dir()];
    for base in bases.into_iter().flatten() {
        for name in ["GLUE", "MCO", "Glue"] {
            let d = base.join(name);
            if d.join("mco.json").is_file() {
                return Some(d.to_string_lossy().into_owned());
            }
        }
    }
    None
}

/// A new GLUE folder for GLUE Home's first run (ADR 0159): Documents\GLUE, made if needed ("GLUE (2)"… when that name is
/// another folder with things in it); a GLUE folder already there is the one. The GLUE website sets a new one up the
/// first time it opens it (`mco.json`). Its path: the settings choose it.
#[tauri::command]
fn new_glue_folder(app: AppHandle) -> Result<String, String> {
    let base = app.path().document_dir().or_else(|_| app.path().home_dir()).map_err(|e| e.to_string())?;
    Ok(free_glue_folder(&base)?.to_string_lossy().into_owned())
}
fn free_glue_folder(base: &std::path::Path) -> Result<PathBuf, String> {
    let usable = |d: &std::path::Path| !d.exists() || folder_look(d).0 || folder_look(d).1;
    let mut d = base.join("GLUE");
    let mut n = 2;
    while !usable(&d) { d = base.join(format!("GLUE ({n})")); n += 1; }
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}
/// A folder is GLUE's (it has `mco.json`), and it's empty.
fn folder_look(d: &std::path::Path) -> (bool, bool) { (d.join("mco.json").is_file(), fs::read_dir(d).map(|mut x| x.next().is_none()).unwrap_or(false)) }
/// What a folder chosen as the GLUE folder is: GLUE's, or empty (a new one, set up when the library opens it).
#[tauri::command]
fn folder_state(path: String) -> serde_json::Value {
    let (glue, empty) = folder_look(std::path::Path::new(&path));
    serde_json::json!({ "glue": glue, "empty": empty })
}

/// The usual folders of this computer (the engine finds music folders by name in them).
fn known_folders(app: AppHandle) -> serde_json::Value {
    let p = app.path();
    let s = |r: tauri::Result<PathBuf>| r.ok().map(|d| d.to_string_lossy().into_owned());
    serde_json::json!({ "home": s(p.home_dir()), "music": s(p.audio_dir()), "documents": s(p.document_dir()), "desktop": s(p.desktop_dir()), "downloads": s(p.download_dir()), "sep": std::path::MAIN_SEPARATOR.to_string() })
}

/// What GLUE Home was asked since it started (the settings show it).
#[tauri::command]
fn activity_now() -> serde_json::Value {
    activity::snapshot()
}

/// A folder of GLUE Home's settings as the disk names it (`canonicalize`), remembered (ADR 0141): every file read
/// looked up every folder on every request, the NAS's among them, so a song on a local drive waited on the network,
/// or woke a sleeping drive it doesn't live on. One that can't be reached is tried again after 30 s, a found one
/// after 10 minutes (a drive letter mapped elsewhere).
pub(crate) fn resolved(root: &std::path::Path) -> Option<PathBuf> {
    static SEEN: Mutex<Option<HashMap<PathBuf, (Option<PathBuf>, std::time::Instant)>>> = Mutex::new(None);
    let fresh = |(c, at): &(Option<PathBuf>, std::time::Instant)| at.elapsed().as_secs() < if c.is_some() { 600 } else { 30 };
    if let Some(hit) = SEEN.lock().unwrap().as_ref().and_then(|m| m.get(root)).filter(|e| fresh(e)) {
        return hit.0.clone();
    }
    // Looked up without the lock: a network folder that's slow to answer holds up no other request.
    let c = fs::canonicalize(root).ok();
    SEEN.lock().unwrap().get_or_insert_with(HashMap::new).insert(root.to_path_buf(), (c.clone(), std::time::Instant::now()));
    c
}

/// The folders GLUE Home may use, the ones `path` is written under first (so a file is matched without looking
/// up any other folder: a network folder, another drive).
pub(crate) fn roots_for(roots: Vec<PathBuf>, path: &str) -> Vec<PathBuf> {
    let low = path.replace('\\', "/").to_lowercase();
    let under = |r: &PathBuf| low.starts_with(&r.to_string_lossy().replace('\\', "/").to_lowercase());
    let (mut first, rest): (Vec<_>, Vec<_>) = roots.into_iter().partition(under);
    first.extend(rest);
    first
}

/// Files GLUE Home may read: in the GLUE folder, the music folders it located, the incoming folder.
pub(crate) fn allowed(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let c = get_config(app.clone());
    let mut roots: Vec<PathBuf> = [cfg_str(&c, "glue"), cfg_str(&c, "incoming")].into_iter().flatten().collect();
    if let Some(m) = c.as_ref().and_then(|c| c.get("folders")).and_then(|v| v.as_object()) {
        roots.extend(m.values().filter_map(|v| v.as_str()).map(PathBuf::from));
    }
    let p = fs::canonicalize(path).map_err(|e| e.to_string())?;
    for r in roots_for(roots, path) {
        if resolved(&r).is_some_and(|r| p.starts_with(r)) {
            return Ok(p);
        }
    }
    Err("not in a folder GLUE Home may read".into())
}

// ---- GLUE Home's own cache: waveforms and full analyses of the shared songs (ADR 0046) --------------

pub(crate) fn cache_path(app: &AppHandle, rel: &str) -> Result<PathBuf, String> {
    if rel.split(['/', '\\']).any(|p| p == ".." || p.is_empty()) {
        return Err("bad path".into());
    }
    Ok(app.path().app_cache_dir().map_err(|e| e.to_string())?.join("library").join(rel))
}

/// Write a cache file whole (a temporary file, then renamed: a reader never sees half of it).
pub(crate) fn cache_put(app: &AppHandle, rel: &str, data: &[u8]) -> Result<(), String> {
    let p = cache_path(app, rel)?;
    if let Some(d) = p.parent() {
        fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

// ---- the incoming folder: what's waiting to be sorted (ADR 0046) -----------------------------------

pub(crate) fn incoming_list_impl(app: AppHandle) -> Vec<serde_json::Value> { glue_engine::incoming::list(&incoming_dir(&app)) }
/// Move a song from the incoming folder into one of the music folders GLUE Home may use (never overwriting; the
/// engine's rule, ADR 0156); the website picks it up there on its next scan.
pub(crate) fn incoming_move_impl(app: AppHandle, name: String, to: String) -> Result<String, String> {
    let dest = allowed(&app, &to)?;
    glue_engine::incoming::move_to(&incoming_dir(&app), &name, &dest)
}

/// GLUE Home's status (service.rs, ADR 0160): the tray's first line, tooltip and Start / Stop follow it.
pub(crate) fn tray_status(app: &AppHandle, text: &str, running: bool) {
    let Some(tray) = app.try_state::<Tray>() else { return };
    let _ = tray.status.set_text(text);
    let _ = tray.start.set_enabled(!running);
    let _ = tray.stop.set_enabled(running);
    if let Some(icon) = app.tray_by_id("main") {
        let _ = icon.set_tooltip(Some(format!("GLUE Home · {text}")));
    }
}

#[tauri::command]
fn show_settings(app: AppHandle) {
    open_settings(&app);
}

#[tauri::command]
fn open_library(app: AppHandle) {
    open_glue(&app);
}

/// The library: in the GLUE window (ADR 0151), or in the browser when the settings say so (`libraryIn: "browser"`) or
/// the window can't open. Made on a thread of its own: on Windows a webview built inside a command (the settings'
/// "Open GLUE library") or an event handler deadlocks with WebView2, leaving a white window and GLUE Home frozen
/// (the user's first try of the window, 2026-10-05).
fn open_glue(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let browser = get_config_impl(app.clone()).and_then(|c| c.get("libraryIn").and_then(|v| v.as_str()).map(|s| s == "browser")).unwrap_or(false);
        if browser || window::open(&app).is_err() {
            let _ = app.opener().open_url(LIBRARY_URL, None::<&str>);
        }
    });
}

fn open_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.unminimize();
        follow_windows(app);
        let _ = w.set_focus();
    }
}

/// macOS: GLUE Home is a menu-bar app, but while one of its windows is open it's a normal app, in the
/// Cmd-Tab switcher and the Dock (it went missing from Cmd-Tab, the user's list 2026-09-28).
#[cfg(target_os = "macos")]
pub(crate) fn follow_windows(app: &AppHandle) {
    let open = ["settings", "dock", window::LABEL].iter().any(|l| app.get_webview_window(l).and_then(|w| w.is_visible().ok()).unwrap_or(false));
    let _ = app.set_activation_policy(if open { tauri::ActivationPolicy::Regular } else { tauri::ActivationPolicy::Accessory });
}
#[cfg(not(target_os = "macos"))]
pub(crate) fn follow_windows(_app: &AppHandle) {}

fn main() {
    tauri::Builder::default()
        // A second launch (or a gluehome:// link) shows the running one's settings.
        // A second start: the settings, or the library with `--library` (a "GLUE" shortcut, ADR 0151).
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| if argv.iter().any(|a| a == "--library") { open_glue(app) } else { open_settings(app) }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--background"])))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Updates from the GitHub releases, signed with the project's key (ADR 0045).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Native file drags out of the drag dock (ADR 0054).
        .plugin(tauri_plugin_drag::init())
        // Reminders of events that need music (ADR 0074).
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![get_config, set_config, default_incoming, device_name, new_glue_folder, folder_state, show_settings, open_library, find_glue_folder, activity_now, dock::dock_items, dock::dock_add, dock::dock_remove, dock::dock_clear, dock::drag_icon, dupes::default_duplicates, engine::engine_cmd])
        .setup(|app| {
            // A menu-bar app on macOS: no Dock icon.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            #[cfg(windows)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            let status = MenuItem::with_id(app, "status", "Starting…", false, None::<&str>)?;
            let library = MenuItem::with_id(app, "library", "Open GLUE library", true, None::<&str>)?;
            let dock_item = MenuItem::with_id(app, "dock", "Drag dock", true, None::<&str>)?;
            let open = MenuItem::with_id(app, "open", "GLUE Home settings…", true, None::<&str>)?;
            let start = MenuItem::with_id(app, "start", "Start service", false, None::<&str>)?;
            let stop = MenuItem::with_id(app, "stop", "Stop service", true, None::<&str>)?;
            let restart = MenuItem::with_id(app, "restart", "Restart service", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit GLUE Home", true, None::<&str>)?;
            let (s1, s2) = (PredefinedMenuItem::separator(app)?, PredefinedMenuItem::separator(app)?);
            let s3 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&status, &s1, &library, &dock_item, &open, &s3, &start, &stop, &restart, &s2, &quit])?;
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
            TrayIconBuilder::with_id("main")
                .icon(icon)
                .tooltip("GLUE Home")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id().as_ref() {
                    "library" => open_glue(app),
                    "dock" => dock::show(app),
                    "open" => open_settings(app),
                    "start" | "stop" | "restart" => {
                        let (a, what) = (app.clone(), e.id().as_ref().to_string());
                        std::thread::spawn(move || { if let Ok(en) = engine::current(&a) { en.control(&what); } });
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        // A click on the icon opens the library (right-click: the menu).
                        open_glue(tray.app_handle());
                    }
                })
                .build(app)?;
            app.manage(Tray { status, start, stop });
            // The connections to the account's other devices (ADR 0150).
            app.manage(rtc::new(app.handle()));
            // The website on this computer talks to GLUE Home directly (ADR 0048).
            activity::start();
            local::start(app.handle().clone());
            ws::start(app.handle().clone());
            // The library's engine (ADR 0153): its jobs carried on, the analysis state kept for `status`.
            engine::start(app.handle());
            // Started with the computer: stay in the tray. Opened by hand (or the first time): settings.
            // `--library`: the library itself (ADR 0151).
            if std::env::args().any(|a| a == "--library") {
                open_glue(app.handle());
            } else if !std::env::args().any(|a| a == "--background") {
                open_settings(app.handle());
            }
            Ok(())
        })
        .on_window_event(|w, e| {
            // Closing the settings window hides it; the service keeps running in the tray.
            if let WindowEvent::CloseRequested { api, .. } = e {
                if w.label() == "settings" || w.label() == "dock" {
                    api.prevent_close();
                    let _ = w.hide();
                    follow_windows(w.app_handle());
                }
            }
            // The GLUE window closes for good (its memory freed); GLUE Home stays in the tray.
            if let WindowEvent::Destroyed = e {
                if w.label() == window::LABEL { follow_windows(w.app_handle()); }
            }
        })
        .build(tauri::generate_context!())
        .expect("GLUE Home couldn't start")
        .run(|_app, e| {
            // No windows shown isn't a reason to quit: only "Quit GLUE Home" is.
            if let tauri::RunEvent::ExitRequested { api, code, .. } = e {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    /// The store GLUE Home will be the engine with (ADR 0152): a collection on disk read, changed and written.
    #[test]
    fn the_rust_store_reads_and_writes_a_collection() {
        use glue_store::{dir::{Dir, FsDir}, store::{LoadOpts, Store}};
        let d = std::env::temp_dir().join(format!("glue-store-{}", std::process::id()));
        let root = FsDir { root: d.clone() };
        root.write("profiles/p/collections/c/collection.json", r#"{"schemaVersion":1,"id":"c","name":"C","createdAt":"","roots":[]}"#).unwrap();
        let mut s = Store::load(root, "p", "c", LoadOpts::default(), Box::new(|| (0, String::new()))).unwrap();
        s.apply(&serde_json::json!({ "m": "tracks", "ts": [{ "id": "ab1", "title": "T" }] }));
        assert_eq!(s.flush().unwrap(), vec!["tracks/ab.json".to_string()]);
        assert_eq!(std::fs::read_to_string(d.join("profiles/p/collections/c/tracks/ab.json")).unwrap(), r#"{"schemaVersion":1,"items":{"ab1":{"id":"ab1","title":"T"}}}"#);
        let _ = std::fs::remove_dir_all(&d);
    }

    use super::*;

    /// GLUE Home's first run makes Documents\GLUE (ADR 0159): an empty one or a GLUE folder is used as it is; a folder
    /// of that name with other things in it is left alone for "GLUE (2)".
    #[test]
    fn a_new_glue_folder_never_takes_someone_elses() {
        let base = std::env::temp_dir().join(format!("glue-new-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        assert_eq!(free_glue_folder(&base).unwrap(), base.join("GLUE"));
        assert_eq!(free_glue_folder(&base).unwrap(), base.join("GLUE"));   // empty: the same
        fs::write(base.join("GLUE").join("notes.txt"), "mine").unwrap();
        assert_eq!(free_glue_folder(&base).unwrap(), base.join("GLUE (2)"));
        fs::write(base.join("GLUE (2)").join("mco.json"), "{}").unwrap();
        assert_eq!(free_glue_folder(&base).unwrap(), base.join("GLUE (2)"));   // GLUE's: the one
        assert_eq!(folder_state(base.join("GLUE (2)").to_string_lossy().into_owned()), serde_json::json!({ "glue": true, "empty": false }));
        let _ = fs::remove_dir_all(&base);
    }

    // A file is matched against the folder it's written under first: no other folder looked up (ADR 0141).
    #[test]
    fn the_folder_a_file_is_under_comes_first() {
        let roots = vec![PathBuf::from(r"\nas\Archive"), PathBuf::from(r"F:\Music Collection"), PathBuf::from(r"F:\Music")];
        let order = roots_for(roots, r"f:\music\Song.wav");
        assert_eq!(order[0], PathBuf::from(r"F:\Music"));
        assert_eq!(order.len(), 3);
    }

    // A folder's name on the disk is looked up once, then remembered: gone a moment later, it's still the one known.
    #[test]
    fn a_folder_is_looked_up_once() {
        let dir = std::env::temp_dir().join(format!("glue-resolved-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let first = resolved(&dir);
        assert!(first.is_some());
        fs::remove_dir_all(&dir).unwrap();
        assert_eq!(resolved(&dir), first);
        assert_eq!(resolved(&dir.join("never-there")), None);
    }
}
