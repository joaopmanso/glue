---
status: accepted
date: 2026-10-01
---
# 0125. A song dropped onto the page is placed by GLUE Home; the tab analyses only what just it can read

Amends [ADR 0103](0103-glue-home-analyses-its-computers-songs.md) and [ADR 0110](0110-screen-takes-glue-homes-analyses.md)
(the tab doesn't analyse in Home mode), and extends [ADR 0122](0122-stop-stops-everything-dropped-folders-found.md)
from dropped folders to dropped songs.

## Context
The user, 2026-10-01, with GLUE Home running:
- they removed a song, then dragged it back from Windows Explorer onto the library;
- the tab said "Analysing · 1 left", while GLUE Home said "All this computer's songs are analysed";
- the song was never analysed, until they quit GLUE Home and the browser took over;
- "the folder from the track already exists in the collection", and "how can the browser access it but not the
  home app?"

Why:
- A browser hands a page a dropped file's contents, name, size and date, never where it is on disk.
- In Home mode the tab's music folders are GLUE Home's (`HomeDir`), so it couldn't tell the file was in one of
  them. The song became one "added on its own", with a browser file handle (`file:…`) and no path.
- GLUE Home skips such songs: it can't read them.
- Since GLUE Home became the engine (ADR 0104), the tab analyses nothing in Home mode.

Also, GLUE Home filled its own cache in the background (songs the browser had analysed while it was off). Each
result counted as "waiting to go into the library", and was written in again though the library had it. That count
cycled ("6… 8… gone… back").

## Decision
- **GLUE Home finds a dropped song** (engine rpc `whereFile`, Rust `find_file`):
  - it looks by name (any case) and size, through the collection's music folders whole first, then the usual
    folders and the drives;
  - **in a music folder**, the song is that folder's (`rootId` + `relPath`), as a scan makes it;
  - **elsewhere**, it's added on its own and GLUE Home keeps where it is (`Track.filePath`, per computer). GLUE Home
    analyses it, streams it and writes its info from there; the browser keeps its handle to play it.
- **The tab analyses the songs only it can read**, even while GLUE Home analyses the rest. These are songs added on
  their own with a browser handle and no `filePath` (GLUE Home didn't find them, or isn't reachable). "Analyse now"
  splits the same way.
- **The cache filled in the background stays GLUE Home's:**
  - its results aren't "waiting to go into the library";
  - a song the library lacks is found by the analysis's own look, which takes the kept result;
  - writing an analysis the library already has (the same file, as new a version) is skipped.

## Consequences
- A song dropped from a music folder is that folder's song, with GLUE Home or without.
- A dropped song is never left unanalysed: GLUE Home analyses it, or the tab does.
- GLUE Home's background work no longer rewrites (and syncs) analyses that didn't change.
