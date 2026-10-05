---
status: accepted
date: 2026-10-03
---
# 0151. GLUE opens in GLUE Home's own window, showing the live site

## Context
The user wanted a desktop app, "rather than just opening another browser" (2026-10-02). GLUE Home's tray opened
`https://joaopmanso.github.io/glue/?open=home#/` in the default browser. ADR 0051 kept the website on its public
address (the same origin: its storage, prefs and sign-in), and ADR 0057 considered and set aside moving the website
into a desktop app. Asked on 2026-10-03, the user chose the live site in a native window over a copy bundled into
GLUE Home.

## Decision
- **A native window, label `glue`** (`home/src-tauri/src/window.rs`), built when opened and destroyed when closed. It
  loads `https://joaopmanso.github.io/glue/?app=window#/`: the same site and origin as a browser tab, so Home mode,
  `/connect`, the stream service worker and the account work unchanged.
- **Only the site stays in it** (`stays`): other sites and `gluehome://` open through the system.
  - Google's sign-in opens as a popup of the window (`popup`), created with the opener's environment so it can answer
    the page.
  - Downloads go to Downloads under a free name, and are shown there.
  - Drops reach the page (no Tauri drag-and-drop handler).
- **Its place** (position, size, maximized) is kept in `window.json` beside the settings: saving the settings tells
  every window.
- **Opening the library:**
  - the tray click, "Open GLUE library" and `--library` (a "GLUE" shortcut; a second start with it too) open or
    focus the window;
  - the settings' "Open the library in" (`libraryIn: "browser"`) sends it to the browser, as does a window that
    can't open.
- **The website knows** it's in the window (`inWindow()`, `src/lib/homeApp.ts`): `?app=window` is taken off the
  address and kept in sessionStorage. GLUE Home isn't offered for download there. `?open=home` (the tab hand-off)
  isn't used, since the window's storage is its own.

## Alternatives considered
- **A copy of the site bundled into GLUE Home:** works offline and is versioned with GLUE Home. But the token
  hand-over (`/connect` answers github.io only), the stream service worker on Tauri's own origin, and Google's
  authorized origins would all need work, for a page that needs the internet for GLUE Cloud anyway.
- **Keep the browser:** what the user asked to leave.

## Consequences
- The window has its own storage: a first sign-in, once. Its library comes from GLUE Home (Home mode), as in a tab.
- It needs the internet to load the page (the WebView's cache keeps it for a while).
- A local run of GLUE Home on a development computer registers `gluehome://` for that build: remove
  `HKCU\Software\Classes\gluehome` after testing there.
