---
updated: 2026-09-30
---
# Changelog

Newest first. Each entry: date, milestone, what changed, links.

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
