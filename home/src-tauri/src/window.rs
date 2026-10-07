//! The GLUE window (ADR 0151): the library in GLUE Home's own window instead of the browser. It shows the live site
//! (the same page, the same origin, so Home mode, the stream service worker and the account work as in a browser);
//! the site knows it's in the window by `?app=window`. Only the site stays in it: other sites open in the browser,
//! Google's sign-in opens as a popup of the window, downloads go to the Downloads folder.
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

/// The label of the window.
pub const LABEL: &str = "glue";
/// What the window opens.
pub const URL: &str = "https://joaopmanso.github.io/glue/?app=window#/";

/// The site's own pages stay in the window (the address GLUE is served from, and its local test servers).
pub fn stays(url: &Url) -> bool {
  match url.scheme() {
    "https" => url.host_str() == Some("joaopmanso.github.io") && url.path().starts_with("/glue"),
    "about" | "blob" | "data" => true,
    _ => false,
  }
}

/// Windows the page may open as its popups: Google's sign-in (its answer comes back to the opener).
pub fn popup(url: &Url) -> bool {
  url.scheme() == "https" && matches!(url.host_str(), Some("accounts.google.com"))
}

/// Where the window was, and how big (kept beside GLUE Home's settings, not in them: saving those tells every window).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Place { pub x: i32, pub y: i32, pub w: u32, pub h: u32, pub max: bool }

fn place_file(app: &AppHandle) -> Option<PathBuf> { app.path().app_config_dir().ok().map(|d| d.join("window.json")) }

pub fn read_place(app: &AppHandle) -> Option<Place> {
  let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(place_file(app)?).ok()?).ok()?;
  let n = |k: &str| v[k].as_i64();
  let p = Place { x: n("x")? as i32, y: n("y")? as i32, w: n("w")? as u32, h: n("h")? as u32, max: v["max"].as_bool().unwrap_or(false) };
  (p.w >= 400 && p.h >= 300).then_some(p)
}

fn save_place(app: &AppHandle, p: Place) {
  if let Some(f) = place_file(app) {
    let _ = std::fs::write(f, serde_json::json!({ "x": p.x, "y": p.y, "w": p.w, "h": p.h, "max": p.max }).to_string());
  }
}

/// Open the window, or bring it forward.
pub fn open(app: &AppHandle) -> Result<(), String> {
  if let Some(w) = app.get_webview_window(LABEL) {
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
    return Ok(());
  }
  let url: Url = URL.parse().map_err(|e| format!("{e}"))?;
  let (nav, pop, dl) = (app.clone(), app.clone(), app.clone());
  let mut b = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(url))
    .title("GLUE")
    .min_inner_size(900.0, 600.0)
    // Songs and folders dropped on it reach the page (Home mode finds them by name and size).
    .disable_drag_drop_handler()
    .on_navigation(move |u| {
      if stays(u) { return true; }
      let _ = nav.opener().open_url(u.as_str(), None::<&str>);
      false
    })
    .on_new_window(move |u, features| {
      if popup(&u) {
        // A popup of the window (its opener kept), so the sign-in can answer the page.
        let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        if let Ok(w) = WebviewWindowBuilder::new(&pop, format!("glue-popup-{n}"), WebviewUrl::External("about:blank".parse().unwrap()))
          .window_features(features).title("Sign in").build() {
          return tauri::webview::NewWindowResponse::Create { window: w };
        }
        return tauri::webview::NewWindowResponse::Deny;
      }
      if stays(&u) { return tauri::webview::NewWindowResponse::Allow; }
      let _ = pop.opener().open_url(u.as_str(), None::<&str>);
      tauri::webview::NewWindowResponse::Deny
    })
    // An export or a backup: into Downloads, then shown there.
    .on_download(move |_w, e| {
      match e {
        tauri::webview::DownloadEvent::Requested { destination, .. } => {
          if let (Ok(dir), Some(name)) = (dl.path().download_dir(), destination.file_name().map(|n| n.to_owned())) {
            *destination = free_name(&dir, &name.to_string_lossy());
          }
        }
        tauri::webview::DownloadEvent::Finished { path: Some(p), success: true, .. } => { let _ = dl.opener().reveal_item_in_dir(p); }
        _ => {}
      }
      true
    });
  // Signed in by GLUE Home (ADR 0159): a single-use code for this window only, which the page trades for a session as
  // this computer when it isn't signed in (no second sign-in in the window).
  if let Some(code) = crate::engine::window_code(app) { b = b.initialization_script(sign_in_script(&code)); }
  match read_place(app) {
    Some(p) => { b = b.inner_size(p.w as f64, p.h as f64).position(p.x as f64, p.y as f64).maximized(p.max); }
    None => { b = b.inner_size(1400.0, 900.0).center(); }
  }
  let w = b.build().map_err(|e| e.to_string())?;
  // Its place kept as it moves (written when it stops moving: every move event would write a file).
  let (app2, w2) = (app.clone(), w.clone());
  let last = std::sync::Arc::new(std::sync::Mutex::new(std::time::Instant::now()));
  w.on_window_event(move |e| {
    if matches!(e, tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) | tauri::WindowEvent::CloseRequested { .. }) {
      let now = std::time::Instant::now();
      *last.lock().unwrap() = now;
      let (app3, w3, last2) = (app2.clone(), w2.clone(), last.clone());
      let closing = matches!(e, tauri::WindowEvent::CloseRequested { .. });
      let save = move || {
        let max = w3.is_maximized().unwrap_or(false);
        // Where it was before it was made full size, when it is.
        if let (Ok(pos), Ok(size), Ok(scale)) = (w3.outer_position(), w3.inner_size(), w3.scale_factor()) {
          let (pos, size) = (pos.to_logical::<i32>(scale), size.to_logical::<u32>(scale));
          if !max || read_place(&app3).is_none() { save_place(&app3, Place { x: pos.x, y: pos.y, w: size.width, h: size.height, max }); }
          else if let Some(p) = read_place(&app3) { save_place(&app3, Place { max, ..p }); }
        }
      };
      if closing { save(); return; }
      std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(600));
        if *last2.lock().unwrap() == now { save(); }
      });
    }
  });
  crate::follow_windows(app);
  Ok(())
}

