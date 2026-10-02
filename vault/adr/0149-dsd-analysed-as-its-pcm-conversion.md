---
status: accepted
date: 2026-10-02
---
# 0149. GLUE Home analyses DSD as its 88.2 kHz PCM conversion, and retries the JavaScript's failures once

## Context
The user's collection has 91 DSF files and 342 M4A files (Apple Lossless) that the website's analysis couldn't
decode ("DSD files can't be decoded in a browser", "It couldn't be decoded."). ADR 0147 moved GLUE Home's analysis to
Rust (`crates/glue-audio`), which decodes ALAC (Symphonia) and can decode DSD. But a failure is stored as the song's
and isn't tried again until its file changes (ADR 0109), so those songs would stay "Couldn't analyse".

## Decision
- **DSD (DSF and DSDIFF) is converted to PCM and analysed as such** (`crates/glue-audio/src/formats/dsd.rs`):
  - the target is 88.2 kHz (96 kHz for the 48 kHz family, any DSD multiple), the conversion GLUE's message has always
    advised;
  - two linear-phase low-pass stages: ÷16 through a table per byte (256 taps, passing up to 44.1 kHz), then ÷2k at
    40 kHz (128·k taps);
  - a bit is ±1 (full-scale DSD is ±1 in PCM; SACD's 0 dB, half modulation, is −6 dB);
  - its info says the DSD rate (2,822,400 for DSD64), its channels and length, and "1-bit";
  - a finding, "Analysed from DSD", says it was converted and that rising noise above about 25 kHz is DSD's own noise
    shaping;
  - DST-compressed DSDIFF says it isn't decoded yet.
- **A failure without `engine` is tried once more by GLUE Home** (`home/ui/analysis.ts` `failedBefore`). That's one
  made by the JavaScript analysis, before 0.46. The native engine's own failure says `engine`, so it isn't retried.

## Alternatives considered
- **176.4 kHz or higher**: more of DSD's ultrasonic band, but it's mostly noise shaping. 88.2 kHz is what the message
  told users to convert to, so results match what they'd have got.
- **Leave failures alone until the file changes**: the 433 songs would never be analysed.
- **Retry every failure on each new engine version**: a version in the rule for one transition; `engine` present or not
  says the same now.

## Consequences
- The 91 DSF files and the 342 ALAC M4As are analysed after GLUE Home 0.48 starts; the website shows their results
  like any other.
- **Not calibrated on real DSD [UNVERIFIED]:** DSD's noise shaping puts energy above 25 kHz in every file, so the
  verdict will mostly read "Genuine hi-res", even for a DSD made from a CD-rate master. The verdict's "Rising
  ultrasonic noise" finding and the DSD finding say why. A DSD-specific rule needs real files to tune against (the
  user's 91).
- DSD decoding is native only: the website still can't analyse DSD without GLUE Home.
