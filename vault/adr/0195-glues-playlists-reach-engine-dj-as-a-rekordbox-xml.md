---
status: accepted
date: 2026-11-26
---
# 0195. GLUE's playlists reach Engine DJ as a rekordbox XML that GLUE Home keeps

## Context
- **ADR 0194** turned GLUE's writes into Engine DJ off after they broke the user's Collection a third time. On
  2026-11-25/26 the cause was understood ([research](../research/engine-dj-write-back.md), "Engine DJ 5.3"): Engine DJ 5.3
  merges every drive's library into the Collection when it starts and copies the Collection's new playlists into every
  drive's database, assuming their playlist ids line up. GLUE's folder, kept in the Collection only, made them differ;
  Engine's copy of the user's own new playlist became its own parent on F:, and its merge never finished. Repaired by hand.
- **The user (2026-11-25):** "maybe have glue create a new collection as if it's a new disk partition". Asked
  (2026-11-26) after it was shown that a drive's library is no longer kept apart in 5.3, they chose GLUE's XML.
- **Engine DJ reads other apps' libraries without them touching its databases:** its Library preferences take a rekordbox
  XML's location; the Collection pane's rekordbox icon › *Update Rekordbox Library* reads it into Engine DJ's own cache
  (`rbm.db`, empty and unused on the user's computer), showing its playlists, and its hot cues, memory loops and beat
  grids are taken when a song is added to the Collection and analysed (Engine DJ's user guides 2.x–4.3). Rekordbox reads
  the same file as its "rekordbox xml" library. Milestone M4 step 3 (a live rekordbox XML with cues and grid) is this file.
- **Only GLUE Home can write it:** the file needs each song's absolute path on this computer, which the browser never
  sees (its folder handles hide them); GLUE Home knows every music folder's place (`folders` in its settings) and holds
  the collections in memory (ADR 0153).

## Decision
- **GLUE Home writes one rekordbox XML file** (`glue_interop::rekordbox_out`, written by the engine's `djxml.rs`): by
  default `<Music>/GLUE/GLUE.xml` on this computer (settings `djXml`: a path, or `false` for none). Never in the GLUE folder:
  its paths are this computer's (the laptop would get the desktop's through OneDrive), and it isn't GLUE's data.
- **What's in it:** the playlists marked *Keep in Engine DJ* (`List.apps` has `"engine"`, as before; a marked folder's
  lists too), every collection's, under a top folder "GLUE" (and a folder per collection when more than one has some), in
  GLUE's order; their songs whose file is on this computer, with title, artist, album, genre, label, comment, year,
  length, size, bit and sample rate, rating, BPM (Prepare's, else the analysis's), key (the analysis's, as rekordbox
  writes it: "Am", "F#"), and Prepare's grid (`TEMPO`), hot cues and memory cues and loops (`POSITION_MARK`), the inverse of
  `parse_rekordbox_xml`. A song not on this computer is left out and counted.
- **When:** the service's timer (every 5 s) builds it from the stores and writes it only when it changed, through a
  temporary file renamed over it (a reader never sees half of one).
- **Nothing else changes in Engine DJ:** GLUE writes none of its files (ADR 0194 stays). The user points Engine DJ (and/or
  rekordbox) at the file once and presses *Update Rekordbox Library* to see changes. Bringing GLUE's lists into Engine
  DJ's Collection is the user's act in Engine DJ.

## Alternatives considered
- **A library of GLUE's own that Engine DJ sees as a drive** (the user's first idea): Engine 5.3 merges drives into the
  Collection and writes into them (its merge renumbers their entries, copies the Collection's playlists in), so it
  wouldn't be apart, and GLUE would again be writing a database Engine DJ also writes.
- **Writing Engine DJ's Collection again, more carefully:** three breakages (ADR 0181–0184, 0194), each from Engine DJ
  changing its private database under GLUE's model of it.
- **The website writing the XML into the GLUE folder** (the M4 plan): it can't know absolute paths, and one file shared by
  computers would carry the wrong ones.
- **A Traktor NML:** Engine DJ reads Traktor's library only from Traktor's own place **[UNVERIFIED]**, which would
  clash with a Traktor the user has.

## Consequences
- GLUE can't break Engine DJ's databases any more; at worst Engine DJ reads a wrong XML, which GLUE writes again.
- Changes reach Engine DJ when the user presses *Update Rekordbox Library*, not live; Engine DJ's own edits don't come back
  to GLUE through this file (reading Engine DJ's libraries, ADR 0167, stays).
- Engine DJ has one rekordbox XML location: a user who also uses rekordbox's own XML there would have to choose.
- The page offers *Keep in Engine DJ* when GLUE Home runs (it no longer needs writes); its help and tour say how to set
  Engine DJ up. Whether Engine DJ 5.3 shows the file as the user guides describe is checked by hand on the user's computer.
