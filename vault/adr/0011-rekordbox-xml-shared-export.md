---
status: accepted
date: 2026-09-24
---
# 0011. One live rekordbox XML file serves both Rekordbox and Engine DJ

## Context
Rekordbox imports external libraries through its official XML (Preferences › Advanced › Database ›
Imported Library; the "rekordbox xml" tree can be refreshed in-app). Engine DJ Desktop reads the
rekordbox XML too (Preferences › Library › Integration), and has no M3U import. Both are the user's
priority targets.

## Decision
MCO maintains `MCO/exports/rekordbox.xml`, regenerated a few seconds after any list change, containing
the whole MCO tree (Playlists, Shows › Sessions) and the tracks they use. Users point both apps at this
file once; afterwards MCO's lists appear in both and refresh without re-exporting.

## Consequences
- One exporter to perfect instead of two; one setup step per app.
- Needs absolute file paths (ADR 0012).
- XML can't carry Rekordbox smart lists or My Tags; MCO smart lists are exported as their current
  contents.
