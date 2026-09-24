---
status: accepted
date: 2026-09-24
---
# 0026. Profile backups are zips; "delete all" removes only what MCO made

## Context
The user wants to download a backup of a profile, restore it (on a fresh start or another
computer), and delete all of MCO's data (2026-09-24). New users also chose a *music* folder when asked
for MCO's data folder. [ADR 0009](0009-json-files-store.md) planned daily zip backups inside the MCO
folder; this is the manual, per-profile part of that.

## Decision
- **Backup** = one zip per profile, built in the page with MCO's own zip writer (`src/core/zip.ts`:
  deflate via `CompressionStream('deflate-raw')`, stored when that doesn't help, CRC-32, UTF-8
  names; standard zip, opens in any tool). Contents: `mco-backup.json` (format, version, schema
  version, profile name/colour, collections and track counts), `profile/…` (everything under
  `profiles/<pid>/`), `files/…` (songs MCO keeps its own copy of). Named
  `MCO backup - <profile> - <date>.zip`.
- Not in the backup: folder handles (the browser can't export them) and derived data (stored
  analyses, fingerprints: rebuilt by the background analysis). After a restore, each music folder
  shows **Find folder** to link it again (`relinkFolder`).
- **Restore**: checks the manifest and versions (refuses backups from a newer MCO), refuses paths
  outside the MCO folder, replaces a profile with the same id after confirmation. From the start
  screen the backup is chosen first and restored as soon as the MCO folder is chosen.
- **Delete all MCO data**: removes `mco.json`, `profiles/` and `files/` from the MCO folder (nothing
  else the user keeps there), MCO's IndexedDB (handles), its browser cache and `mco.*` preferences;
  typed confirmation ("delete"); back to step 1.
- **Onboarding**: three steps (where MCO saves its data · your profile · add your music). Step 1 says
  plainly it's not the music folder and suggests `Documents › MCO`; the chosen folder is looked into
  first: an existing MCO library opens, an empty folder is used, a folder with audio files or other
  content gets a warning with "Choose another folder" / "Use it anyway".

## Consequences
- Moving to another computer = backup, restore, Find folder. Daily automatic backups (ADR 0009) are
  still to do.
- A backup of a large browser-storage library (with song copies) can be big; the zip writer refuses
  over 4 GB (no ZIP64).