/// The script that hands the window's page GLUE Home's code (a JSON string: nothing in it can break out).
pub fn sign_in_script(code: &str) -> String { format!("window.__glueHomeSignIn = {};", serde_json::Value::from(code)) }

/// A name in `dir` that isn't taken: "Export.xml", else "Export (2).xml"…
fn free_name(dir: &std::path::Path, name: &str) -> PathBuf {
  let (stem, ext) = match name.rfind('.') { Some(i) if i > 0 => (&name[..i], &name[i..]), _ => (name, "") };
  let mut p = dir.join(name);
  let mut i = 2;
  while p.exists() { p = dir.join(format!("{stem} ({i}){ext}")); i += 1; }
  p
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_the_site_stays_in_the_window() {
    let u = |s: &str| s.parse::<Url>().unwrap();
    assert!(stays(&u(URL)));
    assert!(stays(&u("https://joaopmanso.github.io/glue/#/track/abc")));
    assert!(!stays(&u("https://joaopmanso.github.io/other/")));
    assert!(!stays(&u("https://github.com/joaopmanso/glue/releases/latest")));
    assert!(!stays(&u("https://accounts.google.com/o/oauth2")));
    assert!(!stays(&u("gluehome://pair?code=X")));
    assert!(stays(&u("about:blank")));
    assert!(popup(&u("https://accounts.google.com/gsi/select?client_id=1")));
    assert!(!popup(&u("https://evil.example/accounts.google.com")));
    assert!(URL.contains("app=window") && !URL.contains("open=home"));
  }

  #[test]
  fn the_sign_in_code_is_a_json_string() {
    assert_eq!(sign_in_script("abc-_9"), r#"window.__glueHomeSignIn = "abc-_9";"#);
    assert_eq!(sign_in_script("\";alert(1)//"), r#"window.__glueHomeSignIn = "\";alert(1)//";"#);
  }

  #[test]
  fn a_download_never_replaces_a_file() {
    let d = std::env::temp_dir().join(format!("glue-dl-{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    assert_eq!(free_name(&d, "Export.xml"), d.join("Export.xml"));
    std::fs::write(d.join("Export.xml"), b"x").unwrap();
    assert_eq!(free_name(&d, "Export.xml"), d.join("Export (2).xml"));
    let _ = std::fs::remove_dir_all(&d);
  }
}
