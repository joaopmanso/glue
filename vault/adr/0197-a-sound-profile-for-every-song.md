---
status: accepted
date: 2026-11-27
---
# 0197. Give every song a sound profile: loudness, busyness, timbre and loudness over time

## Context
- **The user (2026-11-27) on the playlist builder:**
  - "the sonic semblances of the songs chosen are not really similar";
  - "a set should follow a flow, one could for example choose in the filters if we want energy to grow, or be constant".
- **What the analysis kept before:** BPM, key and the quality verdict.
  - The fingerprint finds the same recording, not songs that sound alike.
  - The help article spoke of "energy", but no code had one.
- **The set builder to come (M10)** needs each song's intro, drops and outro to place its mixes.
- **Constraints:**
  - The analysis runs in the browser and in GLUE Home's Rust engine, held to each other by golden files (ADR 0147).
  - A song's analysis must stay small: the collection's `analysis/` shards hold it.

## Decision
- **In each analysis, from the mono mix already decoded** (`soundProfile`, `src/core/audio/sound.ts`, ported line for line
  to `crates/glue-audio/src/audio/sound.rs`):
  - **The frames:** 2048 samples at 44–48 kHz (a higher rate averaged down), no overlap, a Hann window.
  - **`lufs`:** integrated loudness, BS.1770 style: a K-weighting approximated in the spectrum, 400 ms blocks, gated at
    −70 LUFS and 10 LU under the first mean.
  - **`timbre`:** 20 numbers, over the frames within 20 LU of the song's loudness:
    - 16 bands from 40 Hz to 16 kHz, each against the frame's mean band (the spectrum's shape, whatever the volume);
    - the spectral centroid (log2 Hz);
    - flatness;
    - the share of power under 150 Hz and over 5 kHz.
  - **`onsets`:** per second, peaks of the band flux above its mean plus half a deviation, at least 2 frames apart.
  - **`curve`:** the loudness about every 2 s (`step`), in quarter-dB steps from −60 LUFS, as base64 bytes (~240
    characters for 6 minutes).
  - Rounded (2 or 3 decimals) so both engines store the same numbers.
  - Null for a song under 6 s or silent.
- **Kept on the summary as `sound`**, and in the stored details. A verdict re-check keeps it.
- **`ANALYSIS_VERSION` 3 → 4,** so every song is analysed once more, in GLUE Home or the tab, in the background.
- **Energy 1–10 is relative to the collection** (`src/core/library/energy.ts`):
  - the song's rank in loudness (0.45), onsets (0.3), highs (0.15) and BPM (0.1, half-time doubled), ranked again;
  - Mixed In Key's "Energy N" in a comment or grouping, when there, wins.
- **Likeness:** the cosine of the timbres, each dimension z-scored over the collection, from 0 to 1.

## Alternatives considered
- **A separate `SOUND_VERSION`, so only the sound profile is redone:** the songs need decoding again either way, and one
  version keeps a single meaning of "analysed" everywhere (ADR 0109: the sidebar, Stats, GLUE Home's queue).
- **Deriving it from the stored details or the spectrogram thumbnail:** not every song has details on every computer,
  and the thumbnail's 192 columns hold too little.
- **A learned embedding (e.g. a music-tagging network):** better likeness, but tens of MB of model in the browser and
  GLUE Home, and no line-for-line Rust port. It's possible later, beside these numbers.
- **An absolute energy (from LUFS alone):** a collection of one genre would all sit at the same energy.

## Consequences
- After the update, GLUE Home (or the tab) works through the whole collection again. Until it's done, songs without a
  profile count as average energy and neutral likeness, and the dialog says how many are waiting.
- The set builder can read intros, drops and outros from `curve`.
- A change to the profile's maths regenerates the goldens. `tests/fixtures/sound-22k-16.wav` (20 s: a quiet intro,
  then kicks, hats and a chord) exercises it in full.
