---
status: accepted
date: 2026-11-27
---
# 0208. Make the song's menu only buttons round the pointer, wherever it was clicked

Supersedes ADR 0207's centre of the menu (the song's name, its level, a hint) and where it opens from the running
order. The rest of ADR 0207 stands.

## Context
- **The user (2026-11-27):** "I don't like the big round box with the song name and all that, the menu should be around
  the cursor, not have information and a menu all mixed in one".
- **Then:** "clicking the tracks in the running order is showing the menu up above and not where the cursor is".

## Decision
- **The centre:** a small dot where the pointer was; nothing else.
- **The level:** two buttons of the ring, **+1 dB** at the lower right and **−1 dB** at the lower left. Each one's title
  says the level now; the song's block shows it too.
- **The ring:** 60 px.
- **The menu, and the hand-over box beside it, are placed in the window** (`position: fixed`), kept inside it:
  - a click on a song opens the menu at the pointer;
  - so does a click on a song's name in the running order (`menuAt`, bound from `SetView`);
  - a song chosen any other way opens it at the song.
- **The page scrolling** (not the timeline) closes the menu, as it no longer points at what it was opened on.

## Alternatives considered
- **The level as a value in a corner of the ring:** information mixed into the menu again, which the user didn't want.

## Consequences
- `#set-song-level` is gone. `#set-song-louder` and `#set-song-quieter` are ring buttons.
