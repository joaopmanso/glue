---
status: accepted
date: 2026-10-09
---
# 0180. GLUE's own playlists kept in Engine DJ's "GLUE" folder, both ways

## Context
ADR 0178's last Engine DJ step. The user (2026-10-09): "For the Glue only playlists I want to be able to sync those
back on the DJ Collections, so maybe use the EngineDJ, Rekordbox icons we currently have to show which playlists /
folders are currently sync'd. These playlists should show on Engine Dj or Rekordbox under a "GLUE" folder. Then
repeat the structure created in Glue." Their choice: both ways.

ADR 0171's three-way merge of playlists (names, places, songs, the order among siblings, entries GLUE can't name left
where they are, deletes asked) was parked by ADR 0178; it's what this needs, pointed at a different set of playlists.

## Decision
- **Which:**
  - a list of GLUE's own (no `origin`) is kept in Engine DJ when it or a folder it's in has `apps: ["engine"]`;
  - the folders it's in come too, as folders, without their own songs;
  - set with **Keep in Engine DJ** / **Stop keeping it in Engine DJ** on a list's menu, offered once the main Engine DJ
    library is kept in step;
  - shown by the Engine DJ icon by the list's name (fainter when it's kept with its folder).
- **Where:**
  - a folder "GLUE" at the top of Engine DJ's tree, made when something goes in it (one called that already is used);
  - GLUE's folders down to each list under it;
  - which Engine DJ playlist each GLUE list is, GLUE Home keeps (`mirror` in its cache), not `List.origin`, which means
    an import.
- **Both ways** (`djmirror.rs`), in the sync with Engine DJ closed, after a backup, in one transaction. As ADR
  0171–0173, against what they last agreed on (`mirrorBase`, `mirrorOrders`):
  - a name or place: the side that changed it (both: GLUE's);
  - songs: the side that changed them; Engine DJ's entries for drives GLUE hasn't read stay where they are;
  - the order among siblings: the same way;
  - a song Engine DJ lacks is added to its collection.
- **Made in Engine DJ inside the GLUE folder:** made in GLUE, under the list it's in there. One at the folder's top, or
  inside a folder that's only there as structure, gets `apps` of its own, so it stays kept.
- **Gone from one side** (deleted, or moved out of the GLUE folder in Engine DJ): asked in the sidebar, as ADR 0171.
  - "Delete" in GLUE applies at once; in Engine DJ, at the next sync.
  - "Keep" makes it again on the side it went from, at the next sync.
- **Turned off** (or moved where it isn't kept): taken out of the GLUE folder; GLUE's stays.
  - A folder there only for structure goes when nothing in it is kept any more, unless something in it is waiting for
    an answer.
- **The rest of ADR 0171** (its copies of Engine DJ's whole tree) stays superseded (ADR 0178).

## Alternatives considered
- **GLUE to Engine DJ only (GLUE the master):** offered as simpler; the user chose both ways.
- **The link in `List.origin`:** `origin` means a copy of the app's playlist that follows it (an import), and drives
  that follow, the bin and the stats; a GLUE list kept in Engine DJ is still GLUE's own.
- **Every GLUE playlist in Engine DJ:** the user asked for chosen ones, shown by the app's icon.
- **rekordbox now:** its library is an encrypted database; Engine DJ first, rekordbox as its own step (the user's
  choice).

## Consequences
- GLUE's playlists reach Engine DJ without the drag dock, inside a GLUE folder that keeps them apart from Engine DJ's
  own, and Engine DJ's changes to them come back.
- ADR 0171's tests are replaced by `glues_own_playlists_are_kept_in_engine_djs_glue_folder_both_ways`.
- Next (ADR 0178): rekordbox (`master.db`).
