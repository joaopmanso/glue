---
status: accepted
date: 2026-09-25
---
# 0034. Count quiet content above a gentle fade (peak-hold reach)

## Context
After [ADR 0033](0033-tolerate-gentle-roll-offs.md), AIFFs still came out "Caution: band-limited to
about 15 kHz" although their spectrogram showed faint content past 20 kHz (with readable dB values
on hover) and no wall. The user: if content is there, the quality is there, unless there's a wall
(2026-09-25). The fade is measured on the long-term average spectrum: quiet or intermittent highs
(hats, cymbals, reverb tails) barely move an average, so it can sit far below where content ends.

## Decision
- `peakReach(spec)`: in 128 fixed bands, the loud moments (95th percentile over time) and the quiet
  moments (20th) of the spectrogram. The noise floor is the quietest band in quiet moments. Content
  reaches up to the highest two adjacent bands whose loud moments are ≥ 10 dB above that floor and
  ≥ 6 dB above the band's own quiet level. The second condition keeps steady hiss (such as
  noise-shaped dither added after a lossy decode) from counting.
- For a lossless CD / 48 kHz file with no wall whose average fade is below 17 kHz: if the reach
  is ≥ 17 kHz, it's **Lossless** with the Note "Quiet content up to X kHz". Otherwise it stays
  Caution. An encoder removes everything above its lowpass all the time, so content there can't
  come from a lossy source cut at the fade.
- Walls are judged as before (ADR 0033); the reach only applies when there's no wall.
- Fixed bands make stored (row-reduced, 0.8 dB-quantised) spectrograms give the same answer, so
  `VERDICT_VERSION` 3 re-checks stored Caution / Suspect verdicts without decoding.
- The readout shows "gradual fade, quieter to X kHz".

## Alternatives considered
- Lower the fade threshold on the average spectrum: it would also call the noise floor "content".
- Count any single band above the floor (a thin steady line): steady lines are also what whine
  and shaped dither look like. Two bands and "comes and goes" is the safer test.

## Consequences
- A lossy file that was processed afterwards in ways that add intermittent highs (distortion,
  saturation) can pass; the evidence still shows where the bulk of the energy stops.
