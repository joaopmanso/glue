---
status: accepted (its "Live" part amended by 0065)
date: 2026-09-26
---
# 0063. DJ libraries are browsed live; playlists come into GLUE on demand and stay linked

Amends how imports make playlists (ADR 0020's import, and the Engine DJ set import). Phase A of the
plan toward writing back to the DJ apps (ADR 0064, next).

## Context
The user (2026-09-26):
- **Browse without importing:** under each DJ library in the sidebar, browse its playlists
  instead of GLUE importing them all.
- **Import on demand:** an "Import playlist" action that brings one into GLUE, under the library's
  folder as before.
- **Live:** a playlist made in Engine DJ should show up in GLUE.

Until now, every import made copies of all the library's playlists and made them again on each
"Update", with new ids. The Engine DJ import alone had put 761 playlists in GLUE. Traktor and
Rekordbox playlists had ids from reading order ("n12:Name"), which change when a playlist is added
above them.

Decided with the user: the playlists already imported **stay, as linked copies**.

## Decision
- **The library keeps its tree:** an import stores the library's playlists (`Source.tree`) and makes
  no playlists in GLUE. The sidebar's "DJ libraries" rows open into that tree, folder by folder.
  Choosing a playlist shows its songs, in its order, without importing it (selection
  `{ kind: 'dj', sourceId, id }`).
- **Importing on demand:** ⋯ → "Import to GLUE" (or "Import all … into GLUE") copies the playlist, or
  the folder with everything in it, under the library's own folder in GLUE. The folders on the way
  are made as holders (`origin.chain`), so "2022 › 140 › Heavy" lands where it is in the DJ app
  without bringing the rest of "2022". A ✓ marks lists GLUE has.
- **Linked copies follow the library** (`src/store/linked.ts`, `syncLinkedLists`), in place (ids
  never change):
  - **changed** (name, songs, order, or its place, while the copy is still among the library's
    copies): the copy follows;
  - **gone:** the copy goes, and the user's own lists inside it move up;
  - **new inside a folder GLUE has whole:** it comes in; a holder doesn't take it.
  - Only lists the library changed since its last read are touched: what the user did to the other
    copies stays.
- **Stable ids:**
  - Traktor playlists use their UUID.
  - Traktor folders and rekordbox XML playlists get ids from their path (`pathId`: parent's id and
    name, numbered when siblings share a name).
  - Copies made with the old reading-order ids are found again by their path the first time.
  - **Renames** where the id comes from the name (rekordbox XML, Traktor folders, Serato crates): a
    list gone since the last read, and a new one in the same place with the same songs (or at the same
    spot), are the same list. Parents come first, so a renamed folder takes its lists along.
- **Nothing is lost:** a copy GLUE can't find in the library as last read (a first read, or a copy
  renamed in GLUE) becomes the user's own list instead of being deleted.
- **Adopting a found file:** a library imported by hand has no remembered place. When detection finds
  a file of the same app and name (for an Engine DJ set, the biggest), the source adopts it and is
  kept up to date from then on. Until then, its row offers "Keep up to date…" (choose the folder it's
  in).
- **Live** (`src/lib/djWatch.svelte.ts`):
  - **When:** every 5 s while GLUE is in view (and on focus), for each library GLUE found (its place
    and path are remembered).
  - **How it looks:** only the file's date. GLUE Home answers with a stat, never the file.
  - **What happens on a newer date:** the file is read again in a worker (`src/workers/interop.worker.ts`:
    sql.js and the XML parsers, now off the page for every import) and GLUE follows: tracks, tree,
    copies.
  - **Limits:** at most one read per library every 10 s. Engine DJ's save in progress (a non-empty
    `m.db-journal`) waits for the next look.
  - The first look also reads libraries imported before this change, to keep their tree.
  - "Update" only shows while GLUE hasn't caught up.

## Alternatives considered
- **Keep importing everything, with a filter:** it keeps the 761-list sidebar problem (ADR 0062),
  and copies nobody asked for.
- **Browse without keeping the tree:** it would need the library file readable at every look (a
  drive unplugged, a folder not allowed), and it couldn't tell what changed since the last read.
- **Watching with GLUE Home's file events:** only in Home mode. A date check every 5 s is cheap in
  both modes.

## Consequences
- **Checked on the user's real Engine DJ database** (a copy, 163 MB, 761 playlists): read in 0.9 s in
  the worker with no long frame on the page; the tree opens in 57 ms; "2022 › 140 › Heavy" imported
  alone lands as Engine DJ › 2022 › 140 › Heavy.
- The sidebar's Playlists hold what the user chose. The DJ libraries' own trees are one click
  away.
- Edits in GLUE to a linked copy last until the DJ app changes that playlist (then the DJ app's
  version wins). Writing the edit back to the DJ app is ADR 0064's step.
- A library chosen by hand ("+ Import") keeps the tree as read then, until its folder is found ("Keep up
  to date…", or "Look in…").
