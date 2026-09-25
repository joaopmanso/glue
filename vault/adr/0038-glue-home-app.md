---
status: proposed
date: 2026-09-25
---
# 0038. GLUE Home: a small Node.js/TypeScript app that serves the main computer's library

## Context
GLUE Home runs on the computer with the main collection. It serves its library and files to the
user's other devices, and receives uploads into a configurable incoming folder. It needs a login
(pairing), should be easy to install, and should later take over the "desktop client" roadmap
items (reading rekordbox's master.db, absolute paths, analysis without a browser).

## Decision (proposed)
- **Node.js + TypeScript**, reusing `src/core` as is (parsers, verdicts, fingerprints, tags,
  playlists) and the store's file format.
- **WebRTC:** start with **werift** (pure TypeScript, so it packages into one executable easily).
  Move to **node-datachannel** if throughput tests fall short; it's native and needs its addon
  loaded from disk.
- **Packaging:** a single executable per platform (Windows and macOS first), with a tray icon,
  start at login, and a small local settings page.
- **Pairing:** a code from the signed-in website ([ADR 0036](0036-optional-accounts-and-cloud-signaling.md));
  credentials kept in the OS keychain.
- **What it serves:** only its GLUE folder, the music folders listed there, and the incoming folder,
  checked on every request (no `..`, no symlinks out). Read-only on the JSON store in the first
  release; it writes only uploaded files into the incoming folder, so the browser on that computer
  stays the single writer ([ADR 0009](0009-json-files-in-mco-folder.md)).
- **Incoming folder:** configurable, default `Music/GLUE Incoming`. The GLUE tab on that computer
  adds it as a music folder and picks new files up on its next scan.

## Alternatives considered
- **Tauri (Rust + webview):** small installers and a native UI, but the core would run in the
  webview, and WebRTC in Rust is less mature.
- **Electron:** heavy (about 100 MB) for a mostly headless service.
- **Go + Pion:** excellent WebRTC and tiny binaries, but a second implementation of every parser
  and verdict.

## Consequences
- Node single executables are still in "active development"; the builds need pinning and CI tests
  per OS.
- Code signing (Windows SmartScreen, macOS notarisation) costs money and needs a certificate.
- Remote edits later need GLUE Home to become the single writer, with the local tab talking to it:
  a separate ADR.
