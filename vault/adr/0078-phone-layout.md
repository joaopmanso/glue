---
status: accepted
date: 2026-09-28
---
# 0078. On a narrow screen, show the library as a phone app

## Context
The user (2026-09-28): "Mobile browsing is completely broken, all pages don't work on mobile… we need to
have a cohesive mobile UI that feels like a library explorer / player."
- The library was built for a desktop: a sidebar, a wide table of columns, right-click menus, hover
  buttons, a player bar with a waveform. Squeezed onto a phone, the parts land on top of each other,
  and a lot of it needs a mouse (right-click, hover, double-click, drag).
- Since ADR 0077, a phone signed in to GLUE opens the account's library by itself. So the phone is now a
  real way to use GLUE: browse, listen, prepare playlists.
- Some popovers and panels (the note editor, the send panel) lived inside the desktop library view, so
  they did nothing anywhere else.
- Store apps are still for later (ADR 0057), so this is the website in a phone's browser.

## Decision
Below 760 px wide (`PHONE_QUERY`, `lib/phone.svelte.ts`), the library is a phone app with its own frame:
- **Tabs at the bottom:** Library, Browse, Playlists, Search, More.
  - Each tab keeps its own stack of screens, like a phone app: Library › All tracks › a song's menu.
  - Switching tabs keeps each one where it was left; tapping the open tab goes back to its first
    screen.
- **Songs as two-line rows:** the cover, the title, the artist, BPM, key and length.
  - A tap plays the song, and the list plays on after it.
  - ⋯ or a long press opens the song's menu.
  - Only the rows on screen are drawn.
- **Menus as sheets from the bottom** (`ui/phone/ActionSheet.svelte`):
  - The same entries as the desktop's menus (ADR 0067), so there's one place to add an action.
  - `menu.show` hands every menu to the sheet while the phone layout is on: the song, playlist,
    browse and device menus all come up this way, with no phone-only copies.
  - Submenus open in place, with a way back. Long ones get a find field.
  - Keyboard shortcuts aren't shown.
- **The tag, genre and note editors:**
  - The tag and genre editors become sheets too.
  - The note editor sits across the top, clear of the keyboard.
- **The player:**
  - A mini player sits above the tabs.
  - A tap opens the full player: the cover, seek, shuffle and repeat, and the queue.
- **A song's page, the calendar and an event open inside the same frame:**
  - a back button replaces the desktop header;
  - the tabs and the mini player stay;
  - the page's own layout wraps to the screen, and nothing may be wider than it.
- **What stays outside the frame:** "Analyze a file", the welcome screens and the admin page keep the
  desktop header. They already fit a phone.
- **The desktop layout is unchanged above 760 px.**
- **Always rendered by the app, so they work on every page:** the send panel and the note editor.

## Alternatives considered
- **Make the desktop layout responsive** (hide columns, collapse the sidebar):
  - it still needs right-click, hover and a pointer;
  - a table of columns is the wrong shape for a phone;
  - it would stay "components all over the place".
- **A separate phone site or route:**
  - two apps to keep in step;
  - the phone layout is only another view of the same state (`view`, `nowPlaying`, `lib`), so it
    stays in the same app.
- **A native app now:** later (ADR 0057). The website has to work on a phone first anyway.

## Consequences
- A phone gets one consistent frame for everything it needs day to day.
- The desktop's menus drive both layouts. A new menu entry shows up on the phone with no extra work.
- Pages that open inside the frame must fit 390 px with no sideways scroll (checked in
  `e2e/phone-ui.spec.ts`).
- Global class names in `styles/app.css` (`.bar`, `.top`, `.row`…) leak into components. A component
  class with the same name picks up their rules (a `.bar` is 3 px tall), so phone components avoid
  those names.
- **Open:**
  - lock-screen metadata (Media Session);
  - keeping playlists offline;
  - checks in Safari on a real iPhone ([phone app](../features/phone-app.md)).
