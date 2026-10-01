---
status: in-progress
milestone: M7
updated: 2026-10-01
adrs: [0057, 0058, 0131]
---
# Performance

## Now
- `?perf` shows the numbers on screen (below). Budgets are checked by `e2e/perf.spec.ts` (ADR 0058).
- **Rows load what's on screen** (the table draws 12 rows beyond each edge): Overviews, waveforms and covers, newest
  request first. A row that scrolls away drops its requests.
- **From another computer, asked until answered** (ADR 0131): `src/lib/onScreen.ts` (`OnScreen`, `Retries`), shared
  by thumbnails, waveforms and covers.
- The sections below are the history.

## What it does
GLUE stays quick with big collections (the vision: 50,000 tracks feel instant to browse, search and
sort) and draws its waveforms, spectrograms and live views smoothly while music plays. `?perf` in
the address shows the numbers on screen, so anyone can check their own collection.

## Behaviour
- **`?perf`** (before the `#`, e.g. `…/glue/?perf#/`) or the pref `mco.perf = 1` turns on the perf
  panel, bottom left:
  - how long the collection took to open;
  - what the row list costs;
  - saving;
  - drawing per frame;
  - long frames;
  - the last slow clicks and keys.
- The report keeps only real clicks and keys, and matches each long frame with the interaction it
  answered and where the page was.
- **Reset** starts counting again. **Copy** puts the full report on the clipboard, to paste into a
  message.
- Without `?perf`, nothing is measured.

## How it works
- The timers, `src/lib/perf.ts` (turning them on, the frame and interaction observers,
  `window.__gluePerf`) and the panel: [ADR 0058](../adr/0058-performance-budgets.md).
- The plan, in phases: [ADR 0057](../adr/0057-keep-the-stack-fix-the-architecture.md).
  0. Measure. **Shipped 2026-09-26.**
  1. Data pipeline. First step **shipped 2026-09-26**: change counters and indexes
     ([ADR 0059](../adr/0059-indexes-rebuilt-by-change-counters.md)), which fixed the Auto dialog
     (2.2 s → 0.1 s) and Duplicates (0.8 s → under 0.1 s) on the user's library.
  2. GPU drawing. First step **shipped 2026-09-27**: the live 3D view in three.js, drawn only when
     something changed ([ADR 0073](../adr/0073-3d-view-on-the-gpu.md)).
  3. Analysis off the main thread. Decoding **shipped 2026-09-26**
     ([ADR 0060](../adr/0060-decode-in-the-worker.md)), ahead of the rest of phase 1: on the user's
     desktop it was the stall they felt. Still to do: GLUE Home decoding with Symphonia.
  4. The phone web app ([phone app](phone-app.md)).

## Acceptance
- [x] Budgets written down and measured at 10k and 50k tracks ([ADR 0058](../adr/0058-performance-budgets.md)).
- [ ] 50k tracks: open ≤ 2 s; a switch or sort ≤ 100 ms; search P95 ≤ 50 ms; no frame over 50 ms while scrolling or analysing (phase 1).
- [ ] Playback: drawing ≤ 2 ms per frame, P95, on the track page and the Prepare tab, 3D included (phase 2).
- [x] Background analysis without main-thread decoding (phase 3, [ADR 0060](../adr/0060-decode-in-the-worker.md)).

## Tests
- `tests/synthetic.test.ts`: the synthetic GLUE folder loads through the real store and is the same
  for the same seed.
- `e2e/perf.spec.ts`: `PERF=1`; `PERF_SIZES`, and `PERF_BUDGET=1` to enforce.
  `PERF_FOLDER=<GLUE folder>` opens a copy of a real library's JSON files (only read) and clicks
  through every view, list, tag, sort and search, the track page and the Auto dialog, listing the
  slowest steps. The "background analysis" test analyses six 3-minute songs (with ffmpeg) and counts
  long frames.
- `e2e/decode.spec.ts`: the worker's decode against the page's, sample for sample, for every format. Results go to
  `test-results/perf.json`, baselines to [research/performance.md](../research/performance.md).

## A narrow window froze the page (fixed 2026-09-27)
- **The user's report:** narrowing the window below about 850 px froze the page, until a reload.
- **Cause:**
  - Below 800 px the library's layout dropped its fixed height (`.lib { height: auto }`).
  - The table's body, which draws only the rows that fit its height, grew as tall as all its rows.
  - So it drew every one: 7,000 rows, each with a canvas and a thumbnail request.
- **Fix:**
  - The narrow layout keeps the page's height: the sidebar on top (at most a third of the window,
    scrolling), the songs below.
  - The table never draws more rows than fit the window (`min(height, innerHeight)`), whatever the
    layout does.
- **Test:** `e2e/narrow.spec.ts` (always on) opens 3,000 synthetic songs at 1920 px, then 780, 600
  and 420 px. Each time: fewer than 150 rows drawn, a click answered at once, the sidebar there, and
  scrolling works. `seedFolder` moved to `e2e/seed.ts` (shared with perf.spec).

## Limits & open questions
- Headless Edge draws in software, so drawing numbers are relative, not what a GPU gives.
- The synthetic collection has no audio files: analysis and playback are measured with the test
  fixtures.
