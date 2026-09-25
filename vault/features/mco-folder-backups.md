---
status: in-progress
milestone: M2 (folder) · M3 (backups)
updated: 2026-09-24
adrs: [0009, 0014, 0015]
---
# GLUE folder & backups

## What it does
On first run GLUE asks for a home for its data. The folder picker opens in Documents; the user creates
or picks `GLUE`. Everything GLUE knows lives there as JSON files the user can read, copy and back up.
GLUE keeps daily zip backups and can restore any of them.

## Behaviour
- First run: "Choose where GLUE keeps your library" → `showDirectoryPicker({ id: 'mco-home',
  startIn: 'documents', mode: 'readwrite' })`. Explain that Documents itself can't be chosen (browser
  rule) but a folder inside it can; suggest creating `GLUE`.
- If the chosen folder already contains `mco.json`, open it (another machine, restored backup).
- Later visits: stored handle from IndexedDB → `queryPermission`; if not granted, a single
  "Reconnect to your GLUE folder" button (needs a click; Chrome offers "Allow on every visit";
  no installable app for now (ADR 0017)).
- Backups: one zip per day of `mco.json` + `collections/` into `GLUE/backups/YYYY-MM-DD.zip`, keep 14.
  Settings › Backups lists them with size/date and restores one (current state is zipped first).
- Safari/Firefox: same layout inside OPFS; Settings offers "Download backup (.zip)" and
  "Restore from file". A banner explains that Chrome/Edge keep the library in Documents.

## Layout
See [ADR 0009](../adr/0009-json-files-store.md) for the full folder layout and file formats.

## Acceptance
- [ ] Fresh browser: pick `Documents/GLUE` → `mco.json` + default collection files appear on disk.
- [ ] Reload: library loads from the folder; permission re-grant takes one click.
- [ ] Edit a playlist → only that list's JSON file changes on disk (within ~2 s).
- [ ] Kill the tab mid-write → every file still parses (atomic swap-file writes).
- [ ] Backup → delete a playlist → restore → playlist back.
- [ ] Safari: works in OPFS; download backup → restore on another browser.

## Limits & open questions
- Two tabs open on the same folder: use a Web Lock so only one tab writes; the other becomes read-only.

## Shipped in M2 (2026-09-24)
- The GLUE folder (Chromium) or the browser's private storage (Safari/Firefox) holds profiles and
  collections as JSON files; one-click reconnect on later visits; a Web Lock makes a second tab
  read-only.
- Writes are debounced (0.8 s) and flushed when the tab is hidden; the header says "Saving…" until
  they're on disk.
- Interrupted writes: an empty file (the browser creates it before the first write commits) counts as
  missing; an unreadable file is copied aside as `*.damaged`, reported, and the rest of the library
  still opens. Unit-tested in `tests/store.test.ts`.
- Zip backups and restore move to M3.

## Backups, restore, delete all, onboarding (2026-09-24)
- Profile screen: **Backup** per profile downloads `GLUE backup - <profile> - <date>.zip`;
  **Restore a backup…** here or on the start screen; **Delete all GLUE data…** with a typed
  confirmation ([ADR 0026](../adr/0026-profile-backups-and-wipe.md)).
- After a restore, music folders show **Find folder** (folder permissions can't travel in a zip).
- The start is three steps; step 1 explains it's GLUE's own data folder (not the music) and warns
  when the chosen folder looks like a music folder or isn't empty.
- Still to do: automatic daily backups inside the GLUE folder.
