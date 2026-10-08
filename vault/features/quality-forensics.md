---
status: shipped
milestone: Speklone
updated: 2026-10-08
adrs: [0002, 0033, 0034, 0116, 0118, 0119, 0166]
---
# Quality forensics

## What it does
Tells whether a file is really what it claims: genuine hi-res, genuine lossless, a lossy transcode in
a lossless wrapper, an upsample, 16-bit padded to 24, or a YouTube/stream rip. Shows a Spek-style
spectrogram, the average spectrum, a verdict, the evidence behind it, and the file's metadata.

## Behaviour
- **Verdicts**: Genuine hi-res · Lossless · Transcoded · Upsampled / Partly upsampled · Padded ·
  Fake bitrate · Lossy · not hi-res · Unverified (codec unknown) · Suspect / Caution · Silent.
- **Evidence** items are Fail / Caution / Pass / Note, with plain-language detail.
- **Readouts**: Declared format, Expected bandwidth, Measured bandwidth (wall or fade), Effective bit
  depth, Likely origin.
- **Origin clues** from strings in the file: YouTube URLs / DASH brand / yt-dlp, WebM, LAME / FFmpeg /
  Fraunhofer / Nero, CD rippers (EAC, XLD, dBpoweramp, CUETools…), stores and stream recorders.
- A lossy wall at 19.6–20.8 kHz with < 35 dB drop, or from 18.5 kHz with < 30 dB, is a Caution, not a
  Fail (mastering lowpasses).
- A lossless CD / 48 kHz file whose top end fades out gently (no wall) from 17 kHz up is Lossless,
  with a Note; below 17 kHz it's a Caution ([ADR 0033](../adr/0033-tolerate-gentle-roll-offs.md)).
  Stored verdicts are re-checked from stored analyses when these rules change: by GLUE Home where it runs, once a
  run, even with no tab open ([ADR 0166](../adr/0166-glue-home-rechecks-verdicts-and-tidies.md)).
- A fade below 17 kHz is still Lossless when quiet content (hats, cymbals, tails) reaches 17 kHz or
  higher in the louder moments: "Quiet content up to X kHz"
  ([ADR 0034](../adr/0034-quiet-content-above-the-fade.md)). Steady hiss up there doesn't count.
