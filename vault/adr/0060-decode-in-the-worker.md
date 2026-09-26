---
status: accepted
date: 2026-09-26
supersedes: 0019 (its decoding part)
---
# 0060. Read, parse and decode audio in the worker (mediabunny + WebCodecs)

Supersedes how [ADR 0019](0019-background-analysis-decoding.md) decodes: the pool of analysis workers
stays. This is phase 3 of [ADR 0057](0057-keep-the-stack-fix-the-architecture.md), done ahead of the
rest of phase 1 because it's the stall the user feels.

## Context
- **The user's second `?perf` report (2026-09-26) showed stalls of 140–560 ms about every 3 s.**
  They came from fingerprints being made again for songs analysed on the laptop: each song was read,
  parsed and decoded on the page.
- **`decodeAudioData` blocks the page in chunks.** Measured on a 5-minute file: two 180 ms frames
  for MP3, 55 ms for FLAC and AAC, plus the parsing and the copying of every channel.
- ADR 0019 had said: "Revisit if main-thread decoding causes jank."

## Decision
- **Every analysis, fingerprint and Prepare waveform sends the file itself to the worker.** A `File`
  is passed by reference, so that costs nothing. The worker then:
  - reads the file, parses the container and scans the clues (`parseContainer`, `scanClues`, as
    before);
  - reads WAV and AIFF directly, as before;
  - decodes everything else with **mediabunny** (demuxing: MP3, MP4/M4A, ADTS AAC, FLAC, Ogg, WebM)
    and the browser's **WebCodecs** `AudioDecoder` (`src/workers/decode.ts`).
- **Same samples as the browser's own decoder** (`src/core/audio/trim.ts`, `keepRange`). Both run
  FFmpeg's decoders in Chromium; the difference is what gets trimmed:
  - **MP3 with a LAME, Lavc or Lavf tag:** skip delay + 529 at the start, and stop at frames × spf −
    padding + 529 (`mp3Gapless`, FFmpeg's rule).
  - **MP4:** drop the priming its edit list marks (a negative first timestamp), and keep the
    demuxer's duration.
  - **Ogg:** cut to the sample-exact length our parser reads from the last granule.
  - **Everything else:** keep all of it.
- **When the worker can't decode, the page does it, the old way:**
  - which cases: no WebCodecs; a codec the browser doesn't decode here (ALAC in Chromium); a rate
    other than the one the page would decode at (HE-AAC);
  - how: the worker answers `decode`, the page runs `pageJob` (`decodeAudioData`, at most 2 at a
    time), and the worker then analyses.
- **Stems keep decoding on the page.** They need resampling to 44.1 kHz, and the user starts them.
- **`?perf`'s `decodeCheck(url)`** decodes a file both ways and compares them. `e2e/decode.spec.ts`
  runs it on every fixture format.

## Alternatives considered
- **Our own demuxers:** more code to write and keep correct (MP4 sample tables, Ogg pages, FLAC
  frames). mediabunny is maintained and tree-shakes.
- **wasm decoders (wasm-audio-decoders):** about 400 KB of wasm, and mpg123 is LGPL. WebCodecs is
  already in the browser.
- **Only in GLUE Home (Symphonia, ADR 0051 stage 4):** it doesn't help the browser-only mode or the
  laptop. It's still planned, for GLUE Home's own analysis.

## Consequences
- **The same audio as before.** Verified sample for sample, with the largest difference 0, on:
  - the fixtures (MP3, M4A, FLAC, Opus);
  - and, made with ffmpeg: Ogg Vorbis, WebM Opus, ADTS AAC, MP3 with and without a LAME tag, and an
    M4A with an edit list.
  The only difference is WebM Opus, which keeps up to about 8 ms of end padding (WebM doesn't say
  where it ends). The parity tests against the legacy page are unchanged.
- **Six 3-minute songs analysed in the background:**
  - before: 4 frames over 50 ms (worst 83 ms), with 24 ms of parsing and 17 ms of copying on the
    page per song;
  - after: none (worst 49 ms).
  - A song takes about the same time overall (3.2 s → 3.5 s; decoding in WebCodecs is a little
    slower, but it's off the page).
- **The analysis worker grows from about 30 kB to 382 kB** (mediabunny), loaded once and cached. The
  page's bundle is unchanged.
- **mediabunny is MPL-2.0.** It's used unmodified from npm, and its license headers stay in the built
  worker. Any change to its own files would have to be shared.
- **GLUE Home's analysis page uses the same pool,** so it decodes in its workers too (WebView2 has
  WebCodecs; elsewhere the page-decode fallback covers it).
