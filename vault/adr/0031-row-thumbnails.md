---
status: accepted
date: 2026-09-24
---
# 0031. Mini spectrograms in the track table: tiny, per track, loaded on demand

## Context
The user wants each library row to show a small spectrogram next to the play button that also acts
as part of the player (click / drag to play and scrub, a playhead as time passes), and warned that
dozens are on screen at once, so saving, loading and drawing must be cheap (2026-09-24).

## Decision
- **Data**: 192 × 16 bytes per track (≈3 KB), `makeThumb` in `src/core/library/thumb.ts`: time
  columns, 16 frequency bands on a power curve (top band = the highest octave, where lossy cutoffs
  show), the louder of each block, gamma 1.4. Drawn through the current spectrogram palette.
- **Made** by the analysis workers from the spectrum they already compute (no extra decode), and on
  the track page after a fresh analysis. Tracks analysed before thumbnails existed get one made once
  from their stored analysis (one at a time), so large libraries don't need re-analysing.
- **Stored** per track in the browser cache (`cache/thumbs/<collection>/<shard>/<id>.bin`), next to
  the stored analyses and fingerprints ([ADR 0024](0024-background-stores-full-analysis.md)).
- **Loaded** only for rows on screen (the table is virtualised), six reads at a time, into an LRU
  memory cache of 800 entries (≈2.4 MB), so scrolling back is instant.
- **Drawn** once per row with `putImageData` onto a 192 × 16 canvas scaled by CSS; the playhead and
  the played part are an overlay on the playing row only, so playback redraws one row.
- **Cue points** imported from rekordbox / Traktor are ticks on it (hot cues full height, loops
  green), looked up from a per-import index rather than a search per row.

## Consequences
- ~30 MB of cache for 10,000 tracks; derived, rebuilt when missing.
- The "Overview" column can be hidden or moved like any other.
