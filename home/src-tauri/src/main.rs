// GLUE Home (ADR 0044): an icon next to the clock; a settings window; a hidden window that runs the
// service (online in the account's signaling room, receiving songs over WebRTC). This Rust side
// keeps the settings file, writes received songs into the incoming folder, and runs the tray menu.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent, Wry};
use tauri_plugin_opener::OpenerExt;

/// The GLUE library in the browser. `open=home`: a GLUE tab that's open already comes forward instead.
const LIBRARY_URL: &str = "https://joaopmanso.github.io/glue/?open=home#/";

/// Songs being received: id → (the file being written, its `.part` path, its final path).
#[derive(Default)]
struct Transfers {
    next: Mutex<u32>,
    open: Mutex<HashMap<u32, (File, PathBuf, PathBuf)>>,
}

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
    let p = config_path(&app).ok()?;
    serde_json::from_str(&fs::read_to_string(p).ok()?).ok()
}

/// Save the settings (readable by this user only) and tell both windows.
#[tauri::command]
fn set_config(app: AppHandle, config: serde_json::Value) -> Result<(), String> {
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
    let _ = app.emit("config", &config);
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

/// A file name that is safe on Windows and macOS (the website sends only the name, never a path).
fn safe_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("");
    let mut n: String = base.chars().map(|c| if c.is_control() || "<>:\"|?*".contains(c) { '_' } else { c }).collect();
    n = n.trim().trim_end_matches(['.', ' ']).to_string();
    let stem = n.split('.').next().unwrap_or("").to_ascii_lowercase();
    if ["con", "prn", "aux", "nul"].contains(&stem.as_str()) || ((stem.starts_with("com") || stem.starts_with("lpt")) && stem.len() == 4) {
        n = format!("_{n}");
    }
    if n.is_empty() || n == "." || n == ".." {
        n = "song".into();
    }
    if n.chars().count() > 180 {
        n = n.chars().take(170).collect();
    }
    n
}

fn with_number(name: &str, i: u32) -> String {
    match name.rfind('.') {
        Some(d) if d > 0 => format!("{} ({}){}", &name[..d], i, &name[d..]),
        _ => format!("{name} ({i})"),
    }
}

fn incoming_dir(app: &AppHandle) -> PathBuf {
    get_config(app.clone())
        .and_then(|c| c.get("incoming").and_then(|v| v.as_str()).map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from(default_incoming(app.clone())))
}

/// A song starts: a `.part` file in the incoming folder, under a name that isn't taken.
#[tauri::command]
fn incoming_begin(app: AppHandle, t: State<'_, Transfers>, name: String) -> Result<(u32, String), String> {
    let dir = incoming_dir(&app);
    fs::create_dir_all(&dir).map_err(|e| format!("can't use the incoming folder {}: {e}", dir.display()))?;
    let clean = safe_name(&name);
    let (mut fin, mut i) = (clean.clone(), 2);
    while dir.join(&fin).exists() || dir.join(format!("{fin}.part")).exists() {
        fin = with_number(&clean, i);
        i += 1;
    }
    let part = dir.join(format!("{fin}.part"));
    let f = File::create(&part).map_err(|e| e.to_string())?;
    let mut next = t.next.lock().unwrap();
    *next += 1;
    t.open.lock().unwrap().insert(*next, (f, part, dir.join(&fin)));
    Ok((*next, fin))
}

/// More bytes of a song (a raw body; its id in the `x-id` header).
#[tauri::command]
fn incoming_write(request: tauri::ipc::Request<'_>, t: State<'_, Transfers>) -> Result<(), String> {
    let id: u32 = request.headers().get("x-id").and_then(|v| v.to_str().ok()).and_then(|s| s.parse().ok()).ok_or("no transfer id")?;
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("expected bytes".into());
    };
    let mut open = t.open.lock().unwrap();
    let (f, _, _) = open.get_mut(&id).ok_or("unknown transfer")?;
    f.write_all(data).map_err(|e| e.to_string())
}

/// A song is complete (it gets its real name) or failed (the `.part` file goes).
#[tauri::command]
fn incoming_end(t: State<'_, Transfers>, id: u32, ok: bool) -> Result<String, String> {
    let (f, part, fin) = t.open.lock().unwrap().remove(&id).ok_or("unknown transfer")?;
    f.sync_all().ok();
    drop(f);
    if !ok {
        let _ = fs::remove_file(&part);
        return Ok(String::new());
    }
    fs::rename(&part, &fin).map_err(|e| e.to_string())?;
    Ok(fin.to_string_lossy().into_owned())
}

// ---- this computer's GLUE library (ADR 0045): read-only; the website stays its only writer ----------

fn cfg_str(c: &Option<serde_json::Value>, key: &str) -> Option<PathBuf> {
    c.as_ref().and_then(|c| c.get(key)).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(PathBuf::from)
}

