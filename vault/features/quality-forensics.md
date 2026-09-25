---
status: shipped
milestone: Speklone
updated: 2026-09-25
adrs: [0002, 0033, 0034]
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
  Stored verdicts are re-checked from stored analyses when these rules change.
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
  "band-limited"; see [log](../log/2026-09-23-speklone.md).

## Acceptance (met)
- [x] Synthetic 96 kHz file with a 16 kHz wall and 16-bit samples → "Transcoded", "Only 16 of 24 bits".
- [x] Real 48 kHz/24-bit AIFF → "Genuine 48 kHz lossless", content to 21.9 kHz.
- [x] MP3 128k re-wrapped as 24-bit AIFF → Transcoded, wall at 16.7 kHz.
- [x] Video MP4s with AAC audio → "Lossy AAC-LC, not hi-res"; video-only MP4 → clear message.

## Limits & open questions
- A 16-bit master with gain applied after conversion passes the 24-bit test.
- ALAC decodes only in Safari; DSD not supported.
- Porting to MCO: becomes the Inspector and "Analyze a file" (M1); summary stored per track (M3).
