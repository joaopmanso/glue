---
status: accepted
date: 2026-09-28
---
# 0083. GLUE Home counts what it's asked, and does its file work off the main thread

## Context
The user (2026-09-28): "I was not running any background analysis so best to check what caused that
behavior."
Measured on the user's computer the same day:
- **GLUE Home's own background analysis** (ADR 0046) last ran on 2026-09-26. Its cache held 7,920
  songs.
- **Its main thread used about 10% of a core, steadily,** while a GLUE tab (Home mode, over the local
  link) and a phone were connected. The rest of it was idle.
- **Every bridge command ran on that thread:** file reads for streaming (1 MB at a time), cache reads
  and writes, listings. Plain Tauri commands run on the main thread, which also runs the windows and
  the tray.
- **Every local-link request and every file read also read and parsed the settings file** from disk.
- **Nothing showed what GLUE Home was being asked,** so the cause couldn't be pinned down.

## Decision
- **The service page's file commands are `async`,** so Tauri runs them off the main thread:
  `file_read`, `file_size`, `cache_read`, `cache_write`, `cache_list`, `glue_read`, `glue_list`,
  `incoming_list`.
- **The settings are kept in memory,** and read again only when the file's date or size changes.
- **Streaming looks up a song's path once a minute,** not for each piece.
- **GLUE Home counts what it's asked, since it started:** how many times, the time spent, and the
  bytes. The counts cover:
  - the local link's requests, by path;
  - the bridge's file commands;
  - the service page's requests from other devices, by kind.
  - The settings show them under Service › "What GLUE Home was asked", the most time first, with
    Copy.

## Alternatives considered
- **Guess and cut polling in the website:** without numbers, the wrong thing might be cut.
- **A log file:** grows, and is harder for the user to share than one table.

## Consequences
- **The windows and the tray stay responsive while songs stream.**
- **The user can copy the table,** and the next cost to cut is visible.
