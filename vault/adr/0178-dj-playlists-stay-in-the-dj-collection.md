---
status: accepted
date: 2026-10-09
---
# 0178. A DJ app's playlists stay in its DJ collection; GLUE's own go to its "GLUE" folder

## Context
ADR 0171 made the playlists in GLUE's folder of the main Engine DJ library Engine DJ's, kept in step both ways.
Turning the sync on brought every one of them in, and GLUE Home brought the folder back whenever it was missing. The
user (2026-10-09): "after adding Engine DJ sync support I now see all Engine DJ playlists under Playlists not just the
ones I imported. This also means I can't delete playlists from there as they will re-sync and show up again. The
behavior should be the same as before: if I import the playlist it shows under playlists, if not it keeps under the
DJ collection." They also asked to:
- edit songs and playlists directly in the DJ collection, without importing them;
- sync GLUE's own playlists into the DJ apps, under a "GLUE" folder that repeats GLUE's structure, with the apps'
  icons showing which playlists and folders are synced.

In the laptop's copy of their collection: 147 Engine DJ copies imported on 30 September – 3 October, 618 brought in by
the sync on 9 October, and 1 playlist made in GLUE.

The user's choices (2026-10-09):
- every Engine DJ copy taken out of GLUE's playlists, the ones imported before the sync too;
- GLUE's playlists and the app's "GLUE" folder kept in step both ways;
- Engine DJ first, rekordbox as its own step later;
- in the DJ collection: playlists and folders, the songs in them, and the songs' info.

## Decision
- **Three kinds of playlist:**
  - **A DJ app's own** stay in its DJ collection (`Source.tree`, under the library in the sidebar). GLUE has no copy of
    them unless the user imports one.
  - **An import** (a copy under Playlists, `List.origin`) follows its library one way again (ADR 0063, 0090), whether
    or not the library is kept in step: a playlist gone from the library leaves GLUE a minute later, and GLUE's copy
    keeps the library's order. Deleting a copy only deletes GLUE's.
  - **GLUE's own** (no `origin`) can be sent to a DJ app: mirrored both ways under a "GLUE" folder there.
- **This step** (GLUE Home 0.71):
  - turning the sync on brings no playlists in (the page's `importLists(…, [''])` and GLUE Home's fallback are gone);
  - GLUE Home's `dj_clear_copies` takes every copy of the main library's playlists out of GLUE's playlists, once:
    - a backup of the profile first (`backups/pre-engine-playlists-…zip`);
    - each copy into the bin (Recently deleted);
    - the user's own playlists in there moved to the top;
    - marked done in GLUE Home's cache (`listsOut`), with ADR 0171's merge state let go;
  - ADR 0171's two-way merge of the copies stops. The cues, loops and grids (ADR 0170) and the songs pointed at the
    copy the duplicates' clean-up kept (ADR 0172) stay.
- **Next: editing a DJ app's own playlists in the DJ collection.**
  - What can be edited:
    - new, renamed, moved and deleted playlists and folders;
    - songs added, removed and reordered;
    - a song's info (title, artist, album, genre, rating, comment) in the app's own record.
  - How it's written:
    - each edit is an operation sent to GLUE Home;
    - it shows in GLUE at once, marked as waiting;
    - it's written into the app's library through GLUE Home, as ADR 0168 allows: the app closed, a backup first.
- **Then: GLUE's playlists in the app's "GLUE" folder.**
  - The setting: a playlist or folder is turned on for an app, with the app's icon by it.
  - What's in the app:
    - the folder "GLUE" at the top of the app's tree;
    - inside it, GLUE's folders down to each synced playlist.
  - How it's kept in step: both ways, with ADR 0171's three-way merge (names, places, songs, order), questions and
    safety, scoped to that folder.
  - The link: kept in GLUE Home's cache, not in `List.origin` (`origin` means an import).
- **rekordbox** (its `master.db`, ADR 0168's phase 4) after Engine DJ, as its own step.

## Alternatives considered
- **Keep the copies imported before the sync (by their date):** offered; the user chose to take them all out and
  import again what they want.
- **The app's "GLUE" folder written one way (GLUE the master):** simpler. The user's choice is both ways.
- **Edit a DJ app's playlists through GLUE copies (ADR 0171):** that's what filled GLUE's playlists with the whole app.

## Consequences
- GLUE's Playlists hold only the user's own playlists and their imports. A deleted copy doesn't come back.
- Until the next steps ship, GLUE doesn't change Engine DJ's playlists (it did through ADR 0171's copies): the
  cues, loops and grids still sync.
- ADR 0171 is superseded; ADR 0172's order of the copies too (its relink stays).
- Recovery: the backup, and Recently deleted, hold every copy taken out.
