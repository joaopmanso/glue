---
status: accepted
date: 2026-09-26
---
# 0053. An imported copy outside the music folders is the track that has the file

Amends the linking of [ADR 0020](0020-imports-then-link-folders.md).

## Context
The user (2026-09-26) found songs under "No file linked" after importing Engine DJ and Traktor, while
the same song, same file name, was in the library with its file. On their Engine library:
- two records of the song: #1325 `../Music Collection/01-….mp3` (in no playlist) and #5232
  `../preparation/SOULSEEK/…/01-….mp3` (in the 2021, DNB, soulseek and preparation playlists);
- both files exist on disk, the same size (12,057,962 bytes). Only `Music Collection` is a GLUE music
  folder.
- 132 file names are shared by two or more of its 6,865 tracks.

GLUE linked #1325 to the file and left #5232, the one the playlists use, as a separate track with no
file.

## Decision
- An imported record that can't be linked to a file of its own is the track that has one, when there's
  exactly one such track with the same file name (case aside) and the same size.
  - Traktor gives sizes in kB, so 1 kB of slack is allowed.
- Its playlists then play the copy GLUE has, and the library shows one row.
- A track an earlier import left unlinked this way is folded into that track on the next import
  ("Update") (`absorbTracks` in `store/merge.ts`):
  - its playlist places and other imports' links move over;
  - the user's rating, notes, tags and Prepare settings are kept where the other track has none.

## Alternatives considered
- **Add the other folder (`preparation`) as a music folder:** both copies would be tracks, and
  Duplicates would show them. The user doesn't want that folder in the library.
- **Match on the name alone:** different songs share names (`01 - Intro.mp3`); the size makes a
  mistake very unlikely.
- **Compare the audio (fingerprint):** exact, but the copy can't be read; it's not in a folder GLUE
  may use.

## Consequences
- Two different recordings with the same file name and byte size would be taken for one song. This is
  very unlikely.
- When there's no size (some M3U imports), nothing changes.
