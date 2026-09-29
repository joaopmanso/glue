---
status: accepted; the pacing superseded by 0106
date: 2026-09-29
---
# 0105. Pace pushes to GLUE Cloud; GLUE Home analyses as many songs at once as the computer allows

## Context
The user, on GLUE Home 0.29 (2026-09-29):
- The analysis is slow: "I have a 16 core ryzen 7 and an rtx5070… should be able to analyse more than 4
  or 5 at a time."
- "I have about 90k rows written today only, why? that'll use almost all of the free tier" (D1's free
  plan: 100,000 rows written a day, `cloud/src/usage.ts`).

The causes, from the code:
- GLUE Home's pool was half the cores, at most 4 (`home/ui/cache.ts`, the same as a tab).
- Every batch of 25 analysed songs was saved and then synced (`analysis.on.written` → `sharedSoon`). A push
  rewrites every changed file whole: 25 songs touch up to 25 track shards and 25 analysis shards. Each
  file written costs about 3 rows (the row, its primary key, the `shared_files_rev` index), plus one for
  the collection's counter. So a 13,000-song library cost roughly 520 pushes × ~50 files × 3 ≈ 78,000
  rows, before the removal and the re-adding. A tab without GLUE Home did the same after each save.

## Decision
- **Pushes are paced** (`src/core/shared/pace.ts`, `PushPace`; `syncShared(place, plan)`):
  - nothing busy: everything that changed goes up at once, as before;
  - busy: only the files the user edited go up at once (a rating, a playlist: `engine.on.edited`, a
    5-second debounce so a burst makes one push). The rest goes at most once an hour, and all of it once
    the work ends.
    - GLUE Home is busy while it analyses, and for 2 minutes after bulk work (a scan or a removal of
      more than 50 songs).
    - A tab without GLUE Home can't tell edits from analysis, so while it analyses it pushes at most
      every 10 minutes.
  - Pulls are unchanged: they read rather than write.
- **GLUE Home analyses more at once:** by default the computer's threads less 4, from 2 to 12 (16
  threads: 12). The user can set it from 1 to 24 in GLUE Home's Activity ("Songs at a time",
  `HomeConfig.analysisWorkers`). A change applies while the analysis runs.
- The graphics card isn't used: the analysis (decoding, FFTs) runs in workers on the processor. Moving it
  to the GPU (WebGPU) would be its own project, and decoding stays on the processor either way.

## Alternatives considered
- Sync analysis summaries separately, or not at all: other devices need quality, BPM and key.
- Smaller files (more shards): more files per push, not fewer rows.
- Drop the `rev` index: every pull would scan the collection's files (rows read), and a push would still
  cost 2 rows a file.

## Consequences
- A full analysis of a large library costs about one full push an hour (up to ~1,500 rows for 512 files)
  instead of one every 25 songs.
- While GLUE Home analyses, other devices see new analyses (and newly scanned songs) up to an hour late;
  the user's own edits still arrive within seconds.
- More songs at once uses more memory: up to a few hundred MB for each hi-res song being decoded. A worker
  that runs out is restarted and the song is tried again later (`pool.ts`).
