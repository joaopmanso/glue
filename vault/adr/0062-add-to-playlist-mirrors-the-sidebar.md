---
status: accepted
date: 2026-09-26
---
# 0062. "Add to playlist" lists the playlists as the sidebar shows them

## Context
The user (2026-09-26): "playlists I've deleted from the left side still show on the Add to playlist
dropdown".
- **Not reproduced:**
  - Deleting playlists, imported playlists and imported folders updates the dropdown.
  - On a fresh load of the user's library through GLUE Home, the dropdown matched the GLUE folder
    exactly (780 lists).
- **What the dropdown did:** it listed every list, sorted by path, the user's own mixed with every
  imported one.
- **Why that looks like the bug:**
  - The Engine DJ import holds 761 of the 780.
  - Names repeat across its folders: "Heavy" in 19 places ("2022 › 140 › Heavy", "Merged › 170 ›
    Heavy", …), "Roller" in 15, "Bassy" in 13.
  - So deleting one "Heavy" leaves 18 in the list.
- **Adding songs to an imported playlist is lost** when that library is imported again (its
  playlists are replaced).

The user chose "mirror the sidebar".

## Decision
- **`listTree`** (`src/core/library/listTree.ts`, pure) gives the lists in the sidebar's order
  (position, then name) with their depth:
  - the user's own lists first (top-level lists without an import origin, with everything in them);
  - then each import's tree on its own.
  - Lists the sidebar can't reach (their folder is gone) are left out, as in the sidebar; TO BE
    SORTED is never offered.
- **The dropdown** starts with "+ New playlist…". Then comes the "Your playlists" group, then one
  group per import, labelled "Engine DJ ↓ · replaced when you import it again". Entries are
  indented under their folders, and folders are marked 📁 (folders take songs too, ADR 0049).

## Alternatives considered
- **Only the user's own playlists:** hides a real option (adding to an imported crate until the next
  import).
- **A searchable picker:** better still with 780 lists, but a bigger change; possible later.

## Consequences
- Namesakes show where they are: indented under "2022 › 140", not as a flat run of "Heavy"s.
- The automatic playlist dialog's "avoid playlists" list is still sorted by path (a candidate for
  `listTree` too).
