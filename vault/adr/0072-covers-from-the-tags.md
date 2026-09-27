---
status: accepted
date: 2026-09-27
---
# 0072. Covers come from the files' tags, kept as small JPEGs in the browser's cache

## Context
The user's list (2026-09-27): show cover art. GLUE's own container parser skips pictures (it is
parity-tested against the Speklone page, ADR 0016). mediabunny, already the worker's decoder
(ADR 0060), reads embedded pictures:
- ID3 in MP3, and in WAV and AIFF chunks;
- FLAC and Ogg pictures;
- MP4 and Matroska covers.

It reads only the bytes it needs, from a file or from a URL with byte ranges.

A library has thousands of songs; an album's songs usually carry the same picture, often 1000 px or
more.

## Decision
- **Found at analysis:**
  - the analysis worker reads the front cover (or the first picture that isn't a back cover);
  - it makes two square JPEGs, 320 px and 64 px, the small one from the large (`workers/cover.ts`).
- **Named by the picture's hash** (SHA-256, 24 hex): an album's songs share one.
  - The track keeps `art` (the hash; `''`: it has none; absent: not looked for yet).
- **Kept in the browser's cache,** like the analyses and thumbnails (ADR 0024, 0031):
  - `art/<cid>/<hash>-64.jpg` and `-320.jpg`;
  - derived data, safe to lose, not in the GLUE folder.
- **Songs analysed before, or in another browser** (`lib/covers`):
  - only songs on screen, three at a time, in a small worker;
  - it reads only their tags: from the file in the browser, or through GLUE Home's local link with
    byte ranges in Home mode, never the whole song.
- **Shown:**
  - a Cover column (after Overview; hovering shows the 320 px picture beside it);
  - the track page's header.
  - Other computers' songs show none for now.

## Alternatives considered
- **Extending GLUE's parser:** a picture reader per container, and a change to the parity-tested
  parser, for what mediabunny already does.
- **Covers in the GLUE folder:** they'd follow the library between computers and GLUE Home. But a
  cache is what they are, and thousands of images in a synced folder cost more than reading tags
  again.
- **The original pictures:** megabytes each; the table needs 64 px.

## Consequences
- An old library gets its covers as it's scrolled; a column that sorts or filters by cover would need
  a full pass first (none now).
- **Merged collections:** covers of another computer's songs need its GLUE Home to send them (like
  thumbnails, ADR 0046); later.
- **Tests:**
  - fixtures with an embedded cover: `mp3-cover.mp3` (ID3 APIC), `flac-cover.flac` (PICTURE);
  - e2e: found at analysis, one hash for the same picture, hover, the track page, read again from
    the tags when the cache is gone;
  - in Home mode, read with byte ranges only.
