---
status: accepted
date: 2026-09-24
---
# 0020. Imports bring metadata first; music folders are linked afterwards

## Context
DJ libraries (Rekordbox XML, Engine DJ m.db, Serato database V2 + crates, Traktor NML, Apple Music /
iTunes XML, M3U8) reference audio by absolute path, but a website can only open files inside folders
the user grants. Chosen with the user: import shows everything right away, then MCO asks for the
music folder(s) once and matches (2026-09-24).

## Decision
- Importing a library file creates a **source** (read-only record of what was imported), adds its
  tracks to the collection as **unlinked** tracks carrying the imported metadata (title, artist,
  album, genre, BPM, key, rating, cues, play count, date added), and turns its playlists / crates
  into MCO playlists (marked with their origin).
- **Link music folder**: after granting a folder, MCO scans it and matches unlinked tracks by path
  suffix (longest common suffix of the imported absolute path and the file's relative path), then by
  file name + size. A match also records the root's absolute path (ADR 0012).
- Only linked tracks can be played or analysed; unlinked tracks show their imported details and a
  "Find file" hint.
- Re-importing the same source updates it in place (matched by external id / path), never duplicating
  tracks or playlists.

## Consequences
- Imports are fast and useful before any folder is granted.
- Matching can be wrong for files with identical names in different folders; suffix matching on
  several path levels makes that rare, and ambiguous matches are left unlinked.
