---
status: accepted
date: 2026-09-24
---
# 0030. DJ libraries are detected in folders the user has allowed

## Context
The user wants libraries found automatically with an "Add" button, keeping manual import
(2026-09-24). A web page can only read folders the user has granted; `Documents` itself and system
folders (`AppData`, `~/Library`) can't be granted ([ADR 0012](0012-absolute-path-strategy.md),
research/browser-capabilities). rekordbox's own library (`master.db`, encrypted, in AppData) is out
of reach; its XML export is the supported path ([ADR 0011](0011-rekordbox-xml-shared-export.md)).

## Decision
- A shallow finder (`src/core/library/detect.ts`, depth ≤ 3, ≤ 4000 folders) looks for:
  `Engine Library/Database2/m.db`, `_Serato_/database V2`, `collection.nml`, XML files whose start
  is `<DJ_PLAYLISTS` (rekordbox) or a `<plist` named *Library* (iTunes / Apple Music).
- It runs on every collection open, after scans, imports and new places, over: the music folders,
  the MCO folder itself (always readable: the place to export rekordbox / Apple Music XML to), and
  "library places" the user allows with **Look in…** (remembered in IndexedDB; e.g. Documents ›
  Native Instruments for Traktor). Places whose permission lapsed show **Allow**.
- Each import started from a detected library records `origin` (place, relative path, file date) on
  its source; a newer file shows **Update** (re-import is idempotent, ADR 0020). Imports made the old
  way are matched by app + file name.
- Manual **+ Import** stays.

## Consequences
- Engine DJ, Serato and iTunes appear as soon as the Music folder is added; Traktor after one "Look
  in…"; rekordbox after exporting into the MCO folder (repeat the export, press Update).
- Detection never reads whole libraries until the user presses Add.
