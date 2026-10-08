---
status: accepted
date: 2026-10-08
---
# 0169. The main DJ library

## Context
With every DJ app's cues and grid shown in Prepare (ADR 0168, phase 1), the user (2026-10-08): "much like the 'main
folder' there should be a 'main dj collection' that would default to always show and sync to that collection." A
song can be in several DJ libraries (Engine DJ, rekordbox, an old Traktor import) with different grids and cues; GLUE
needs one to treat as the song's, and one to sync with.

## Decision
- **One DJ library per computer is the main one:** marked on its record (`Source.main`), so it's each computer's own in a
  shared collection, as its libraries are. Set from the library's menu in the sidebar ("Make it the main DJ library")
  or from Prepare's **In your DJ apps** ("Make it main"); marked "main" in both places. `setMainSource` (website) and
  `set_main_source` (GLUE Home) unmark the computer's others; a read of the library keeps the mark (`applyImport`,
  held by the import goldens).
- **What a song shows, in order:**
  - **BPM:** GLUE's own correction (Prepare), then the main DJ library's grid, then the analysis, then another DJ app's
    BPM (`bpmInUse`). The library's lists show it too.
  - **Grid:** GLUE's own; else the main library's (unless GLUE's BPM differs from it, which keeps placing the grid on
    the audio).
  - **Cues:** GLUE's own, else the main library's, else another library's. On the pads too: editing one makes the
    shown list GLUE's own.
- **The two-way sync (ADR 0168) is with the main DJ library:** its "opt-in per library" is the main library, with
  writing switched on.

## Alternatives considered
- **In the collection's settings, like the main folder (`meta.mainRoot`):** one value for the whole shared collection,
  while each computer has its own DJ libraries.
- **No main library, the first one found:** which one wins would depend on the order the libraries were imported.

## Consequences
- A song's BPM can change in the library when a main DJ library is chosen (its grid's tempo, e.g. 140.03 instead of the
  analysis's 140).
- Phase 2 of ADR 0168 has one target per computer.
