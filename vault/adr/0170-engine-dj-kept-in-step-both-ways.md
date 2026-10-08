---
status: accepted
date: 2026-10-09
---
# 0170. Engine DJ kept in step both ways: cues, loops and the beat grid

## Context
ADR 0168 decided on a two-way sync with the DJ apps, starting with Engine DJ: opt-in, a backup before every write, only
while the app is closed, clashes asked, the grid included. ADR 0169 made it the main DJ library's. This is phase 2: the
cues, loops and grid. Engine DJ's layout is in `vault/research/engine-dj-write-back.md`. Its model differs from
GLUE's, which is rekordbox-shaped:

| | Engine DJ | GLUE |
|---|---|---|
| Hot cues | 8 hot cue slots (points) | pads A–H (a cue or a loop on each) |
| Loops | 8 saved loop slots | memory loops (and memory cues) |
| Other | a main cue | — |

## Decision
- **Switched on per library:** "Keep in step both ways…" on the main Engine DJ library's menu (`Source.sync`, kept
  through every read, held by the import goldens), with GLUE Home running; it asks once.
- **What maps to what** (`glue_interop::sync`):
  - a pad is the hot cue slot of its letter; a loop on a pad goes as a hot cue at its start (Engine DJ has no hot
    loops);
  - GLUE's memory loops are Engine DJ's saved loops, each keeping its slot. Engine DJ's are now read as memory loops;
    they were pad loops in 0.65, colliding with hot cues;
  - memory cues and Engine DJ's main cue stay each side's own;
  - the grid is GLUE's whole one (a BPM and a first beat) against Engine DJ's adjusted grid. Writing it also sets
    `Track.bpmAnalyzed` **[UNVERIFIED that Engine DJ's BPM column reads it there]**.
- **Three-way merge, per slot and for the grid**, against what the two sides last agreed on:
  - the same on both sides: in step;
  - changed on one side: that side's goes to the other;
  - changed on both: a clash, each side left as it is, shown in the song's Prepare ("Keep GLUE's" / "Keep Engine
    DJ's");
  - a song with no cues of GLUE's own shows the library's, so GLUE has no change of its own there;
  - colours are compared only where both sides have one, since GLUE gives default colours to Engine DJ's uncoloured
    cues.
- **What they agreed on is GLUE Home's own** (its cache, `dj/<p>/<c>/<source>.json`), not the GLUE folder: only that
  computer syncs that library, and it's state, not data. Lost, the next sync takes only what's on one side and
  removes nothing. Settling a clash sets the agreed value to the other side's, so the side kept counts as the one
  that changed.
- **Written by GLUE Home** (`djsync.rs`), after each look (every 5 s), when GLUE's library or a database changed since
  the last sync:
  - never while `Engine DJ` or `OfflineAnalyzer` runs (`Host::apps_running`: `tasklist` / `pgrep`; unsure counts as
    running), nor while a database's journal or WAL isn't empty;
  - each database found by its id (where the library was read from, and each drive's `Engine Library`);
  - a copy of it first, in GLUE Home's cache (`dj-backups/<uuid>/`, the last 3), not the GLUE folder (which may be in
    OneDrive; F: is 163 MB);
  - one transaction per database, only the fields that changed (`quickCues`, `loops`, `beatData`), every byte GLUE
    doesn't know kept (`perf::encode_hot`, `encode_loops`, `encode_grid`);
  - Engine DJ's changes into GLUE as GLUE Home's own edit of the songs' `prep`.
- **The page** shows the state ("⇄" by the library: waiting for Engine DJ to close, or in step) and the clashes;
  `/rpc` `dj` (with `sync`), `djClashes`, `djResolve`, `djSyncNow`.

## Alternatives considered
- **The agreed state in the GLUE folder (on the source):** every read rebuilds the source, and it would sync to other
  computers that don't sync this library.
- **Writing while Engine DJ runs:** it asks tools not to, and its in-memory library would be out of step.
- **Re-numbering Engine DJ's saved loops in time order:** would move the user's loop pads in Engine DJ; slots are kept.

## Consequences
- Prepared in GLUE, played in Engine DJ, and the other way round, for cues, saved loops and grids.
- Engine DJ must be closed for GLUE's changes to reach it; the sidebar says so.
- Before the user's own library is switched on: a hand test on it (with its backups) is theirs to do.
- Playlists both ways (phase 3) need an experiment on how Engine DJ reconciles its copies of the tree first.
