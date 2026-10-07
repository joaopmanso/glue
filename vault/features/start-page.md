---
status: shipped
milestone: Speklone
updated: 2026-10-07
adrs: [0092, 0159]
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

## Now
The visitor's start is the homepage (`homepage.md`, rewritten 2026-10-01), then the setup below it; Gluey's first
tour follows the setup (ADR 0126). "Analyze a file" (`#/analyze`) is this page.

**A GLUE folder is always offered** (2026-10-07, [ADR 0159](../adr/0159-glue-homes-first-run-and-its-window-signed-in.md)):
with GLUE Home answering, its own folder window (also where the page has no folder window of its own, as in GLUE
Home's window), and "with GLUE Home" preselected; without its link, **Look for GLUE Home again** and a folder in this
browser for now. GLUE Home's window skips this page when GLUE Home has a GLUE folder, signed in by GLUE Home.

## Limits & open questions
- GLUE: becomes the first-run flow (create/choose the GLUE folder, add music) plus "Analyze a file".
- **The first question (2026-09-28, [ADR 0092](../adr/0092-first-question-how-glue-is-used.md)):** how GLUE is used here (just this computer, synced, with GLUE Home, from another device); the profile screen's "This computer" card shows and changes it.
