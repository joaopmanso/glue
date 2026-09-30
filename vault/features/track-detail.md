---
status: shipped
milestone: M2
updated: 2026-09-30
adrs: [0019, 0023, 0024, 0071, 0072, 0110, 0111]
---
# Track detail

Since 2026-09-26 the page has two tabs: **Details** (this note) and **Prepare** (waveform, beat grid,
metronome, tempo, corrections: [prepare](prepare.md), [ADR 0052](../adr/0052-prepare-tab.md)).
"Re-analyse" also resets Prepare's BPM and grid corrections (cues stay).

## What it does
Every song in a collection has its own page with everything GLUE knows about it: the full Speklone
analysis (verdict, spectrogram, average spectrum, evidence, tempo and key, file details), the player
with live view and stems, plus library information: which playlists it's in, and what imported
libraries say about it (BPM, key, rating, play count, cue count, date added).

## Behaviour
- Double-click a track (or press Enter) opens its page; Back returns to the list with the scroll
  position kept. The address is `#/track/<id>`, so a reload stays on it.
- The page recomputes the full analysis with the same code as the background pass; its summary
  replaces the stored one if the file changed.
- Unlinked tracks (imported, file not found yet) show the imported details and "Link the folder that
  holds this file".

## Acceptance
- [ ] Detail page for a linked track matches "Analyze a file" for the same file.
- [ ] Shows the playlists the track belongs to and the imported DJ-app values.

## Shipped in M2 (2026-09-24)
- `#/track/<id>`: title and verdict, file location (absolute when the folder's location is known),
  size, length, genre, label, date added, playlists, and a table of what each imported DJ library
  says (BPM, key, rating, plays, cues, added) next to GLUE's own BPM and key.
- Below: the complete "Analyze a file" view (verdict, spectrogram, player, live view, stems, average
  spectrum, evidence, file details). A fresh analysis here also refreshes the stored summary.
- Previous / Next walk the current library view. Unlinked and missing tracks explain how to link them.
- Not yet: scroll position kept when going back.

## Stored analysis and playback (2026-09-24)
- The full analysis is computed on the first visit and stored ([ADR 0023](../adr/0023-store-track-page-analysis.md));
  later visits open instantly ("Stored analysis"). "Re-analyse" recomputes it. A changed file is
  re-analysed automatically.
- Opening the page of the track that's playing keeps it playing (also on the way back to the library).
- Since ADR 0024 the background analysis writes that stored analysis for every track, so even a first
  visit is instant once the background pass has reached the track.

## The user's list, batch 5 (2026-09-27)
- **"Edit info"** in the header opens the song info dialog; a line under the header names the fields
  edited in GLUE but not in the file yet ([song info](song-info.md), [ADR 0071](../adr/0071-song-info-written-through-glue-home.md)).
- **The cover** (64 px, from the 320 px one) before the title, when the song has one
  ([ADR 0072](../adr/0072-covers-from-the-tags.md)). Grouping shows among the details.

## The user's list, batch 1 (2026-09-27)
- **Songs open on the tab used last** (`trackTab`, `trackHref()` in `lib/route`). After Prepare,
  double-click, Enter, the player's title and Duplicates open Prepare, until Details is chosen again.
  - The song menu has both "Open details" and "Prepare".
  - Previous and Next keep the tab.
- **"In playlists" shows two;** "+N more" lists all of them (a find field once it's long). Clicking
  one opens it with the song selected. They used to run over the rest of the line.

## GLUE Home's analyses, and why there's no file (2026-09-30)
- In Home mode the page takes the song's details from GLUE Home's cache when the browser has none, and
  never analyses in the tab: it asks GLUE Home to analyse it now (`#home-analysing`) and shows the result
  when it's in ([ADR 0110](../adr/0110-screen-takes-glue-homes-analyses.md)).
- A song with no file says why (`#no-file-why`): the file wasn't found where it was, it came from a DJ library,
  it was added on its own, or its music folder was removed
  ([ADR 0111](../adr/0111-removing-a-folder-removes-its-songs.md)).
