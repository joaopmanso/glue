---
status: accepted
date: 2026-09-30
---
# 0118. A steep top end from 17 kHz, with no drop-outs under it and strong content above, is a mastering lowpass

Amends [ADR 0069](0069-content-beyond-a-wall.md) (content beyond a wall was only a caution) and
[ADR 0075](0075-drop-outs-under-a-wall.md) (no drop-outs cleared a wall only from 19.8 kHz).

## Context
The user, 2026-09-30, on `Loxy & Resound - Shadow System - 05 Infectious.aiff` (44.1 kHz, 16-bit), shown as "Caution:
Steep top end at 19.0 kHz, with content beyond": "it's just a home master most likely, but it's definitely not an mp3
re-encoded as aiff".

Measured with GLUE's own analysis:
- a 21 dB step at 19.0 kHz;
- the band just under it never switches off (0 % of the loud moments; MP3 transcodes switch it off in 25–57 %);
- above the step, content that follows the music (correlation 0.57), only 20 dB under it.

An encoder removes everything above its lowpass, all the time. A limiter after a lossy source adds only faint
distortion up there.

## Decision
A lossless file whose steep top end is at 17 kHz or higher is "Lossless" ("Steep lowpass (mastering)", an info
note), not a caution, when both hold:
- the band under the step never switches off (drop-outs in 2 % of the loud moments at most);
- content above the step follows the music, within 25 dB of it.

From 19.8 kHz, no drop-outs alone still suffices, as before. `VERDICT_VERSION` 7 re-judges stored verdicts.

## Consequences
- The user's AIFF and the synthetic "mastering lowpass, then limiting" test signal: "Lossless".
- A step with faint content above it (more than 25 dB under the music), or with drop-outs under it, stays a caution
  or a transcode.
