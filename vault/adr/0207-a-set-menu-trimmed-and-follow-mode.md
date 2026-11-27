---
status: accepted
date: 2026-11-27
---
# 0207. Trim the song's menu to fixed, labelled places; follow the playhead only until the user looks elsewhere

Supersedes ADR 0206's list of the menu's items and how it opens. The rest of ADR 0206 stands.

## Context
- **The user (2026-11-27), on ADR 0206's menu:**
  - "it doesn't always show, sometimes it takes a couple seconds, sometimes it disappears and I have to choose another
    track for it";
  - "overall it's a bit too cluttered and not intuitive";
  - the hand-over box's "Cut" button was outside its frame.
- **Then:** "the follow cursor: if I click to see something else I then get zoom issues and it focus back on the cursor.
  if I zoom or scrub through it should disable the follow mode … a way to reenable it next to the play button".
- **Causes found:**
  - The bass strip along a song's foot is invisible until hovered, but it caught clicks: 12 px, and 34 px under the
    pointer, about 40 % of a song's height. A click there selected the song without opening its menu.
  - A press held 350 ms counted as a grab, so a slow click opened the menu only when let go.
  - A click on the song already selected moved the menu to the song's middle.
  - The hand-over box's grid track was as wide as its longest title (`white-space: nowrap`), so its rows overflowed the
    frame.
  - The view followed the playhead whenever it played, so it pulled back after every zoom or scroll.

## Decision
- **The menu's items** each have a fixed place and a label:
  - Play on top;
  - Mix in on the left and Mix out on the right;
  - Key lock below;
  - its Page at the upper left;
  - "Bass ×" at the upper right, only when the song has bass edits.
- **The level** is in the middle: − and + either side of the dB value.
- **Earlier and later** leave the menu: they're the song's own drag, and the hand-over box keeps "Next in".
- **Only the menu's buttons take the pointer.** The rest of the centre lets it through, so a selected song is dragged
  from under the menu.
- **Opening the menu:**
  - a click on the strip that isn't a drag is a click on the song, and opens its menu;
  - only a drag on the strip selects without the menu;
  - a click on the song already selected opens the menu, or moves it, where it was clicked;
  - a press is a grab after 450 ms;
  - a cancelled pointer lets go of a drag.
- **The bass strip** grows to 22 px under the pointer, not 34.
- **The hand-over box's grid** is `minmax(0, 1fr)`: a long title is cut, and the rows wrap inside the frame.
- **Following the playhead** (`follow`, bound between `SetView` and `SetLanes`):
  - the view follows only while it's on;
  - turned off by any scroll the follow itself didn't make (a drag on the lanes, the scrollbar, a song brought into
    view), the wheel, the zoom buttons and Fit;
  - a crosshair toggle by Play (`#set-follow`, `aria-pressed`) turns it on again. When it's on while playing, the view
    jumps back to the playhead.

## Alternatives considered
- **Spreading the items evenly round the ring:** their places move as items come and go, so nothing is learned.
- **A follow that only pauses for a few seconds:** the user asked for it to stay off until turned on again.

## Consequences
- The menu has no `set-song-earlier` / `set-song-later` any more. `set-song-quieter`, `set-song-louder` and
  `set-song-level` are in its centre.
- With follow off while playing, the playhead can run out of view: the toggle is by Play.
