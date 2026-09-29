---
status: accepted
date: 2026-09-29
---
# 0100. One row per song, its best copy; a computer removes only its own copies

## Context
After the first real try of the shared collection (2026-09-29), the user saw every song twice on the
laptop. The desktop's "Music" and "Music Collection" are two real copies on disk, so both copies were
correct, but they looked identical: another computer's copy showed only its file name. The user wants
one row per song, the best copy, with the N× badge to manage the rest. Choosing another best copy
makes that one the row.

Removing songs in a shared collection also removed them for every computer. `removeTrack` dropped the
whole shared record, other computers' copies included. The user plans to remove and re-add everything
on the desktop to check the clean-up.

## Decision
- **Views of the whole collection show one row per song**: All tracks, a tag, browsing, Recently
  added (`view.svelte.ts ONE_PER_SONG`).
  - In a "same recording" group (fingerprints, or confirmed), only the best copy is a row
    (`dupes.hidden`, `g.best`, `meta.dupBest`), with the N× badge.
  - A search or filter matching any copy shows the song's row.
  - The counts follow.
  - "Probable" groups (same name, not matched by sound) stay separate rows until confirmed.
- **Views about copies show every copy**: a playlist or folder, a music folder, a DJ library's list,
  Needs attention, Not analysed, No file, Duplicates.
- **Removing rows of a one-per-song view removes the song**: every copy of its group (`withCopies`).
- **In a shared collection, a computer removes only its own copy.**
  - A song another computer also has stays: its playlists keep it, and it shows as that computer's.
  - Only this computer's copy and analysis go (`CollectionStore.removeTrack`).
  - A song with no copy left goes, as before.
  - Removing a music folder goes through the same path. The confirmation says so.
- **Another computer's copy says where it is**: the computer, its music folder and path
  (`Track.remote.where`, from `rootsBy`). Shown in Duplicates and on the song's page.

## Alternatives considered
- Hiding duplicates only in the Duplicates view: what the user asked to change.
- Removing a song for every computer: one computer can't know that the other's file should go.

## Consequences
- A playlist can still hold a non-best copy. It shows that copy, with the badge; "Use in playlists"
  points every playlist at one copy.
- Tests that act on a hidden copy do so from a view of copies (a music folder, Duplicates).
