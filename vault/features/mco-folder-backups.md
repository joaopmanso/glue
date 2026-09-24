---
status: planned
milestone: M2
updated: 2026-09-24
adrs: [0009, 0014, 0015]
---
# MCO folder & backups

## What it does
On first run MCO asks for a home for its data. The folder picker opens in Documents; the user creates
or picks `MCO`. Everything MCO knows lives there as JSON files the user can read, copy and back up.
MCO keeps daily zip backups and can restore any of them.

## Behaviour
- First run: "Choose where MCO keeps your library" → `showDirectoryPicker({ id: 'mco-home',
  startIn: 'documents', mode: 'readwrite' })`. Explain that Documents itself can't be chosen (browser
  rule) but a folder inside it can; suggest creating `MCO`.
- If the chosen folder already contains `mco.json`, open it (another machine, restored backup).
- Later visits: stored handle from IndexedDB → `queryPermission`; if not granted, a single
  "Reconnect to your MCO folder" button (needs a click; Chrome offers "Allow on every visit";
  installed PWA keeps it automatically).
- Backups: one zip per day of `mco.json` + `collections/` into `MCO/backups/YYYY-MM-DD.zip`, keep 14.
  Settings › Backups lists them with size/date and restores one (current state is zipped first).
- Safari/Firefox: same layout inside OPFS; Settings offers "Download backup (.zip)" and
  "Restore from file". A banner explains that Chrome/Edge keep the library in Documents.

## Layout
See [ADR 0009](../adr/0009-json-files-store.md) for the full folder layout and file formats.

## Acceptance
- [ ] Fresh browser: pick `Documents/MCO` → `mco.json` + default collection files appear on disk.
- [ ] Reload: library loads from the folder; permission re-grant takes one click.
- [ ] Edit a playlist → only that list's JSON file changes on disk (within ~2 s).
- [ ] Kill the tab mid-write → every file still parses (atomic swap-file writes).
- [ ] Backup → delete a playlist → restore → playlist back.
- [ ] Safari: works in OPFS; download backup → restore on another browser.

## Limits & open questions
- Two tabs open on the same folder: use a Web Lock so only one tab writes; the other becomes read-only.
