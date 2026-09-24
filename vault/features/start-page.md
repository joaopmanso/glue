---
status: shipped
milestone: Speklone
updated: 2026-09-24
adrs: []
---
# Start page

## What it does
The first screen: a one-line headline, a large full-width drop zone (dimmed illustrative spectrogram
behind "Drop a track here · or click to choose a file"), a "Try the example" button that generates a
synthetic 96 kHz / 24-bit track with a 16 kHz wall, and four cards explaining the checks.

## Behaviour
- While a file is dragged over, the zone lights up and says "Release to analyze".
- The header's tagline and Open button hide while the start page is up.
- The analysis layout replaces the start page once a file or the example loads.

## Limits & open questions
- MCO: becomes the first-run flow (create/choose the MCO folder, add music) plus "Analyze a file".
