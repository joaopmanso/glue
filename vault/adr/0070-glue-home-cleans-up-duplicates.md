---
status: accepted
date: 2026-09-27
---
# 0070. GLUE Home moves duplicate music files aside, or recycles them, when asked

## Context
The user (2026-09-27): a duplicates folder, configured in GLUE Home like the incoming folder but not
shown in GLUE. On the Duplicates page, with GLUE Home, each group gets two options:
- move the other copies into the duplicates folder and out of the collection;
- delete them from the disk, to the operating system's Recycle Bin, after a confirmation.

The best copy is the one kept. "Use in playlists" makes a copy the best. Playlists move to the best
copy first. Several groups can be done at once.

Until now GLUE never changed a music file (only its own GLUE folder, and the incoming folder's songs,
by moving them into music folders). A web page can't send a file to the Recycle Bin; the File System
Access API only deletes for good.

## Decision
- **GLUE Home:**
  - **A "Duplicates folder" setting** (its settings, Folders). The default is `GLUE duplicates` in the
    user's folder, not in Music, which is often a music folder itself. A folder chosen inside a music
    folder is refused, with a warning in the settings: GLUE would find those songs again.
  - **`POST /fs/dupes {mode: "move" | "trash", items: [{root, path}]}`** (`dupes.rs`), a result per
    item:
    - Only files inside a music folder or the incoming folder GLUE Home knows; never the GLUE folder,
      never a DJ library's folder. Paths are checked as for every `/fs/*` call (plain names, still
      inside the folder once links are followed).
    - **Move:** into `<duplicates>/<music folder's name>/<path>`, so they can go back. A name that's
      taken gets a number. Across drives: copied, the size checked, then the original removed.
    - **Trash:** the `trash` crate (the Recycle Bin, the macOS Trash).
- **The website, in Home mode only** (`lib/dupes` `cleanUp`, `DuplicatesView`), for "same recording"
  groups only (not "probable" ones, which aren't confirmed by sound):
  - **Actions:** "Move the others…" and "Delete the others…" per group; tick several groups and do
    them from a bar.
  - **The confirmation** lists every file that goes, the space it frees, and any DJ library that
    still lists one (it will show them missing).
  - **The files go first.** Each copy that went folds into the best one (`lib.foldCopies`, which is
    `absorbTracks`): its playlists' places, the DJ libraries' records, rating, notes, tags and Prepare.
    A copy whose file couldn't go changes nothing and is reported.
  - **"Use in playlists"** remembers the chosen copy (`meta.dupBest`), which the groups then show as
    best.
  - An older GLUE Home is told to update.

## Consequences
- GLUE changes music files for the first time, and only through GLUE Home, only on request, never
  silently. Moving is the default wording; deleting is marked and confirmed.
- **DJ apps** (Engine DJ, rekordbox…) still list the removed files until they're pointed at the copy
  that stays; the confirmation says so.
- **Tests:**
  - Rust unit tests for the move (mirrored path, numbered clash, refusals);
  - the e2e fake has the endpoint;
  - e2e: move one group, recycle another ticked from the bar; the playlist and rating move to the
    copy that stays.
