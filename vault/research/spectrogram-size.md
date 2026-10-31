---
updated: 2026-10-21
---
# The details' spectrogram: what it costs, and what would shrink it

Measured on 2026-10-21, on 100 of the user's songs ("Non-Electronic", read from GLUE Home's cache), after the user asked
whether the spectrogram could be "data driven instead of image driven". **Decision: left as it is** (the user, "nop,
let's leave it as is").

## What's stored
`d/<p>/<c>/<shard>/<id>.bin` (ADR 0185): the zlib block of the average spectrum (f32) and the spectrogram,
1600 time slices × 512 bands, one byte a cell (0.8 dB steps from −204 dB), delta-coded down each slice. It's already data
(the song page draws it on a canvas; the quality re-check, ADR 0166, reads it). About 500 KB a song: 9.6 GB for the
user's 17,500 songs.

## Encodings tried (average per song)
| Encoding | KB |
|---|---|
| Now: zlib, delta along frequency | 509 |
| zstd 19, same bytes | 492 |
| zstd 19, delta along time | 556 |
| brotli 11, delta along time | 521 |
| Floor −150 dB, 0.8 dB steps | 553 |
| Floor −150 dB, 1.6 dB steps | 469 |
| Floor −130 dB, 1.6 dB steps | 467 |
| 800 time slices (the louder of each pair) | 278 |

A music spectrogram is mostly real detail: compression and coarser levels save 3–8 %. Only 1.5 % of cells are below
−150 dB. Fewer cells save in proportion.

## The other way, not taken
- **The idea:** keep only the small numbers (the header, the mini spectrogram and waveform, the fingerprint), and work
  the spectrogram out from the file when a song's page opens. The cache would drop to under 1 GB.
- **The cost:**
  - A full analysis took 1.5–3.9 s a song on the user's files (`glue-audio bench`, release build, the desktop).
  - The re-check of quality rules would read every file again: an hour or two.
  - The file must be reachable to open a song's full spectrogram.
  - It's a format change across the website, GLUE Home and the answers to other devices.
