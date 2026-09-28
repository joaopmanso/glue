---
status: accepted
date: 2026-09-28
---
# 0075. Drop-outs under a wall tell an encoder's lowpass from a mastering one (amends 0069)

## Context
The user's report (2026-09-28): a promo WAV sent by the artist,
`B2 - ARtroniks - The Escape (BWR004).wav`, is a caution, "Brick-wall cutoff at 20.3 kHz". With the
spectrogram's floor under −120 dB, content above the wall shows, moving over time. The user's view: a
floor that moves means a real song that just doesn't use the whole band.

**Measured with GLUE's own analysis** (read-only; the transcodes were made from track A1 of the same
EP, in a scratch folder):

| File | Wall | Above the wall, loud moments (p99) | Band under the wall switched off, loud half |
|---|---|---|---|
| B2 (promo WAV) | 20.3 kHz, 24 dB | −101 dB, moving (20 dB spread) | **0 %** |
| A1 (same EP) | 20.6 kHz ("full") | −100 dB, moving | **0 %** |
| MP3 320 → WAV | 20.2 kHz | −102 dB, moving (15 dB) | **25 %** |
| MP3 256 → WAV | 19.5 kHz | −96 dB, moving; passed 0069's test | **47 %** |
| MP3 192 → WAV | 18.8 kHz | −100 dB | **57 %** |
| AAC 256 → WAV | 20.5 kHz ("full") | −95 dB, moving | **0 %** |
| 0069's Kloudmen WAV | 17.3 kHz | content beyond | 3.9 % |

- **Moving content above the wall doesn't separate them:** decoders leak it too (MP3 256 kbps even
  passed ADR 0069's "content beyond" test).
- **What does:** in the loud half of the song, how often the band just under the wall falls to the
  empty level above it. MP3 encoders keep switching that band off moment to moment; the masters never
  do.
- AAC at 256 kbps doesn't either, but it reaches 20.5 kHz and was already rated full-band.
- Why B2 was a caution and A1 not: its wall sits at 20.3 kHz, under the 20.5 kHz "full band" line.

## Decision
- **`holesUnderWall` (`core/audio/verdict`):**
  - the louder half of the song, by its 1–8 kHz level;
  - in those moments, the share where the band from 2 kHz to 0.5 kHz under the wall is within 6 dB of
    the median level above the wall.
- **For a wall in a lossless file:**
  - **No drop-outs (≤ 2 %) and a wall at 19.8 kHz or above:**
    - "Steep top end at X kHz", info;
    - the verdict is lossless ("a steep lowpass, as some masters and sample-rate converters leave").
  - **Drop-outs in 12 % or more of the loud moments:**
    - a transcode, even near 20 kHz (where it was only a caution);
    - even with content beyond the wall (0069's caution doesn't apply);
    - the finding says how often.
  - **Otherwise:** as before (0069's content beyond the wall; the lossy wall rule).
- **Scope:** only 19.8 kHz and up is cleared by "no drop-outs". Lower walls with no drop-outs (unusual
  for a master) keep their verdicts until there's data.
- `VERDICT_VERSION` 5: stored cautions and suspects are worked out again.

## Consequences
- The user's promo WAVs read "Genuine 44.1 kHz lossless". MP3 transcodes from 192 to 320 kbps read
  "Transcoded" (two were only cautions).
- Parity with the Speklone page is unchanged (its tests pass). Synthetic steady walls under 19.8 kHz
  stay transcodes.
- **Tests:**
  - synthetic, a steady 20.3 kHz wall: lossless, with the info finding;
  - the same wall with 40 % drop-outs: a transcode, the share in the finding.
- Measurements not kept in the repo (they're the user's files); the table above is the record.
