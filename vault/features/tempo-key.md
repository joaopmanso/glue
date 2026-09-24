---
status: shipped
milestone: Speklone
updated: 2026-09-24
adrs: [0006]
---
# Tempo & key

## What it does
Detects BPM and musical key for every file. Shows the key in Camelot, Open Key or musical notation
(switchable, remembered), a circle-of-fifths wheel with the key and its harmonic neighbours
highlighted, and the three keys it mixes with.

## Behaviour
- BPM shown to 0.1 (whole number when within 0.05), with ½× and 2× alternatives, because half/double
  time can't be settled from the signal alone.
- Key shows the runner-up when the margin is small ("Close call: could be 5A") and notes tuning when
  it's ≥ 10 cents off A440.
- Mixes with: one step either way on the same ring, and the relative major/minor.

## How it works
`analyzeMusic(mono, sr)` in the analysis worker, on a ~11 kHz decimated copy:
- **Tempo**: spectral-flux onset envelope (1024-point FFT, hop 128, log magnitude), local-mean removal,
  autocorrelation, comb score over 4 multiples × log-normal prior centred on 122 BPM (σ 0.9 octave),
  then refinement from parabolic peaks at 2L…16L so one frame of lag error divides down.
- **Key**: 8192-point frames, tuning from the circular mean of peak deviations from the 440 Hz grid,
  chroma from **tonal peaks only** (≥ 2.5× local mean) with **square-root** weighting (so a note's
  fundamental outweighs its overtones; log weighting made keys land a fifth off), each frame
  normalised and voting equally, then correlation with Temperley (Kostka–Payne) major/minor profiles.
- Notation: fifths position 0 = C major / A minor; Camelot = ((pos + 7) mod 12) + 1 with B/A;
  Open Key = pos + 1 with d/m.

## Acceptance (met)
- [x] Synthetic tracks: tempo within 0.03 BPM (93.5–174 BPM, incl. −30 ¢ detune).
- [x] Clear-centre progressions: 8/8 keys correct (4 minor, 4 major).
- [x] Real tracks: tempo identical across both halves of each track.

## Limits & open questions
- Octave (half/double) ambiguity: the prior picks one; the UI shows the alternatives.
- Relative major/minor ambiguity on progressions that genuinely support both.
- Stored per track and shown as columns in MCO (M3); Engine DJ key ints 0–23 map to fifths order.
