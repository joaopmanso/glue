---
status: accepted
date: 2026-10-01
---
# 0130. The same file on two computers is one song, with a copy on each

## Context
The user, 2026-10-01: a song added to the collection on the laptop and sent to the desktop showed correctly in TO
BE SORTED. But the library had it twice, one row for the laptop and one for the desktop, shown as duplicates,
"instead of showing both devices on the same song … it's more than obvious that if I'm copying a song from one
device to another, it's the same song that will exist on both devices."

How it came about:
- In a shared collection a song has `copies[computer]` (ADR 0094), so one song can be on several computers.
- On the desktop (Home mode, ADR 0051) the incoming folder is a hidden music folder. Its scan (`applyScan`) made
  every new file a new song, never asking whether the collection already had that song on another computer.
- So the laptop's song and the desktop's received file were two songs. Their fingerprints then grouped them as
  duplicates (ADR 0100 shows one row per "same recording" group, but they were two songs, each with one computer).
- The only place copies were matched across computers was `adopt` (ADR 0096), when a computer's collection first
  joins the shared one.

## Decision
- **A new file that is the same file as a song only other computers have becomes this computer's copy of that
  song.** The test for "the same file":
  - the same size;
  - and the same name, or the name with " (2)" (GLUE Home's incoming folder adds that when the name is taken).

  Where:
  - the scan's new files: `applyScan`;
  - songs already made twice, when a collection opens and after a sync reloads files: `joinCopies`;
  - the store's `addCopy` writes this computer's copy into the song through the same projection as every other
    write (`toShared` / `toLocal`). The other computers' copies are kept, so the row shows both computers.
- **Which song stays:** both computers see the pair, so they must agree on it. The older song stays (earlier
  `addedAt`, then the lower id), and only the computer whose song goes does the joining; it writes only its own
  parts. Otherwise each would drop the song the other kept.
- **Folding an existing pair:** this computer's song joins theirs:
  - its analysis becomes this computer's analysis of the song;
  - its playlist places, rating, notes, tags and Prepare move over (`absorbTracks`);
  - its row goes.
- **When the file came by scan:** the other computer's analysis of the same bytes is kept as this computer's too, so
  it isn't analysed again.
- **Not joined:**
  - a second copy of a song this computer already has (a duplicate on this computer);
  - a file of another size;
  - collections that aren't shared.
- **A backup first:** more than 10 pairs at once (the first open after this change, which may fold older pairs too)
  are backed up first (`backupBefore('join-copies')`).

## Alternatives considered
- **Match by tags and length (`trackKey`, as `adopt` does):** two different files of one recording (a FLAC on one
  computer, an MP3 on the other) would become one song with two copies of different quality. That's what
  Duplicates is for (best copy, ADR 0120). A copy of the file is the same file: size and name.
- **Match in TO BE SORTED only:** songs copied between computers by hand (not through GLUE Home) have the same
  problem.
- **Leave it to the duplicate groups:** they show one row, but it is still two songs, each "only on" one computer:
  Duplicates lists it, and playlists and ratings split between the two.

## Consequences
- A song sent between computers, or copied by hand into a music folder, is one row with both computers. Removing it
  on one computer removes only that copy (ADR 0100).
- On the first open after this, pairs made before are folded into one song: this computer's row goes into the other
  computer's song.
- `fileName` is the song's, not the copy's: a copy saved as "Song (2).mp3" shows the song's name. Its own path is
  `relPath`.
