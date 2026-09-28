---
status: accepted
date: 2026-09-28
---
# 0085. Other computers' songs get their waveforms from GLUE Home too

Extends [ADR 0046](0046-glue-home-shares-analysis-and-sorts-incoming.md) (GLUE Home shares mini
spectrograms and full analyses) to the Overview column's waveform look (added 2026-09-27).

## Context
On the laptop, with the Overview set to waveform, every song of the desktop showed an empty box,
while the spectrogram look worked (the user, 2026-09-28). Why:
- **In the browser, waveforms were never looked for** on another computer: the `waves` store was
  built with `remoteOk: false`.
- **GLUE Home dropped the waveform** its analysis already makes (`PoolResult.wave`). It kept only
  the spectrogram and the full analysis.
- **Nothing sent waveforms anywhere:** the hand-over, the `have` request and the `put` request had
  no place for them.

## Decision
- **GLUE Home keeps a waveform per song:** `w/<profile>/<collection>/<shard>/<id>.bin`, 768 bytes,
  plus `i/<name>.wave.bin` for songs in the incoming folder.
- **Where they come from:**
  - GLUE Home's own analyses;
  - the website on its computer, which hands them over (`put` kind `wave`; `have` lists `waves`);
  - GLUE Home itself, made from a full analysis it already keeps (`decodeDetails` + `makeWaveThumb`),
    so a song isn't read again just for its waveform.
- **Background work:** songs without a waveform are included. Those with a kept analysis are done in
  a moment, and the rest are analysed as before.
- **The `thumbs` request takes `wave: true`** and answers waveforms instead. A missing waveform is
  made from the kept analysis at once, or queued for analysis as a spectrogram is.
- **The browser** asks other computers' GLUE Homes for waveforms as it does for spectrograms:
  `waves.remote`, a screenful at a time, and asked again while they're being made.

## Alternatives considered
- **Make waveforms on the laptop from each song's full analysis:** that means downloading
  megabytes per row just to draw 192 columns.
- **Send the waveform inside the spectrogram thumbnail:** it changes a format older GLUE Homes and
  caches already hold.

## Consequences
- A GLUE Home older than 0.17 ignores `wave: true` and answers spectrograms. The browser rejects
  them by size (768 bytes expected), so the box stays empty until that GLUE Home updates.
- The `have` request lists one more folder per shard: 256 more directory reads per collection, once
  per visit.
