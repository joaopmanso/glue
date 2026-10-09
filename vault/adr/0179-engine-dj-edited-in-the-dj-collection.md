---
status: accepted
date: 2026-10-09
---
# 0179. Engine DJ's own playlists, and its songs' info, edited from GLUE

## Context
ADR 0178's next step. The user (2026-10-09): "What would be nice is if I can add / edit / remove songs and playlists
directly in the DJ collection, not needing to actually import them". Their choice: playlists and folders, the songs
in them, and the songs' info.

GLUE writes into a DJ app's library only as ADR 0168 allows: through GLUE Home, for a library the user switched on
(the main Engine DJ library kept in step), after a backup, while Engine DJ is closed. GLUE Home already reads and
writes Engine DJ's playlists (`glue_interop::enginedb`, ADR 0171) and its songs' cues (ADR 0170).

## Decision
- **An edit is an operation** (GLUE Home's `djEdit`), on the library's own playlists by their Engine DJ id:
  - `new` (a playlist or folder, inside one or at the top, before a sibling or last);
  - `rename`, `move` (into a folder or the top, before a sibling);
  - `delete` (with everything in it; the songs stay in Engine DJ's collection);
  - `add` (GLUE's songs, before an entry or at the end; a song Engine DJ lacks is added to its collection, as ADR 0171);
  - `remove` and `shift` (entries taken out, or moved before an entry).
- **Shown at once:**
  - the operations wait in GLUE Home's cache (`ops`, in order);
  - each is put on the library's tree (`Source.tree`), marking what it touched (`wait`: an amber ● in the sidebar);
  - they're put on again after each read of the library, until they're written.
  - A new playlist has GLUE Home's id (`n:…`) until it's written. Then Engine DJ's id replaces it in the tree, and
    `made` translates the old one for an edit from a page that hadn't seen it yet.
- **Written** by the sync (`djsync.rs`), in the database the library is read from, only while Engine DJ is closed:
  - a backup first;
  - one transaction, each operation on its own savepoint. One whose playlist went meanwhile is dropped (and said in
    the activity); the others are written.
  - The library's next read shows Engine DJ's own.
  - The cache is read and written by one at a time (`dj_keep`): an edit made during a sync isn't lost.
- **Song info both ways**, with the cues: title, artist, album, genre, comment, label, year, rating (`djinfo.rs`).
  - Each side is compared with what it was when they last agreed. Both sides' values are kept, since a song read
    from its file and Engine DJ's record can differ from the start without either changing.
  - One side's change goes to the other; both changed: GLUE's.
  - Taken into GLUE: GLUE Home's own edit, the field marked edited (ADR 0071). The rating is Engine DJ's 0–100, GLUE's
    stars × 20.
- **In the website** (with GLUE Home, the library kept in step):
  - the DJ tree's menus: New playlist / folder inside, Rename, Move to, Delete in Engine DJ; the library's menu: new
    ones at the top;
  - songs dropped on a playlist there, or a song's **Add to Engine DJ playlist**;
  - a playlist's view (not a folder's): drag to reorder, Delete or **Remove from playlist**.

## Alternatives considered
- **Edit through GLUE copies merged three ways (ADR 0171):** that's what filled GLUE's playlists with the whole app.
- **Write at once, the app open:** Engine DJ keeps its database open and overwrites it (ADR 0168).
- **Song info from GLUE to Engine DJ only:** the user's edits in Engine DJ would be lost on the next of GLUE's.
- **A clash for info changed on both sides, as for cues:** a title or a genre isn't worth a question; GLUE's wins, as
  for playlist names in ADR 0171.

## Consequences
- Engine DJ's playlists are changed from GLUE without importing them; GLUE's Playlists stay GLUE's.
- GLUE's song info edits reach Engine DJ, and Engine DJ's reach GLUE, and through GLUE the files' tags (ADR 0071).
- Next (ADR 0178): GLUE's own playlists in Engine DJ's "GLUE" folder; then rekordbox.
