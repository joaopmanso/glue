---
status: accepted
date: 2026-09-30
---
# 0116. A hi-res file is judged by what reaches past 24 kHz above digital silence

Amends [ADR 0033](0033-tolerate-gentle-roll-offs.md) (how a hi-res file's top end is read).

## Context
- **The user, 2026-09-30:** a 24/88.2 FLAC ("FIREFLIES", Doechii) was called "Upsampled: not hi-res, upsampled from
  48 kHz". With the spectrogram's floor at −125 dB it clearly carries information to 40 kHz and past. It's a
  quiet song, mostly bass and vocal.
- **Measured** (GLUE's own analysis, run on the file and on its 10 album-mates with the same verdict):
  - the music fades into a flat floor near 23 kHz, and that floor (about −100 dB on GLUE's scale) carries on
    unchanged to 44 kHz;
  - digital silence on the same scale is about −130 dB at 16 bits and −178 dB at 24 bits (TPDF dither,
    measured at 44.1–192 kHz);
  - so the band above 24 kHz sits 71–83 dB over 24-bit silence, continuous with the band below it: the
    recording's own air and noise.
- **Why it was misjudged:** the cutoff is where the spectrum sinks into the file's *own* floor. Here that was
  23.4 kHz, just under 24 kHz, so "upsampled from 48 kHz".
- **Fakes, made from the same song** (down to 48 or 44.1 kHz, back up to 88.2 or 96 kHz):
  - with soxr: caught before;
  - with ffmpeg's default resampler: called "Genuine hi-res: content to 44.1 kHz". Its residue (−155 dB, with
    spurs to −142 dB) passed for content.

## Decision
- **For a lossless hi-res file** (no wall), `ultrasonic()` measures `reach`: the highest frequency where the
  long-term spectrum stays, for 400 Hz, both
  - 30 dB over the file's digital silence (−130 dB at 16 bits, 6 dB lower per extra bit), and
  - within 80 dB of the music (its median level from 200 Hz to 12 kHz).
- **Reach stops by 28.5 kHz and a cliff follows** (30 dB down within 2 kHz, a resampler's filter): the file is
  "Upsampled".
  - The rate is named when the reach is within 800 Hz of 22.05 or 24 kHz, or where the old measure put it;
    otherwise "from CD or 48 kHz".
  - This is checked before "content reaches…", so a resampler's residue no longer passes for content.
- **Reach carries on past 30 kHz** (no rising noise, no mirror image): "Genuine hi-res", even when most of the
  energy fades out by 24 kHz.
  - The headline is "Real hi-res, with a quiet top end" when that band is 20 dB or more under the music.
  - Otherwise it's "Real hi-res: content to …": a flat signal sets the old cutoff low without anything fading.
- `VERDICT_VERSION` 6: on opening a collection, the stored verdicts of warnings, failures and "Genuine hi-res"
  are judged again from the stored analysis (the browser's, or GLUE Home's cache), with no decoding.

## Consequences
- The user's 11 Doechii tracks: "Genuine hi-res". The three fakes: "Upsampled".
- The test fixture `flac-96k-24.flac` (flat noise to 48 kHz, 110 dB over 24-bit silence) was called "Upsampled from
  22.05 kHz", because its flat level put the old cutoff at 11 kHz. It's "Genuine hi-res: content to 46.6 kHz" now,
  and the e2e tests that relied on the old label were changed on purpose.
- A digital production whose content really ends by 28 kHz and is silent above looks like an upsample. It did
  before too, when its content ended just under 22 or 24 kHz.
