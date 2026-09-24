---
status: planned
milestone: M3
updated: 2026-09-24
adrs: [0013]
---
# Quality tiers & filters

## What it does
Turns each verdict into a quality tier so the collection can be filtered and sorted by real quality:
hide MP3s, find fake lossless files, and always prefer the best copy of a song.

## Tiers (best first)
| Tier | Meaning | From verdict |
|---|---|---|
| **A · Hi-res** | genuine content beyond 24 kHz and/or 24 real bits | Genuine hi-res |
| **B · Lossless** | genuine CD/48 kHz lossless | Lossless (full band) |
| **C · Lossy high** | honest lossy ≥ 256 kbps (or Opus/AAC equivalents) | Lossy as labelled, high bitrate |
| **D · Lossy low** | honest lossy < 256 kbps | Lossy as labelled, low bitrate |
| **E · Fake** | transcode, upsample, padded bits, fake bitrate, YouTube rip | Transcoded / Upsampled / Padded / Fake bitrate |
| **? · Unknown** | not analysed or unsupported | — |

Caution-level findings (e.g. 20 kHz wall) keep the tier but add a "check" flag.

## Behaviour
- Tier column with badge; sort by tier.
- Smart views: **Needs attention** (E + flagged), **Fake lossless** (E with a lossless container),
  **Lossy** (C + D).
- Global toggles: "Hide lossy", "Hide lower-quality duplicates" (uses the preferred copy).
- Smart-list rules can use tier (e.g. "tier ≥ B and BPM 122–128").

## Acceptance
- [ ] Every analysed track has exactly one tier; the mapping is unit-tested per verdict type.
- [ ] Toggling "Hide lossy" updates a 50,000-row table instantly.