- "Fake bitrate" is a Fail only for MP3 (LAME's lowpass per bitrate is reliable); for AAC/Vorbis/Opus
  a low cutoff is a Caution.
- Unknown format + lossy wall → "Lossy audio: content stops at X"; unknown without a wall →
  "Unverified", never "Genuine lossless".

## How it works
- **Parsing** (`parseContainer` and friends): WAV/RF64 (incl. EXTENSIBLE, LIST/INFO, bext, id3),
  AIFF/AIFF-C, FLAC (STREAMINFO, Vorbis comments), MP3 (Xing/Info/LAME/VBRI, frame walk), ADTS AAC,
  MP4/M4A (first *sound* track only; esds, alac, dOps, dfLa, ilst tags), Ogg (Vorbis/Opus/FLAC),
  WebM/Matroska (heuristic). DSD, WavPack and APE are reported as unsupported.
- **Decoding**: WAV and AIFF are read bit-exactly by our own PCM reader in the worker; everything else
  via `decodeAudioData` at the file's native rate (no resampling).
- **Analysis** (worker): `analyzeSamples` (peak, clipping, wasted low bits via OR of samples, float
  16/24-bit grid, L/R identity/correlation) → `computeSpectrum` (Hann STFT, 4096–16384 points by rate,
  up to 1600 columns × 1024 rows, max-pooled) → `detectCutoff` on the smoothed average spectrum
  (brick wall = ≥18 dB drop with floor above; else gradual fade at floor + 6 dB; rising ultrasonic
  noise; mirror-image upsampling around 22.05/24 kHz) → `classify`.
- The 6 dB fade threshold (was 15 dB) came from a real 48 kHz Bandcamp AIFF falsely flagged
  "band-limited"; see [log](../log/archive/2026-09-23-speklone.md).

## Acceptance (met)
- [x] Synthetic 96 kHz file with a 16 kHz wall and 16-bit samples → "Transcoded", "Only 16 of 24 bits".
- [x] Real 48 kHz/24-bit AIFF → "Genuine 48 kHz lossless", content to 21.9 kHz.
- [x] MP3 128k re-wrapped as 24-bit AIFF → Transcoded, wall at 16.7 kHz.
- [x] Video MP4s with AAC audio → "Lossy AAC-LC, not hi-res"; video-only MP4 → clear message.

## Walls with content beyond (2026-09-27, [ADR 0069](../adr/0069-content-beyond-a-wall.md))
- **A lossless file with a wall, but with content beyond it** (loud moments well above the floor, following
  the music) is a caution: "Steep top end at X kHz, with content beyond". It used to be
  "Transcoded". It can be a steep mastering filter and then limiting, or a lossy source processed
  again.
- **A lossy file whose cutoff is too low for its bitrate** keeps its verdict. Specks above the wall
  far under the music are explained as the decoder's rounding: they show only with the
  spectrogram's floor set very low.
- `VERDICT_VERSION` 4: stored cautions and suspects are worked out again when a collection opens.

## Limits & open questions
- A 16-bit master with gain applied after conversion passes the 24-bit test.
- ALAC decodes only in Safari; DSD not supported.
- Porting to GLUE: becomes the Inspector and "Analyze a file" (M1); summary stored per track (M3).

## Drop-outs under a wall (2026-09-28, [ADR 0075](../adr/0075-drop-outs-under-a-wall.md))
- MP3 encoders keep switching off the band just under their lowpass in loud moments; masters with a
  steep lowpass don't.
- **Measured:**
  - MP3 transcodes, 192–320 kbps: 25–57 % of loud moments;
  - the user's promo WAVs: 0 %.
- **So:**
  - a wall at 19.8 kHz or above with no drop-outs is a mastering lowpass: lossless, with an info
    finding;
  - drop-outs in 12 % or more of loud moments make a wall a transcode, even near 20 kHz.
- The user's `B2 - ARtroniks - The Escape` WAV (a caution at 20.3 kHz) now reads lossless.
- `VERDICT_VERSION` 5.

## Hi-res judged by what reaches past 24 kHz (2026-09-30, [ADR 0116](../adr/0116-hi-res-by-what-reaches-past-24-khz.md))
- `ultrasonic(cut, binHz, sr, bits)` finds how far content reaches while staying 30 dB over digital silence (16-bit
  about −130 dB on GLUE's scale, 6 dB lower per bit) and within 80 dB of the music.
  - Past 30 kHz: genuine ("Real hi-res, with a quiet top end").
  - Stopping by 28.5 kHz with a 30 dB cliff after it: upsampled.
- Checked on the user's Doechii 24/88.2 album (11 tracks: all genuine now), and on fakes made from it with
  soxr and with ffmpeg's default resampler (all upsampled; the default one used to pass).
- Tests: `tests/verdict.test.ts` (a quiet genuine top end; music stopping at 23.5 kHz with a resampler's residue).

## A mastering lowpass from 17 kHz (2026-09-30, [ADR 0118](../adr/0118-mastering-lowpass-from-17-khz.md))
- A home master's 21 dB step at 19.0 kHz (`Loxy & Resound … Infectious.aiff`) was a caution. With no drop-outs under
  it and content above that follows the music within 25 dB, it's "Lossless" now (from 17 kHz; from 19.8 kHz no
  drop-outs alone still suffices).

## Content beyond a wall is lossless (2026-09-30, [ADR 0119](../adr/0119-content-beyond-a-wall-is-lossless.md), superseding 0118)
- "Steep top end at … kHz, with content beyond" was a caution (136 of the user's songs, like Kame.wav and Dead
  Stylus.wav). With the band under the wall not switching off often (under 12 % of the loud moments) it's
  "Lossless" now, with the note kept. Checked on 10 of them and 10 "Transcoded" songs (which stay transcoded).
