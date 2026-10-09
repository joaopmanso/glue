---
status: accepted; the order of GLUE's copies superseded by 0178 (copies follow the library one way)
date: 2026-10-09
---
# 0172. Engine DJ: the playlists' order in step, and songs pointed at the copy kept

## Context
After ADR 0171, the user (2026-10-09): a playlist made in GLUE showed up in Engine DJ, but "because of the duplicate
clean up the engine DJ now points to songs that no longer exist, it would be nice to update those references with the
best copy chosen. also … playlist is always added to the end."

GLUE Home's duplicate clean-up (ADR 0070) moves the other copies aside and folds them into the copy kept, in GLUE:
GLUE's record of each of those Engine DJ songs already names the song kept. Engine DJ's own record still names the file
that went. A new playlist was made last among its siblings, and their order wasn't synced.

## Decision
- **Songs whose file is gone** (`djlists.rs` `dj_relink`, before the playlists): an Engine DJ song of the main library
  whose file isn't there, whose GLUE song has its file:
  - **The kept copy on the same drive, not in Engine DJ yet:** the record names the kept file (path, file name, size).
    Its id, cues, playlist places and history stay.
  - **Engine DJ has the kept copy already** as another song: that song takes the gone one's playlist entries (an
    entry of a playlist that has it already goes). It takes the gone one's hot cues and loops too, where it has none.
  - **The kept copy on another drive:** that drive's song (added where it lacks it) takes the entries.

  The gone record stays in Engine DJ's collection (removing songs from it is the user's). Repointed entries are counted
  once, not at every sync. The playlist sync maps a GLUE song to the record kept, not the gone one.
- **The order of playlists among their siblings** (each folder, and the top): merged as a playlist's songs are,
  against the order they last agreed on (GLUE Home's cache, `orders`).
  - GLUE's is its lists' `position`; Engine DJ's is the `nextListId` chain, rewritten in one pass through values no
    row has (`enginedb::set_order`; a link is unique among siblings).
  - A new playlist goes where it was put.
  - The website's re-sort of a library's copies into the library's order (`syncLinkedLists` `order`) is off for a
    library kept in step, since GLUE Home keeps the order both ways.

## Alternatives considered
- **Removing the gone songs from Engine DJ's collection:** destructive, and not asked for. They stay, without entries
  once another song took them.
- **Engine DJ's order winning for playlists made in GLUE:** the reason a new playlist always went last.

## Consequences
- After a duplicate clean-up, Engine DJ's playlists play the copy GLUE kept, with its cues.
- Engine DJ's collection keeps a record for each copy cleaned up (it shows as missing there). Removing those is a
  possible later step, asked.
