---
status: accepted; pairing and the device model refined by 0045 (companion, code only)
date: 2026-09-25
---
# 0044. GLUE Home is a Tauri tray app; the website sends songs to it over WebRTC

Supersedes [ADR 0038](0038-glue-home-app.md) (Node.js single executable). Accepts the data-channel
part of [ADR 0037](0037-p2p-webrtc-transport.md) for sending songs; library browsing and streaming
come later.

## Context
The user (2026-09-25) wants GLUE Home as a small program:
- it puts an icon next to the clock, with Start / Stop / Restart / Quit on right-click;
- a simple settings screen: sign in, or type a code; choose the incoming folder;
- on first launch it asks whether to start with the computer;
- Windows and macOS builds, with the website offering the right one;
- the use case: a song downloaded on the laptop is pushed into the desktop's library rather than
  the laptop's.

Later (same day): clicking the icon opens the GLUE library in the browser, and if a GLUE tab is
already open, that one should come forward. They chose Tauri (a small download, built on GitHub,
since this laptop has no Rust) and a first release that includes sending songs.

## Decision
- **Tauri 2** in `home/`:
  - **Rust side** (`home/src-tauri`): the tray menu (status line, Open GLUE library, settings,
    Start, Stop, Restart, Quit); the settings file (the app's config folder, user-only); writes into
    the incoming folder (`.part` then renamed, safe names, never overwriting); start at login
    (autostart plugin, `--background`); `gluehome://` links (deep-link plugin); one instance.
  - **Two web views**:
    - the settings window (Svelte): account, incoming folder, start with the computer, service
      controls, received songs;
    - a hidden service window: online in the signaling room, receiving songs.

    The web views have WebRTC and WebCrypto built in, so the service uses the same browser code as
    the website (`src/core/transfer.ts`, `src/core/password.ts`).
- **Joining the account:**
  - **email + password:** a new `POST /v1/home/signin` makes a GLUE Home device straight away;
  - **Google:** the app opens the website's `#/connect-home`, which signs in there, makes a pairing
    code, and hands it back through `gluehome://pair?code=…`;
  - **a code typed in** from Devices › + GLUE Home.
- **Sending songs:**
  - The website offers a data channel to the GLUE Home through the account's signaling room; STUN
    only for now, no relay.
  - Messages: `file` → binary chunks of 64 KB (sending pauses above 4 MB queued) → `end` →
    `saved` or `failed`.
  - The service writes each chunk through the Rust side (raw IPC bodies).
  - From the website: drop songs on a GLUE Home in Devices, or ⋯ › Send songs…, or select tracks ›
    "Send to <name>".
- **Tray icon click:**
  - opens `…/glue/?open=home#/`;
  - if a GLUE tab answers on a BroadcastChannel, it's asked to come forward (and flashes its title,
    since browsers mostly don't let a page focus itself), and the new tab closes itself;
  - if the browser keeps it open, it offers "Use this tab instead": the other tab saves and releases
    the GLUE folder's writer lock, then this one opens the library.
- **Builds:**
  - `.github/workflows/home.yml` on Windows (NSIS, per user) and macOS (universal dmg, ad-hoc
    signed), on every change;
  - a tag `home-v<version>` publishes both as a GitHub release with fixed names
    (`GLUE-Home-Setup.exe`, `GLUE-Home.dmg`), which the website links to (`releases/latest`) by OS.
- API origins now include the app's web views (`http://tauri.localhost`, `tauri://localhost`).

## Alternatives considered
- **Node.js single executable (ADR 0038):** no tray, dialogs or autostart without native add-ons;
  WebRTC needs a library.
- **Electron:** about 90 MB for a background service.
- **Go + Pion:** a second implementation of the website's code.

## Consequences
- Installers of about 1.3 MB (Windows) and 3.8 MB (macOS), built only on GitHub (about 5 minutes).
  The Rust code can't be run on this laptop; the web part is tested in the browser with a stand-in
  for the Rust side (`e2e/tauri-mock.ts`).
- **Not code-signed:** Windows SmartScreen warns ("More info › Run anyway"); macOS needs right-click
  › Open the first time. Signing needs a certificate (Windows) and an Apple Developer membership.
- **Direct connections only:** computers that can't reach each other (strict NATs) can't send yet;
  a TURN relay is the fix (ADR 0037).
- The device credential is in a user-only file, not the OS keychain yet.
- The GLUE tab on the receiving computer adds the incoming folder as a music folder once. Picking
  new files up needs a scan (or the folder watcher where the browser has one).
