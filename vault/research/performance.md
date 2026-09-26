---
updated: 2026-09-26
---
# Performance notes

Dev machine: Windows 11 laptop, 12 threads, Intel Iris Xe (gen-12lp). Measured 2026-09-23/24.

## Stem separation (HT-Demucs fp16-weights ONNX, 7.8 s chunks)
| Engine | Per chunk | 4-min track | Notes |
|---|---|---|---|
| Browser WebGPU (Iris Xe), onnxruntime-web 1.30 | ~30–39 s | ~15 min | Thread count doesn't matter (1 vs 8 similar; ~30 s without cross-origin isolation) |
| Browser WASM CPU | — | — | `std::bad_alloc`: exceeds 4 GB even with mem arena/pattern off |
| Native onnxruntime-node 1.22 CPU, 12 threads | ~11 s | ~6–7 min | Removed (client-only rule); for the desktop client |
| Native Python onnxruntime CPU | ~9–10 s | — | Reference |
| DirectML (onnxruntime-node) | — | — | Failed to initialise on this machine |
Session creation: ~20 s first time (WebGPU and native). Model download ~8 s.

Re-measured 2026-09-25 (headed Edge, real Iris Xe adapter "intel gen-12lp", 40 s test WAV = 7 chunks):
the frozen Speklone page **37 s/chunk, 284 s total**; GLUE **38 s/chunk, 297 s total**, so the same
engine at the same speed. A 4:25 track is 46 chunks, about 28 min on this laptop either way (a user
remembered ~3 min in Speklone, which matches a clip of about 30 s). The first chunk is ~10 s slower
(shader compilation).

## Analysis (Speklone pipeline)
- 30 s 48 kHz/24-bit clip: full analysis < 1 s in Node.
- 4-min 48 kHz/24-bit AIFF: parse + analysis ~0.8 s (Node), plus tempo/key ~4 s (tempo FFT pass
  dominates: 80k frames × 1024-point FFT). Optimisation candidate for background analysis: hop 256
  for tempo, or analyse the first 2–3 minutes only.
- Synthetic 12 s demo (96 kHz): generation ~0.5 s + analysis ~0.4 s.

## Library and drawing baseline (2026-09-26, before ADR 0057's phases)
Measured with `PERF=1 npx playwright test e2e/perf.spec.ts` ([ADR 0058](../adr/0058-performance-budgets.md)):
headless Edge on the desktop (JMansoPC), production build, synthetic collections (seed 1). Each time
runs from the interaction to the next painted frame. **Bold** = over budget.

| | 10k tracks | 50k tracks | Budget (50k) |
|---|---|---|---|
| GLUE folder JSON | 14 MB | 70 MB | |
| Open (choose folder → rows) | **2.4 s** (store load 1.1 s) | **4.8 s** (store load 3.3 s) | 2 s |
| JS heap after opening | 21 MB | 94 MB | |
| Sidebar switch, worst (folder "Gigs") | **131 ms** | **336 ms** (All tracks 258) | 100 ms |
| Sort, worst (artist / title / BPM) | 90 ms | **437 ms** | 100 ms |
| Search keystroke P95 | **78 ms** | **538 ms** | 50 ms |
| Scrolling: frames over 50 ms | **2** | **3** | 0 |
| 5 s of background changes: frames over 50 ms | **3** (worst 663 ms) | **45** (worst 774 ms) | 0 |
| One row-list computation (`rows`) | 6 ms | 44 ms (×2 per change) | |

Playback on the track page and the Prepare tab (flac-96k-24 fixture, looped, 6 s each):

| View | Drawing per frame P95 | Frames in 6 s | Notes |
|---|---|---|---|
| Track page, scrolling live view | 2.0 ms | 576 | spectrogram redrawn every frame (1.0 ms) |
| Track page, 3D live view | **6.3 ms** | 315 | frame rate halves; 3D draw 2.1 ms plus raster |
| Prepare deck | 1.5 ms | 587 | deck redrawn every frame (1.0 ms) |
| Prepare deck + 3D | **4.7 ms** | 266 | 3D 2.2 ms |

Readings:
- **Rows:** sorting, searching and switching grow with the collection, because every change rebuilds
  every track's row, search text and sort values. The browser's own work (rendering about 50 rows)
  is a fixed cost.
- **Background changes:** each stored analysis runs `rows` twice (analysis, then track). At 50k that
  is about 90 ms per change, so 12 changes a second take most of the main thread.
- **3D views:** 110 ridges × 220 points with a gradient each, drawn in 2D every frame, halve the frame
  rate even in headless (software) drawing.

## The user's library, step by step (2026-09-26, ADR 0059)
The user's `?perf` report (Chrome, their 8.8k-track library, GLUE Home's disk):
- open 2.7 s (store load 2.67 s);
- rows 7 ms average, 24 ms at most;
- one click 1.7 s, one form submit 1.1 s, then 0.9 s handling a JSON response.

The same library from a copy of its GLUE folder (`PERF_FOLDER`, headless Edge, 1,298 JSON files,
14 MB):

| Step | Before | After ADR 0059 |
|---|---|---|
| Open (choose folder → rows) | 3.4 s (store load 2.4 s) | 2.9 s |
| Opening the Auto playlist builder | **2,176 ms** | 103 ms |
| Generating an auto playlist | **673 ms** (candidates 558) | 143 ms (candidates 9, generator 94) |
| Opening Duplicates (421 groups) | **797 ms** | under 100 ms (40 groups, more on scroll) |
| Opening the Engine DJ folder (all its playlists' songs) | 192 ms | 178 ms |
| Sorts | 67–108 ms | 84–106 ms |
| Search keystroke | 42–105 ms | similar |
| Duplicate scans during the sweep | 25 (a loop) | 1 |

Still to do (the row index, next): sorts, searches and switches at about 100 ms here, and 300–540 ms
at 50k; opening in 2–3 s.

## Decoding on the page vs in the worker (2026-09-26, ADR 0060)
- **`decodeAudioData` on the page** (5-minute files, headless Edge, first run):

| Format | Decode | Long frames |
|---|---|---|
| MP3 320k | 637 ms | 181, 180, 58 ms |
| FLAC | 390 ms | 55 ms |
| AAC 256k | 593 ms | 54 ms |

  Copying the channels took about 25 ms more.
- **mediabunny + WebCodecs in a worker** (same files):
  - 1.4–1.8 s per 5-minute file, with no long frames on the page;
  - samples identical once trimmed (MP3 LAME delay 1,105; AAC priming 1,024).
- **Background analysis of six 3-minute songs:**

| | Frames over 50 ms | Worst frame | Per song |
|---|---|---|---|
| Before (page decode) | 4 | 83 ms | read 63 ms, parse 24 ms, decode 633 ms, copy 17 ms on the page; worker 2.5 s |
| After (worker decode) | 0 | 49 ms | 3.5 s, all in the worker |

- **The user's second report** (8.8k library, Chrome):
  - open 1.75 s;
  - Auto dialog: candidates 10 ms, generate 69 ms;
  - GLUE Cloud overlay merge about 100 ms;
  - stalls of 140–560 ms every 3.3 s from fingerprints made again on the page (fixed by ADR 0060);
  - a 0.9 s "click" that was the native "Delete playlist?" confirm dialog.
