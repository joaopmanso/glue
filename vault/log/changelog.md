---
updated: 2026-09-30
---
# Changelog

Newest first. Each entry: date, milestone, what changed, links.

## 2026-10-02 · Waveforms: a row on screen always gets its own
- **The user:** after a few jumps down the list with the scroll bar, a block of 5 or 6 rows had no waveform for
  10–15 s; the song's page and back loaded them at once
  ([ADR 0142](../adr/0142-a-row-on-screen-always-gets-what-it-asked-for.md)).
- **The cause:** a song's track changing on screen (its cover found, the engine's feed) made its cell "leave and come
  back", which cancelled the waveform it was waiting for, and nothing asked again.
- **Now:** rows are held by the song's id, and what a cancel took is asked again when the row is back. Covers too.
  Two unit tests replay it.

## 2026-10-02 · GLUE Home 0.42.2: songs get their own port; a read looks up only its folder
- **The user:** on 0.42.1, the first song after opening GLUE (a WAV on F:) took 34 s; the next ones started at once,
  a NAS song in under 2 s ([ADR 0141](../adr/0141-songs-get-their-own-port-and-a-read-looks-up-only-its-folder.md)).
- **Measured:** the same WAV through the local link played in 0.4 s from a browser of its own. F: is a hard disk
  that Windows turns off after 20 minutes. Every file read resolved each of the 21 music folders until one matched,
  the NAS's among them, and the songs shared the browser's 6 connections to GLUE Home with everything else.
- **Now:**
  - songs played go to a port of their own on GLUE Home (`playPort`), with 6 connections nothing else uses;
  - a read resolves only its own folder, and each folder's name on disk is remembered;
  - the e2e stand-in listens on both ports, and the Home-mode test checks songs go to the songs' port and covers
    don't.

## 2026-10-02 · GLUE Home 0.42.1: a song played pauses the analysis's reads
- **The user:** "much much better", but the first song played took about 30 s to start; would a socket help the
  stream? ([ADR 0140](../adr/0140-a-song-played-pauses-the-analysis-reads.md))
- **No:** the player streams over HTTP ranges. The time went to the NAS: the analyses already running read on, about
  30 s each, and only new ones waited.
- **Now:** every piece of a song read for playing (here or streamed to a device) marks "playing now". The analysis's
  reads wait while it's fresh (3 s), and carry on when the player's buffer is full.

## 2026-10-01 · GLUE Home 0.42.0: a socket for the background loads; the list stays put
- **The user's report:** scrolling into a part not loaded yet, the songs on screen changed 5–7 times before
  settling, even with the analysis paused
  ([ADR 0139](../adr/0139-a-socket-for-background-loads-and-a-list-that-stays-put.md)).
- **The cause:** as rows loaded, songs just above the screen left or joined the list (one row per song, failed
  analyses left out), shifting everything below. Reproduced in `e2e/scroll.spec.ts`.
- **The list stays put:** the song at the top of the window keeps its place when the list changes by itself, in
  every view; only the user moves it.
