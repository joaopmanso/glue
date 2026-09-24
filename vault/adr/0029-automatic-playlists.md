---
status: accepted
date: 2026-09-24
---
# 0029. Automatic playlists: a greedy walk along a BPM ramp with weighted randomness

## Context
With BPM, key, ratings and fingerprints in place, the user wants to pick a song and have MCO build a
playlist around it (2026-09-24): start / end BPM, harmonic mixing, number of songs (20 by default,
fewer if the collection is smaller), must-include songs, always favour the highest rated unless told
otherwise, different every time; later, avoid repeating songs from shows and sessions.

## Decision
- `src/core/library/autoplaylist.ts` (pure, unit-tested) builds the list slot by slot:
  - **Targets**: a linear BPM ramp from start to end; tempo fit within ±tolerance (half/double time
    optional).
  - **Fixed slots**: the starting track first; each must-include track at the slot whose target
    tempo it fits best.
  - **Score** for each candidate: tempo fit ×2 + harmonic fit with the previous (and a fixed next)
    track ×2.5 (Camelot: same key 1, ±1 step 0.9, relative 0.85, +2 energy boost 0.5, else 0) +
    rating ×4 (the user's stars, else the DJ app's; unrated = 2), so among tracks that fit the
    highest rated wins unless "prefer highest rated" is off.
  - **Strict harmonic** makes key compatibility (≥ 0.5) a rule rather than a preference.
  - **Randomness**: pick among the best k candidates with weights exp(Δscore / T); k and T grow with
    the "Surprise me" slider. A seeded PRNG makes a run repeatable; "Another" changes the seed.
  - **Relaxing**: when nothing fits, widen the tempo range, then allow key changes, then drop the
    tempo target, and report what was relaxed.
- The pool (`src/lib/auto.svelte.ts`): tracks with a file and an analysis (option to allow
  unanalysed), one copy per same-recording duplicate group (the best), minus tracks in playlists the
  user chooses to avoid; optional minimum rating and same-genre filters.
- Saved as an ordinary playlist; the options and seed are kept on the list (`list.auto`) for
  "generate again" and for avoiding repeats once shows and sessions exist.

## Consequences
- Instant for thousands of tracks (O(count × pool)).
- Transitions are judged pairwise (greedy), not globally optimised; fixed slots look one ahead.
- "Avoid songs played recently" plugs into the same pool filter when shows and sessions land (M3).
