---
status: accepted
date: 2026-10-08
supersedes: 0010
---
# 0168. DJ apps synced both ways: playlists, cues, loops and beat grids

## Context
The user (2026-10-08): "goal is to be able to prepare songs outside of their DJ native apps… a two way sync of the
playlists, cuepoints, loop points… add songs to a playlist or create new playlists on Glue and be able to move them
into rekordbox or engine dj… without the drag box… if they are already set on Engine DJ or rekordbox, they should be
displayed, if they are changed on Glue they should update on the apps".

ADR 0010 kept GLUE out of other apps' libraries in v1 and said "direct write-back comes later (desktop era), opt-in,
with an automatic backup before every write". GLUE Home is that desktop era: it reads the libraries in Rust and
follows them live (ADR 0167). What writing to Engine DJ involves is in `vault/research/engine-dj-write-back.md`. The
user's choices (2026-10-08):
- write-back with safeguards;
- Engine DJ first;
- a clash settled by them;
- the beat grid included.

## Decision
- **GLUE writes into a DJ app's library**, only through GLUE Home and only:
  - for a library the user switched on (opt-in, per library);
  - after a backup of that library's files, before every write;
  - while that app is closed: the change waits, and is written a few seconds after the app quits.

  Reading stays live. This replaces ADR 0010's "never write".
- **Both ways, by three-way merge.** GLUE Home keeps the state it last synced with each library. A change on one side
  since then goes to the other; both sides' changes to different things are kept. The same cue, loop, grid or list
  changed on both sides is a clash, shown in GLUE to settle (as a shared collection's are).
- **What's synced:** playlists (new ones, songs added, removed and reordered), hot cues, memory cues, loops and the
  beat grid.
- **In phases:**
  1. Every app's cues, loops and grid shown in GLUE (this release, read only). Engine DJ's are read from
     `PerformanceData`: hot cues (`quickCues`), loops (`loops`), the beat grid (`beatData`, the adjusted grid where
     set). rekordbox's grid comes from its XML `TEMPO`, Traktor's from its AutoGrid marker. Each record keeps its grid
     next to its cues (`SourceTrack.grid`). Prepare shows each app's, with **Use its cues** and **Use its grid**.
  2. Cues, loops and the grid written into Engine DJ: one database per song, its blobs changed in place, unknown bytes
     kept.
  3. Playlists both ways with Engine DJ, once an experiment has shown how Engine DJ reconciles the tree it copies into
     every database (C:, each drive).
  4. rekordbox through its `master.db`, then Traktor and Serato.
- **Held as the rest:** the website's readers are the reference (`tests/golden/interop`), `glue-interop` follows them
  byte for byte.

## Alternatives considered
- **Files the apps import (rekordbox XML, ADR 0011):** one way only, a manual step each time, and rekordbox doesn't
  update the cues of songs it already has from an XML.
- **Writing while the app runs:** Engine DJ asks tools not to open its database then, and rekordbox would overwrite it.

## Consequences
- A bug writing could damage a DJ's library: every write is backed up first, opt-in, and tested on throwaway libraries
  before the user's.
- CLAUDE.md's non-negotiable becomes "write into a DJ app's library only as ADR 0168 allows".
- Prepare is where songs are made ready, and what GLUE has there is what the apps get.
