---
status: shipped
milestone: M2
updated: 2026-10-02
adrs: [0006, 0009, 0019, 0024, 0103, 0109, 0110, 0147]
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

## On / off per collection (2026-09-24)
- "Background analysis" switch in the library header, saved in the collection (`autoAnalyse`), so a
  big import needn't all be analysed. Off: the header shows how many aren't analysed; "Analyse" in the
  selection bar analyses chosen tracks; opening a track's page still analyses it.

## Decoding in the worker (2026-09-26, [ADR 0060](../adr/0060-decode-in-the-worker.md))
- **Each worker gets the file itself** and reads, parses and decodes it there: mediabunny demuxes,
  WebCodecs decodes. The samples are trimmed as the browser's decoder trims them, so they're
  identical to before, sample for sample.
- **The page only decodes what a worker can't** (ALAC, HE-AAC), the old way.
- **Six 3-minute songs analysed:** no frame over 50 ms, against 4 before (up to 83 ms). The user's
  real stalls were 140–560 ms every few seconds.

## One meaning of "not analysed" (2026-09-30, [ADR 0109](../adr/0109-one-meaning-of-not-analysed.md))
- `analysisState` (`src/core/library/analysed.ts`): done, failed (couldn't analyse), waiting, elsewhere (another
  computer's song), nofile. The sidebar, its views, Stats, the analysis bar, the tab's queue and GLUE Home's
  all count with it; `needsAnalysis` is "waiting".
- Passing failures (`isTransient`: took too long, allocation failed, out of memory, worker stopped) are never
  stored. GLUE Home and the tab retry a song up to three times per session. Old stored ones count as waiting.
- Lasting failures show under "Couldn't analyse"; "Analyse now" tries them again.
- In Home mode, the screen takes GLUE Home's results from its cache when it needs them
  ([ADR 0110](../adr/0110-screen-takes-glue-homes-analyses.md)).

## Songs added from a tab are looked for at once (2026-09-30, GLUE Home 0.36.1)
- The user added music folders while GLUE Home ran: the tab said the songs were being analysed by GLUE Home,
  GLUE Home said "all analysed", until it was restarted. It looked for songs at most every 5 minutes, and not
  at all while a run went on.
- Now an edit that adds songs new to the collection (`engine.edit` → `added`) makes GLUE Home look again at
  once (`analysis.added`), and during a run the new songs join its queue (those running or queued aren't
  queued twice). Ratings and other edits don't cause a look (it reads every file of the collection).

## GLUE Home's native engine (2026-10-02, [ADR 0147](../adr/0147-glue-home-analyses-natively.md))
- `crates/glue-audio`: the same analysis in Rust, every stored file (0.44 lossless, 0.45 the rest and lossy decoders).
- GLUE Home 0.45.0, Activity › Native engine check: re-analyses a sample natively, saves nothing, compares with the
  stored results; outcomes in `library/x/verify.jsonl` in GLUE Home's cache.
- GLUE Home 0.46.0 analyses with it ([ADR 0148](../adr/0148-glue-home-analyses-songs-in-rust.md)): `analyse_song`
  reads, analyses and writes the cache in Rust; the queue stays in the service page. 0.47.0: incoming songs, covers and
  waveforms from details too; no audio JavaScript in GLUE Home (`tests/homeBundle.test.ts`).
