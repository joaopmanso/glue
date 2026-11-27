---
status: accepted
date: 2026-11-27
---
# 0202. A set's length asked for, songs layered on 3 decks, and the timeline's gestures

## Context
The user, on the set builder (ADR 0199–0201), 2026-11-27:
- "mouse scroll should zoom in or out";
- "clicking on the track should select it and show its options, not default to move it";
- "clicking empty space, or even clicking and just moving, should move left and right so we can navigate";
- "a click can only be moved if it's selected";
- "clicking to listen should be reserved to the time bar on the top";
- "a way to select how long you want the set to be, 30 min, 60, 90, etc. or have no limit";
- "the 3 deck option is basically just the same as 2 decks, goal is to have 2 songs playing together (those that have
  a very high closeness sonically) and then the third one mixes in";
- "an icon like the Engine DJ one that reflects the auto-set has been generated for that playlist";
- "a more inline solution rather than a panel … maybe clicking the icons shows a box on the icon's position instead."

## Decision
- **The timeline's gestures** (`SetLanes.svelte`):
  - **wheel:** zooms around the pointer (a sideways swipe still scrolls);
  - **drag** on empty space, or on a song not selected: scrolls;
  - **click** a song: selects it and opens its box under the timeline at its place:
    - play from it;
    - key lock for that song;
    - level ±1 dB;
    - in earlier or later;
    - its page.
  - **A selected song** is dragged to move it and the songs after it. Its edges show, to trim its start or its end.
  - **The time bar:** click or drag to put the playhead there. Nothing else seeks.
  - **A hand-over's chip:** opens its box at the chip (style, length ±4 bars, next song earlier or later, Hear it, how
    alike the two sound).
  - Escape, ×, or a click on empty space closes a box. The panel below the timeline is gone.
- **A length asked for** (`PlanOptions.length`, `SetPlan.length`): 30 min, 45 min, 1 h, 1 h 30, 2 h, 3 h, or no
  limit.
  - Every song plays the same share of what it would, the largest share that fits, never under 40 %. A shorter share
    picks an earlier 16-bar phrase, or an earlier drop for a double drop.
  - If even 40 % is too long, songs come off the end of the playlist.
  - A plan kept with a length is the playlist's first songs.
- **Layering on 3 decks** (`planSet`, after the usual plan): two songs in a row are layered when they:
  - sound alike (likeness ≥ 0.72, the timbre cosine of ADR 0198);
  - are within 4 % in tempo;
  - have keys that fit.
  The layering:
  - the second comes in early, to play along with the first for 48 bars;
  - the one after it comes in at least 16 bars before the first goes;
  - three play at once for those bars.
  - All moves are whole bars and clamped to a set that holds together (ADR 0201).
  - Their hand-over is the new style **Layer**: the incoming song rises over 8 bars without its bass; 16 bars before
    the end, the bass changes hands and the outgoing song fades. Only one song has its bass at any beat.
  - Equal-power headroom (ADR 0201) keeps three at once from stacking up.
- **A playlist that has a set** shows a crossfader mark beside its name in the sidebar, which opens the set.

## Alternatives considered
- **Fitting a length by dropping songs first:** the set would lose songs the user picked while others play long.
  Shorter songs come first, as a DJ would play them.
- **3 decks as a third lane only** (before): the same mix, spread out; it never had three songs at once.
- **Layering every pair on 3 decks:** two unrelated songs at full for 48 bars is clutter. Only those that sound alike
  are layered.
- **Ctrl + wheel for zoom** (before): the user wants the plain wheel; the timeline doesn't scroll up and down, so
  nothing is lost.

## Consequences
- A song can no longer be moved by accident: it's selected first.
- Plans made before keep their items; asking for a length or 3 decks plans the set again.
- The likeness needs sound profiles (ADR 0197). Songs without one are never layered.
