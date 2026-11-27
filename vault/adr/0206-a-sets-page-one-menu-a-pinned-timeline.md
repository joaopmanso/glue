---
status: accepted
date: 2026-11-27
---
# 0206. Give the set's page one round menu per song and a pinned timeline; give the site's ground some depth

## Context
- **The user (2026-11-27), after ADR 0205:**
  - "we should see the grid faintly, not just a black background so it's easier to line up";
  - "the functions could show as a round menu when we click the track so that we can do everything in a single place
    instead of having separate controls for mixing and track";
  - the bass cut "not very intuitive, maybe making the bar larger when we hover on it", and "a little x next to each
    segment";
  - "min zoom should be fit to screen";
  - "improve the visual clutter, have the text playlist be shown on a modal";
  - the running order: "a running indicator as if the bar is filling", and its boxes open on the track, out of reach
    when the page is scrolled down;
  - "select a subsection of the set to export";
  - "the black only background on the website is very boring … a small degrade or some faint yellow geometric lines".
- **What the page had:**
  - a song's box and a hand-over's box, each under the lanes;
  - the bass strip only on a selected song, 14 px high;
  - zoom out to 0.05 px/s;
  - the tracklist always shown;
  - the running order outlined in the accent.

## Decision
- **A song's round menu** (`SetLanes.svelte`, `#set-pop-song`):
  - it opens where the song is clicked, or at the song when chosen in the running order;
  - **items, round from the top:** play from here, +1 dB, Mix out, later, key lock, let go of its bass edits (when it
    has some), earlier, Mix in, −1 dB, its page. Absent ones are left out;
  - **Mix in and Mix out** open that hand-over's box beside the menu (`.beside`), so a song and its hand-overs are shaped
    in one place;
  - the centre shows the song, its level, and what the hovered item does;
  - the centre lets the pointer through, so a selected song is still dragged from under it;
  - it hides while a song is dragged, and follows the song after.
  - Several songs selected keep their own box (ADR 0205).
- **The timeline:**
  - each lane is washed, and a grid on the mix's beat clock is drawn under the songs: bars, every 4 bars brighter, 16-bar
    phrases in the accent, thinned out when zoomed out;
  - the songs' fill is slightly see-through;
  - zoom stops at Fit;
  - **the bass strip** shows on any song under the pointer, grows from 12 to 34 px under it, and says what a drag does
    (cut or open). A drag on a song not selected selects it without the menu;
  - each stretch has a × (shown on hover or when selected);
  - a part marked for export is shaded on the time bar.
- **The page** (`SetView.svelte`):
  - the transport and the timeline are sticky at the top in windows 760 px tall or more, so anything opened from the
    running order is in view;
  - the running order:
    - the song playing fills its line as it plays (`--p`, from the preview's frame), with an equaliser for its number;
    - the hand-over playing is lit;
  - **export:** the whole set or a part, from song a to song b. `edit.ts` `part` makes it a set of its own: the first song
    comes in alone at beat 0, and the rest is as it is. It's named "… (songs a–b)". GLUE Home mixes a part like any
    plan;
  - the tracklist opens in a `<dialog>` (copy, save as text).
- **The site's ground** (`app.css`):
  - `html` gets a faint radial glow of the theme's accent at the top right and the bottom left, over `--ground`, fixed;
  - `body::before` draws fine lines at 60°, −60° and 0° in the accent (4–7 %), masked to fade out from those corners;
  - both come from the theme's tokens, so every theme and mode gets its own;
  - not printed.

## Alternatives considered
- **A full pie menu with sub-rings for styles and bass choices:** seven styles and four bass choices don't fit a ring
  legibly. The hand-over's existing box, opened beside the ring, keeps them readable.
- **Opening the box next to the running order's row:** two places to look again. The pinned timeline keeps one place.
- **An image for the background:** the lines are drawn in CSS from the theme's tokens: no asset, and right in every
  theme.

## Consequences
- The song's box ids (`set-song-play`, `-louder`, `-quieter`, `-level`, `-earlier`, `-later`, `-keylock`) are on the
  menu now. Key lock is a toggle (`aria-pressed`), not a checkbox.
- The tracklist is in the DOM but hidden until opened.
- Short windows (under 760 px) don't pin the timeline.
