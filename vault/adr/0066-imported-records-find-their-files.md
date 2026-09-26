---
status: accepted
date: 2026-09-26
---
# 0066. Imported records find their files by the folder's place; what an import no longer has goes

Amends the matching of ADR 0020 and ADR 0053.

## Context
The user (2026-09-26): about 200 songs in "No file linked", with paths such as `../Music
Collection/02-pen_dub-sosban_fach-mkd.mp3`, although the song is in `F:\Music Collection` (and in
`F:\preparation\mp3`). They suspected leftovers of a removed Traktor import. Their GLUE folder showed:
- **183 records of the current Engine DJ import**, with Engine's own paths: relative to its library
  folder.
  - The matcher compared only paths inside each music folder, so the copy in "Music Collection" and
    the one in "preparation/mp3" tied, and the size (the same) didn't break the tie.
  - The file-name-and-size rule (ADR 0053) wants exactly one candidate.
  - A record already stored as a track without a file was never matched again on later reads.
- **4 records of an import that had been removed:** removing it only cleaned tracks in its own list.
- **Wrong music folder locations** ("E:\Music Collection", "/preparation"; GLUE Home knows they're on
  F:), guessed from old Traktor paths and Engine's relative ones.
- **In the Traktor collection:** 388 records of Traktor's own factory sounds and samples, in
  Native Instruments' folders.

## Decision
- **The music folder's own place counts in matching** (`FileEntry.under`: its path, or its name).
  `../Music Collection/x` is the x in the folder called Music Collection.
- **Only an absolute path says where a music folder is.** A relative one (Engine DJ) is never used for
  that.
- **In Home mode, a music folder's location is GLUE Home's** (`musicFolderPath`), and replaces an
  older guess.
- **Records without a file are matched again** each time their library is read. When the file is
  found, the record folds into the track that has it (`absorbTracks`): rating, notes, tags, Prepare
  and playlist places carry over.
- **What a library no longer has goes:**
  - a track with a file only stops naming that import;
  - a track without a file and without any other import was only its record, and is removed
    (`ImportReport.dropped`).
  Removing an import cleans every track naming it.
- **When a collection opens** (`tidyTracks`):
  - names of imports that are gone are cleared, and their leftovers go;
  - tracks without a file are matched again (music folders' places known by then).
- **Traktor's own content isn't imported:** entries inside Native Instruments' folders (factory
  sounds, remix sets).

## Consequences
- **On the user's collection** (a copy, dry run): 161 of the 187 records link to their file and 4
  leftovers go. 24 stay "No file linked", and those are genuine: Engine's `temp` copies and a few files
  that aren't in the music folders.
- **A Traktor collection that points at other computers' drives** (the user's has about 1,200 records
  on a Mac volume and other drives) still lists them as "No file linked" while it's imported. They
  go when it's removed.
