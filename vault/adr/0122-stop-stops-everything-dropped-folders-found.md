---
status: accepted
date: 2026-10-01
---
# 0122. GLUE Home's Stop stops everything; a dropped folder is found by GLUE Home at once

Amends [ADR 0044](0044-glue-home-tauri-tray-app.md) (what Start / Stop mean) and [ADR 0051](0051-glue-home-as-local-engine.md) (music folders in
Home mode).

## Context
The user, 2026-10-01, on the desktop with GLUE Home running:
- **A folder added to the library was never analysed.** The tab left the analysis to GLUE Home, and GLUE Home did
  nothing with it. Quitting GLUE Home let the browser analyse it.
  - The folder came in with the browser's handle only (a drop, or a pick outside Home mode). The browser never says
    where a folder is, so its `absPath` was empty and GLUE Home's settings didn't know it.
  - For every song, GLUE Home then searched every drive for a folder of that name (up to 25 s, several songs at
    once), and never kept what it found.
- **Start / Stop / Restart seemed to do nothing:** "the connection is only stopped after I quit". Stop only took
  GLUE Home offline for other devices. The local link, the engine and the analysis carried on, so the website kept
  using GLUE Home.
- The folder, "2025", was also inside "Music Collection", already a music folder.

## Decision
- **Stop stops GLUE Home's work:**
  - it goes offline;
  - nothing new is analysed, synced, removed, backed up or written;
  - the local link answers only GLUE Home's own windows (`running: false` in its settings: 503 to the website,
    `local.rs` `refused_while_stopped`).

  The website treats a 503 like GLUE Home being quit (`HomeDisk`: `HomeDown`; the engine client's poll checks the
  link). The library carries on in the browser, and goes back to GLUE Home when it answers again.
- **Start** carries on, and looks for work at once. **Restart** also starts the engine and the analysis over (songs
  that failed this session are tried again).
- **A folder dropped onto the library in Home mode is GLUE Home's folder** (`platform.droppedFolder`):
  - the tab sends its name and a song in it (engine rpc `where`);
  - GLUE Home looks for it, first in the usual places and inside the music folders it knows, then on the drives;
  - it keeps what it finds in its settings, and the root gets `handleKey: home:<id>` and its `absPath`;
  - if it isn't found, GLUE Home's folder dialog asks.
- **GLUE Home searches for a music folder once** (`home/ui/library.ts` `locate`):
  - one search per folder, shared by its songs;
  - a folder found by looking is remembered in the settings (unless one was set meanwhile);
  - a folder that isn't found isn't searched for again for a minute.
- **A folder inside one of the collection's music folders isn't added:** its songs are that folder's already. The
  user is told so.

## Consequences
- Stop is a way to hand the library to the browser without quitting GLUE Home.
- While GLUE Home is stopped, a browser with no folder access of its own (ADR 0115) has no library until Start.
