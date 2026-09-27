---
status: shipped
milestone: Speklone
updated: 2026-09-27
adrs: [0073]
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

## 3D you can move (2026-09-27)
- The 3D mode is drawn by three.js on the GPU ([ADR 0073](../adr/0073-3d-view-on-the-gpu.md)): a surface
  of the same frames, a ridge every 4 frames, the front crest, floor lines with frequency labels, the
  cutoff, fog.
- Drag to turn, wheel to zoom, right-drag to move; "Reset view". Wider boxes get a wider surface.
- Redrawn only when a spectrum arrives or the view moves. Without WebGL, the 2D drawing above.
- Code: `src/ui/render/waterfall3d.ts`, `src/ui/Live3D.svelte` (also on the Prepare tab).

