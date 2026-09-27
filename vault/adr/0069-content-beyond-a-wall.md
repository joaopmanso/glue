---
status: accepted
date: 2026-09-27
---
# 0069. Content beyond a wall that follows the music isn't an encoder's cut; specks far under it are rounding

Amends [ADR 0033](0033-tolerate-gentle-roll-offs.md) and [ADR 0034](0034-quiet-content-above-the-fade.md),
which dealt with gentle fades. This one deals with walls.

## Context
Two false positives, as the user saw them (2026-09-27):
- **`#yakuza.mp3`,** "Upconverted from a lower-quality file". The user: "I clearly see small peaks
  going over 20 kHz… a poor master but a 320 file nonetheless".
- **`ENV012 - Kloudmen - Genorale - Ten Eight Seven Mastered.wav`,** "Lossy audio in a WAV wrapper".

Measured with GLUE's own analysis (read-only; the numbers are per-moment band peaks, percentiles over
time):
- **The MP3:**
  - 192 kbps CBR (ffprobe: 4.6 MB over 3:13), LAME 3.99.5 through ffmpeg, not 320. LAME at 192 kbps
    keeps content to about 18.6–19.5 kHz.
  - A wall at 17.0 kHz dropping 53 dB, the lowpass of 128–160 kbps.
  - Above it, the loudest moments sit at about −115 dB, 64 dB under the music (−51), against a float
    floor of −144. That's the decoder's rounding (it moves with the music, correlation 0.7, as filter
    bank leakage does); it shows only with the spectrogram's floor set very low. The verdict was
    right, and nothing explained the specks.
- **The WAV:**
  - 16-bit/44.1 kHz. A wall at 17.3 kHz dropping 31 dB.
  - Above it, the loud moments reach −80 to −88 dB: 10–20 dB above the 16-bit floor (−98), and they
    follow the music below the wall (correlation 0.53).
  - A lossy file simply saved as WAV has only the floor up there. Something came after the cut: a
    steep mastering lowpass and then limiting, or a lossy source that was processed again. Calling it
    "lossy" was too strong.

## Decision
- **`beyondWall()` (`core/audio/verdict.ts`)**, for a wall:
  - **The level:** the 99th percentile over time of each moment's peak, 0.7–3.5 kHz above the wall.
  - **Whether it follows the music:** the correlation over time with the band 0.5–2 kHz under the
    wall.
  - **It's content** when the level is at least 45 dB-under-the-music-or-louder and 12 dB above the
    floor, and the correlation is at least 0.3. Steady hiss doesn't follow the music; rounding is too
    far under it.
- **A lossless file with a wall and content beyond it** gets a caution: "Steep top end at X kHz, with
  content beyond", not "Transcoded".
- **A lossy file whose cutoff is too low for its bitrate** keeps its verdict. When there are specks
  above the wall that aren't content, the finding says what they are (their level and how far under
  the music).
- **`VERDICT_VERSION` 4:** stored warn and bad verdicts are worked out again from the stored analyses
  when a collection opens.

## Consequences
- A steep mastering filter followed by limiting no longer reads as a transcode.
- A lossy source that was processed again (limited, clipped) also reads as "caution". Its wall is
  still shown, and the finding says it may be either.
- Synthetic tests:
  - a wall with content on the kicks above it → caution;
  - the same wall without it → transcode;
  - a lossy file with far-under specks → the verdict stays, with the note.
  - A test envelope with jumps splatters above the wall by itself; that's "processing after the cut",
    counted as content, correctly.
