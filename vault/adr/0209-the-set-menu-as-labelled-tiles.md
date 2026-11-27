---
status: accepted
date: 2026-11-27
---
# 0209. Draw the song's menu as labelled tiles round the pointer; bring a song into view only when none of it shows

Supersedes ADR 0208's round buttons, and ADR 0201's "a song chosen is brought into view". The rest of ADR 0208 stands:
the menu sits at the pointer, in the window.

## Context
- **The user (2026-11-27):**
  - "if I'm zoomed in on a track in a way where I can't see the beginning of the track, select it and try to move it, my
    cursor jumps to the beginning of the track";
  - the menu's icons "could be improved slightly … the color or the font, the spacing. they should look more
    professional. maybe we can try with it not all being round icons".
- **The cause of the jump:** choosing a song scrolled the timeline to the song's start whenever the start was off screen.
  The check also read the songs' places, so it ran again on every step of a drag.

## Decision
- **The menu's items are tiles:**
  - an icon and a word ("Play", "Mix in", "Mix out", "Key lock on/off", "+1 dB", "−1 dB", "Its page", "Clear bass");
  - 28 px high, 7 px corners, the UI's sans at 600;
  - quiet glass: the surface at 86 % with a blur, a hairline border;
  - the accent is on the icons, and on a tile that's on or under the pointer.
- **Each tile has a fixed spot round the pointer** (`SPOT`), anchored by the edge nearest it, in rows that never overlap:
  - north and south, centred, 76 px away;
  - the four diagonals 39 px up or down;
  - east and west at the pointer's height.
- **The pointer:** a small dot with a halo.
- **Bringing into view:** a hand-over or song chosen is scrolled into view only when none of it is on screen. Never
  during a drag, and only when the choice changes (the songs' places are read untracked).

## Alternatives considered
- **Round buttons with labels underneath** (ADR 0207, 0208): the user found them unprofessional.

## Consequences
- The menu is wider than it is tall: it's kept 150 px from the window's sides and 96 px from its top and bottom.
- `e2e/sets.spec.ts` selects a song zoomed in past its start, and checks the timeline doesn't scroll.