/// Where the website keeps its GLUE folder, if it's in a usual place (it has an mco.json).
#[tauri::command]
fn find_glue_folder(app: AppHandle) -> Option<String> {
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

/// The usual folders of this computer (to find music folders by name).
#[tauri::command]
fn known_folders(app: AppHandle) -> serde_json::Value {
    let p = app.path();
    let s = |r: tauri::Result<PathBuf>| r.ok().map(|d| d.to_string_lossy().into_owned());
    serde_json::json!({ "home": s(p.home_dir()), "music": s(p.audio_dir()), "documents": s(p.document_dir()), "desktop": s(p.desktop_dir()), "downloads": s(p.download_dir()), "sep": std::path::MAIN_SEPARATOR.to_string() })
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    PathBuf::from(path).exists()
}

/// A text file inside the GLUE folder (the library's JSON), by its path in there.
#[tauri::command]
fn glue_read(app: AppHandle, rel: String) -> Result<String, String> {
    let root = cfg_str(&get_config(app), "glue").ok_or("no GLUE folder chosen")?;
    if rel.split(['/', '\\']).any(|p| p == ".." || p.is_empty()) {
        return Err("bad path".into());
    }
    fs::read_to_string(root.join(rel)).map_err(|e| e.to_string())
}

/// Files GLUE Home may read: in the GLUE folder, the music folders it located, the incoming folder.
fn allowed(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let c = get_config(app.clone());
    let mut roots: Vec<PathBuf> = [cfg_str(&c, "glue"), cfg_str(&c, "incoming")].into_iter().flatten().collect();
    if let Some(m) = c.as_ref().and_then(|c| c.get("folders")).and_then(|v| v.as_object()) {
        roots.extend(m.values().filter_map(|v| v.as_str()).map(PathBuf::from));
    }
    let p = fs::canonicalize(path).map_err(|e| e.to_string())?;
    for r in roots {
        if let Ok(r) = fs::canonicalize(r) {
            if p.starts_with(&r) {
                return Ok(p);
            }
        }
    }
    Err("not in a folder GLUE Home may read".into())
}

#[tauri::command]
fn file_size(app: AppHandle, path: String) -> Result<u64, String> {
    Ok(fs::metadata(allowed(&app, &path)?).map_err(|e| e.to_string())?.len())
}

/// Bytes of a song, from `offset` (at most `len`), as a raw answer.
#[tauri::command]
fn file_read(app: AppHandle, path: String, offset: u64, len: u32) -> Result<tauri::ipc::Response, String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = File::open(allowed(&app, &path)?).map_err(|e| e.to_string())?;
    f.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; len.min(4 * 1024 * 1024) as usize];
    let mut n = 0;
    while n < buf.len() {
        let k = f.read(&mut buf[n..]).map_err(|e| e.to_string())?;
        if k == 0 {
            break;
        }
        n += k;
    }
    buf.truncate(n);
    Ok(tauri::ipc::Response::new(buf))
}

/// The service reports its state: the tray's first line, tooltip and Start / Stop follow it.
#[tauri::command]
fn set_status(app: AppHandle, tray: State<'_, Tray>, text: String, running: bool) {
    let _ = tray.status.set_text(&text);
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

fn open_glue(app: &AppHandle) {
    let _ = app.opener().open_url(LIBRARY_URL, None::<&str>);
}

fn open_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        // A second launch (or a gluehome:// link) shows the running one's settings.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| open_settings(app)))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--background"])))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Updates from the GitHub releases, signed with the project's key (ADR 0045).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(Transfers::default())
        .invoke_handler(tauri::generate_handler![get_config, set_config, default_incoming, device_name, incoming_begin, incoming_write, incoming_end, set_status, show_settings, open_library, find_glue_folder, known_folders, path_exists, glue_read, file_size, file_read])
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
            let open = MenuItem::with_id(app, "open", "GLUE Home settings…", true, None::<&str>)?;
            let start = MenuItem::with_id(app, "start", "Start service", false, None::<&str>)?;
            let stop = MenuItem::with_id(app, "stop", "Stop service", true, None::<&str>)?;
            let restart = MenuItem::with_id(app, "restart", "Restart service", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit GLUE Home", true, None::<&str>)?;
            let (s1, s2) = (PredefinedMenuItem::separator(app)?, PredefinedMenuItem::separator(app)?);
            let s3 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&status, &s1, &library, &open, &s3, &start, &stop, &restart, &s2, &quit])?;
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
            TrayIconBuilder::with_id("main")
                .icon(icon)
                .tooltip("GLUE Home")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id().as_ref() {
                    "library" => open_glue(app),
                    "open" => open_settings(app),
                    "start" | "stop" | "restart" => {
                        let _ = app.emit_to("service", "control", e.id().as_ref());
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
            // Started with the computer: stay in the tray. Opened by hand (or the first time): settings.
            if !std::env::args().any(|a| a == "--background") {
                open_settings(app.handle());
            }
            Ok(())
        })
        .on_window_event(|w, e| {
            // Closing the settings window hides it; the service keeps running in the tray.
            if let WindowEvent::CloseRequested { api, .. } = e {
                if w.label() == "settings" {
                    api.prevent_close();
                    let _ = w.hide();
                }
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
