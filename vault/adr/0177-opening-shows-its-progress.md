---
status: accepted
date: 2026-10-09
---
# 0177. Opening the library or a collection shows its progress, and waits less

## Context
The user (2026-10-09), on the laptop: "first time load or when I change my collection … I just get a black screen
saying Opening your library… for maybe 5 to 10 seconds. Or I just get to a library page saying 0 songs and collection
drop down remains empty until it's loaded … it should display some sort of loading bar whenever things are happening in
the background not just a black screen with text."

Measured with a copy of the laptop's GLUE folder (1,813 files, 27 MB; `?perf`, the open's steps recorded as
`open.<step>`):
- **Before the library starts opening**, the page looks for GLUE Home on this computer (`localHome.find`). A browser
  that met one before asks its last port, then all ten ports, then the last port again, one after another. On Windows a
  port nobody answers on takes about 2 s to say so (`curl` to 127.0.0.1:47400 on the laptop: 2.05 s), so the page waited
  about 5 s here with only "Opening your library…" on a dark page.
- **Reading the collection** (`CollectionStore.load`) took 2.0–2.6 s of the open's 2.7–3.5 s; the steps after it
  (folders, copies, added songs) about 40 ms. Reading a file by its path asked the browser for each folder on the way,
  then the file: eight calls a file.
- **Switching collections** closed the open one first, then read the new one: meanwhile the library showed no store (the
  heading said 0 tracks, the collection list had nothing chosen).

## Decision
- **What's opening is state** (`lib.loading`: a title, the step, files read of how many, the collection being opened),
  from the page's start until the library or the start page is there:
  - the GLUE folder's steps ("Looking for GLUE Home on this computer…", "Finding your GLUE folder…", "Reading your
    profile…");
  - a collection's ("Opening “name”": "Saving what's open…", "Reading songs, playlists and analysis…" with the files
    counted, "Finding your music folders…", "Almost there…").
- **A card with a bar** (`src/ui/library/Opening.svelte`) in place of the dark page at the start and of the empty library
  while a collection opens; the collection list keeps naming the collection being opened (not chosen again meanwhile).
- **A line along the top of the page** (`src/ui/TopLoading.svelte`) while something opens or a job runs (`lib.job`),
  whatever page is shown.
- **The store counts its files** (`LoadOpts.onProgress`): every folder is listed first, then read; the card is updated a
  few times a second, not once a file.
- **Fewer calls a file:** a folder's files are read through the handles its listing gives (`fsx.listFiles`), two calls a
  file; and 32 at a time instead of 12. Reading the copy: 1.2–1.5 s instead of 2.3–2.6 s.
- **GLUE Home looked for side by side:** when its last port hasn't answered within 0.3 s, its ten ports are asked
  meanwhile, and the old-GLUE-Home check (`/hello` on the last port) runs alongside: about 2 s at worst instead of 5. A
  GLUE Home running there answers at once, so the other ports aren't asked (each would be an error in the console, ADR
  0143).

## Alternatives considered
- **Open the library without waiting for GLUE Home at all** (switching onto its disk when it answers): the tab would
  read and write the GLUE folder through the browser while GLUE Home, not knowing, writes it too (one writer at a time,
  ADR 0051).
- **A shorter wait for each port:** a GLUE Home busy analysing can take a second or more to answer (ADR 0137); it would
  be missed and the library opened in the browser instead.
- **Keep the open collection shown until the next one is read:** reopening the same collection (a reset, a shared one
  seen again) reads the files the close is still saving.
- **A cache of the whole collection in the browser:** every file would still be asked for its date to know the cache is
  current; most of the time is the browser's own calls, not the parsing.

## Consequences
- The start and a collection's switch say what they're doing and how far it is; the top line says something's working
  on every page.
- On the laptop, the start waits about 3 s less for GLUE Home, and the collection reads about a second faster.
- `e2e/library.spec.ts` slows every file read and checks the card, the bar's count, the collection list and the top
  line, while switching and after a reload.
