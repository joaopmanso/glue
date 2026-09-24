---
status: planned
milestone: M3
updated: 2026-09-24
adrs: [0006, 0009]
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
