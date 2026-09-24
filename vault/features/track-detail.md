---
status: shipped
milestone: M2
updated: 2026-09-24
adrs: [0019, 0023]
---
# Track detail

## What it does
Every song in a collection has its own page with everything MCO knows about it: the full Speklone
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
  says (BPM, key, rating, plays, cues, added) next to MCO's own BPM and key.
- Below: the complete "Analyze a file" view (verdict, spectrogram, player, live view, stems, average
  spectrum, evidence, file details). A fresh analysis here also refreshes the stored summary.
- Previous / Next walk the current library view. Unlinked and missing tracks explain how to link them.
- Not yet: scroll position kept when going back.

## Stored analysis and playback (2026-09-24)
- The full analysis is computed on the first visit and stored ([ADR 0023](../adr/0023-store-track-page-analysis.md));
  later visits open instantly ("Stored analysis"). "Re-analyse" recomputes it. A changed file is
  re-analysed automatically.
- Opening the page of the track that's playing keeps it playing (also on the way back to the library).

