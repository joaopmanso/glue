---
status: accepted
date: 2026-09-24
amends: 0013 (how tier 2 fingerprints are made and kept)
---
# 0025. Band-energy fingerprints for "same recording", kept in the browser's cache

## Context
[ADR 0013](0013-duplicate-tiers.md) planned chroma codes over 30 s from the middle, stored in the MCO
folder. The user's case (2026-09-24): "HHH 04 RADIX.wav" and "HHH-Bebida.mp3" are two rips of one
song, under different names and codecs. Rips also differ in length and lead-in, so a fixed 30 s
middle window may not overlap enough, and fingerprints are derived data like the stored analyses
([ADR 0024](0024-background-stores-full-analysis.md)).

## Decision
- **Fingerprint** (Haitsma–Kalker / Philips style, `src/core/audio/fingerprint.ts`): the decoded mono
  signal is lowpassed and resampled to 5512.5 Hz; 0.37 s frames every 46 ms; per frame 32 bits: the
  sign of the change, from the previous frame, of the energy difference between neighbouring bands
  (33 log bands, 300–2000 Hz). Up to 150 s, centred. Plus one level byte per frame so silence is
  ignored. ~21.5 words/s, ≈16 KB per track. Computed by the background workers from the same decoded
  audio as the analysis (≈0.4–0.7 s per track).
- **Matching** (`src/core/library/duplicates.ts`, in a worker): an index of 16-bit halves of the
  words proposes pairs and time offsets (pieces shared at a consistent offset); each candidate is
  confirmed by the bit error rate at the best alignment: ≤ 0.30 over ≥ 20 s of common sound is the
  same recording (unrelated audio ≈ 0.5). Groups by union–find.
- **Measured**: a real WAV vs a 128 kbps MP3 of the same passage (48 kHz, 1.3 s longer lead-in):
  BER 0.04, offset found exactly; another passage of the same song: no match. Synthetic rip with
  noise, level change, 8-bit quantisation and resampling: BER < 0.2.
- **Tier 3** ("probable"): same normalised artist + title and length within 3 s, not confirmed by sound.
- **Storage**: `cache/fp/<collection>/<shard>/<id>.bin` in the browser's storage; the summary records
  that a fingerprint exists. `ANALYSIS_VERSION` 3 fingerprints existing libraries once.
- **Actions**: best copy (genuine before suspect, lossless before lossy, then resolution / bitrate);
  "Use in playlists" points every playlist at one copy; "Not duplicates" hides a group (kept in the
  collection file). No file is deleted.

## Consequences
- Rips under any name, tag, codec, bitrate, sample rate or lead-in are grouped; remixes, radio edits
  cut in different places, time-stretched or pitched versions may not be (only the overlap counts).
- Pairs are indexed as 16-bit track numbers: up to 65,536 fingerprinted tracks per collection.
- Tier 1 ("exact": size + quick hash) isn't separate: identical files match with BER ≈ 0.
