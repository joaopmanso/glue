---
status: accepted
date: 2026-09-25
---
# 0033. Tolerate gentle top-end roll-offs; re-check stored verdicts when the rules change

## Context
Many free downloads (artists' own, Bandcamp, SoundCloud free releases) came out as "Caution:
Band-limited to about 19.4 kHz" (e.g. a 16-bit / 44.1 kHz AIFF, full 16-bit depth, gradual fade,
no wall). The rule flagged every lossless CD / 48 kHz file whose top end faded out below 20.8 kHz,
yet its own explanation said this "is not a clear lossy fingerprint". The user: electronic masters
often roll off gently rather than hitting a brick-wall lowpass, so be more tolerant (2026-09-25).
The collection has ~10k analysed tracks, which shouldn't need decoding again.

## Decision
- Lossless, not hi-res, no wall: a fade from **17 kHz** up (`ROLL_OFF_OK`) is a Note ("Top end rolls
  off from about X kHz"), and the verdict stays **Lossless** ("The top end rolls off gently…").
  Lossy encoders leave a wall, not a slope. A fade ending below 17 kHz stays a Caution.
- A detected "wall" that is both high and shallow (≥ 18.5 kHz, < 30 dB drop, `SOFT_WALL`) is a
  Caution at most, never "Transcoded" on its own: steep mastering lowpasses look like that; the
  encoder walls MCO is sure of drop far more (the synthetic ones ~70 dB). The old rule (≥ 19.6 kHz,
  < 35 dB) still applies too.
- Verdicts carry `vv` (`VERDICT_VERSION`, now 2). When a collection opens, stored verdicts from an
  older version that were a warning or a fail are judged again from the stored analysis (the full
  average spectrum is kept, so the result is the same as a fresh analysis), one at a time in the
  background; a notice says how many now count as lossless. No re-decoding.

## Alternatives considered
- Tell walls from roll-offs by shape (a sloping "shoulder" before the cut): the measure was too
  noisy on test signals to trust without real examples; revisit with real files.
- Bump `ANALYSIS_VERSION`: re-decodes every track; far too slow for 10k tracks.

## Consequences
- A lossy file that was later processed (re-mastered, heavily EQ'd) so its wall became a slope can
  now pass as lossless; the evidence still shows the roll-off frequency.
- Parity with the legacy page is unchanged on its fixtures (their band limit is 5 kHz, still a Caution).
- Future verdict changes bump `VERDICT_VERSION` instead of re-analysing (widen the re-check filter if
  a change can also make verdicts stricter).
