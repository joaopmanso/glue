---
status: accepted
date: 2026-09-30
supersedes: 0118
---
# 0119. A steep top end with content above that follows the music, and without frequent drop-outs under it, is lossless

Supersedes [ADR 0118](0118-mastering-lowpass-from-17-khz.md). Amends [ADR 0069](0069-content-beyond-a-wall.md) (content
beyond a wall was a caution) and [ADR 0075](0075-drop-outs-under-a-wall.md).

## Context
The user, 2026-09-30, after ADR 0118: many songs are still "Caution: Steep top end at … kHz, with content beyond",
and "if there is content then it's likely not a fake file… these conditions likely deserve a green pass". Examples:
`Music/Kame.wav` (32-bit float, a DAW export) and `Music/Dead Stylus.wav`.

Measured with GLUE's own analysis:

| File | Step | Content above (under the music, correlation) | Drop-outs under the step |
|---|---|---|---|
| Kame.wav | 33 dB at 20.3 kHz | 43 dB, 0.78 | 5 % |
| Dead Stylus.wav | 33 dB at 16.5 kHz | 42 dB, 0.76 | 7 % |

- The library had 136 such cautions.
- Of 10 sampled, all had drop-outs in 0–8 % of the loud moments.
- 10 sampled "Transcoded" songs either drop out in 12–49 % of them, or have no content above the step that
  follows the music.

## Decision
- **A lossless file whose steep top end has content above it that follows the music, and whose band under it
  doesn't keep switching off** (under 12 % of the loud moments, ADR 0075's threshold), is "Lossless":
  - an info note "Steep top end at … kHz, with content beyond";
  - the reason: a lowpass in the master, since an encoder removes everything above its cutoff and switches that
    band off in a quarter to half of the loud moments.
- **The frequency and the level above don't matter** (ADR 0118's 17 kHz and 25 dB are dropped). The evidence is
  that the content follows the music and there are no drop-outs.
- **Unchanged:**
  - a step with nothing above it that follows the music stays "Transcoded" (or a caution near 20 kHz);
  - drop-outs under the step (12 % or more) make it "Transcoded".
- **Loudness** (a heavy bass, say) isn't used: it shows the mix, not the encoding.
- `VERDICT_VERSION` 8 re-judges stored verdicts on open.

## Consequences
- The user's 136 "with content beyond" cautions become "Lossless", with the note kept.
- A lossy source that was processed afterwards, adding content above the wall and without drop-outs (a
  128 kbps AAC, which switches bands off less than MP3), would pass. The sample of "Transcoded" songs showed
  none.
