---
status: accepted
date: 2026-10-06
---
# 0157. One analysis pipeline: listed once, tags then analysis, all inside "songs at a time"

## Context
The user, 2026-10-06, about GLUE Home's window while it analysed: "even though it was analysing 8 tracks, it was
showing maybe 30 on the list in yellow … the analysis process should be streamlined. Folder is added, we … list all of
the files and folders … add those to the collection as not yet analysed. analyser picks from that list based on the
configured number of songs to analyse at the same time … we shouldn't need to list them multiple times or to read
over the limit." Asked how new songs' tags should be read, the user chose: inside the limit.

How it was:
- **Adding a folder:** the tab listed it (one walk), then asked GLUE Home to read every new song's tags, 200 a
  request and 8 files at a time (`/fs/read-tags`, ADR 0135), outside the analysis's number and not in its meter; then
  each song was read whole for its analysis.
- **The queue looked through the whole collection** (every shard's songs and analyses) each time an edit added a song,
  and every 5 minutes, to find what was left.
- **Songs other devices waited for** (`soon`) and the background thumbnails ran on their own threads, beside the
  queue's places.
- **The window's list of songs running** was kept by hand: a job that ended early stayed in it.
- **Writes of one file at once collided:** every write went through a temporary file of a fixed name; two of an
  album's songs analysed together wrote their shared cover's files at once, and the second's rename found nothing
  ("cannot find the file"): that song failed, and after three tries was given up (found by this ADR's test).

## Decision
- **Adding a folder lists it once**, and adds its music as songs not yet analysed (the rows show file names). With
  GLUE Home 0.56 the tab reads no tags (`platform.homeReadsTags`); older GLUE Homes and the browser alone as before.
- **The queue is the one way songs are read** (`queue.rs`), in its "songs at a time", every kind of job counted in its
  meter and its list:
  1. songs asked for now: by a tab ("Analyse now"), or another device waiting for one (`analyse_for`, answers.rs);
  2. new songs' tags (`tags.rs`: only the tags, lofty, GLUE Home's own reader moved into the engine), written into
     the library with the others read meanwhile (only empty fields not edited, then the file's name), so rows show
     who and what before the analysis;
  3. the library's songs to analyse, network folders taking turns (ADR 0135);
  4. the background's mini spectrograms and waveforms for other devices, when nothing of the library's is left.
- **An edit queues its own songs** (`queue_edit`): those it adds (tags, then analysis) and those whose file changed.
  The collections are looked through only when GLUE Home starts, after a sync took changes in, and on Restart.
- **A job's place is given back however it ends** (`Slot`, and `Stepping` for the meter's reading/analysing): the
  running count, the list of names, its network folder's turn, and those waiting for the song.
- **Each write has a temporary file of its own** (`glue_store::dir`, the process and a counter in its name).

## Alternatives considered
- **Analysis only (no separate tag step):** rows show file names until each song is analysed; hours on a big network
  folder. The user chose tags inside the limit.
- **Keeping the tag pass, outside the limit:** what the user asked to end.

## Consequences
- **Never more files read than the setting**, whatever asks: the meter's reading and analysing add up to at most the
  number, and the window's list names only the songs running (`tests/engine.rs`).
- **A new folder's rows fill in a few songs at a time** as their tags are read (a song's tags take milliseconds on a
  drive), ahead of the analyses.
- **Another device's ask waits for a free place** instead of running beside the others; it goes first.
- **A song moved or changed outside GLUE** is found at the next start, sync or Restart, or the next scan of its folder
  (which is an edit).
