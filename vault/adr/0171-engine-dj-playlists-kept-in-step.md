---
status: superseded by 0178 (the app's playlists stay in its DJ collection; GLUE's own go to its "GLUE" folder)
date: 2026-10-09
---
# 0171. Engine DJ's playlists kept in step both ways

## Context
Phase 3 of ADR 0168. ADR 0170 synced each song's cues, loops and grid with the main Engine DJ library. The user wants
the same for playlists: "add songs to a playlist or create new playlists on Glue and be able to move them into
rekordbox or engine dj… without the drag box".

On their computer Engine DJ's library (its settings) is `F:\Engine Library`, the database GLUE already follows. The
databases on C: and G: hold the same playlist tree (Engine DJ copies it); their `ChangeLog` view and `Pack` table are
empty, so it isn't a change log. Engine DJ's schema, with its triggers, is now a test fixture
(`tests/fixtures/engine-schema.sql`, no data).

The user's choices (2026-10-09):
- a song Engine DJ doesn't have is added to its collection;
- a playlist deleted on one side is asked about, not deleted on the other;
- the playlists in the library's folder in GLUE are the synced ones.

## Decision
- **The playlists in GLUE's folder of the main library are Engine DJ's.**
  - Turning the sync on brings all of its playlists in (the folder whole, so its new ones come too).
  - A playlist (or folder) made or dragged into that folder is made in Engine DJ, parents first.
- **Written into the database the library is read from** (Engine DJ's library), as Engine DJ writes
  (`glue_interop::enginedb`):
  - a new playlist is the last of its siblings, linked by Engine DJ's own triggers;
  - a move re-links the old siblings and the new ones, since Engine DJ has no trigger for that;
  - a title is unique among siblings ("Title (2)");
  - a playlist's songs are a linked list, each song once;
  - `isPersisted`, `isExplicitlyExported` and `lastEditTime` are set as Engine DJ's own rows have them, only where
    the database has those columns.
- **Merged three ways** against what they last agreed on (GLUE Home's cache, `lists`; `glue_interop::sync`):
  - a name or a place: the side that changed it; both: GLUE's;
  - the songs: the side that changed them; both: GLUE's order without what Engine DJ removed, with what it added
    after.
- **A song Engine DJ doesn't have** is added to the collection of the database on its file's drive (Engine DJ keeps
  one per drive), with its path from that `Engine Library` folder ("../Music/a.mp3"), its tags, length and size.
  `isAnalyzed` is 0: Engine DJ analyses it. Its triggers give it its origin and an empty `PerformanceData`.
- **Gone from one side** (deleted, or moved out of the folder in GLUE): a question by the library in the sidebar,
  "Delete it in … too" or "Keep it" (made again where it went).
  - GLUE's side of an answer applies at once; Engine DJ's at the next sync, with Engine DJ closed.
  - The website's one-way rule that removes a copy a minute after its list is gone (ADR 0090) doesn't apply to a
    library kept in step (`syncLinkedLists`, held by the import goldens).
- **Safety as ADR 0170:**
  - only while Engine DJ is closed;
  - a copy of each database before its first write of a sync;
  - one transaction for the playlists;
  - a failure leaves them as they were and doesn't stop the cues' sync.

## Alternatives considered
- **Experiment first on how Engine DJ reconciles its databases' trees:** the user pointed out Engine DJ's settings name
  the library database; GLUE writes only that one, and their first hand test (with the backups) checks that Engine DJ
  keeps it.
- **Every GLUE playlist in Engine DJ:** the user's choice is the library's folder.
- **Deletes going through both ways:** the user's choice is to be asked.

## Consequences
- A playlist made in GLUE (and its songs, added to Engine DJ's collection where needed) is in Engine DJ when it next
  opens, without the drag dock.
- Not yet: the order of playlists among their siblings (GLUE's order of a new one is Engine DJ's last), smart lists,
  songs on a drive without an Engine DJ library.
- Engine DJ's own reconciliation of its other databases' copies of the tree is the user's first check.
