---
status: shipped
milestone: M2
updated: 2026-09-24
adrs: [0006, 0009, 0019, 0024]
---
# Background analysis

## What it does
Analyses every track in the background (quality verdict and tier, bandwidth, effective bit depth,
BPM, key, tuning, fingerprint) so the table can sort and filter by them, without the user waiting or
the UI stuttering.

## Behaviour
- Queue = tracks with no analysis or an older `analysisVersion`. New tracks go first.
- Pool of `min(4, hardwareConcurrency / 2)` workers; drops to 1 while audio is playing; pausable.
- Status in the header: "Analysing 1,204 of 8,730 · ~40 min left".
- Results saved per track into its analysis shard; a crash loses at most the tracks since the last
  write. Bumping `analysisVersion` re-queues everything (e.g. after an algorithm fix).

## How it works
> v1 per [ADR 0019](../adr/0019-background-analysis-decoding.md): WAV/AIFF read in the worker; other formats decoded
> by the browser (2 at a time) and analysed in a worker pool; workers return a summary only.

- Worker receives the `FileSystemFileHandle`, reads the file, parses the container (existing parsers).
- Decoding inside the worker: own WAV/AIFF reader (bit-exact); FLAC / MP3 / Ogg Vorbis / Opus via
  wasm-audio-decoders; AAC / M4A via WebCodecs `AudioDecoder` + mp4box.js demux; ALAC via the main
  thread's `decodeAudioData` where supported, otherwise "can't analyse this format".
- Pipeline: existing `analyzeSamples` → `computeSpectrum` → `detectCutoff` / `classify` →
  `analyzeMusic` → fingerprint ([duplicates](duplicates.md)).
- No spectrograms stored; the Inspector recomputes the full one when opened.

## Acceptance
- [ ] Results match "Analyze a file" for the same file (same verdict, BPM, key).
- [ ] 1,000 mixed files analyse unattended; UI stays responsive; playback never stutters.
- [ ] Reload mid-run resumes where it stopped.

## Limits & open questions
- Decode licensing: mpg123 is LGPL-2.1 (shipped as a separate wasm module, fine); skip GPL faad2.
- Firefox AAC via WebCodecs unverified; check `isConfigSupported()` at runtime and fall back.

## Shipped in M2 (2026-09-24)
- As in [ADR 0019](../adr/0019-background-analysis-decoding.md): WAV/AIFF PCM read directly, other
  formats decoded by the browser (at most 2 at once), analysis in a pool of `min(4, cores/2)` module
  workers that return a summary (verdict, bandwidth, depth, origin, BPM, key, findings). One at a time
  while music plays; Pause/Resume in the library header with the number left.
- Re-queues a track when its size or date changes, or when `ANALYSIS_VERSION` is bumped. Failures are
  stored with their reason and not retried until the file changes.
- Code: `src/lib/pool.ts`, `src/workers/analysis.worker.ts`, `src/core/library/summary.ts`.
- Not yet: fingerprints (M5), time-left estimate.

## Full analysis stored too (2026-09-24)
- Each worker also returns the track's full analysis in its stored form, kept in the browser's storage
  ([ADR 0024](../adr/0024-background-stores-full-analysis.md)), so track pages open with no analysis.
- `ANALYSIS_VERSION` 2: existing libraries are analysed once more to fill that store.

