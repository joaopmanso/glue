---
status: shipped
milestone: Speklone
updated: 2026-09-24
adrs: []
---
# Live view

## What it does
A second spectrogram below the main one that scrolls in real time with what's playing (last 12 s),
using the same colours and floor, with the detected cutoff as a dashed line. Toggle remembered.

## How it works
- `MediaElementSource → AnalyserNode → destination` in an AudioContext created **at the file's sample
  rate** (falls back to the device rate, with a note, where the browser refuses).
- `getFloatFrequencyData` + a +13.6 dB offset (Blackman coherent gain 0.42 and 1/N scaling) so a
  full-scale sine reads 0 dB, matching the main view.
- Scrolls by wall-clock time (60 columns/s), not per frame, so the window is 12 s on 60 and 120 Hz
  screens alike; clock reset on pause.
- The AudioContext is created inside the play click so autoplay rules allow it.

## Limits & open questions
- Firefox may refuse a non-default-rate context for media elements → limited to the device range.

## 3D mode (2026-09-24)
- A "Scrolling | 3D" switch in the live view (remembered per browser). 3D shows the last ~3 s of
  spectra as ridges running from "now" at the front to a vanishing point on the horizon: frequency
  across on a log scale (20 Hz to Nyquist), level as height and colour (same palette and floor as the
  spectrogram), older frames fading with distance, the detected cutoff as a dashed line into the
  distance. Ridges get a light 3-band smoothing for looks; the scrolling view is unchanged.
- Code: `src/ui/render/waterfall.ts`; frames captured in `Live.pushFrame` (36 per second, 220 bands).
- Cost: measured the same frame time as the scrolling view (≈7 ms per frame, headless Edge).

