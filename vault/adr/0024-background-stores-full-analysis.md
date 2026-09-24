---
status: accepted
date: 2026-09-24
supersedes: 0023 (storage location and when it's written)
---
# 0024. Background analysis stores the full analysis, in the browser's storage

## Context
[ADR 0023](0023-store-track-page-analysis.md) stored a track page's full analysis on its first
visit, in the MCO folder. The user still saw the analysis steps every time they opened a track they
hadn't opened before (2026-09-24): they expect the information to be collected once, by the
background pass, and never again. The background workers already compute the full spectrum; they
threw it away. At full resolution a track's analysis is ~1.6 MB (1600 × 1024 spectrogram), ~1 MB
compressed: 10 GB for a 10,000-track library, too much for a Documents folder that's often synced
(OneDrive, iCloud).

## Decision
- The background analysis workers also build the stored form and return it with the summary; MCO
  writes it right away. Opening any analysed track's page shows it with no analysis.
- Stored form: average spectrum as float32 (exact; the verdict uses it), spectrogram at ≤ 512
  frequency rows (the louder of each pair), one byte per cell in 0.8 dB steps, rows delta-coded,
  deflate-compressed. Measured on a real 3:54 AIFF: 490 KB (the spectrogram has a fixed 1600
  columns, so the size barely depends on length): about 5 GB for 10,000 tracks.
- Location: the browser's own storage (OPFS) under `cache/details/<collection>/<shard>/<id>`, not the
  MCO folder. It's derived data: not synced, safe to lose, rebuilt by re-analysing.
- `ANALYSIS_VERSION` 2 re-queues every track once so existing libraries get stored analyses.
- The track page still analyses (and stores) a track the background pass hasn't reached yet;
  "Re-analyse" recomputes.

## Consequences
- Instant track pages; one background pass per library (plus changed files).
- A cleared browser storage, or another browser, means a background re-analysis to rebuild the cache.
- The spectrogram on the page has half the frequency resolution of a fresh analysis; readouts, the
  verdict and the average spectrum are unchanged.
