---
status: accepted
date: 2026-09-26
---
# 0058. Performance budgets, measured on a synthetic collection

## Context
The vision says 50,000 tracks should feel instant to browse, search and sort, but nothing measured
it ([ADR 0057](0057-keep-the-stack-fix-the-architecture.md)). The user's own collection is about
8.8k tracks: 16 MB of JSON in about 1,300 files. Timings depend on the machine, so they can't gate CI.

## Decision
- **Instrumentation.**
  - `src/core/perf.ts` holds the timers: `time`, `timeAsync`, `record`, and per-frame totals of the
    `draw:*` spans. It has no DOM, so the store can use it, and it costs nothing while off.
  - `src/lib/perf.ts` turns them on with `?perf` in the address (before the `#`) or the pref
    `mco.perf = 1`. It keeps:
    - frame gaps and drawing per frame;
    - long animation frames, with the scripts that caused them;
    - slow interactions, from Event Timing.
  - `window.__gluePerf` exposes all of it to tests.
  - `src/ui/PerfHud.svelte` shows the numbers on screen, and "Copy" puts a report on the clipboard.
- **What gets timed:**
  - `store.load`, `store.flush`, `store.serialize`;
  - `open.collection`;
  - `rows` (every row-list computation);
  - `analysis.read / parse / decode / copy / worker / track`;
  - `draw:spec / specimage / live / capture / deck / over / overview / 3d / thumb`.
- **A synthetic GLUE folder:** `tests/synthetic.ts` builds one from a seed at any size:
  - 256 shards;
  - nested folders and playlists;
  - three DJ imports with BPM, key and rating;
  - tags;
  - every grade;
  - songs with no file, and songs not analysed yet.
  The songs' music folder isn't connected, so it measures the library alone.
- **The perf test:** `e2e/perf.spec.ts`, run with `PERF=1`. It measures each interaction to the next
  painted frame, at 10k and 50k tracks (`PERF_SIZES`):
  - open;
  - each sidebar view;
  - each sort;
  - each search keystroke;
  - 2.5 s of scrolling;
  - 5 s of background changes (12 a second, like analysis);
  - playback drawing per frame on the track page and the Prepare tab, with the live and 3D views.
  Results go to `test-results/perf.json`. `PERF_BUDGET=1` fails on budgets; the phases that meet
  them turn it on.
- **Budgets at 50k tracks** (Edge, the dev laptop):

| What | Budget |
|---|---|
| Open, from choosing the folder to rows on screen | ≤ 2 s |
| Switching the sidebar view | ≤ 100 ms |
| A sort | ≤ 100 ms |
| A search keystroke to paint | P95 ≤ 50 ms |
| Scrolling | no frame over 50 ms |
| 5 s of background changes | no frame over 50 ms |
| Playback | drawing ≤ 2 ms per frame (P95) |

## Alternatives considered
- **Lighthouse, or tracing with DevTools:** good for one-off digging, but it can't drive GLUE's
  interactions or check a collection this size.
- **Timing checks in CI:** too noisy on shared runners.

## Consequences
- Every performance phase shows before-and-after numbers in
  [research/performance.md](../research/performance.md).
- The user can measure their own collection on the live site with `?perf`.
- The synthetic collection has no audio: analysis and playback are measured separately, with the
  test fixtures.