- **The socket (the user's idea):** GLUE Home 0.42 has a WebSocket on 127.0.0.1 for the page's background loads
  (spectrograms, waveforms, details, the analyses' results).
  - Any number at once on one connection, numbered.
  - A row that scrolls away cancels its read.
  - The browser's connections are left for playing; older GLUE Homes use HTTP through the gate.

## 2026-10-01 · GLUE Home 0.41.6: what you ask for goes first
- **The user's report:** analysing a NAS folder of 24-bit FLACs, 2 songs a minute at 10 MB/s; the page lost its
  direct link again, and clicking 3 or 4 songs in a row broke playing
  ([ADR 0138](../adr/0138-what-the-user-asks-for-goes-first.md)).
- **Measured:** GLUE Home answered in 4–87 ms, but the page had used up the browser's 6 connections to it (the
  analyses' results 20 at a time, the rows' pictures, the status poll piling up). The NAS gave 47–74 MB/s to plain
  reads while GLUE Home got 10.
- **The page:** background requests to GLUE Home's cache go through a gate, 3 at a time, a song page's first; the
  status poll runs one at a time.
- **GLUE Home:**
  - while a song plays (here or streamed to a device), no new analysis beyond 2;
  - it reads songs whole from its own local link in 1 MB steps, not 4 MB at a time through Tauri.
- **Next:** a dedicated socket for the thousands of spectrograms, waveforms and covers (the user's idea).

## 2026-10-01 · GLUE Home 0.41.5: this computer is never a remote session
- **The user's report:** while analysing, the desktop's page kept losing its direct link, and the iPhone couldn't
  connect; stopping the analysis fixed both ([ADR 0137](../adr/0137-this-computer-never-a-remote-session.md)).
- **The page:**
  - drops the direct link only when GLUE Home doesn't answer twice (3 s, then 5 s), not once in 1.5 s behind its
    other requests;
  - never opens a remote session to this computer's own GLUE Home.
- **GLUE Home** lets its own computer's browser in always; "Most at once" counts other devices only.
- **Measured after, with the analysis running (24 at a time, network at 4):** the desktop kept its link and the iPhone
  streamed. GLUE Home answered in 2–4 ms, used about a quarter of the machine, and the network ran at 185 Mbit/s of
  a gigabit link. The cause was the impatient link check and the fallback session, not the processor or the network.

## 2026-10-01 · GLUE Home 0.41.4: the speed as a panel
- **The user:** a meter rather than a line of text, like the website's admin stats (ADR 0136).
- **GLUE Home's window, Activity › Speed:**
  - tiles: songs a minute (with a chart of the last ten minutes), MB/s from this computer's drives, MB/s from
    network folders;
  - **Places in use:** the songs running now, reading (orange) or analysing (green), from `cache.steps`;
  - **A song's time:** the same split, on average;
  - the suggestion underneath.

## 2026-10-01 · GLUE Home 0.41.3: the analysis speed shown, the limits yours
- **The user:** the network cap shouldn't come from their NAS; leave it selectable and show stats instead
  ([ADR 0136](../adr/0136-analysis-limits-are-the-users-with-speed-shown.md)).
- **"From each network folder at a time"** in GLUE Home's window: No limit (unless set), or 1 to 16.
- **Speed** over the last two minutes: songs a minute, MB/s from this computer's drives and from network folders,
  and a song's time to read and to analyse.
- **A suggestion when one stands out:** fewer at once from network folders when reading them takes most of the
  time; more at a time when the processor has room; fewer when there are more than processors.

## 2026-10-01 · GLUE Home 0.41.2: analysing around a network folder
- **The user's report:** the tab's and GLUE Home's "left" counts differed by 20–30; "Reading tags… 0/9807" sat
  still; with 24 songs at a time the processor stayed under 60%
  ([ADR 0135](../adr/0135-analysis-around-network-folders-and-tags-by-glue-home.md)).
- **Measured on the desktop:** the NAS reads 12 MB/s (one file) to 24 MB/s (eight), and its songs average 59 MB.
  The network is the limit for that folder, not the processor.
- **One "left":** queued plus running, in both. GLUE Home's window says "Analysing 24 at a time · N left".
- **A network folder's songs take turns,** 4 at a time each; the other places go to local songs.
- **Tags:** GLUE Home reads only the tags of new songs, 200 a request, 8 files at a time (`/fs/read-tags`), instead
  of the page reading 512 KB of each one at a time. The count moves as they come.
- **Help:** GLUE Home › How fast it analyses.

## 2026-10-01 · GLUE Home 0.41.1: network folders
- **The user's report:**
  - on Windows, dropping a network folder took about 10 s before GLUE Home's dialog, with nothing on screen;
  - on a Mac, + Folder on a network folder failed ("Can't scan Música: Bad Path")
  ([ADR 0134](../adr/0134-network-folders-found-quickly-and-read-past-odd-names.md)).
- **Mac:**
  - GLUE Home refused names with `:` or `\` (fine on macOS: "Track 1/2" in Finder is `Track 1:2`), and one such name
    failed the whole scan. Now allowed except on Windows;
  - a scan skips what it can't read, says how many, and keeps those songs as they were.
- **Dropped folders:**
  - GLUE Home looks for 5 s (was 25), then asks;
  - the page says "Looking for "Música"…", then "Choose it in GLUE Home's window".
- **CI:** GLUE Home's Rust tests now run on Windows and macOS.

## 2026-10-01 · GLUE Home 0.41.0: a session per device
- **The user's request:** one private, secure session from the laptop to the desktop, opened at sign-in, for a
  real-time conversation instead of separate calls, with a configurable maximum
  ([ADR 0133](../adr/0133-a-session-per-device-with-glue-home.md)).
- **The session:**
  - each device's tab keeps one session with each of the account's other GLUE Homes, opened at sign-in;
  - a heartbeat every 15 s, reopened when it drops;
  - requests, playing and songs sent all go through it (songs on their own channel, same connection).
- **In GLUE Home:**
  - "Devices connected" lists them, with Disconnect (refused for an hour);
  - "Most at once" sets the maximum (5): a new device when full is told so;
  - the same tab reconnecting replaces its own session.
- **Real time:**
  - GLUE Home tells every session when songs are analysed: rows' waveforms and a song page waiting for its analysis
    show at once, with no asking again on a timer;
  - it tells when TO BE SORTED changes: the 30 s check becomes 5 minutes.
- **Older GLUE Homes** are used as before.
- **Help:** GLUE Home › Devices connected.

## 2026-10-01 · GLUE Home 0.40.2: connections bounded
- **The user's report:**
  - the laptop couldn't connect to the desktop at all ("Desktop: no addresses; new"), so no waveforms and no
    playing;
  - the iPhone's song pages said "The connection closed".
- **The cause** ([ADR 0132](../adr/0132-connections-to-glue-home-are-bounded.md)):
  - every failed connection left a half-made one in GLUE Home;
  - at 500, the most a page can hold (measured), GLUE Home answered nobody new;
  - ADR 0131's retries made it come within hours.
- **GLUE Home:** set-ups not open within 30 s are let go, at most 20 at once, and an offer it can't take is answered.
- **The website:**
  - says "bye" when it gives up on a connection;
  - waits 5 to 60 s before connecting again for background asks (row thumbnails, covers);
  - playing and song pages try at once.

## 2026-10-01 · The first screen's waveforms load without scrolling; shared helpers
- **The user's report:** on the laptop, the first screen's waveforms often didn't load until scrolled away and
  back ([ADR 0131](../adr/0131-rows-on-screen-ask-until-answered.md)).
- **The causes:**
  - an ask to the other computer that failed (its link still opening) was taken as "none", retried after 8 s, and
    only for rows still on screen;
  - covers marked a failed batch "tried" for the whole session.
- **Now:**
  - one helper, `src/lib/onScreen.ts`: rows on screen, and asking again;
  - "couldn't ask" is asked again soon (1, 2, 4… 15 s) while the row is on screen;
  - "none there yet" is asked again later, or at once when the row comes back;
  - a row that scrolls away cancels its retry;
  - the margin stays 12 rows each way.
- **Found with the code map** (function names defined in several files), and folded:
  - the " (2)" copy-name rule: `core/transfer.ts` `firstName`, used by TO BE SORTED and by the joining of copies;
  - drag-out file names now use `transfer.ts`'s `safeName`, which also avoids Windows' reserved names.

## 2026-10-01 · A song on two computers is one song
- **The user's report:** a song added on the laptop and sent to the desktop was two songs there, one per computer,
  shown as duplicates ([ADR 0130](../adr/0130-same-file-on-two-computers-is-one-song.md)).
- **The cause:** the desktop's scan of its incoming folder made every new file a new song, never asking whether
  another computer already had it.
- **Now, in a shared collection, the same file (size, and name or "Name (2)") on two computers is one song** with a
  copy on each:
  - a scan makes it this computer's copy of the other's song (`applyScan`, `store.addCopy`);
  - pairs made before are joined when a collection opens and after a sync (`joinCopies`), with the row's
    analysis, playlists, rating and notes. More than 10 at once are backed up first.
  - the older song stays, joined by the computer whose song goes, so two computers never drop each other's.
- **Help:** duplicates and devices say so.
- **Code map:** a doc edited between `graph_docs.py prepare` and `finish` is no longer marked read (nor cached
  under its new content); the next refresh reads it again.

## 2026-10-01 · The code map's docs kept current; its view on the site
- **Every session that changes docs refreshes them in the graph** before its commit
  ([ADR 0129](../adr/0129-code-map-docs-every-session.md)):
  - `scripts/graph_docs.py prepare` → one subagent per batch → `finish`, which merges, clusters and publishes;
  - not through the 41 KB skill; only the changed docs are read.
- **`vault/log/` is out of the graph:** it changes every session and is read directly.
- **Code tied to its decisions:** the code's "ADR 0124" comments link to the ADRs (about 450 edges), and ADRs are
  labelled by their titles (`graph_docs.py link`, also in CI).
- **The graph's interactive view** is at https://joaopmanso.github.io/glue/graph/, copied from the branch `graphify` by
  the site's deploy.
- **graph.yml publishes with a lease,** so it never overwrites a docs refresh published while it ran.

## 2026-10-01 · The code map built on GitHub; the colleagues' rules
- **Built for every push to `main`** ([ADR 0128](../adr/0128-code-map-built-on-github.md)):
  - `.github/workflows/graph.yml` updates the code part on top of the last graph and publishes it to the branch
    `graphify` (one commit, replaced each time);
  - `node scripts/graph.mjs fetch` / `publish` (git only);
  - a Claude Code session-start hook fetches it when a computer has none.
- **Usage rules** (CLAUDE.md, from colleagues):
  - `affected --depth 2` before planning; `god-nodes`, `explain`, `path`;
  - distinctive labels; never `query`; never the 41 KB skill to answer questions.
- graphify's own hook (a "MANDATORY: run graphify query" note on every Bash call and Read) is replaced by one line
  before Grep and Glob.
- The SQL migrations are in the graph now (the `[sql]` extra).

## 2026-10-01 · A map of the code for coding sessions (graphify)
- **graphify** ([ADR 0127](../adr/0127-graphify-code-map.md)), a developer tool, not part of GLUE:
  - a knowledge graph of the code (tree-sitter) and the vault and help (one semantic pass): about 4,200 nodes,
    10,600 edges, 185 named communities;
  - sessions ask it before grepping (`graphify explain` / `path` / `query`), to read less to find things.
- **How it's set up:**
  - built per computer into `graphify-out/` (git-ignored);
  - a git hook rebuilds the code part after each commit; docs reach it with `/graphify . --update`;
  - `.graphifyignore` leaves out frozen, generated and binary files;
  - in git: the skill in `.claude/skills/graphify/`, nudge hooks in `.claude/settings.json` (they do nothing
    without graphify) and a "graphify" section in CLAUDE.md.
- **The laptop isn't set up yet:** steps in the handoff.

## 2026-10-01 · Gluey can hide; "What's this?"; GLUE Home in the tours; the homepage's pictures full size
- **Gluey's button can be hidden:** right-click him › Hide Gluey, or "Show Gluey's button" in "Who's using GLUE?".
  Kept once per person like the rest (`guide.hide`, the newer choice wins). Hidden, there are no tips or offer;
  Help stays at the top, and tours still run when asked.
- **"What's this?"** at the end of the right-click menus runs Gluey's tour of that part: Library views (Duplicates,
  No file linked, the quality views), sidebar sections, playlists, tags, music folders, DJ libraries, songs,
  columns, filters, devices.
- **GLUE Home in the tours:** the first tour has a GLUE Home stop. The GLUE Home and devices tours point at the
  Devices panel (left, when signed in) and its "+ GLUE Home", which downloads the app and shows a code to type into
  GLUE Home's window. A stop can name alternatives (`pair-home|devices`: the account button when not signed in).
- **The homepage's pictures:** each chapter's pictures are full size, side by side to scroll through (arrows, dots,
  a caption, swipe, ← →); the small ones were too small to read. Recaptured without Gluey, and the duplicates picture
  is now the whole page.

## 2026-10-01 · A new homepage
- **The homepage, rewritten** ([homepage](../features/homepage.md), ADR 0126 batch 3):
  - shorter and current, introduced by Gluey;
  - "How it starts" in three steps, with what you need;
  - four chapters: every DJ app; quality, duplicates and No file linked; Prepare, the builder and the calendar;
    every device, the phone;
  - "More in the help" links, and an ending with Gluey.
- **Media recaptured** from the current app: No file linked, Prepare, the calendar and the phone are new. Unused
  media is gone (1.9 MB, from 4.6). The demo library has "removed duplicates" for No file linked; the capture keeps
  Gluey quiet and brings the DJ library's playlists in on demand.

## 2026-10-01 · Gluey's help centre and a tour per feature (GLUE Home 0.40.1)
- **Help** ([ADR 0126](../adr/0126-gluey-tours-and-help.md)):
  - 18 articles, one per feature, searchable;
  - in Gluey's panel (bottom right of the library) and as a page, `#/help` ("Help" in the top bar; the phone's
    More; a "Help" link in GLUE Home's window);
  - it works before anything is set up.
- **A tour per feature,** run with "Show me": the library, adding music, DJ libraries, quality, a song's page,
  Prepare, playlists, duplicates, No file linked, the calendar, GLUE Home, devices, analyse a file, themes.
- **Tips:** the first time Duplicates, No file linked, Lower quality, Browse, the Calendar or Prepare opens, Gluey
  says one line, with "Show me". Once per person; "Gluey's tips" in his panel turns them off.

## 2026-10-01 · Gluey, and his first tour (GLUE Cloud migration 0011)
- **Gluey, the glue stick, shows new people around** ([ADR 0126](../adr/0126-gluey-tours-and-help.md)):
  - a one-minute tour on their first login (the library views, adding music, the analysis, a song's page,
    playlists, devices, where help is); four stops on a phone;
  - never again on another device: what's seen is kept in the browser, the GLUE folder and the account (new
    `users.guide`, `PATCH /v1/me/guide`), merged as a union;
  - people from before Gluey get an offer instead;
  - "Take the tour again" is in "Who's using GLUE?"; Gluey's button (bottom right) has the tours.
- Next: the help centre with a tour per feature, then the new homepage.

## 2026-10-01 · The newer look wins
- **A theme or dark/light chosen just before a reload stays.** The GLUE folder's look always won over the browser's
  on opening, and the folder's copy is saved a moment after the choice: a reload in between brought the older look
  back (CI's themes test failed on it). Each choice now carries its time (`appearance.at`, pref `lookAt`), and
  the newer of the browser's and the folder's wins.
- **The e2e suite's slowness and flakiness of 2026-09-30/10-01** (12–13 min, 1–3 random failures a run, then no
  browser starting at all) was the desktop's Desktop Window Manager leaking memory (41 GB, 0.6 GB free). After a
  restart: 90 passed in 5.9 min.

## 2026-10-01 · A dropped song is analysed with GLUE Home running (GLUE Home 0.40.0)
- **A song dragged onto the library is found by GLUE Home**
  ([ADR 0125](../adr/0125-dropped-songs-placed-by-glue-home.md)). The browser never says where a dropped file is, so
  with GLUE Home running such a song was "added on its own": GLUE Home couldn't read it, and the tab left all
  analysis to GLUE Home, so it was never analysed. Now:
  - GLUE Home finds it by name and size, in the collection's music folders first;
  - in a music folder, it's that folder's song again; elsewhere, GLUE Home keeps its path and analyses it;
  - if GLUE Home can't find it, the tab analyses it itself.
- **"Waiting to go into the library" no longer cycles:** GLUE Home's background cache-filling isn't counted there, and
  an analysis the library already has isn't written (and synced) again.

## 2026-10-01 · "No file linked" finds the songs in your library (GLUE Home 0.39.1)
- **"No file linked" is a matching page** ([ADR 0124](../adr/0124-no-file-songs-matched-and-linked.md)). An Engine DJ
  import's playlists named duplicates removed since; most of those songs are in the library.
  - Each song with no file shows its likely match, with a certainty from title, artist, length, file name, album
    and size, and why.
  - "Link", "Not this one", another candidate, or a certainty filter with "Tick all shown" and "Link N…". Doubtful
    matches (another version, another artist, two as good) are left out of a bulk link unless included.
  - A linked song takes the playlist places, rating, notes and cues, and keeps the DJ library's record, so Engine
    DJ's next read doesn't bring the song with no file back.
  - "Show them as a list" gives the usual table.
- GLUE Home 0.39.1: the same song format (its engine keeps a linked record per computer in a shared collection).

## 2026-10-01 · Network folders that come and go; errors that say what's wrong (GLUE Home 0.39.0)
- **A music folder that can't be reached is away, not gone**
  ([ADR 0123](../adr/0123-music-folders-that-come-and-go.md)). A tester's Mac has all its music on network folders
  over Wi-Fi:
  - songs in an away folder are no longer marked missing by the analysis (saved and synced, for every song looked
    at);
  - GLUE Home leaves them for later instead of failing them (and no drive search);
  - their song info waits instead of failing (said once, tried again every 3 minutes);
  - a rescan that finds an empty folder where songs were keeps them;
  - a read that drops mid-file is tried again, never kept as "couldn't analyse".
- **Errors say what's wrong:** "needs GLUE Home 0.12" showed for any music folder GLUE Home couldn't reach. GLUE Home
  now says why: not reachable, or not allowed by macOS's privacy settings. Its window also says why analysed songs
  wait to go into the library.

## 2026-10-01 · Stop stops GLUE Home; a dropped folder is analysed (GLUE Home 0.38.0)
- **A folder dropped onto the library, with GLUE Home running, is analysed**
  ([ADR 0122](../adr/0122-stop-stops-everything-dropped-folders-found.md)). The browser never says where a dropped
  folder is, so GLUE Home searched every drive for it, once per song, and never kept the answer: nothing was
  analysed until the user quit GLUE Home. Now:
  - GLUE Home finds a dropped folder when it's dropped (its name and a song in it) and keeps it; its folder dialog
    asks if it can't;
  - it searches for any music folder once, not per song, and remembers what it finds.
- **A folder inside a music folder isn't added again** ("2025" inside "Music Collection"): its songs are there.
- **Stop stops everything:** offline, no analysis, sync or writes, and the local link answers only GLUE Home's
  windows, so GLUE in the browser carries on by itself as if GLUE Home were quit. Start goes back; Restart also
  starts the engine and the analysis over. (Stop only went offline for other devices.)

## 2026-10-01 · Engine DJ's databases on several drives are one found library
- Engine DJ keeps a database on every drive it's used with; the user's desktop has three (`C:\Users\…\Music`,
  `F:\`, `G:\`), listed as three "Engine DJ library" entries. GLUE already makes one source of an Engine DJ set, so
  "DJ libraries found" now shows one entry for it ("+ 2 more drives", the paths in its tooltip), led by the file GLUE
  Home follows (else the biggest). Add reads every database together (`combineEngine`); × takes the whole set off.

## 2026-09-30 · A found DJ library is listed once, and can be taken off the list
- **One entry per DJ library file.** The user saw one Engine DJ `m.db` four times under "DJ libraries found": the same
  file was reached by several ways (a music folder, the GLUE folder, remembered "Look in…" places, GLUE Home's followed
  libraries), each listed as its own. Entries that are the same file (the browser's `isSameEntry`, or the same app,
  name, size and date on GLUE Home's disk) are one now; the entry an import came from is kept.
- **× next to Add** takes a found library off the list, whichever way it's found again (`meta.djDismissed`, synced
  with the collection). "+ Import" still imports it by hand.

## 2026-09-30 · A main music folder for duplicates
- **Optional main music folder** ([ADR 0121](../adr/0121-main-music-folder.md)): right-click a music folder › "Make it the
  main folder", or pick it on the Duplicates page. Among duplicates, its copy is the one kept and shown, after grade
  and lossless (a lossless copy elsewhere still beats an MP3 in the main folder). The sidebar marks it "main".

## 2026-09-30 · One copy shown and used; Duplicates in bulk; one GLUE Home build per change
- **Only the best copy of a song shows and is used** ([ADR 0120](../adr/0120-one-copy-shown-and-used.md)): "Lower quality",
  "Not analysed yet", "Couldn't analyse" and "No file linked" leave out the other copies (the sidebar counts too).
  Playlists, imports and DJ lists show the best copy, and every playlist is rewritten to use it whenever duplicates
  change (an imported playlist too). "Use in playlists" is "Make it the best".
- **Duplicates in bulk:**
  - filters by type (by sound, marked by you, confirmed, probable) and by certainty (each group has a %);
  - "Tick all shown";
  - a bulk removal sets aside groups whose copies may be different versions (a version word in a title or file
    name, lengths more than 3 s apart, other artists) unless you include them.
- **Duplicates' rows line up:** the best copy is outlined, and its "Best copy" label takes the place of the button.
- **GLUE Home builds once per change:** a push to main with a new version publishes the release itself; no tag
  and no second 6-minute build.

## 2026-09-30 · Content beyond a wall is lossless; phones hide failed songs; scrolling loads what's on screen (GLUE Home 0.37.3)
- **"Caution: steep top end, with content beyond" is "Lossless" now**
  ([ADR 0119](../adr/0119-content-beyond-a-wall-is-lossless.md), superseding 0118). Content above the wall that follows
  the music, and a band under it that doesn't keep switching off (under 12 % of the loud moments), mean a lowpass in
  the master, not a lossy encoder. That covers 136 of your songs (Kame.wav, Dead Stylus.wav…). Checked on 10 of them
  and on 10 "Transcoded" songs, which stay transcoded. The note stays.
- **Fixed: on the laptop and the phone, songs that failed on the desktop showed in the library as "Not
  analysed"** (and "Not analysed yet" said 0). A song that failed for good on the computer that has it is under
  "Couldn't analyse" on every device.
- **Scrolling a big library:** Overviews and covers load newest first, and a row that scrolls away drops what it
  asked for (its file read, its place in the next batch from another computer's GLUE Home, its retries). A jump
  down the list loads the rows you land on at once, however many jumps came before.

## 2026-09-30 · A home master's steep top end is lossless; the analysis bar shows GLUE Home's queue (GLUE Home 0.37.2)
- **Fixed: a home master called "Caution: steep top end at 19.0 kHz, with content beyond"**
  ([ADR 0118](../adr/0118-mastering-lowpass-from-17-khz.md)). No drop-outs under the step and content above it that
  follows the music (20 dB under it): a mastering lowpass, "Lossless". `VERDICT_VERSION` 7 re-judges stored verdicts
  on open.
- **Fixed: the analysis bar said "Analysing · 0 left" while GLUE Home worked through 300 songs.** It showed only
  the browser's count of songs waiting; it shows GLUE Home's own queue now.
- **Fixed: Duplicates' buttons overlapped "in no playlist".** The column fits its buttons.
- Another browser on the computer looks for GLUE Home more patiently (2 s per port) and again every 15 s until it
  finds it, instead of once a minute (a busy computer could leave it on its own storage meanwhile).

## 2026-09-30 · Duplicates: versions kept apart; "Keep · not a duplicate" and "Mark as duplicates"
- **Fixed: an instrumental and the vocal, a studio and a live take, a 4- and a 7-minute version grouped as
  duplicates** ([ADR 0117](../adr/0117-duplicates-are-one-version.md)). Copies are duplicates only if they're the
  same version: the same version words in the title (or "live" in the album), and lengths within 10 s (6 % on long
  songs).
- **"Keep · not a duplicate"** on a copy in Duplicates takes it out of its group for good; clean up the rest.
- **"Mark as duplicates"** (song menu, two or more songs chosen) makes your own group, cleaned up like any other.
- **Fixed: double-clicking a row over an artist or album opened another song.** A name opens its songs only on
  a single click, a moment later.
- The test fixture `flac-96k-24.flac` is "Genuine hi-res: content to 46.6 kHz" (flat noise to 48 kHz), not
  "Upsampled"; the e2e tests that relied on the old label were changed on purpose (ADR 0116).

## 2026-09-30 · Quality: a quiet top end is still hi-res, and upsamples that passed are caught (GLUE Home 0.37.1)
- **Fixed: "FIREFLIES" (Doechii, 24/88.2 FLAC) called "Upsampled from 48 kHz"**
  ([ADR 0116](../adr/0116-hi-res-by-what-reaches-past-24-khz.md)).
  - Its music fades out before 24 kHz, but its own air and noise carry on to 44 kHz, 78 dB over 24-bit digital
    silence. A hi-res file is now judged by how far its content reaches above digital silence: past 30 kHz,
    genuine.
  - All 11 of your songs called "Upsampled" (the same album) are "Genuine hi-res" now.
- **Upsamples made with ffmpeg's default resampler were called "Genuine hi-res".** Its faint residue passed for
  content. Content that stops at 22 or 24 kHz and falls off a cliff is "Upsampled" now (checked with soxr and
  ffmpeg fakes of the same song).
- Stored verdicts are judged again when a collection opens, with no decoding. That covers warnings, failures
  and "Genuine hi-res", with the stored analysis from the browser or GLUE Home.
- A song that fails to analyse is tried once more before it's saved as "Couldn't analyse" (under load, one
  failure isn't proof, and a failed song leaves the library's lists).

## 2026-09-30 · The library: its place kept, links on names, no unreadable songs in it
- A song whose file can't be analysed is only in "Couldn't analyse", not in All tracks, Recently added, tags or
  Browse (its count too). Playlists keep what you put in them.
- The library keeps its place: a song's page and back (or another view and back) finds the table where it was.
- A playlist's numbers always show (they shared a class with the drag handle, shown only on hover).
- The phone's "All tracks" counts songs as the desktop does (one per song, not every copy of a duplicate).
- The Overview column's mini spectrograms and waveforms have no black background: the theme's shows through.
- An artist, album, genre or label clicked in the table shows that value's songs (the whole album, say). The
  second click on the one selected song still edits it.
- "Needs attention" is now "Lower quality", with a tooltip: it's for information.
- Tests: e2e `narrow.spec` (its place kept on 3,000 songs; an album clicked), `library.spec` (an unreadable file,
  the playlist's numbers).

## 2026-09-30 · The vault: one file for how GLUE works now; the name MCO retired
- **A new session reads far less.** It used about 40% of a Claude Pro session's budget just to understand
  GLUE (about 700 KB of vault). Now:
  - [SYSTEM.md](../SYSTEM.md) (13 KB) says how GLUE works today, in one place;
  - [handoff.md](handoff.md) is one rolling note (state, waiting on the user, next);
  - older handoffs and changelog entries are in [archive/](archive/);
  - feature files open with a "Now" section (the template too);
  - `CLAUDE.md` says to read only SYSTEM.md, the handoff and the roadmap, and to look up features and ADRs
    by term instead of reading them in bulk.
- **MCO → GLUE** in the docs and the vault (the lowercase `mco` file and setting names stay; data depends on
  them). ADR 0035 keeps the old name: it's the record of the rename. `features/mco-folder-backups.md` is now
  `glue-folder-backups.md`. The old `joaopmanso/mco` forwarding repo is retired; the local remote now uses
  the repo's exact name (`glue`), so pushes no longer say "This repository moved".

## 2026-09-30 · Edge shows what Chrome shows; phones off the collections' lists (GLUE Home 0.37)
- **Fixed: another browser on the desktop (Edge) opened its own storage, with every folder asking for
  permission** ([ADR 0115](../adr/0115-any-browser-takes-glue-homes-link.md)). GLUE Home now gives any GLUE page on
  its computer its link directly: Edge, signed in, opens GLUE Home's library (the GLUE folder, its music folders,
  no permission), as Chrome does, and afterwards at once on every visit.
- **Fixed: phones listed under a collection as "A computer no longer in your account · 0 songs".** Only a computer
  with songs or music folders sends its numbers; GLUE Cloud ignores a phone's; the old lines no longer show, and
  any computer's line can be taken off with its ×.
- Tests: GLUE Cloud (a phone's numbers ignored, a line taken off), e2e `homemode.spec` (a browser that never met
  GLUE Home signs in and opens its library), `shared.spec` (the lists).

## 2026-09-30 · Every device's profiles in one list; GLUE Home picks up new folders at once (GLUE Home 0.36.1)
- **Profiles are every device's** ([ADR 0114](../adr/0114-profiles-are-every-devices.md), amends 0113): all the
  profiles of all your devices show everywhere ("404", "404" and "Joao Manso" now); each device keeps its own
  choice; delete the extras from "Who's using GLUE?" and they're gone on every device. The profiles the first
  version dropped come back once.
- **Fixed: songs of newly added folders waited until GLUE Home restarted.** It looked for new songs at most
  every 5 minutes, and not while analysing; now songs added from a tab are looked for at once, also mid-run.
- Tests: GLUE Cloud's merge, the profiles put back, e2e `shared.spec` (profiles on two devices) and
  `homemode.spec` (a song added after "all analysed" is analysed within seconds).

## 2026-09-30 · Profiles are the account's artist aliases
- **Profiles are the same on every device** ([ADR 0113](../adr/0113-profiles-are-the-accounts-aliases.md)):
  artist aliases the account keeps (pick, create, rename, delete, BPM range), seen at once on the account's
  other devices. A first sign-in with none asks for one.
- **Fixed: the iPhone made "Joao Manso"** from the account's name. A device without a library of its own now
  uses the account's profile ("404"), or asks.
- The list is seeded once, from the first computer with a GLUE folder of its own: **open the desktop first**,
  so "404" keeps its id. After that, a device's own profiles the account doesn't have drop out ("Joao
  Manso", the laptop's own "404" becomes the account's).
- Nothing moved on disk: each GLUE folder keeps one library (its profile folder), which every alias opens.
  Backup and Cloud sync are the library's, on the "This computer" card.
- GLUE Cloud migration 0010 (`profiles`). Tests: the migration, GLUE Cloud's profiles, e2e `phone.spec` and
  `shared.spec`.

## 2026-09-30 · The account's collections: one box each, with its computers (GLUE Home 0.36)
- **Fixed: two "My collection · 0 songs · changed just now" boxes** ([ADR 0112](../adr/0112-the-accounts-collections.md)).
  - One box per collection, listing its computers: each one's songs, whether it's online (or when it was
    last seen), whether GLUE Home runs there, and its last change. The counts come from each computer after
    its sync (GLUE Cloud migration 0009).
  - Rename and Delete on the box. A rename reaches every device. A deletion asks for the name to be typed;
    every device then backs the collection up (`backups/pre-deleted-…zip`) and forgets it; GLUE Cloud keeps
    its data 30 days, then purges it.
  - The second box is the 8-song `c8f50116…`, made quietly: delete it from its box.
- **Fixed: a second collection could become the account's with nobody asked.** While the account has
  collections, the box asks (put into one, keep as its own, not now). "New collection…" is the account's own.
- Putting a collection into the account's joins it only once that worked.
- Tests: GLUE Cloud (numbers per computer, rename, deletion with 410 and purge); e2e `shared.spec` (heavy):
  one box with both computers' numbers, a new collection, a rename, a deletion the laptop follows with a
  backup.

## 2026-09-30 · One meaning of "not analysed", GLUE Home's analyses on screen, folders take their songs (GLUE Home 0.35)
- **Fixed: "Not analysed yet 0" while Stats said 903** ([ADR 0109](../adr/0109-one-meaning-of-not-analysed.md)).
  - One function says where a song stands: done, couldn't analyse, waiting, on another computer, or no
    file. The sidebar, its views, Stats, the analysis bar and both queues (the tab's and GLUE Home's) count
    with it.
  - New "Couldn't analyse" entry in the sidebar (only when there are some). "Analyse now" tries them again.
  - Stats says why songs aren't graded: waiting, couldn't analyse, no file, on another computer.
  - Failures that aren't the file's fault (took too long, out of memory, the worker stopped) are never
    stored, and are tried up to three times a session. The ones already stored (297 on the desktop) are
    analysed again, with no migration.
- **Fixed: songs with a label but no Overview, and song pages that analysed again**
  ([ADR 0110](../adr/0110-screen-takes-glue-homes-analyses.md)).
  - In Home mode the Overview, the waveform and a song's details come from GLUE Home's cache when the
    browser has none, also for songs analysed while no tab was open.
  - A song page there never analyses in the tab: it asks GLUE Home to do it now, and says so.
  - Writing song info into a file restamps its cached analysis, so it isn't analysed again.
- **Fixed: removing a music folder left its songs as "No file linked"**
  ([ADR 0111](../adr/0111-removing-a-folder-removes-its-songs.md)).
  - Its songs on this computer now leave with it (a song another computer has stays). The question says
    what goes with them: "4 songs, 1 rated, 1 in 1 playlist".
  - Songs already left with no file get a bar once per collection: "Remove them" (after a backup,
    `backups/pre-orphans-….zip`) or "Keep them". On the desktop that's the 484 from F:\preparation and
    F:\temp.
  - The song page says why a song has no file (a DJ library, added on its own, its folder removed).
- Tests:
  - unit tests: `analysisState`, and what a removal takes with it;
  - e2e `library.spec`: the removal question's counts, the folder's songs gone, the orphans bar once;
  - e2e `homemode.spec` (heavy): a stored time-out analysed again by GLUE Home; with a tab opened later,
    the Overviews and a song page come from GLUE Home's cache.

## 2026-09-30 · One id per computer, and the desktop's songs put back under it (GLUE Home 0.34)
- **Fixed: the desktop's songs were written under a stand-in ("this-computer")** ([ADR 0108](../adr/0108-one-id-per-computer.md)).
  - What happened: a tab opened before sign-in finished, and Edge's own private library claimed the
    desktop's entry. After that, GLUE Home saw every one of the desktop's songs as another computer's: it
    stopped analysing them, and other devices couldn't stream them.
  - GLUE Home now learns its computer: from GLUE Cloud (`GET /v1/computer`), or from the music folders it
    found on this disk (then it vouches for it). Activity says which, or why it can't tell.
  - Only the GLUE folder recorded for a computer writes its copies, analyses, folders and entry. An unknown
    computer writes none of them, and nothing is ever written as "this-computer".
  - **The repair, once, with a backup first** (`backups/pre-repair-…zip`): the stand-in's copies,
    analyses, folders and libraries become the computer's; a song that was twice in TO BE SORTED is once,
    with its playlist places kept; the computer's entry names its own folder again. It's sent up to GLUE
    Cloud like any edit.
  - A browser that kept a library in its own storage opens GLUE Home's on a computer where it runs.
  - Requests from other devices that name the wrong profile folder still find the collection.
  - A merge of two browsers moves GLUE Home's companion with them.
- **GLUE Home 0.34.1:** in its settings, the page picked in the list stays marked when the pane can't
  scroll it to the top ("Updates" lost its mark to a hidden "Received").
- **Fixed: "Analysis done" every minute.** It now tells only what that run did, and only when it did
  something.
- Tests:
  - unit tests: who may write a computer's parts, and the repair (a store shaped like the desktop's data);
  - `/v1/computer`, and the companion following a merge;
  - e2e `identity.spec` (heavy): GLUE Home vouches, repairs, and GLUE Cloud gets it; a browser's own
    library gives way to GLUE Home's;
  - `homemode.spec`: a second run with nothing to do says nothing.

## 2026-09-29 · GLUE Home and the browser no longer run out of memory while analysing (GLUE Home 0.33)
- **Fixed: GLUE Home and Chrome crashed while analysing** (since 0.31,
  [ADR 0107](../adr/0107-sync-looks-only-at-what-changed.md)).
  - Every push to GLUE Cloud (every 25 analysed songs) read and parsed the whole collection, and rewrote a
    sync state as big as the collection. Measured on 13,000 songs: 21 MB read and 22.6 MB written per push.
    Now 1.3 MB and 0.66 MB, about the changed songs' files.
  - The sync is told which files changed (what the store wrote). Every file is looked at on the first
    sync and every 30 minutes.
  - The sync state keeps each file's agreed copy on its own; the old single file is split once.
  - Taking changes in reads only the files they touch.
- **Fixed: a song's 2-minute limit ended every analysis running** (since 0.3.1, much worse with 12 at a
  time). Songs running when it fired failed as "took too long", or hung. Now the limit is cancelled when the
  song finishes, and ends only its own worker.
- Comparing songs ignores the order of their fields (two stores never send a song back and forth).
- Tests: `tests/syncCost.test.ts` measures bytes read and written per push and per pull on a 13,000-song
  library.

## 2026-09-29 · GLUE Home online again for streaming (GLUE Home 0.32)
- **Fixed: GLUE Home could stay offline for the account's other devices.** Since 0.28 it reads its settings
  fresh at start-up. Settings that never said "running" (Start or Stop never pressed) counted as stopped.
  - It never joined the signaling room, so nothing streamed from it: no waveforms, details or playback on
    the laptop or phone.
  - Analysis, the local link and the desktop's tab all kept working.
  - Now only an explicit Stop stops it.
- **The track page says why a song can't stream here:** no GLUE Home on that computer is connected to the
  account, or it's offline (and when it was last seen).
- Tests: GLUE Home with no "running" in its settings goes online, and stays connected when other settings
  are saved (it fails on 0.31).

## 2026-09-29 · The account's collection as a snapshot and a log: real-time sync, few rows (GLUE Home 0.31)
- **GLUE Cloud keeps each shared collection as a snapshot and a log of changes**
  ([ADR 0106](../adr/0106-shared-collection-as-a-snapshot-and-a-log.md); supersedes the pacing of 0105).
  - A push is one row, however many songs.
  - Of a file of songs, only the songs that changed are sent, not the whole file.
  - Now and then the device that pushed folds the log into the snapshot.
- **No more waiting:** changes go up within seconds, while analysing too, and the account's other devices
  are told at once.
- A full analysis of a large library now costs a few thousand rows written, not ~80,000.
- **Moving over:** what's in GLUE Cloud becomes each collection's snapshot. A GLUE tab or GLUE Home from
  before is told to update when it tries to push (410).
- **Admin:** the cloud card also counts the changes in the log.
- **Tests:** the sync engine's unit tests and the shared, phone and GLUE Home end-to-end tests now run GLUE
  Cloud's real code on an in-memory SQLite (`tests/sharedCloud.ts`), in place of three hand-written
  stand-ins.
  - New unit tests: a push is one entry; a rating sends one song; a long log is folded and a new device
    reads snapshot then log; state from before the log; the old push refused.
  - The cloud API tests: the log, stale entries, checkpoints, limits.

## 2026-09-29 · Fewer cloud writes, faster analysis (GLUE Home 0.30)
- **Pushes to GLUE Cloud are paced** ([ADR 0105](../adr/0105-pace-cloud-pushes-and-analyse-more-at-once.md)).
  - Before, each batch of 25 analysed songs re-sent ~50 whole files: about 90,000 rows written in a day,
    against the free plan's 100,000.
  - Now, while GLUE Home analyses (or right after a scan or a big removal), only the user's own edits go
    up at once. The rest goes at most once an hour, and when the work ends.
  - A tab without GLUE Home pushes at most every 10 minutes while it analyses.
- **GLUE Home analyses more songs at once:** the computer's threads less 4, from 2 to 12 (it was at most
  4). "Songs at a time" in GLUE Home's Activity sets it (1–24).
- Tests: unit (the pacing; a push of some files, or none); e2e (the setting).

## 2026-09-29 · GLUE Home is the library's engine (GLUE Home 0.29)
- **On a computer with GLUE Home, GLUE Home writes the library and the website is its screen**
  ([ADR 0104](../adr/0104-glue-home-is-the-librarys-engine.md)).
  - Every change made in the tab goes to GLUE Home's engine and is saved there: playlists, ratings, tags,
    notes, song info, removing songs or folders.
  - GLUE Home analyses (the tab no longer does), and the tab shows its progress ("by GLUE Home") and its
    results, with waveforms and details.
  - Closing the browser stops nothing that was asked.
  - No account needed for any of this (the local link's new `/rpc`).
- Removing thousands of songs no longer waits on this browser's cache.
- Still in the tab for now: scanning folders, importing DJ libraries, writing song info into files (their
  results already go to GLUE Home). Next: those on GLUE Home, the "GLUE Home isn't running" bar with the
  browser fallback, and other devices' requests.
- Tests:
  - unit: the same changes, made directly or sent as ops, give the same files;
  - e2e: GLUE Home's real service page as the engine for a tab with no account (analysis, details, a
    rating and a playlist it writes, Stop and Resume, removing with the tab closed).

## 2026-09-29 · Music folders no longer lost after a refresh (GLUE Home 0.28)
- **Fixed: music folders added in Home mode came back as "missing" after a refresh.**
  - GLUE Home's background folder search saved the settings it had read *before* it searched. That put
    every folder back at its old place, over a folder just picked with "Add folder".
  - Now it saves only folders it found anew, never one the settings changed meanwhile.
  - Every settings write of GLUE Home's service reads the current settings first and changes only its own
    keys (`bridge.patchConfig`), and it listens for changes before its first write.
- The start of the bigger change the user asked for: GLUE Home as the library's engine, the website as
  its screen (the plan: `plan-shared-collection`, and the steps in the handoff note).
- Tests: unit, a search's folders never over one picked meanwhile.

## 2026-09-29 · "Analyse now" is always there
- **Right-click "Analyse now" and the selection bar's "Analyse now" are always offered** for songs with
  a file, and analyse them again even if they're analysed already (the user asked). Before, they showed
  only for songs not analysed yet, and the button only with background analysis off.
  - This computer's songs: here, or by its GLUE Home in Home mode.
  - Another computer's: by that computer's GLUE Home ([ADR 0103](../adr/0103-glue-home-analyses-its-computers-songs.md)).
- Tests: an analysed song analysed again from its menu.

## 2026-09-29 · GLUE Home analyses the library, Stop, Analyse now, GLUE Home's Activity (GLUE Home 0.27)
- **GLUE Home analyses its computer's songs, also with the browser closed**
  ([ADR 0103](../adr/0103-glue-home-analyses-its-computers-songs.md)).
  - With no GLUE tab open, it puts the analyses into the library itself, and they're synced.
  - With a GLUE tab open in Home mode (signed in), that tab leaves the analysis to it, takes the results
    in with their details, waveforms and fingerprints, and shows "by GLUE Home".
- **Right-click "Analyse now"** also for another computer's songs: that computer's GLUE Home does them
  first.
- **Stop** in the library's analysis bar stops at once and turns background analysis off. In Home mode
  the switch pauses and resumes GLUE Home too.
- **GLUE Home's window: Activity.** What it's analysing, how many are left, how many wait to go into the
  library, Pause / Resume, what happened lately. Each new event shows as a toast: songs being analysed,
  a song received, analyses put into the library, changes from other devices.
- Fixed:
  - stopping an analysis stored the song being analysed as failed;
  - GLUE Home's analyses carried no file date, so they could never count as the song's.
- Tests:
  - unit: an analysis as data;
  - e2e: GLUE Home with no tab analyses into the library and says so; a tab in Home mode leaves it to
    GLUE Home, takes the results in (its cache too), and pauses and resumes it; Stop; GLUE Home's
    Activity, toasts and Pause.

## 2026-09-29 · Caches follow a collection; turning cloud sync off (GLUE Home 0.26, GLUE Cloud migration 0007)
- **Waveforms, analyses, fingerprints and covers follow a collection** when it's put into the account's
  ([ADR 0102](../adr/0102-caches-follow-and-cloud-sync-off.md)): in the browser's cache, and in GLUE
  Home's own (once, soon after it starts).
- **Turning cloud sync off asks first:**
  - this computer keeps its collections and stops syncing them;
  - in a browser's storage only, a copy can be downloaded;
  - a checkbox also deletes the account's copy from GLUE Cloud in 30 days. A device still syncing it, or
    turning sync on again, cancels that.
  - GLUE Cloud removes what's due once a day.
- A profile with cloud sync off isn't synced, by the tab or by GLUE Home.
- Fixed:
  - a checkbox squeezed to nothing on the start page;
  - GLUE Home's settings marking the page above a short section after a jump to it.
- Tests: the e2e browsers are dark, as the laptop is (CI's runner is light).
- Tests:
  - unit: the cache move (renamed songs, packs left to be made again); the 30-day deletion, cancelled by
    a sync;
  - e2e: the laptop's analyses under the account's collection after "Put into"; the desktop turning
    sync off.

## 2026-09-29 · One sync: cloud sync on means your collections are your account's (GLUE Home 0.25)
- **No more Share or Move buttons** ([ADR 0101](../adr/0101-cloud-sync-is-the-accounts-collections.md)).
  With cloud sync on and signed in, a collection becomes the account's when it opens, and syncs with
  every device.
  - If the account already has collections and this computer's has songs of its own, a box asks once:
    put this computer's songs into the account's collection (the same songs become one), keep it as a
    collection of its own, or not now.
  - A new, empty profile just takes the account's collection.
- **A phone (or any browser with no library of its own)** keeps the account's collections in the
  browser's storage, and opens, edits and streams them. It stays a session, not a device, and isn't
  listed as a member of the collection.
- **The old sync is gone** from the site, GLUE Home and GLUE Cloud's routes:
  - each device's own cloud copy;
  - merged collections and the merged view;
  - the queue of edits for other computers.
  The old tables in GLUE Cloud are untouched for now (dropping them waits for the user's go-ahead).
- The admin panel counts the account's collections; "Clear cloud data" clears them.
- Fixed:
  - a collection could become the account's before GLUE Cloud's list of collections arrived, making a
    second one;
  - GLUE Cloud's answers are checked before anything changes here.
- Tests:
  - the shared e2e tests without buttons (automatic, the box);
  - the phone test on the new model (browser storage, streaming, a rating and a title going up);
  - the cloud unit tests on the shared routes.
  The old sync's tests went with it.

## 2026-09-29 · After the first real try: one row per song, own copies only, the account menu, faster tests
- **What went wrong on the user's first try** (from the laptop's GLUE folder):
  - two sync systems ran at once: the old per-device upload dropped the desktop's cloud copy when it
    moved into the shared collection;
  - caches are kept per collection id, so the move lost the waveforms and analysis details;
  - GLUE Home doesn't analyse for the library, so analysis stopped when the browser closed;
  - "Music" and "Music Collection" on the desktop are two real copies on disk.
  The fix is planned in `plan-shared-collection` (one sync only, GLUE Home as the computer's server).
- **One row per song** ([ADR 0100](../adr/0100-one-row-per-song-and-own-copies.md)):
  - All tracks, tags, browsing and Recently added show a recording once, its best copy, with the N×
    badge;
  - choosing another copy ("Use in playlists") makes it the row;
  - playlists, music folders, Duplicates and the "needs…" views still show every copy.
- **In a shared collection, removing a song removes only this computer's copy**: another computer's
  copy, its analysis and its playlists stay. Removing a row of All tracks removes every copy of that
  song on this computer.
- **Another computer's copy shows where it is** (computer, folder, path) in Duplicates and on the
  song's page.
- **Phone: the account menu stays on screen** (it opened to the left of a button on the left).
- **Tests:**
  - the e2e suite runs in two projects (heavy tests two at a time);
  - test browsers have no GPU process and one analysis worker;
  - per-test times are written to `test-results/durations.json`.
  One test keeps this laptop busy on its own, so the suite is bounded by its total work, not by
  parallelism.

Older entries: [archive/changelog-2026-09-23-to-28.md](archive/changelog-2026-09-23-to-28.md).
