---
status: superseded in part
superseded-by: 0024
date: 2026-09-24
amends: 0019
---
# 0023. Track pages store their full analysis

## Context
[ADR 0019](0019-background-analysis-decoding.md) kept only a summary per track and had the track page
recompute the full analysis (spectrogram, average spectrum, evidence) on every visit. The user found
that slow and wasteful (2026-09-24): the result should be computed once, kept, and regenerated only on
request. Recomputing also replaced the player's source, so returning to the playing track stopped it.

## Decision
- The first time a track page is opened, its full analysis is stored in the collection folder:
  `details/<shard>/<id>.json` (file facts, sample stats, tempo/key, spectrum sizes) and
  `details/<shard>/<id>.bin` (average spectrum as float32, then the spectrogram at one byte per cell,
  0.8 dB steps from −204 dB). About 0.1–1 MB per track, only for tracks whose page was opened.
- Later visits show the stored result straight away. It's discarded when the file's size or date
  changes, or when `DETAILS_VERSION` is bumped. "Re-analyse" on the page recomputes and replaces it.
- A stored analysis can be shown without permission to read the file; playing it asks once.
- The player knows which library track it holds (`sourceKey`); a page for that track doesn't reload it.

## Consequences
- Track pages open instantly after the first visit, and the music keeps playing.
- `details/` is derived data: safe to delete, rebuilt on demand. Background analysis still keeps
  summaries only (no full analysis for every track).
