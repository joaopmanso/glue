---
status: accepted
date: 2026-10-05
---
# 0154. The analysis queue in GLUE Home's engine, in Rust

## Context
Since ADR 0147 GLUE Home analyses each song natively (`crates/glue-audio`), but the queue around it was still
JavaScript in the hidden service page (`home/ui/analysis.ts`, `lanes.ts`, `speed.ts`, most of `cache.ts` and
`library.ts`). The queue decides which song is next, finds the songs' files, counts the speed, retries failures and
puts the results into the library through the engine's stores, which became Rust in ADR 0153. Each song crossed
from JavaScript to Rust and back several times. The plan approved on 2026-10-03 moves the queue next (E3).

## Decision
- **The queue is part of the engine** (`crates/glue-engine/src/queue.rs`), with the same rules as before:
  - songs asked for now first, then those never analysed or whose file changed, oldest added first;
  - songs on network folders take turns (ADR 0135);
  - no new song beyond two while one plays (ADR 0138);
  - songs that failed for a passing reason are tried again, at most three times, then saved as failed with why
    (ADR 0109, 0144);
  - songs whose folder isn't reachable wait;
  - the results go into the library every 25 songs and at the end of a run, through the engine's own stores, while no
    tab from before the engine holds the lease;
  - a tab that asks takes the results itself (`delegate`, `taken`);
  - the results waiting are kept in `s/pending.json`;
  - the speed over two minutes and the ten-minute chart (ADR 0136).
- **Where songs are** (`library.rs`) is the engine's too: the library's profiles and collections, a shared collection
  as this computer, a song's file, and finding music folders (the settings, the DJ app's path, the usual folders, then
  one drive search per folder, remembered in the settings).
- **One song's analysis** (`analyse.rs`, moved from `home/src-tauri/src/analysis.rs`) is shared by GLUE Home and the
  e2e tests' engine. GLUE Home's host reads the file (only from its folders, giving way to songs being played).
- **The local link answers every `/rpc` in Rust:** `analyse`, `pause`, `where` and `whereFile` too. Nothing goes to the
  service page any more (the `rpc` event and `rpc_reply` are gone).
- **The service page keeps** what serves other devices until E4: songs analysed at once for another device (`soon`), the
  background thumbnails, covers. It reaches the engine through `engine_cmd` (`analyseSong`, `trackPath`, `describe`,
  `analysisAsk`…) and hears the queue's state (`engine-analysis`) and the songs made (`engine-made`).
- **The e2e tests analyse for real:** the test engine links `glue-audio` (built optimised) and reads real files. The
  tests that stood songs in with `window.__disk` now put them on disk (`e2e/homeDisk.ts`). The fake GLUE Home serves its
  cache folder.

## Alternatives considered
- **Keep the queue in JavaScript and call the engine per song:** it worked, but every song crossed the bridge several
  times, and the service page had to stay for it.
- **Move the queue and the cloud side together:** too big to test well in one step. The parts that serve other
  devices go with the sessions in E4.

## Consequences
- The queue's unit tests are Rust's (`tests/lanes.test.ts` and `tests/speed.test.ts` moved into `queue.rs`). An e2e run
  needs Rust, and the first build of the test engine compiles `glue-audio`.
- The settings window's numbers come from the engine (`engine-analysis`) through the service page; E5 sends them
  straight to the window.
- A music folder the engine finds is saved in GLUE Home's settings by the engine itself (`patch_config`).
- The backup made before a repair is dated with its own time, so it's the same bytes on any computer (a macOS build
  caught the clock in it, 2026-10-05).
