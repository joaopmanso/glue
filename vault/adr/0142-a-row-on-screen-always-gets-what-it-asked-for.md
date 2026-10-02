---
status: accepted
date: 2026-10-02
---
# 0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it

## Context
The user, 2026-10-02: after dragging the scroll bar about 5,000 songs down and again, 3 or 4 times, a block of 5 or 6
rows in the middle had no waveform; the songs played, and the waveforms came 10–15 s later. The song's page and back
loaded them at once.

Reproduced in a unit test (`tests/onScreen.test.ts`), from the code:
- **The cell held its row by the track object** (`WaveCell`, `CoverArt`: the effect read `t`). The library replaces a
  song's track object when it changes: its cover found from its tags (for the rows just scrolled to), the engine's
  feed. The effect ran again: `drop` (left the screen) then `hold` (came back).
- **`drop` cancelled what was asked:** it took the song out of the queue (waiting behind the 6 reads in flight) or
  cancelled its read. `hold` asked again only for another computer's songs that had none yet. The cell's own ask had
  run just before, and was skipped because the song was still queued.
- **Nothing asked again** until the row was made anew (the song's page and back) or its track changed once more
  with nothing in flight (the 10–15 s).
- A read was also known only once it reached GLUE Home, so a row leaving while it read the browser's own cache didn't
  cancel it.

## Decision
- **Rows are held by the song's id** (`WaveCell`, `CoverArt`: `$derived(t.id)`; `covers.hold/drop` take the id): a new
  copy of a song's track isn't leaving the screen.
- **What a cancel took is asked again** (`thumbs.svelte.ts` `lost`): a song dropped while queued, being read, waiting
  to be made from its analysis, or in the next batch from another computer is asked for again when its row is back,
  whatever order the cell's effects run in.
- **A read is known from its start** (`pump` keeps its `AbortController`): a row that leaves cancels it at any step,
  and a song is asked again when its last read was cancelled (`request` skips only a live one).

## Alternatives considered
- **Asking again every few seconds for every row with nothing:** hides the cause, and asks GLUE Home for thousands.
- **Never cancelling:** the jumps down the list got slower each time (2026-09-30, ADR 0139).

## Consequences
- **A row on screen with nothing is never left unasked.** The tests replay the cell's effects: a song changing while
  it waits, and a row leaving and coming back in the same moment.
- **Fewer reads:** a song's track changing no longer cancels and repeats its read.
