---
status: in-progress
milestone: M7
updated: 2026-09-26
adrs: [0057, 0058]
---
# Performance

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
- **Reset** starts counting again. **Copy** puts the full report on the clipboard, to paste into a
  message.
- Without `?perf`, nothing is measured.

## How it works
- The timers, `src/lib/perf.ts` (turning them on, the frame and interaction observers,
  `window.__gluePerf`) and the panel: [ADR 0058](../adr/0058-performance-budgets.md).
- The plan, in phases: [ADR 0057](../adr/0057-keep-the-stack-fix-the-architecture.md).
  0. Measure. **Shipped 2026-09-26.**
  1. Data pipeline.
  2. GPU drawing.
  3. Analysis off the main thread.
  4. The phone web app ([phone app](phone-app.md)).

## Acceptance
- [x] Budgets written down and measured at 10k and 50k tracks ([ADR 0058](../adr/0058-performance-budgets.md)).
- [ ] 50k tracks: open ≤ 2 s; a switch or sort ≤ 100 ms; search P95 ≤ 50 ms; no frame over 50 ms while scrolling or analysing (phase 1).
- [ ] Playback: drawing ≤ 2 ms per frame, P95, on the track page and the Prepare tab, 3D included (phase 2).
- [ ] Background analysis without main-thread decoding (phase 3).

## Tests
- `tests/synthetic.test.ts`: the synthetic GLUE folder loads through the real store and is the same
  for the same seed.
- `e2e/perf.spec.ts`: `PERF=1`; `PERF_SIZES`, and `PERF_BUDGET=1` to enforce. Results go to
  `test-results/perf.json`, baselines to [research/performance.md](../research/performance.md).

## Limits & open questions
- Headless Edge draws in software, so drawing numbers are relative, not what a GPU gives.
- The synthetic collection has no audio files: analysis and playback are measured with the test
  fixtures.
