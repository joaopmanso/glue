---
status: accepted
amended-by: 0023
date: 2026-09-24
---
# 0019. Background analysis: browser decoding feeding a pool of analysis workers

## Context
Every track should be analysed in the background, several at once. Analysis (samples → spectrum →
verdict → tempo/key) is pure and already runs in a worker. Decoding is the issue: `decodeAudioData`
exists only on the main thread; decoding inside workers needs WebCodecs plus demuxers, or wasm
decoders (feature doc background-analysis.md).

## Decision (v1)
- WAV and AIFF are read bit-exactly in the worker from the raw bytes (as today).
- Everything else is decoded by the browser (`decodeAudioData` on an OfflineAudioContext at the file's
  own rate; the browser does the work off the main thread), at most 2 decodes at a time.
- A pool of analysis workers (`min(4, cores / 2)`, 1 while audio is playing) runs the unchanged
  pipeline and also the verdict, returning only a small summary (no spectrogram) to save memory.
- The detail page recomputes the full analysis (with spectrogram) when opened, with the same code,
  so it matches the summary.
- Very long files (decoded size above ~600 MB, e.g. a 2-hour hi-res mix) are skipped in the
  background with a note; they can still be opened.

## Alternatives considered
- WebCodecs + mp4box.js / Ogg / FLAC demuxers in workers: fully off the main thread, but a lot of
  code; ALAC unsupported anyway. Revisit if main-thread decoding causes jank.
- wasm-audio-decoders: adds ~400 KB of wasm and licence care (mpg123 LGPL).

## Consequences
- Supports every format the browser can decode, with little new code.
- Main thread does copying of decoded channels; kept to 2 concurrent decodes.
