---
status: accepted
date: 2026-09-25
---
# 0045. GLUE Home is the companion of the browser on its computer: code-only, streams its songs, updates itself

Refines [ADR 0044](0044-glue-home-tauri-tray-app.md): pairing, the device model and what GLUE Home
does.

## Context
After installing GLUE Home 0.1.0 on the desktop, the user (2026-09-25) saw two "Desktop" devices
(the browser and GLUE Home), both "Streaming off". Their intent:
- GLUE Home is a companion, not a new instance;
- it provides the same collection and profile as chosen on the website on that computer;
- it acts as its server for streaming and other functions (later: analysis of new tracks, so the
  browser doesn't do it);
- users who want streaming or better analysis install it, but they needn't;
- connecting needs only the code: no email or Google sign-in in the app;
- a "Check for updates" button and an auto updater, so there's no trip to the website every time.

## Decision
- **Companion:**
  - A pairing code remembers the browser that made it (`pairing_codes.device_id`). The GLUE Home that
    claims it is that browser's companion (`devices.companion_of`, migration 0004).
  - Devices shows one row per computer, the browser's, with "GLUE Home on/off" and streaming on while
    it runs. Sending songs goes to it.
  - Claiming again replaces the app's previous device, which the app proves with its old token
    (`replaces`). One companion per browser: an older one is revoked.
- **Code only:** `POST /v1/home/signin` and the website's `#/connect-home` are removed.
  - The app shows where to get a code (Devices › + GLUE Home on this computer).
  - `gluehome://pair?code=` still connects in one click.
- **The same library, read-only:**
  - GLUE Home finds the website's GLUE folder in the usual places (it has `mco.json`), or the user
    chooses it.
  - It reads profiles, collections, tracks and roots from it and never writes to it; the website
    stays the only writer (ADR 0009).
  - Music folders are located by where the user put them, then the collection's `absPath`, then a
    folder of that name in Music, Documents, home, Desktop or Downloads that has the collection's
    songs in it. A folder found by name is remembered.
  - The Rust side reads files only inside the GLUE folder, those music folders and the incoming folder.
- **Streaming:**
  - The website asks another computer's GLUE Home over a `stream` data channel:
    `{ t: 'get', profile, collection, track }` with the owner's own ids (kept on the overlay's
    remote tracks). GLUE Home answers with the size, the bytes, and the end.
  - The website plays the whole file once it has arrived (seeking works), keeps the last three, and
    can analyse it in full on the track page ("Play and analyse from Desktop").
- **Updates:**
  - The Tauri updater plugin, signed with the project's key. The public key is in `tauri.conf.json`;
    the private key is a GitHub secret, with a copy in `%USERPROFILE%\.glue-secrets`.
  - Tagged releases carry signed update files and `latest.json`.
  - GLUE Home checks a minute after starting and every six hours, and installs by itself when
    nothing is being sent or received (switchable). Settings has "Check for updates".

## Alternatives considered
- **GLUE Home as the library's writer:** it would take over analysis and imports, but that means a
  lock or single-writer handover between the browser and the app. It's the next step, built on
  this read access.
- **One device record for both (the app signs in as the browser):** the app and the browser each
  need their own credential and presence.

## Consequences
- Installs from before 0.2.0 have no updater: 0.2.0 is installed by hand once.
- **Old pairings:** a GLUE Home paired before this (no `companion_of`) shows as its own row until
  it's connected again with a code from the browser on that computer.
- **Songs added on their own in the browser** (a file handle, not a folder) can't be served:
  GLUE Home doesn't know their path. Copies kept in the GLUE folder can.
- **Next:** analysis of new tracks by GLUE Home (results handed to the website to store), then
  streaming with seeking before the whole file has arrived.
