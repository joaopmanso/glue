---
status: accepted
date: 2026-10-02
---
# 0144. FLAC decoded by GLUE itself; a big song gets the time it needs; a song given up on says so

## Context
The user, 2026-10-02: the analysis was done, but every GLUE showed 7 songs "analysing", matching GLUE Home's last log
lines.

Measured on the desktop:
- **GLUE Home was idle** (nothing left or running, 21 failed). The 7 songs (John Coltrane's *Blue Train*, 24-bit/192
  kHz FLACs of 360–543 MB, and two more, on the NAS) had no analysis in the collection, and nothing in GLUE Home's
  cache: **3 tries each, all failed, and nothing saved** (`home/ui/analysis.ts`: out of time, memory or a stopped
  worker are "try again", never saved; after 3, skipped for the session). The tab counted them as waiting for ever.
- **Why they failed:** the analysis of *Lazy Bird* alone ran past 10 minutes.
  - **WebCodecs** (the worker's decoder, ADR 0060) stalled: Edge's GPU process used 553 s of processor and the decode
    never finished in 30 minutes.
  - **The page decoder** (`decodeAudioData`) refused it: "Unable to decode audio data".
  - **ffmpeg** gave no samples either.
  - **The files:** 17 MB of zeros between the metadata and the first frame (left by whatever tagged them).
- **GLUE Home's limit** was 2 minutes a song, whatever its size.

## Decision
- **GLUE decodes FLAC itself** (`src/core/formats/flac.ts`, RFC 9639), first, in the analysis worker (`decode.ts`);
  the browser's decoders when it can't.
  - Every frame form (fixed and LPC subframes, the stereo modes, wasted bits, Rice escapes), any rate and depth.
  - Read a part at a time (8 MB), so a 543 MB file isn't held whole beside its samples.
  - Anything that isn't a frame is skipped to the next one (the zeros, a tag at the end).
  - **Exact:** the fixtures give ffmpeg's samples (hashes in `tests/flac.test.ts`); *Lazy Bird* and *Blue Train* give
    the MD5 their files record. *Lazy Bird* (7 min) decodes in 18.5 s, *Blue Train* (10:43) in 27 s; its whole
    analysis took 75 s alone ("Genuine hi-res: content to 96.0 kHz").
- **A song's time is 2 minutes, or a second a MB** (`cache.timeFor`): a 543 MB file gets 9 minutes beside the others.
- **A song given up on says so** (`cache.giveUp`, `gaveUp` in `src/core/library/analysed.ts`): after its third try,
  saved as failed, with why ("GLUE Home gave up after 3 tries: it didn't finish in time. Analyse it again to retry."),
  in words that aren't "try again". It shows as "Couldn't analyse" everywhere, and is tried again when asked, or
  when its file changes.

## Alternatives considered
- **A FLAC decoder from npm** (WebAssembly): a dependency for what's 300 lines of TypeScript, and none was installed.
- **Decoding in GLUE Home's Rust:** the website's analysis needs it too (no GLUE Home), and the samples would cross
  to the page.
- **Never giving up:** a song that can't be analysed would hold a place for ever.

## Consequences
- **Every FLAC is decoded the same way everywhere,** without the browser's decoders (its other formats still use them).
- **A failure that keeps coming is shown,** not counted as waiting.
- **Memory:** a 10-minute 192 kHz song is about 1 GB of samples while it's analysed, as before.
