---
status: accepted
date: 2026-10-10
---
# 0182. Engine DJ's playlists written as Engine DJ writes them: its Collection, then each drive's copy

## Context
The playlists GLUE Home 0.72 made in Engine DJ (its GLUE folder, ones made from GLUE's DJ collection) showed in GLUE
but not in Engine DJ, though Engine DJ named a new "Glue" "Glue 2". The user's copies of their databases
(`vault/research/engine-dj-write-back.md`, 2026-10-10) and what Engine DJ shows settle it:
- Engine DJ's **Collection** is the computer's database (`C:\Users\…\Music\Engine Library`): its playlist tree is the one
  Engine DJ shows ("2022": 1,007 songs, as C:'s entries count them).
- A **drive's** database (F:, shown under Drives as "Shared") holds that drive's copy: the lists with its songs and the
  folders they're in, **each with the Collection's id** ("2022" there: 985, as F:'s count them). Engine DJ makes each
  change in both (the user's "cenas" and "Teste GLUE 123": the same ids in both).
- GLUE took F: (the library it was imported from, with the songs) for the library and wrote its playlists there alone:
  they were in the drive's copy only, and its ids ran past the Collection's (id 9047: the user's "Playlist" in C:,
  GLUE's "Auto · WONDA" in F:).

The user's choices (2026-10-10): write the Collection and the F drive as Engine DJ does; put F: right; GLUE's DJ
collection shows the Collection's tree.

## Decision
- **The Collection's database** is the one in the Music folder (`engine_collection`); where there's none, the library's
  own (as before).
- **Read:** GLUE Home reads it with the library's databases, its tree the Collection's (`combine_engine_with_tree`;
  the songs every database's), and reads again when either changes (`origin.tree`).
- **Write:** every playlist write (the DJ collection's edits, ADR 0179; the GLUE folder, ADR 0180) goes into the
  Collection's database, a new list's id free in every database GLUE sees (`make_room`). Then what changed there (its
  tree before and after) goes into each drive's database (`dj_to_drives`):
  - a list deleted;
  - a list with that drive's songs (or one the drive has) made or put as the Collection has it, the folders it's in
    first, with the same id;
  - only what changed (a name, a place, the songs, or only the order: a neighbour's addition never copies a list's
    songs over the drive's);
  - their siblings' order as the Collection's; a list only the drive has keeps its place. Nothing else in the drive's
    copy is touched.
- **The duplicates' clean-up** (ADR 0172) points the entries at the copy kept in every database that carries the tree.
- **Once** (`treeFixed`), after a backup, what GLUE 0.71–0.72.3 wrote into a drive's database alone is put right
  (`dj_tree_repair`):
  - a list there with an id past every one the Collection has given goes (only GLUE's can be);
  - a list under the Collection's id with another name or place takes the Collection's;
  - GLUE Home's memory of the old tree (its GLUE folder, new lists' ids, waiting edits) is let go. GLUE's own lists
    kept in Engine DJ go into the Collection's GLUE folder again at the next sync.
- **Writes are on again** (0.72.3 paused them); `djPlaylists: false` in GLUE Home's settings turns them off.

## Alternatives considered
- **Only the Collection** (Engine DJ copying to the drive by itself): it doesn't, on opening (the 114 lists that
  differ); the drive's copy is what a player reads.
- **Making every drive's copy equal to the Collection's:** it would change 114 lists in F: (among them what the
  2026-10-09 restore put back there) without the user asking.
- **Keep F: as GLUE's library and write both:** GLUE's DJ collection would show a tree Engine DJ doesn't.

## Consequences
- Checked on copies of the user's databases (`real_engine_databases_dry_run`, run by hand): the repair took out GLUE's
  5 lists from F: and put 9047 back; a new list went into the Collection only (no drive songs); every other list in
  both stayed as it was (764/764, 623/623).
- **[UNVERIFIED]** that Engine DJ shows a list GLUE writes into the Collection as it shows its own: the rows are made as
  Engine DJ's own new ones are. The user's check.
- The 114 lists whose songs differ between C: and F: (the restore is F:'s only) are left as they are: the user decides.
