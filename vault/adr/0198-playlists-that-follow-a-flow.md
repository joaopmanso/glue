---
status: accepted
date: 2026-11-27
---
# 0198. Build playlists along a flow, with the songs to start from placed where they fit

## Context
- **The user (2026-11-27):**
  - "the chosen song always is chosen as the first song of the playlist";
  - "the sonic semblances of the songs chosen are not really similar";
  - "a set should follow a flow … if we want energy to grow, or be constant, maybe be guided in some way".
- **They chose (2026-11-27):** presets, plus a curve to draw.
- **ADR 0029's builder:**
  - put the seed in slot 0;
  - scored BPM along a straight ramp, Camelot keys, ratings and tags;
  - filled the slots left to right, greedily.
- ADR 0197 gives every song an energy (1–10, relative) and a timbre.

## Decision
- **A flow:** points 1–10 spread evenly over the set, smooth between them.
  - Presets: Steady (at the seed's own energy), Warm-up, Build to a peak, Peak and down, Peaks and breathers, Cool-down.
  - Dragging a point makes the flow the user's own.
  - "No energy target" turns it off.
  - The BPM can follow the flow's shape between the start and end BPM, instead of a straight ramp.
- **The songs to start from (the seed and the ones to include) each have a role:**
  - *Where it fits*, the default: the slot whose energy and BPM targets fit it best;
  - *Opener*, *At the peak*, *Closer*.
  - With no targets at all, the seed opens, as before.
- **The score** (one weights table in `autoplaylist.ts`):
  - BPM fit 2;
  - energy fit 4;
  - key 2.5;
  - rating 3;
  - tags 3;
  - likeness to the songs started from 3 × *Sound*;
  - likeness to the song before 1.5 × (0.3 + *Sound*);
  - −4 for the same artist within 3 songs;
  - −1 per step of an energy jump beyond what the flow asks.
- **A beam search:** 8 partial sets kept, each step looking at the 48 (+ the step) best songs for that slot.
  - Randomness: each partial set's best few, drawn with Gumbel noise. The same seed gives the same set.
  - The four relax steps stay.
- **The result** shows each song's energy (E1–E10), and the curve with the songs' energies on it.
- **The form** (flow, points, roles, *Sound*, artist spacing) is kept on `List.auto` as before.

## Alternatives considered
- **Greedy with look-ahead:** simpler, but a fixed song later in the set (an included one, a closer) still pulls badly
  on its neighbours. The beam costs ~8× a greedy pass, which is still milliseconds.
- **Ordering a chosen pool by energy afterwards:** the order would follow the curve, but the songs picked wouldn't.
- **Per-slot targets typed in:** offered to the user and declined, in favour of presets plus a curve.

## Consequences
- ADR 0029's "the seed first" no longer holds: it's a role now.
- Tests: `tests/autoplaylist.test.ts` (the curve followed, the roles, likeness, artist spacing, the flow's BPM),
  `tests/energy.test.ts`, and the e2e of the dialog (presets, the curve by keyboard, Opener).
- **The set builder (M10)** starts from a playlist made this way. Its timeline, mixer and exports are their own
  decisions.
