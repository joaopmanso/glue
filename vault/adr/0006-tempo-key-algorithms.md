---
status: accepted
date: 2026-09-23
---
# 0006. Tempo and key detection algorithms

## Context
DJs need BPM and key, in Camelot / Open Key / musical notation. No ML models, fast enough to run on
every track in the background.

## Decision
- **Tempo**: spectral-flux onsets → autocorrelation → comb over lag multiples with a log-normal prior
  centred on 122 BPM → refinement from parabolic peaks at far lag multiples (2L…16L). Show ½× and 2×.
- **Key**: tuning-corrected chroma from **tonal peaks only**, **square-root** weighted, per-frame
  normalised votes, matched against Temperley (Kostka–Payne) major/minor profiles; report the margin
  and the runner-up.

Details and test results: [features/tempo-key.md](../features/tempo-key.md).

## Alternatives considered
- Log-magnitude chroma over all bins: keys came out a fifth off (overtones and kick sweeps). Rejected.
- Krumhansl–Kessler profiles: similar; Temperley chosen, revisit with real-world test data.
- ML key/tempo models (e.g. Essentia): better on hard material, but large downloads per track type.

## Consequences
- ±0.05 BPM on steady-tempo music; octave ambiguity surfaced, not hidden.
- Needs a real-world labelled test set (DJ-app key tags from imports can serve, M5).
