---
status: shipped
milestone: M2
updated: 2026-09-24
adrs: [0009]
---
# Ratings

## What it does
Rate tracks from half a star to five stars, in the track table and on the track page.

## Behaviour
- Click a star; the left half of a star gives a half star. Clicking the current rating clears it.
  Keyboard: focus the stars, ←/→ change by half a star, Delete clears.
- With several tracks selected, rating one row rates them all.
- Until you rate a track, the rating from an imported DJ library (rekordbox, Engine DJ, Traktor,
  Apple Music) is shown dimmed; your own rating always wins.
- Sort by the Rating column (highest first).

## How it works
`Track.rating` (0.5–5 in steps of 0.5, absent = not rated) in the track shards; imported ratings stay
in each source's file.

## Not yet
- Writing ratings back to DJ apps (exports, M4).
