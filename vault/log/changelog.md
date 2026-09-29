---
updated: 2026-09-29
---
# Changelog

Newest first. Each entry: date, milestone, what changed, links.

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

## 2026-09-28 · The shared collection, step 5c: every computer's DJ libraries
- **In a shared collection, every computer's DJ libraries show on every device**, with that computer's
  name and a computer icon ([ADR 0099](../adr/0099-dj-libraries-belong-to-their-computer.md)).
- Their playlists can be imported into GLUE from any device, and reach every device.
- Only the library's own computer reads it again, follows it, or removes it. Another computer's same
  DJ app is a different library, and its playlists are never taken as this one's.
- Tests:
  - unit: a library read here is this computer's; a moved-in one too;
  - e2e: the desktop's rekordbox library on the laptop, with "Desktop" and no Refresh, and its
    playlists imported from the laptop reach the desktop.

## 2026-09-28 · The shared collection, step 5b: duplicates on every device
- **The 2×/3× badge now shows on another computer's songs** in a shared collection
  ([ADR 0098](../adr/0098-duplicates-across-computers.md)): each computer publishes the same-recording
  matches among its own songs with the collection, and every device joins them to its own.
- Tests: e2e, the desktop's two rips of one recording are one group on the laptop, which has no music.
- Testing note: the ffmpeg e2e tests read `FFMPEG` as ffmpeg's path. Run the suite without
  `FFMPEG=1`, or those tests are skipped.

## 2026-09-28 · The shared collection, step 5a: GLUE Home keeps it up to date (GLUE Home 0.24)
- **With no GLUE tab open, GLUE Home syncs this computer's shared collections**
  ([ADR 0097](../adr/0097-glue-home-syncs-shared-collections.md)): as soon as GLUE Cloud says another
  device changed one, and every minute. It never writes while a tab holds the lease.
- **Song info edited on any device goes into every computer's own file:** the edit marks each other
  computer's copy, and that computer's GLUE Home (or its tab) writes it, then sends back the file's new
  date.
- GLUE Home streams songs of shared collections, finds their music folders, and makes their waveforms.
- Clashes GLUE Home meets are shown by the next GLUE tab on that computer.
- **Fixed: a newly added song could be lost when leaving the library.**
  - While songs were being analysed, saving kept being put off, so a scan's songs could sit unsaved
    for a long time.
  - Closing the collection saved only what was waiting when that save started. What the analysis
    marked meanwhile was never saved: the next save was for the next collection.
  - Now a save is never put off more than 3 s, and closing saves until nothing is left. This was the
    intermittent "batch 1" e2e failure.
- Fixed: "Share" while songs were still being analysed could put the old form back over the shared
  one (the collection is now closed while it changes form, and while it moves in).
- Fixed: a stand-in GLUE Cloud answering the shared list oddly broke the page (the list is checked).
- Tests:
  - unit: other computers told to write changed song info; which member a GLUE folder is;
  - e2e: GLUE Home's real service page with no tab takes in the laptop's rename, writes the tag, and
    sends back the file's new date.

## 2026-09-28 · The shared collection, step 4: merged collections move over
- **Once one device of a merged group shares its collection, the others get "Move into shared “…”"**
  in the collection bar ([ADR 0096](../adr/0096-move-merged-collections-into-the-shared-one.md)):
  - a backup of the profile first (`backups/pre-shared-…zip`);
  - this computer's songs join the shared ones: the same song gets this computer's copy (and a rating
    or notes set only here), and the others come in;
  - playlists and folders with the same place and name become one; the others come in;
  - analyses, music folders and DJ libraries come along as this computer's;
  - the old collection stays in the GLUE folder, out of the list, and is no longer uploaded.
- Tests:
  - unit: the move, shaped like two computers' collections (same songs, same playlists, an id taken,
    a DJ library), done twice, and in a GLUE folder;
  - e2e: a laptop merged with the desktop moves in; the songs are there once each, and its playlist
    reaches the desktop.

## 2026-09-28 · The shared collection, step 3: a clash asks
- **The same thing changed differently on two devices** (a playlist renamed on both, a song's title…):
  a box, bottom right, on the device whose change clashed
  ([ADR 0095](../adr/0095-ask-per-clash.md)).
  - It says what (the song or playlist, and the field), both values, and which device made the other
    change and when.
  - **Keep this device's** sends this one to every device; **Take the other's** leaves theirs;
    **Merge both** joins lists and text where that means something. "For all" answers them all.
  - Until answered the other device's value shows; the clash stays across reloads.
- Tests:
  - unit: settling a clash both ways, `setAt`, `mergeBoth`;
  - e2e: a playlist renamed on an offline laptop and on the desktop; the laptop keeps its name, and
    the desktop shows it.

## 2026-09-28 · The shared collection, step 2c: share a collection, add it on another device
- **"Share"** in the collection bar (signed in) makes the open collection one copy for all your
  devices ([ADR 0094](../adr/0094-one-shared-collection-in-glue-cloud.md)).
  - Its files become the shared form: each song with every computer's copy, analyses per computer,
    music folders per computer.
  - Then it goes up to GLUE Cloud.
- **Other devices "Add" it** from the collection menu. They see the same songs, playlists and edits:
  another computer's songs are shown as that computer's, and play from it when its GLUE Home runs.
- **Changes reach the other devices at once** (GLUE Cloud tells them), otherwise every 2 minutes:
  - changes on both sides are merged;
  - a real clash keeps the other device's change for now and says so (the prompt comes in phase 3).
- **What stays on the old sync:** a shared collection isn't in the per-device copies, and has no
  merged overlay.
- Other computers' songs are never downloaded here just to be analysed.
- Tests:
  - unit: a collection made shared on one computer and joined on another, as each sees it;
  - e2e: two browsers share, add, and a rating crosses at once.

## 2026-09-28 · The shared collection, step 2b: projection, merge and the sync engine
- `src/core/shared/merge3.ts` merges three ways ([ADR 0094](../adr/0094-one-shared-collection-in-glue-cloud.md)):
  - field by field;
  - each computer's own parts (a song's copy, its analysis, its music folders) are that computer's;
  - sets merge as sets, and playlist songs merge three ways;
  - a clash keeps the cloud's value and is reported.
- `src/core/shared/project.ts` shows a song as this computer sees it: its own copy, or a remote row
  pointing at a computer that has it. It writes back only this computer's copy.
- `src/store/shared/engine.ts` pulls what changed since the cursor (merging what changed on both
  sides) and pushes what changed here (stale files are merged and sent again). It keeps the agreed
  copy and the clashes in `cloud/shared/<cid>.json`, and runs the same in a tab and in GLUE Home.
- Nothing uses it yet (step 2c).
- Tests: merge3, the projection, and the engine against an in-memory GLUE Cloud with two devices
  (merges, clashes, deletions).

## 2026-09-28 · The shared collection, step 2a: GLUE Cloud's side (migration 0006)
- **GLUE Cloud can hold one copy of a collection for all the account's devices**
  ([ADR 0094](../adr/0094-one-shared-collection-in-glue-cloud.md)):
  - files at revisions, and "what changed since";
  - pushes that land only on the revision they saw (else "stale", to be merged on the device);
  - deletions kept 30 days;
  - online devices told at once through the signaling room.
- Nothing uses it yet; the site comes in step 2c.
- Tests: cloud (revisions, stale pushes, deletions and the bin, bundles, other accounts, limits).

## 2026-09-28 · Admin › Free tier
- **The admin panel shows how much of Cloudflare's free plan GLUE Cloud uses**
  ([ADR 0093](../adr/0093-free-tier-usage-in-the-admin-panel.md)): database size, rows read and
  written today, Worker requests today, relay (TURN) traffic this month, each against its limit.
- It needs a read-only token, `CF_ANALYTICS_TOKEN`, in the repository's secrets. Until then it shows
  the database size and says what to add.
- The drag-out e2e waits for the playlist's songs to be matched (it failed now and then).
- Tests: cloud (usage with Cloudflare stubbed, without the token, admins only).

## 2026-09-28 · The first question: how GLUE is used here
- **First run asks "How will you use GLUE here?"** ([ADR 0092](../adr/0092-first-question-how-glue-is-used.md)):
  - **Just this computer** (the default): no account, nothing leaves it;
  - **This computer, synced:** sign in, then the folder;
  - **This computer, with GLUE Home:** the installer, sign in, a code for GLUE Home, then GLUE
    Home's folder window;
  - **Open my library from another device** (the default on a phone): sign in only.
- "Just this computer" makes its profiles with cloud sync off, even when signed in.
- **The profile screen's "This computer" card** says which it is now, with the next step: turn on
  cloud sync, add GLUE Home, or stop syncing a profile.
- Tests: an e2e covers the four choices, the code for GLUE Home, and that a local-only profile uploads
  nothing while signed in (it fails without the change).

## 2026-09-28 · One device per computer; sessions (GLUE Home 0.23, GLUE Cloud migration 0005)
- **Two browsers on one computer are one device.** With GLUE Home running there, a browser finds it
  on 127.0.0.1 and joins the computer by itself; GLUE Home vouches for it
  ([ADR 0091](../adr/0091-computers-and-sessions.md)). Without GLUE Home: "This browser is on the
  same computer" in the other browser's menu in Devices.
- **Signing in only to browse (a phone) is a session:** not in Devices, and never in a merged group.
  Old ones with no songs are turned into sessions, and their empty collections leave the groups.
- **Admin › Sessions and devices:** every sign-in, whose it is, what it is, when last seen.
- Several GLUE Homes on one account stay, one per computer.
- The signaling room keeps one connection per device and tab.
- Tests:
  - cloud: sessions, promotion on upload, attach, same computer, several GLUE Homes, admin sessions;
  - e2e: a second browser joins the desktop through its GLUE Home's /attach.

## 2026-09-28 · Safety: a bin, guarded DJ-library re-reads, daily backups (GLUE Home 0.22)
- **Recently deleted** (sidebar, under the playlists): deleted playlists and folders, with
  everything inside, kept 30 days, whoever deleted them. Restore puts them back
  ([ADR 0090](../adr/0090-bin-guarded-re-reads-daily-backups.md)).
- **DJ libraries followed live:**
  - a playlist missing from a read leaves GLUE only if a read a minute later still lacks it;
  - a read with less than half the playlists is ignored (Engine DJ saving, a drive not plugged in),
    and GLUE says so.
- **Daily backups** of each profile in `GLUE/backups/auto/`, the last 14 kept: made by the open tab,
  or by GLUE Home when no tab is open.
- Tests:
  - unit: bin and restore, two-read and incomplete-read guards, daily backups;
  - e2e: delete a folder, restore it with its playlist, reload.

## 2026-09-28 · Playlists deleted everywhere: fixed (GLUE Home 0.21)
- **The cause** (reproduced in e2e): a device showing a merged collection kept its snapshot when the
  collection was reopened or switched. The next round of edits then looked like "every other
  device's playlist was deleted", and went to those devices
  ([ADR 0089](../adr/0089-edits-only-against-their-own-collection.md)).
- **Fixed:** sync lets go of a collection before it closes, and edits are only worked out against
  the collection they came from.
- **Deleting more than 3 playlists** (or more than a tenth) at once now asks first. That covers
  sending, cloud views, and edits arriving from elsewhere; GLUE Home leaves such deletions to a tab.
- **Tests:** the cloud sync e2e reopens a merged collection and checks that no deletion is sent (it
  fails without the fix).
- **Next:** a bin, confirmed DJ-library removals, daily backups, then the shared collection (see the
  plan in the handoff).

## 2026-09-28 · AIFF songs stream too (GLUE Home 0.20)
- **Another computer's AIFF songs stream** instead of downloading first ("getting it from Desktop…
  44%"). Chrome, Edge and Firefox don't play AIFF, so the page turns it into WAV a piece at a time
  as it plays ([ADR 0088](../adr/0088-aiff-streams-as-wav.md)).
  - Before, only the songs whose format the browser plays by itself streamed, which is why some
    started at once and others didn't.
- **GLUE Home 0.20:** its settings' "What GLUE Home was asked" updates within 2 s of each request.
- Tests:
  - `wavStream` unit tests: every range matches rewrapping the whole file;
  - the phone e2e plays an AIFF and checks GLUE Home was never asked for the whole song. It fails
    with AIFF streaming off.

## 2026-09-28 · The user's fourth list, batch L: edit other computers' songs (GLUE Home 0.19)
- **The laptop (or phone) can edit the desktop's songs:** title, artist, album, genre, label, year,
  grouping and comment, as well as ratings, notes, tags and playlists
  ([ADR 0087](../adr/0087-edits-reach-glue-home.md)).
  - The edit goes to the desktop, which keeps it as its own and writes it into the song's file.
  - Songs waiting in TO BE SORTED are edited once they're in a music folder.
- **With GLUE Home on the desktop, the edit arrives within seconds,** GLUE tab open or not:
  - with a tab open, the tab takes it in at once (GLUE Home tells it);
  - with no tab, GLUE Home applies it to the GLUE folder and the file itself.
- **The writer lease:** an open GLUE tab in Home mode tells GLUE Home every 5 s that it's the one
  writing the library.
- The song-info writing is shared by the website and GLUE Home (`store/writeInfo.ts`).
- Tests:
  - unit: info in edit ops;
  - e2e: a phone edits a desktop song's title, and it goes to the desktop's GLUE Home;
  - e2e: GLUE Home applies an edit into the GLUE folder and the file with no tab open, and leaves it
    while a tab holds the lease.

## 2026-09-28 · The user's fourth list, batch K: missing covers from public services (GLUE Home 0.18)
- **Songs with no cover in their tags get one looked up** ([ADR 0086](../adr/0086-covers-looked-up-by-glue-home.md)).
  - A GLUE Home of the account asks Deezer, then iTunes, then MusicBrainz's Cover Art Archive,
    automatically, one album at a time.
  - Only the artist and album or title go out, never audio.
  - A cover is taken only when the artist and album (or song) match.
- **Any device uses it**, including a laptop without GLUE Home, for its own songs. The covers are
  kept on the device, and never written into the files or the collection.
- **"Wrong cover"** on a song's page, for a looked-up cover: GLUE Home won't show or look for that
  album's cover again.
- GLUE Home only reaches those services, over https, from its Rust side (`web_get`).
- Tests:
  - `coverSearch` unit tests (matching, addresses, each service's answer);
  - the phone e2e: a looked-up cover shows, only the cover services were asked, and "Wrong cover"
    is remembered.

## 2026-09-28 · The user's fourth list, batch J: waveforms of other computers' songs (GLUE Home 0.17)
- **The Overview's waveform look works for the desktop's songs on the laptop and phone**
  ([ADR 0085](../adr/0085-waveforms-from-glue-home.md)). Before, it showed empty boxes.
- **GLUE Home keeps a waveform for each song:** from its own analyses, from the website on its
  computer (hand-over), or made from a full analysis it already has, without reading the song again.
- **Its background work** now also fills in songs that have no waveform yet.
- Tests: the phone e2e opens a song's page and checks GLUE Home kept its waveform.

## 2026-09-28 · The user's fourth list, batch I: playback first (GLUE Home 0.16)
From the user's tests with the relay on ([ADR 0084](../adr/0084-playback-first-on-the-link-to-glue-home.md)):
- **Playback first on the link to GLUE Home:**
  - what's playing goes ahead of covers, waveforms and analyses, which never take the last two
    places;
  - the music has its own data channel on the same connection, so a song page's full analysis
    can't stall it.
- **No silent whole-song download.**
  - The first stream check waits up to 25 s instead of 8, and a bad connection is made again once.
  - After that the player says what failed; before, streaming switched itself off for the visit.
- **Connection errors now list what each side offered** (local, public or relay addresses) and how
  far the connection got, to find out why 5G fails.
- **GLUE Home 0.16:**
  - a song is looked up once, even when the probe and its first parts ask together;
  - a connection that goes "disconnected" (a phone changing networks) gets 15 s to come back.
- **The streaming worker** takes over the page after a hard reload too.
- **Player:**
  - songs go on to the next on any page but the song that ended;
  - on a song's page, the spectrogram seeks only that song, and on a touch screen only on a tap
    (scrolling over it no longer moves the music).
- Tests: `candidateType` unit test; the phone, streaming and GLUE Home e2e suites.

## 2026-09-28 · The TURN relay is on
- The user created the Cloudflare TURN key; the repository secrets `TURN_KEY_ID` and
  `TURN_KEY_API_TOKEN` are in. The cloud workflow, run by hand, uploaded them to the Worker, and
  `/v1/turn` hands out relay credentials to signed-in devices ([ADR 0081](../adr/0081-turn-relay.md)).
  Streaming and sending songs should now work away from the home network (the user tests it on
  mobile data).

## 2026-09-28 · The user's third list, batch H: away from home, covers, GLUE Home's CPU (GLUE Home 0.15)
- **Streaming and sending songs away from the home Wi-Fi** ([ADR 0081](../adr/0081-turn-relay.md)):
  - GLUE Cloud hands out day-long credentials for Cloudflare's TURN relay (`GET /v1/turn`), from the
    owner's key in the repository's secrets;
  - the website and GLUE Home use them when a direct connection can't be made;
  - the relay can't read what it passes.
- **Covers on the phone** ([ADR 0082](../adr/0082-covers-from-glue-home.md)):
  - GLUE Home keeps covers: handed over by the website, found by its analyses, or read from a song's
    tags on request;
  - the phone asks for the rows on screen and keeps them;
  - never in GLUE Cloud.
- **GLUE Home 0.15** ([ADR 0083](../adr/0083-glue-home-activity-off-the-main-thread.md)):
  - its file work runs off the main thread;
  - its settings are kept in memory (they were read from disk for every request);
  - a streamed song's path is looked up once a minute;
  - Settings › Service › "What GLUE Home was asked" shows the counts since it started, with Copy.
- **Found while checking the CPU:** GLUE Home's own background analysis last ran on 2026-09-26. The
  steady load came from answering the open GLUE tab and the phone on its main thread.
- Tests:
  - Vitest: `/v1/turn` (no key, a key, port 53 left out, the service failing);
  - e2e `phone.spec`: a cover read from a song's tags by the desktop's GLUE Home shows on the phone;
    both ends ask for the relay;
  - e2e `home.spec`: the activity table and Copy;
  - Rust: the counts.

## 2026-09-28 · The user's third list, batch G: playlists by touch, tablets, iPhone playback
- **Playlists on phones and tablets** ([ADR 0079](../adr/0079-touch-layout-and-playlists-by-touch.md)):
  - new playlists and folders;
  - several songs picked at once (Select) and added to a playlist;
  - Edit: drag to reorder, ⊖ to remove with Undo;
  - rename, colour, move to a folder, duplicate and delete from a ⋯ in the top bar or the row;
  - names typed in a sheet, not the browser's prompt.
- **Tablets** (touch, no mouse) get the touch layout at any width, with sheets kept to a readable
  width.
- **iPhone:** songs start however long the stream takes to answer, and the next one plays by
  itself: they play on audio elements a tap has unlocked
  ([ADR 0080](../adr/0080-play-on-elements-a-tap-unlocked.md)). The message now says what the
  browser said, not always "can't play this format".
- A playlist's title on a phone is its own name; notices go by themselves after a few seconds.
- Tests: e2e `phone-ui.spec`:
  - playlists by touch (folders, select, drag, Undo, rename, delete);
  - a tablet (1024 × 768, touch).

## 2026-09-28 · The user's second list, batch F: the phone layout
- **On a phone the library is a phone app** ([ADR 0078](../adr/0078-phone-layout.md), [phone app](../features/phone-app.md)):
  - Tabs at the bottom: Library, Browse, Playlists, Search, More. Each tab remembers where it was.
  - Songs as two-line rows with their covers. A tap plays; ⋯ or a long press opens the menu.
  - Every menu is a sheet from the bottom, with the desktop's entries. So are the tag and genre
    pickers.
  - A mini player above the tabs opens the full player (cover, seek, shuffle, repeat, the queue).
  - A song's page (Details and Prepare), the calendar and an event open inside the same frame, with a
    way back. Nothing is wider than the screen.
  - Above 760 px wide nothing changes.
- **Fixed on the desktop too:**
  - Browse's find field was squashed to 3 px (a global `.bar` style);
  - "Add a note…" and the send panel now work from any page, not only the library table.
- Tests:
  - e2e `phone-ui.spec` (new, 390 × 844 with touch);
  - `phone.spec` now runs at phone size, with the phone controls;
  - `narrow.spec` checks that the phone layout at 600 and 420 px draws only the rows on screen.

## 2026-09-28 · The user's second list, batch E: the library on any device
- **Signed in on a device without a library** (a phone; no GLUE folder), the account's library opens
  by itself from GLUE Cloud, remembered for next time. Nothing is made on the device
  ([ADR 0077](../adr/0077-library-on-any-device.md)).
- **Cloud views play:** songs stream from a computer that has them. Ratings, tags, notes and playlists
  go to the owning computers.
- **Devices › Send songs…** works there too: from a phone to a computer's GLUE Home.
- Tests: e2e `phone.spec` (opens by itself, nothing made, streams, a rating queued, a song sent,
  reopens).

## 2026-09-28 · The user's second list, batch D: streaming (GLUE Home 0.14), macOS Cmd-Tab
- **Songs stream instead of downloading first** ([ADR 0076](../adr/0076-songs-stream-by-range.md)):
  - Home mode: from GLUE Home's local link, by byte range;
  - another computer's song: from its GLUE Home over WebRTC, through GLUE's streaming service
    worker, 512 kB first and then 2 MB at a time;
  - seeking asks for the part it needs.
  - AIFF in Chrome and older GLUE Homes still come whole.
- **GLUE Home 0.14:** answers ranged requests. On macOS it stays in Cmd-Tab and the Dock while its
  windows are open.
- Tests: e2e: the desktop's song streams through `__stream/` (real service page, WebRTC); Home mode
  reads only ranges.
- Also: the account e2e ignores a GLUE Home running on the test computer.

## 2026-09-28 · The user's second list, batch C: genres and browsing
- **Genres picked like tags:**
  - the collection's, those added before, and common ones; a new one is added by typing it;
  - from the Genre cell (a slow second click), the song menu (several songs), or the track page;
  - written into the files like other song info ([song info](../features/song-info.md)).
- **Browse** under All tracks: Artists, Albums, Genres, Labels and Years, each value with its songs
  and length; find, A–Z or most songs; a value opens its songs, with a way back
  ([browse](../features/browse.md)).
- Tests: Vitest `browse.test`; e2e batch C.

## 2026-09-28 · The user's second list, batch B: the promo WAV at 20.3 kHz
- **Measured** (read-only) on the user's promo WAVs and on MP3/AAC transcodes of one of them
  ([ADR 0075](../adr/0075-drop-outs-under-a-wall.md)).
  - Content moving above a wall is in both (decoders leak it).
  - What separates them: MP3 encoders keep switching off the band just under the wall in loud moments
    (25–57 %); the masters never do (0 %).
- **The promo WAV now reads lossless** ("Steep top end at 20.3 kHz", info). MP3 transcodes read
  "Transcoded", including two near 20 kHz that were only cautions.
- `VERDICT_VERSION` 5: stored cautions and suspects are worked out again.
- Tests: synthetic steady and drop-out walls at 20.3 kHz; parity unchanged.

## 2026-09-28 · The user's second list, batch A: quick fixes
- **The tags pop-up** fits the window with many tags, opens upward when there's more room, and
  scrolls inside ([tags](../features/tags.md)). It ran off the bottom.
- **Playlist insights' tempo** uses the BPM the rows show (70, not 70–140)
  ([playlists](../features/playlists.md)).
- **Renaming a playlist** by clicking its name again after a moment.
- **"Not a problem"** on a song's verdict (its page, or the song menu for several): shown as
  "Marked fine" everywhere while GLUE's verdict stays the same ([quality tiers](../features/quality-tiers.md)).
- **Probable duplicates:** "Same recording" confirms a group, which can then be moved or deleted
  like one. Probable groups follow edited names at once ([duplicates](../features/duplicates.md)).
- The plan for the whole list: [handoff](2026-09-28-handoff.md).
- Tests: e2e batch A (the mark, rename, confirmation, the pop-up's size); Prepare (the tempo with a
  60–120 range).

## 2026-09-27 · The user's list, batch 7: events and reminders (GLUE Home 0.13)
- **A Calendar tab** ([events](../features/events.md), [ADR 0074](../adr/0074-events-calendar.md)):
  - a month of events, what's coming and what's been;
  - an event's details: when, my set, where, lineup, flyer, link, notes, status, reminder days.
- **An event's music:**
  - its own folder in Playlists (Events › '2026-10-03 · Lux') for versions of playlists made for it;
  - playlists assigned to it;
  - each timed against the set; Play; Stats….
- **Needs music:**
  - a banner above the library and the calendar, and a count on the Calendar tab;
  - GLUE Home 0.13 sends a desktop notification once a day per event (hourly look; Check now in its
    settings).
- **Also:**
  - selecting a playlist opens the sidebar folders above it;
  - the event page shows GLUE's notices.
- **Fix:** ▶ on the row of the song its track page had loaded only resumed it, with nothing after it.
  Now the rest of that list follows it (the table, Duplicates, the playlist builder;
  `nowPlaying.resumeFrom`).
- Replaces the planned "shows & sessions".
- **GLUE Home 0.13.1** is the release. 0.13.0's build stopped on Tauri's version check:
  - installing `@tauri-apps/plugin-notification` (2.5) had also moved `@tauri-apps/api` to 2.12;
  - crates.io has `tauri` 2.11 and `tauri-plugin-notification` 2.4.
  - Both npm packages are now pinned to those minors (`~`).
- Tests:
  - Vitest `events.test`;
  - e2e `events.spec` (calendar, folder, assign, version, flyer, delete, reminder);
  - `home.spec` (GLUE Home's reminders).

## 2026-09-27 · The user's list, batch 6: stats, and a 3D view you can move
- **Stats** ([stats](../features/stats.md)):
  - for the collection (a chart button by its name), or "Stats…" on a playlist or folder, a tag, a
    music folder, a DJ library or one of its playlists, a device, a Library entry, or several
    selected songs;
  - songs, playtime, size; artists, albums, labels, genres; verdicts and formats; tempo and keys; top
    genres, artists and labels; years of release; songs added per month; rated and tagged.
- **The live 3D view is on the GPU** (three.js, [ADR 0073](../adr/0073-3d-view-on-the-gpu.md)), on
  Details and Prepare:
  - drag to turn, wheel to zoom, right-drag to move, "Reset view";
  - frequency labels along the front;
  - redrawn only when something changed.
  - It's the first step of M7 phase 2.
- Tests:
  - Vitest `stats.test`;
  - e2e: stats from the button and menus; 3D drawn, turned, zoomed and reset; Prepare's 3D.

## 2026-09-27 · The user's list, batch 5: editing song info (GLUE Home 0.12), and covers
- **Song info** ([ADR 0071](../adr/0071-song-info-written-through-glue-home.md), [song info](../features/song-info.md)):
  - edit title, artist, album, genre, label and year in the table in place: F2, or a slow second
    click; Tab goes on, Esc drops;
  - "Edit info…" for several songs at once, "(mixed)" where they differ; "Edit info" on the track
    page;
  - kept in GLUE at once. GLUE Home 0.12 writes it into the files (`POST /fs/tags`, lofty): at once
    in Home mode, otherwise when it next connects. A dot marks what isn't in the file yet;
  - the song isn't analysed again: its size, date and stored analysis follow the file;
  - an edited field is never filled in again from the file or a DJ library.
- **Covers** ([ADR 0072](../adr/0072-covers-from-the-tags.md)):
  - found at analysis (mediabunny reads the tags), kept as 64 and 320 px JPEGs by hash in the
    browser's cache;
  - a Cover column (hover to enlarge), and on the track page;
  - songs analysed before get theirs as they come on screen, from their tags only (byte ranges
    through GLUE Home).
- Tests:
  - Rust (tags per format, the cover kept);
  - Vitest (edited fields stay, the stored analysis follows the file);
  - e2e: song info in Home mode; covers.
  - New fixtures `mp3-cover.mp3`, `flac-cover.flac`.
- **Fix:** a ⋯ menu in a sidebar that had to scroll to show it closed the moment it opened. Menus now
  close on a scroll only when what they were opened on moves ([right-click menus](../features/context-menus.md)).

## 2026-09-27 · The user's list, batch 4: GLUE Home 0.11, a desktop window; cleaning up duplicates
- **GLUE Home's window** is a desktop app's: a header, the pages on the left, one pane that scrolls.
  760 × 540, at least 640 × 460, no scroll bars on the window.
- **Duplicates** ([ADR 0070](../adr/0070-glue-home-cleans-up-duplicates.md)), with GLUE Home:
  - per group, or several ticked groups from a bar: "Move the others…" (into GLUE Home's new
    Duplicates folder) or "Delete the others…" (the Recycle Bin), after a confirmation that lists
    the files, the space and the DJ libraries that still list them;
  - the best copy stays and takes over the others' playlists, rating, notes, tags and Prepare;
  - "Use in playlists" makes a copy the best.
- **Playlists imported from a DJ library** show its app's badge in the Playlists pane (the user's
  follow-up).
- Tests: Rust `cargo test` (the move); e2e: the clean-up in Home mode (move, and recycle from the bar),
  and GLUE Home's window at its smallest.

## 2026-09-27 · The user's list, batch 3: quality false positives
- **Measured on the user's two files** (read-only, GLUE's own analysis) ([ADR 0069](../adr/0069-content-beyond-a-wall.md)).
  - **The WAV** ("Lossy audio in a WAV wrapper"): a 17.3 kHz wall, but content beyond it that
    follows the music, 10–20 dB above the 16-bit floor. It's now a caution: "Steep top end at
    17.3 kHz, with content beyond".
  - **The MP3** ("Upconverted"): 192 kbps CBR by LAME 3.99.5 (not 320), cut at 17.0 kHz, where LAME
    keeps 18.6+ kHz at that rate. The verdict stays. The specks above 20 kHz sit around −115 dB,
    64 dB under the music: decoder rounding, now explained in the finding.
- `VERDICT_VERSION` 4: stored cautions and suspects are worked out again.
- Tests: synthetic verdict tests (a wall with content on the kicks; without; lossy specks).

## 2026-09-27 · The user's list, batch 2: duplicates at once, column widths, the Overview as a waveform
- **Duplicates show the moment a collection opens:** the last result is kept, fingerprints are
  packed per shard, and only songs fingerprinted since are matched again (`findMatchesFor`, the same
  result as a full match for them) ([duplicates](../features/duplicates.md)). It took one or two
  minutes with thousands of songs.
- **Columns:** drag a header's edge to resize; double-click it to fit its content; kept per
  browser.
- **Overview:** right-click its header for Spectrogram or Waveform (the Prepare page's colour
  schemes). The mini waveform is made from the analysis spectrogram (at analysis time, and from the
  stored analysis for older songs), so nothing is decoded again
  ([library](../features/library-scanner.md)).
- **Fix:** each collection's queue is restored as it opens, before its songs show. A song
  started straight after "Back to the library" could have its new queue overwritten by the restored
  one.
- Tests: unit (incremental match, packs, mini waveform); e2e batch 2 (new) and the duplicates test
  (kept result, at once after a reload).

## 2026-09-27 · The user's list, batch 1: quick fixes
From the user's list (the plan's batch 1):
- **The selection bar never moves the rows:** one fixed-height line; the actions always there,
  greyed out until songs are selected. A double-click used to open the wrong song as the rows
  jumped.
- **Details:** "In playlists" shows two and "+N more".
- **Pairing:** a Copy button beside the code.
- **The profile screen:** "← Back to the library", and the GLUE logo goes back too.
- **Prepare by default** once used (until Details is chosen again).
- **The queue:** "Next from" reorders by dragging, grips, "Move to the top" and "Play next";
  "Played before" folds, with Clear.
- **The sidebar folds away** (a button, or Ctrl+B) for more columns.
- **DJ libraries show their app's badge,** drawn for GLUE.
- Tests: e2e batch 1 (new); the copy button in the account test; the badge in the DJ-library test;
  unit `placeLater`.

## 2026-09-27 · Fix: a narrow window froze the page
From the user: narrowing the window below ~850 px froze the page until a reload.
- **Cause:** below 800 px the layout lost its fixed height, so the song table grew as tall as all its
  rows and drew every one (7,000 rows with their canvases).
- **Fix:** the narrow layout keeps the page's height (the sidebar on top, a third of the window at
  most, the songs below), and the table never draws more rows than fit the window
  ([performance](../features/performance.md)).
- Test: `e2e/narrow.spec.ts` (3,000 songs; 780, 600 and 420 px wide).
- **Tests always use a fresh build now** (`reuseExistingServer: false`).
  - A dev server left running on the test port since the day before had been reused silently.
  - It served code older than the source, and two player tests failed against it.
  - On a fresh build they pass. A server on the port now fails the run instead.

## 2026-09-27 · A full player: queue, the open player with the visualiser, the sound output
From the user: queue songs, "a right button with an arrow to expand the player to see the queue and
manage it", choose the sound card and driver, and a visualiser from their own
[threejs-visualisers](https://github.com/festanqueiro/threejs-visualisers), at its latest release
([ADR 0068](../adr/0068-full-player.md), [feature](../features/player.md),
[research](../research/audio-output.md)).
- **The queue:**
  - "Next up" (right-click › Play next / Add to queue, for songs and playlists; drop songs or
    playlists on the bar or the queue), then "Next from ‹list›";
  - shuffle; repeat the list or the song; Previous through what played;
  - remembered per collection, with the place in the song.
- **▲ opens the player:**
  - the song or the visualiser on the left, the queue on the right (drag to reorder, ×, Clear,
    double-click, right-click);
  - its top edge sizes it.
- **The visualiser:** eight themes and their options, full screen, keys. Loaded only when shown (its
  own 1.6 MB chunk).
  - package.json pins v0.1.2.
  - Every deploy installs the latest release when it's newer, and `visualisers.yml` checks daily
    and deploys when there's a new one (main's ruleset stays as it is: nothing is committed).
- **Sound output:** a menu of the outputs the browser offers, remembered; "List the sound cards…"
  asks for the microphone once (Chromium's rule, nothing recorded).
  - ASIO and WASAPI need GLUE Home to play the music itself: the next step (M9 phase 2).
- **Also:** the bar's ⌖ sits beside the title again.
- Tests: 169 unit (+10: the queue); e2e: the player (new).

## 2026-09-26 · Right-click menus across the library page; "Send to" only for other computers
From the user: "a weird 'Send to Desktop' button… it shouldn't be there", and a right-click menu for
the library explorer, for several files and playlists, wherever it makes sense, and "right clicking
a filter should allow me to hide it" ([ADR 0067](../adr/0067-one-context-menu.md),
[feature](../features/context-menus.md)).
- **One menu for the whole page**, with submenus, a find field for long ones, the keyboard (arrows,
  → ←, letters, Esc, Shift+F10) and focus back where it was. The sidebar's ⋯ buttons open the same
  menus.
- **Songs** (one, or all the selected ones):
  - play; details, Prepare;
  - add to playlist (recent first), remove from this or any playlist, show in playlist;
  - rating, tags, note; "Show only" the value under the pointer;
  - build a playlist; analyse; duplicates;
  - drag dock, send to another computer, move to a music folder, copy;
  - remove from the collection.
  In the table, the duplicates and the mini player; the selection bar has ⋯ for it.
- **Everything else:**
  - playlists and folders (play, new folder inside, Save as .m3u8, Show in ‹app›'s library, move
    with a find field…);
  - tags (on or off the selection);
  - music folders, DJ libraries and their playlists, devices, section heads;
  - column headers (sort, filter, hide, columns);
  - the table's empty space.
- **Hide things:**
  - a Library entry (back from "N hidden · show…" or the section's menu);
  - a filter group in the Filter menu (it stops filtering; listed as hidden, with "Show them");
  - a column.
  When filtered, the selection bar shows removable chips.
- **"Send to ‹computer›"** left the selection bar for the songs' menu, and never offers this
  computer's own GLUE Home.
- Tests: e2e right-click menus (new); the playlist, send-songs and local-link tests follow the menus.

## 2026-09-26 · "No file linked" cleaned up: imported records find their files; leftovers go
From the user: about 200 songs in "No file linked" with paths like `../Music Collection/…`, although the
songs are there ([ADR 0066](../adr/0066-imported-records-find-their-files.md)).
- **Matching counts the music folder's own place.** Engine DJ's relative paths name it: the same song
  in two folders (Music Collection and preparation/mp3) is no longer a tie.
- **Records without a file are matched again** each time their library is read, and when the
  collection opens; they fold into the track with the file, keeping rating, notes, tags and playlists.
- **What a library no longer has goes;** removing an import cleans every track naming it. That included
  4 leftovers of an import removed earlier.
- **Music folder locations** come from GLUE Home ("E:Music Collection" and "/preparation" were wrong
  guesses: they're on F:).
- **Traktor's factory sounds and remix sets** aren't imported (388 records).
- **On the user's collection** (a dry run on a copy): 161 of 187 link, 4 go, 24 stay (genuine).
- Tests: 159 unit (+6); e2e 40.

## 2026-09-26 · GLUE Home 0.10.0: DJ libraries followed live through GLUE Home; Refresh in the browser
From the user's test: playlists made in Engine DJ never reached GLUE, because the library had come in
through "+ Import" and GLUE didn't know where its file was. The user set the rule: live sync is GLUE
Home's, the browser has Refresh ([ADR 0065](../adr/0065-live-sync-through-glue-home.md)).
- **GLUE Home finds DJ libraries:**
  - Engine DJ on every drive and in Music; Traktor's newest collection;
  - it remembers files imported with its own dialog ("+ Import" in Home mode);
  - their folders are served read only (a write into one is refused).
- **Hand-imported sources adopt the file found:** the user's Engine DJ source adopts F:\Engine Library
  (the biggest of three found) with no click. A row shows ● while followed live, or "Find its file…".
- **Browser alone:** Refresh (Update when a newer file was seen) reads the library again, or asks for
  the file when GLUE can't reach it. "Keep up to date…" (a folder picker) is gone.
- **Fixed:** hovering a library row showed its × and moved the buttons under the pointer, so a click
  could land on the row instead.
- Tests: 153 unit; e2e 41 (live through a fake GLUE Home's dialog, the file sent only when it
  changes; Refresh in the browser).

## 2026-09-26 · DJ libraries browsed live; playlists imported on demand, kept in step (M8 phase A)
From the user: browse each DJ library's playlists in the sidebar instead of importing them all, import
the ones wanted, and see changes made in Engine DJ ([ADR 0063](../adr/0063-dj-libraries-browsed-live.md)).
- **Browse:**
  - "DJ libraries" rows open into each library's tree;
  - a playlist shows its songs without importing it;
  - ⋯ → "Import to GLUE" or "Import all" brings them under the library's folder, linked.
- **Linked copies follow the DJ app, in place:**
  - renamed, songs changed, moved or deleted;
  - new playlists inside folders imported whole come in too;
  - lists the app didn't change keep the user's edits.
  - The 761 Engine DJ and 14 Traktor copies already in GLUE stay, linked.
- **Live:** a look at each library file's date every 5 s while in view; a newer file is read again in
  a new worker (`interop.worker.ts`: sql.js and the XML parsers, now off the page for every import).
  Engine's saves in progress are waited out.
- **Stable ids:** Traktor by UUID; rekordbox XML and Traktor folders by path, with renames recognised.
  Old copies are re-found by their path; one GLUE can't place becomes the user's own list, never
  deleted.
- **Libraries imported by hand** adopt their file when GLUE finds it, or with "Keep up to date…".
- **Checked on the user's real Engine database** (a copy): read in 0.9 s in the worker, no long frame
  on the page; the tree opens in 57 ms.
- **Found for the next step** (writing back): Engine DJ 3.0.2 keeps the same playlist tree in every
  database of a set, row for row, and its triggers keep the linked lists right.
- Tests: 153 unit (+6 linked lists and renames); e2e 40 (browse and import on demand, and the live
  update: a rekordbox.xml in the GLUE folder renamed and extended on disk).

## 2026-09-26 · "Add to playlist" as the sidebar shows it
- The user's "deleted playlists still in Add to playlist": the dropdown listed all 780 lists by path,
  and the Engine DJ import repeats names across folders ("Heavy" in 19 places).
- It now mirrors the sidebar ([ADR 0062](../adr/0062-add-to-playlist-mirrors-the-sidebar.md)):
  - "+ New playlist…" first;
  - then your own playlists, indented under their folders;
  - then each import in its own group, marked "replaced when you import it again".
- Lists the sidebar can't reach are left out.
- Tests: 147 unit (+2 list tree); e2e 39 (the dropdown's groups).

## 2026-09-26 · GLUE Home 0.9.0: drag songs onto the drag dock
From the user's feedback: only playlists could be dragged onto the dock; songs needed "+ Dock"
([ADR 0061](../adr/0061-songs-onto-the-drag-dock.md)).
- **Drag song rows out of the browser onto the dock window.** The page tells GLUE Home where the
  drag was let go, and GLUE Home adds the songs if that's on the dock.
- **Or drop them on the "Drag dock" button** (playlists too). The ⋮ handle's drag carries them for
  the dock as well.
- **Checked with a real mouse:** a song row dragged from Edge onto the dock window was queued.
- **"Deleted playlists still in Add to playlist":** not reproduced. On a fresh load the dropdown
  matches the folder exactly (780 lists). The Engine DJ import holds 761 of them, with names that
  repeat in different folders ("Heavy" in 19 places), so deleting one leaves its namesakes listed.
  Pending the user's answer.
- Tests: 145 unit; e2e 39 (song drags onto the button and out of the window, on and off a fake dock).

## 2026-09-26 · Decoding moves into the workers: no more stalls while songs are analysed (M7 phase 3)
From the user's second `?perf` report: stalls of 140–560 ms every 3 s, from fingerprints being made
again on the page ([ADR 0060](../adr/0060-decode-in-the-worker.md)).
- **Analysis, fingerprints and the Prepare waveform** send the file to the worker, which reads,
  parses and decodes it (mediabunny + WebCodecs).
- **The same samples as before:** trimmed as the browser's decoder trims them (MP3 LAME delay and
  padding, MP4 edit lists, Ogg's exact length). Checked for every format by `e2e/decode.spec.ts`.
- **The page decodes only what a worker can't** (ALAC, HE-AAC), as before.
- **Six 3-minute songs analysed:** 0 frames over 50 ms (was 4, up to 83 ms).
- **New dependency:** mediabunny 1.60 (MPL-2.0, unmodified). The analysis worker grows to 382 kB; the
  page's bundle is unchanged.
- **Also found:** the 0.9 s "click" in the report was the native "Delete playlist?" dialog, which
  holds the page while it's open.
- Tests: 145 unit (+5 trim and MP3 tag); e2e 39 (+ decode parity); `PERF=1` adds a
  background-analysis test.

## 2026-09-26 · Auto playlists and Duplicates fast again; change counters and indexes (M7 phase 1, step 1)
From the user's `?perf` report, and the same library clicked through from a copy of its folder
([ADR 0059](../adr/0059-indexes-rebuilt-by-change-counters.md)):
- **The Auto playlist builder:**
  - opening it went from 2.2 s to 0.1 s, generating from 0.67 s to 0.14 s;
  - cause: every track's DJ BPM and rating came from searching every import;
  - it also recomputed on every library change while open.
- **Duplicates:**
  - it opens in under 0.1 s (was 0.8 s);
  - it draws 40 groups, then more as you scroll;
  - "in N playlists" comes from an index.
- **Fixed:** an endless duplicate-scan loop when analysed songs had no fingerprint and no readable
  file.
- **Under the hood:** the store counts changes by kind (including other devices' songs and TO BE
  SORTED, now set through store methods). Indexes of DJ values and playlist membership are rebuilt
  only when their part changed.
- **`?perf`:**
  - the report now names the click behind each long frame and where the page was, without the
    mouse-movement noise;
  - `PERF_FOLDER` measures a real library step by step.
- Tests: 140 unit (+3 indexes and change counters); e2e 38.

## 2026-09-26 · Stack review; performance budgets and `?perf` (M7 phase 0)
- **Stack review** ([ADR 0057](../adr/0057-keep-the-stack-fix-the-architecture.md)):
  - GLUE keeps Svelte, TypeScript, Vite and Tauri; no React Native.
  - The slow spots are GLUE's own design: row lists rebuilt on every change, and Canvas 2D drawing
    on the main thread every frame.
  - Plan: measure → data pipeline → GPU drawing → analysis off the main thread → a phone web app
    (remote + offline).
- **Measuring** ([ADR 0058](../adr/0058-performance-budgets.md)):
  - `?perf` in the address shows a perf panel; "Copy" gives a full report;
  - timers on loading, saving, the row list, analysis stages and every drawing step;
  - a synthetic GLUE folder at any size;
  - `e2e/perf.spec.ts` (`PERF=1`) measures open, switch, sort, search, scroll, background
    changes and playback drawing against budgets.
- **Baseline at 50k tracks** ([performance](../research/performance.md)): open 4.8 s, a sort up to
  437 ms, a search keystroke 538 ms, 45 long frames in 5 s of background changes. The 3D views halve
  the frame rate.
- Tests: 137 unit (+2 synthetic folder); e2e unchanged (the perf test is opt-in).

## 2026-09-26 · GLUE Home 0.8.0: drop a playlist on the drag dock; a wider sidebar
From the user's batch 4:
- **Sidebar:**
  - playlist rows fit, so opening the playlists no longer shows a sideways scroll bar;
  - a handle between the sidebar and the songs sets its width (remembered; double-click resets)
  ([playlists](../features/playlists.md)).
- **Drag dock:**
  - drag a playlist or folder from the sidebar onto the dock window to queue its songs
    ([ADR 0056](../adr/0056-playlists-drag-with-the-browser.md));
  - the "Drag dock" button is always shown in Home mode.
- Checked with a real mouse: a playlist dropped from Edge onto the dock window was queued.
- Tests: 135 unit; e2e 38 (the playlist's drag payload, sidebar width, rows that fit).

## 2026-09-26 · GLUE Home 0.7.0: the drag dock as a queue; duplicates across browsers; sidebar sections; faster GLUE Home builds
From the user's batch 3 ([handoff](2026-09-26-handoff-2.md)):
- **Duplicates:** songs analysed in another browser, or on the other computer (the GLUE folder is in
  OneDrive), had no fingerprint in this browser and were skipped silently. Their fingerprints are now
  made again in the background, and the Duplicates view says so. The user's two Mala copies have
  identical fingerprints ([duplicates](../features/duplicates.md)).
- **Drag dock:** a queue ([ADR 0055](../adr/0055-drag-dock-is-a-queue.md)): "+ Dock", "Add to drag
  dock" on playlists and folders, ⇲ on music folders; × and Clear in the dock.
- **Sidebar:**
  - Each section folds from its name, and ⤢ gives one section the full height while the others fold
    (remembered).
  - Tags: all of them in a scrolling list, with a filter when there are more than 8 (no more "Show
    all").
- **GLUE Home's workflow** caches the Rust build ([deployment](../features/deployment.md)).
- Tests: 135 unit; e2e 38 (dock queue, fingerprints made again, sidebar sections).

## 2026-09-26 · Prepare tab, step 2: cue points and loops
- **Hot cues A–H** (pads, keys 1–8, Rekordbox colours), **memory cues** (named, jump, remove),
  **loops** of 1–16 beats that repeat while playing, saved as memory loops or hot loops. Q puts them on
  the beat.
- Drawn on the deck and overview; the library row's mini waveform shows them.
- An import's cues can be taken over with one click.
- Saved on the track and synced; Re-analyse keeps them
  ([prepare](../features/prepare.md#shipped-step-2-cues-and-loops-2026-09-26)).
- Tests: 135 unit (cue editing), 38 e2e (cues in the Prepare story).

## 2026-09-26 · GLUE Home 0.6.0: the drag dock ([ADR 0054](../adr/0054-drag-dock-in-glue-home.md))
- Reported by the user: songs and playlists couldn't be dragged into Engine DJ or Rekordbox.
- Tested on their desktop ([research](../research/drag-to-dj-apps.md)): Engine DJ takes a real file
  from a native window and nothing a web page drags. GLUE Home can't take over a drag from the page.
- **Now:** "Drag dock" in the library (Home mode) opens GLUE Home's small window. It holds the selected
  songs (or the open playlist's), and dragging from it drops the real files into the DJ app or a
  folder. Tested: a drag from the dock delivered the real file.
- Tests: e2e Home mode covers filling the dock (the stand-in GLUE Home has `/dock`). The Home-mode
  e2e's copy of the browser's folder now waits for the analysis and skips a file replaced mid-copy
  (it failed once on a slow run).

## 2026-09-26 · The same BPM everywhere; the playing song stands out; cloud clean-up fixed
From the user's batch ([handoff](2026-09-26-handoff-2.md)):
- **BPM:**
  - The Details page's Tempo card and the DJ-app table follow the correction, the profile's range and
    the flip. Auto-playlist rows too.
  - A correction, flip or reset applies to every copy of the same recording. The user's "duplicate
    song" was two files of it ([prepare](../features/prepare.md#the-same-bpm-everywhere-2026-09-26)).
- **Library:** the song that's playing has an accent bar, outline and tint in the table. The mini
  player's ⌖ scrolls the table to it (from All tracks when the open list doesn't have it).
- **Cloud:** "Delete everything in my cloud" cancels scheduled uploads and waits for a running one.
  Before, an upload could put a file back right after; it showed as an intermittent e2e failure.
- Tests: 130 unit; e2e 38 (Prepare covers copies and the Details page).

## 2026-09-26 · Imported songs that are really a track you have ([ADR 0053](../adr/0053-imported-copy-is-the-same-song.md))
- Reported by the user: after importing Engine DJ and Traktor, songs showed under "No file linked"
  although the same song was in the library.
- **The cause** (on the user's Engine library): two records of the song. The playlists use the copy in
  `preparation`, which isn't a music folder; only the copy in `Music Collection` got linked.
- **Now:** a record with no file of its own, whose file name and size equal exactly one track that has
  its file, is that track (Traktor's kB sizes get 1 kB of slack). Re-importing ("Update") folds the
  tracks left unlinked before into it, keeping the user's rating, notes, tags and Prepare settings,
  and their playlist places.
- Tests: 130 unit (2 new in `tests/merge.test.ts`), 38 e2e.

## 2026-09-26 · Engine DJ: the computer's and the drives' libraries as one set
- Reported by the user: an Engine DJ import left most playlists empty and said to import another
  library.
- **The cause:** Engine DJ 3 keeps one playlist tree in every library (the computer's and each drive's),
  and each entry names the library its song is in. GLUE imported one `m.db` at a time, and a second
  import replaced the first (they're all `m.db`).
- **Now:** each Engine import joins one Engine DJ source, and entries are resolved across every library
  imported ([import: Engine DJ](../features/import-engine.md#engine-libraries-are-a-set-2026-09-26)).
  On the user's libraries: 9 → 355 of 601 playlists with songs. The remaining ones are on 5 drives or
  sticks that weren't connected, and the message now says so.
- Known issue, not from this change: the e2e cloud-sync test failed once at its last step (one file
  left in the cloud after "clean up"; 1 of about 6 full runs; passes alone). Likely an upload queued
  before the clean-up landing after it. To look into.

## 2026-09-26 · Prepare tab, step 1: waveform, beat grid, metronome, tempo ([ADR 0052](../adr/0052-prepare-tab.md))
- The track page has two tabs, **Details** and **Prepare** ([feature](../features/prepare.md)).
- **Prepare:**
  - a deck waveform and overview, in 4 colour schemes, with the beat grid and a 3D view;
  - a tempo fader with key lock, and a metronome on the music's own clock;
  - BPM and grid corrections (±, ×2, ÷2, tap, nudge, "Beat 1 here"), saved on the track and synced.
    Re-analyse resets them.
- **BPM shown as:** as detected, 60–120 or 120–240, chosen per profile on the profiles screen, plus a
  per-track flip. The corrected BPM is used everywhere.
- The waveform is made from the track's audio the first time Prepare opens, and kept in the browser.
  The analysis is unchanged (the onset envelope was only moved into its own function; the parity tests
  pass).
- Grid placement measured on synthetic kicks: within 0.1 ms after correcting an 18.6 ms lag.
- Tests: 127 unit, 38 e2e. Next: cues and loops (step 2), then the rekordbox XML export (step 3).

## 2026-09-26 · When GLUE Home stops; Duplicates from a track; a compact track page
From the user's checks of 0.5.0 (everything else worked, including the sent song on the desktop):
- **GLUE Home stopped:** opening a track said "Failed to fetch". The open library now carries on with
  the browser's own GLUE folder and music folders, and goes back to GLUE Home when it runs again
  (checked every 5 s). A banner asks for a click if the browser needs permission again. Part of
  [ADR 0051](../adr/0051-glue-home-as-local-engine.md) stage 3.
- The "2×" on a track opens Duplicates **on that track**: its group scrolled into view, highlighted.
- **Track page:** the header and details take about 50–110 px instead of about 330, so the verdict,
  spectrogram and player are on the first screen. The quality badge shows once; notes are one line
  that grows.
- TO BE SORTED fills in as soon as a collection opens, and again after each scan of the incoming
  folder. Before, a start-up slower than 10 s left it empty until the next round (30 s).
- The page waits at most 3 s for GLUE Home at start-up before opening the library without it.
- e2e: a stand-in GLUE Home (`e2e/fakeHome.ts`) and the Home mode story, stopping and starting it.

## 2026-09-26 · GLUE Home 0.5.0: Home mode (ADR 0051, stages 1–2)
- **GLUE Home is the website's disk** on its computer. The GLUE folder and music folders are read and
  written through its local link, so there are no folder permission prompts.
  - Your real library (7,426 tracks) opens in about 1.9 s this way. Scans read sizes from folder
    listings and tags from byte ranges, never whole songs.
  - GLUE Home only allows the GLUE folder, its incoming folder and the music folders it knows, with
    plain relative paths that must stay inside them once resolved.
- **The incoming folder is a hidden music folder.** Songs sent to a computer are that computer's own
  tracks: analysed, with waveforms and a full track page, and synced.
  - This fixes the handoff bug: the sent song showed as the laptop's track, with "run GLUE Home on
    Laptop".
  - TO BE SORTED lists the folder, which is watched every 5 s.
  - Move to music folder keeps the same track (its analysis and playlists stay).
- Checked on the desktop against GLUE Home's release build and a copy of the GLUE folder. 118 unit
  tests and the e2e suite pass. Not checked here: the merged row across computers (needs the account).
- Dev: Vite no longer watches `home/src-tauri/target`; `Cargo.lock` is committed.

## 2026-09-26 · Decision: GLUE Home as the computer's disk and engine (ADR 0051)
- The open bug (a song sent to the desktop shows no waveform there and its page says "run GLUE Home on
  Laptop") comes from the song staying the laptop's track on the desktop. Instead of patching that,
  the user chose to have GLUE Home do the local work when it runs:
  [ADR 0051](../adr/0051-glue-home-as-local-engine.md), which supersedes 0050.
  - The website keeps its public address and uses GLUE Home's disk over the local link.
  - The incoming folder becomes a hidden music folder, so a sent song is that computer's own track.
  - One writer at a time, through a lease; with no tab open, GLUE Home syncs on its own.
  - GLUE Home does the analysis, with Rust decoding and parallel workers.
- `CLAUDE.md`'s non-negotiables reworded (no GLUE server that sees your music; GLUE Home as disk
  and engine; one writer). No app code changed yet.

## 2026-09-26 · Handoff; open bug recorded
- The user's check on the desktop: the direct link answers and the sent song plays. Still wrong: that
  song (the laptop's track, with its file waiting on the desktop) has no waveform or analysis there.
  Cause and fix plan in [the handoff note](2026-09-26-handoff.md) and the
  [GLUE Cloud known issues](../features/glue-cloud.md#known-issues-2026-09-26). No code change.

## 2026-09-25 · TO BE SORTED without the wait; the direct link shows in Devices
From the user's test of 0.4.0:
- Laptop: TO BE SORTED took ~30 s (until the next round) when the desktop's GLUE Home came online
  after the page asked. Now a GLUE Home coming online, or the sign-in finishing, is asked at once,
  with "Looking for songs sent to Desktop…" while it answers.
- Desktop: a song played "from Laptop" although the laptop has no GLUE Home. It came from the
  desktop's own GLUE Home over the cloud channel, because the direct link wasn't up; the label now
  names the computer the file comes from.
- Devices shows "linked directly" (or "no direct link", with the reason on hover) on this computer's
  row. The first handshake waits up to a minute, so the browser's "apps and services on this device"
  question can be answered ([ADR 0048](../adr/0048-local-link-to-glue-home.md)).

## 2026-09-25 · GLUE Home 0.4.0: the local link; one row per song; folders are playlists
- The website on a computer with GLUE Home talks to it directly, on `127.0.0.1` (ports 47400–47409,
  a token GLUE Home made), learned once over the account's channel
  ([ADR 0048](../adr/0048-local-link-to-glue-home.md)). TO BE SORTED shows at once on opening,
  without GLUE Cloud, and its songs play from disk. The browser may ask once to allow "devices on
  your local network".
- GLUE Home analyses each song as it arrives (and those already waiting): TO BE SORTED rows show
  quality, BPM, key, waveform and the full track page straight away.
- A song sent from this computer is the same track in TO BE SORTED: one row, on both computers
  (Laptop · Desktop), played from the nearest copy with no download. "Song (2).mp3" counts as
  "Song.mp3".
- Folders are playlists too, as in Engine DJ ([ADR 0049](../adr/0049-folders-are-playlists.md)):
  drop tracks on a folder or pick it in "Add to playlist"; a folder shows its own songs first, then
  its playlists'. Engine imports put a parent playlist's songs in the folder itself (re-import to
  get it).
- Proposed next ([ADR 0050](../adr/0050-glue-home-as-the-computers-library.md)): GLUE Home becomes the
  computer's library, saving and cloud sync included.
- Tests: "the local link: …" e2e (reload with GLUE Cloud offline), updated send-songs and
  drops-on-folders e2e, Engine import unit test.

## 2026-09-25 · Engine DJ folders and playlists; a steadier link to GLUE Home (0.3.1); scroll bar
- Engine DJ: a playlist with children is now a folder (its own songs go into a playlist of the same
  name inside it), so "2021 › DNB › Bangers" shows as folders in the sidebar. Playlist entries are
  counted: the import message says how many found their song, and how many point at another Engine
  library (a drive), which has to be imported too.
- The laptop ↔ GLUE Home channel ([ADR 0047](../adr/0047-stream-channel-requests-at-once.md)):
  - requests run at the same time, with tagged bytes, so one slow one no longer blocks the rest;
  - time limits reconnect a stuck channel instead of freezing until a reload;
  - GLUE Home's analysis queue no longer deadlocks, and an analysis can't hang it;
  - track page: the summary at once with "Getting the full analysis from …" or "… is analysing
    this song now", plus the song's download progress (no more blank page);
  - waveforms that aren't made yet are asked for again for longer.
- Library: only the rows scroll, both ways, so the vertical scroll bar stays visible on narrow
  windows; the header follows sideways and the columns menu floats above it.

## 2026-09-25 · GLUE Home 0.3.0: shares waveforms and analyses; TO BE SORTED
- Another computer's songs now show their mini spectrograms, and their track page shows the full
  analysis at once, from that computer's GLUE Home, without downloading the audio; "Play from
  Desktop" gets the song ([ADR 0046](../adr/0046-glue-home-shares-analysis-and-sorts-incoming.md)).
  GLUE Home keeps them in its own cache: the website on its computer hands over what it analysed,
  and GLUE Home analyses the rest itself (on request first, then gently in the background).
- Drag tracks from the table onto a computer with GLUE Home in Devices to send their files there
  (dropping files from the desktop already worked).
- **TO BE SORTED**: a playlist at the top with the songs waiting in every GLUE Home's incoming
  folder (Device column shows where). They play from there; "Move to music folder…" moves them into
  that computer's music folder, and they leave the list.

## 2026-09-25 · GLUE Home 0.2.1: finds every music folder by itself; install guide
- On the user's desktop, streaming failed ("The system cannot find the path specified"): the
  music folders weren't where GLUE Home looked by name, and a folder chosen by hand wasn't checked.
  Now GLUE Home finds every shared collection's music folders by itself, checking each with one of
  its songs:
  - where the song's DJ app said it is;
  - the collection's known path;
  - the usual folders;
  - a search of the drives for a folder of that name with that song in it.

  A folder chosen by hand is checked the same way.
- Settings: the only thing asked for is the code. Every collection is shared (a switch per
  collection); a "not found" list with Choose… appears only for a folder that can't be found.
- Website: the GLUE Home download and pairing dialog explains the browser's "isn't commonly
  downloaded" bar, Windows' blue "Windows protected your PC" screen and the macOS warning, and why
  they're safe to pass.

## 2026-09-25 · GLUE Home 0.2.0: this computer's companion; streaming; updates itself
- GLUE Home is the companion of the browser on its computer
  ([ADR 0045](../adr/0045-glue-home-companion.md)): the code made in that browser links them;
  Devices shows one row per computer ("GLUE Home on", streaming on). Connecting again replaces the
  old GLUE Home device (no more duplicates).
- Codes only: GLUE Home's email and Google sign-in are gone (and the website's `#/connect-home`).
- GLUE Home reads the website's GLUE folder (found in the usual places) and finds its music folders
  by name; it never writes to them.
- Streaming: another computer's songs play here through its GLUE Home, and their track page can
  "Play and analyse from Desktop" with the full analysis.
- Updates: "Check for updates" in GLUE Home and automatic installs (signed; tagged releases carry
  `latest.json`). Installs of 0.1.0 update by hand once.
- API: migration `0004_companions`; `POST /v1/home/signin` removed.

## 2026-09-25 · GLUE Home: a tray app for Windows and macOS; send songs to another computer
- GLUE Home is now a small Tauri app ([ADR 0044](../adr/0044-glue-home-tauri-tray-app.md),
  superseding 0038):
  - an icon next to the clock (click: the GLUE library; right-click: status, settings, Start / Stop
    / Restart, Quit);
  - settings: sign in with email and password, Google in the browser (`#/connect-home`), or a code;
    the incoming folder; start with the computer (asked on first launch);
  - installers of 1.3 MB (Windows) and 3.8 MB (macOS universal), built on GitHub and published as
    releases; the pairing dialog links the one for your OS.
- Send songs: drop them on a GLUE Home in Sidebar › Devices, or ⋯ › Send songs…, or select tracks ›
  "Send to …". They go straight between the two computers over WebRTC into its incoming folder,
  with progress; names that are taken get " (2)".
- Opening the library from GLUE Home while a GLUE tab is open brings that tab forward (its title
  flashes) instead of a second one; "Use this tab instead" moves the library across safely.
- API: `POST /v1/home/signin`; the app's web views are allowed origins.
- Tests: GLUE Home's settings and service pages with a stand-in for the Rust side; a real WebRTC
  transfer from the website to the service page (bytes compared); the tab hand-off.

## 2026-09-25 · Merged collections: instant after a reload, duplicates across devices, full track page
- A reload showed only this device's songs and then fetched the other device's again: the cloud's
  list of merges wasn't in yet, so the copy in the GLUE folder wasn't used. Now it opens from the
  copy at once, and a sync only fetches what changed ("Updating from Desktop… 3 of 12 changed
  files"; "Getting Desktop's songs…" only the first time).
- Duplicates: a section "On more than one device" lists songs on several devices with each copy's
  device, format and quality ("Best copy" when one is better).
- Another device's track page shows the same verdict, readouts, tempo / key wheel and evidence
  widgets as a local one, built from its stored summary; only the spectrum views need the file.

## 2026-09-25 · Merged collections load in seconds, songs appear as they come
- On a 7k-song desktop the laptop sat at "Updating from Desktop…" for minutes and then showed
  nothing: one request and one saved file per shard (1,167 of them), everything at the end, and
  one failed file failed the device. Now uploads and downloads go many files per request, playlists
  and songs first ("… 3,200 of 7,000 songs", the count rising as they come), the copy is one file
  per device, and a missing file waits for next time
  ([ADR 0043](../adr/0043-batched-sync-and-progressive-loading.md)). Backend: `POST /v1/sync/files`,
  `POST /v1/sync/<device>/<profile>/bundle`.
- Clicking a device in Sidebar › Devices always filters the library to its songs.
- SQLite for GLUE's own data was looked at and not taken (ADR 0043, alternatives): the merge of
  12k songs takes ~0.25 s; the slow part was requests and file writes.

## 2026-09-25 · One library across devices: sync by default, automatic merge, Device column
- Signed in, Cloud sync is on for every profile (turn it off per profile). No setup dialog.
- A collection is merged with the same one on your other devices by itself, and their songs and
  playlists show in this computer's library, not in a separate cloud view. They come from a copy
  kept in the GLUE folder (`cloud/`), so the library opens at once and offline, then refreshes with
  an "Updating from …" signal ([ADR 0042](../adr/0042-merged-collection-in-the-local-library.md),
  partly superseding 0040).
- Device column with coloured chips and a Device filter; Sidebar › Devices shows each device's
  colour, songs, last sync and that streaming is off, and filters on click.
- Fixed: another device's track asked for file permission and then failed; its page now says where
  the file is. Fixed: the device ⋯ menu was cut off at the bottom of the sidebar.
- GLUE Home is on hold (user, 2026-09-25).

## 2026-09-25 · Homepage: colour behind the page, no numbers band, logo in the hero
- The glue-stick logo stands large beside the headline (small on phones).
- Removed the "0 bytes / 5 / 100% / Free" band, which didn't read well.
- Soft, slowly drifting fields of colour behind the sections so the page isn't flat black.

## 2026-09-25 · A homepage that shows the real app
- New homepage ([feature](../features/homepage.md)): a large headline, then the product itself.
  Real screenshots and short looping clips of the library, quality verdict, playlist builder,
  insights, duplicates, column filter, the live 3D view and GLUE Cloud, in alternating chapters.
  Scroll-in, headline and tilt animations are all off with reduced motion.
- The media comes from a synthetic demo library (`scripts/demo/make-audio.ts`), captured by
  driving the built app in headless Edge (`scripts/demo/capture.ts`) into `public/home/`.

## 2026-09-25 · GLUE in capitals everywhere; admin strictly for admins
- Every visible "glue" is now GLUE: the homepage headline "The GLUE between your DJ apps.", the
  theme "GLUE Stick", and the page description (reworded rather than "GLUEs").
- The Admin tab and account-menu link only show for admins, as before. Now `#/admin` also sends
  anyone else (signed out included) back to the library once the session has loaded. The API
  refused them already.

## 2026-09-25 · Email + password accounts, tiers, admin panel; GLUE Stick is the default
- Sign in with an email and password (short register form) as well as Google. The password is
  stretched in the browser (PBKDF2 300k); the server stores a salted hash of that only.
- Tiers free / paid / admin (everyone paid). Admin only via a Google-verified
  joao.pedro.manso@gmail.com. Admin panel at `#/admin`: stats, users, tiers, clear data, delete,
  maintenance ([ADR 0041](../adr/0041-passwords-tiers-admin.md)). Backend migration `0003`.
- Glue Stick is the default theme; Classic stays.

## 2026-09-25 · Cloud sync, merged collections, a real start page, Glue Stick theme
- Cloud sync (opt-in per profile):
  - library data (never audio) goes to GLUE Cloud;
  - any signed-in browser opens any device's collection;
  - merge collections across devices, chosen when the second device links;
  - edits made in a cloud view reach the owning device the next time it opens;
  - clean-up per copy or everything.

  [ADR 0040](../adr/0040-cloud-sync-and-merged-collections.md). Backend migration `0002_sync`.
- Start page: a product homepage (logo, pitch, features, how it works, GLUE Cloud) above the setup.
- New theme **Glue Stick** (yellow on black); yellow favicon; the logo keeps cream glue and a dark
  band in every theme.
- Tests: two slow audio tests got 30 s limits, and the backend tests make one RSA key per file (the
  suite had begun timing out under load).

## 2026-09-25 · GLUE Cloud phase 1 live
- D1 database created, API deployed (also from CI), live smoke test passed, test data removed.

## 2026-09-25 · GLUE Cloud phase 1 built (deploy waits on D1 access)
- Accounts (Google), devices, pairing codes, per-user signaling room: `cloud/` (Worker + D1 +
  Durable Object). Website: Sign in, Sidebar › Devices, pairing dialog. GLUE Home preview in `home/`.
  [GLUE Cloud](../features/glue-cloud.md), ADR 0036 accepted.
- Tests: API on real SQLite, pairing, e2e with stand-ins, and a local smoke test against `wrangler
  dev`. That smoke test found that close handshakes don't reach clients locally, so the room now
  says `removed` / `replaced` first.

## 2026-09-25 · Header on smaller windows; stem separation speed
- Fixed: below about 1,700 px wide the header's profile / theme buttons were pushed off screen. The
  track table's column minimums (more since Overview and Tags) widened the whole page. The page
  now stays window-wide and the table scrolls sideways; e2e checks 1590 / 1280 / 1024 px.
- Stems: measured Speklone and GLUE on this laptop's Intel Iris Xe: same ~37–38 s per chunk, so not
  a regression. The status now names the graphics chip. There's an estimate before starting, from
  the last run's speed. Background analysis pauses while separating.

## 2026-09-25 · GLUE = Global Library Unified Exporter
- The U is **Unified**, not Utility: header, title, description, docs and the /mco/ redirect page
  ([ADR 0039](../adr/0039-glue-unified.md)).

## 2026-09-25 · Moved to joaopmanso.github.io/glue/
- Repo renamed `mco` → `glue`; Vite base `/glue/`. `joaopmanso/mco` becomes a redirect to /glue/
  (routes kept). Same origin, so browser data and folder permissions carry over.
- GLUE Cloud decisions from the user: Google sign-in first (Apple later), first release = phases 1–3,
  a free SQL database: ADR 0036 now proposes Cloudflare's free tier (Worker, D1, Durable Objects).

## 2026-09-25 · GLUE Cloud designed (proposed)
- Design for the optional cloud tier: accounts (Google / Apple), GLUE Home, P2P remote library,
  uploads, devices ([GLUE Cloud](../features/glue-cloud.md), ADRs 0036–0038 proposed,
  [research](../research/remote-access.md)). Waiting on the user's decisions; nothing built yet.

## 2026-09-25 · MCO is now GLUE
- Renamed to **GLUE, Global Library Utility Exporter** (MCO was taken): header with the letters
  emphasised and a glue-stick logo, favicon, title, messages, backup names, docs
  ([ADR 0035](../adr/0035-rename-to-glue.md)). File formats and storage keys keep the `mco` prefix,
  so existing folders, backups and settings open unchanged. Repo and URL not moved yet.

## 2026-09-25 · Quiet content above the fade counts
- AIFFs still read "band-limited to about 15 kHz" although faint content reached past 20 kHz. The
  fade is measured on the average spectrum; quiet highs barely move it. Now the spectrogram's louder
  moments are checked too: quiet content up to 17 kHz or higher, with no wall, means Lossless
  ([ADR 0034](../adr/0034-quiet-content-above-the-fade.md)). Steady hiss doesn't count.
- `VERDICT_VERSION` 3: stored Caution / Suspect verdicts are re-checked again, without decoding.

## 2026-09-25 · Gentle roll-offs are no longer "Caution"
- Lossless files whose top end fades out gently from 17 kHz up (common on artist / Bandcamp /
  SoundCloud downloads) now read Lossless with a Note; shallow high "walls" (≥ 18.5 kHz, < 30 dB)
  are a Caution at most ([ADR 0033](../adr/0033-tolerate-gentle-roll-offs.md)).
- Existing verdicts are re-checked in the background from the stored analyses (no decoding), with a
  notice of how many changed. `VERDICT_VERSION` 2.
- Parity fixtures unchanged (their 5 kHz band limit is still a Caution).

## 2026-09-25 · Tags, playlist insights, column filters, the player keeps playing
- Tags on tracks and playlists, made in MCO or found in files (Grouping, rekordbox My Tag,
  #hashtags): Tags column, editor, sidebar section (drop tracks on a tag), track page, rename /
  delete everywhere ([ADR 0032](../adr/0032-tags.md), [tags](../features/tags.md)).
- Filters: Tags and Genre groups; ▾ in the Quality, Format, Tags and Genre headers lists every
  value to tick (and sorts).
- Playlist insights: length, tempo flow, keys and harmonic mixes, quality, Venn of up to three tags;
  under playlists and in the builder.
- Playlist builder: "Look at tags" on by default (prefer / only / avoid); each proposed track shows
  its overview to play and scrub; rows fit phone widths (e2e checks no sideways overflow).
- Fixed: opening track B's page while A played stopped A. The page's source now waits until it's
  played there ([player](../features/player.md)).

## 2026-09-24 · Overview column, quality / format filters, track page scrollbar
- Mini spectrogram per row, playable and scrubbable, with a playhead and imported cue points
  ([ADR 0031](../adr/0031-row-thumbnails.md)).
- Filter the table by quality verdict and format; click a quality badge to filter by it.
- Fixed: the track page's verdict sidebar had a height cap and scrolled by a pixel or two whenever
  the tempo/key card made it just too tall (seen at 1080p and with display scaling); it's no longer
  its own scroller. e2e checks no element on the track page scrolls.

## 2026-09-24 · Playlist builder scrolls again; cue points and ratings imported
- Fixed: with many playlists the builder's Generate button was unreachable. A global `.cols` rule
  (the analysis page's columns, `align-items: start`) stopped the dialog's columns from fitting, so
  they couldn't scroll; the earlier test passed because scroll-into-view moves clipped content. The
  dialog's classes are now prefixed, and the e2e scrolls with the mouse wheel and checks the button is
  really on screen (it fails on the old code).
- Imports: rekordbox (POSITION_MARK) and Traktor (CUE_V2) cue points and loops are kept (position,
  hot-cue slot, name, colour); an imported rating becomes the track's own rating when it has none.
  Engine DJ and Serato cues are not read yet (Engine's quickCues blob and Serato's in-file tags).

## 2026-09-24 · Fix: "Couldn't save to your MCO folder … not of type 'WriteParams'"
- A playlist or import deleted while a save was running (constant during a 10k-track analysis) was
  still written as "nothing"; the write failed, was retried every second, and — because one failure
  aborted the whole save — held back every other change. Now each file saves on its own, a deleted
  item's file is removed instead, imports are removed through the store, and the error shows once.
- Test: the mid-save delete race.

## 2026-09-24 · DJ libraries detected automatically
- Sidebar › DJ libraries: libraries found in music folders, the MCO folder and remembered places, with
  Add / Update; "Look in…" allows another place (e.g. Traktor's); "Where are my libraries?" guide;
  manual Import kept ([ADR 0030](../adr/0030-detect-dj-libraries.md)).
- Fixed: a search requested while one was running was dropped; it now runs right after.

## 2026-09-24 · Build a playlist with several selected tracks
- With more than one track selected, the builder starts from the first and includes all the others.

## 2026-09-24 · Playlist builder fits smaller windows
- The dialog's top was cut off below ~1080p: it was centred in a box that couldn't scroll, its
  columns didn't scroll (nested grid sizing), and focusing the Generate button scrolled the clipped
  dialog. Now: columns scroll on their own (flex), the page scrolls for very short windows, focus
  doesn't scroll, and an empty result explains why. e2e checks five window sizes.

## 2026-09-24 · Background analysis on / off
- A per-collection switch replaces the session-only Pause; with it off, "Analyse" analyses selected
  tracks on demand ([background analysis](../features/background-analysis.md)).

## 2026-09-24 · Automatic playlists, full-name logo
- [Automatic playlists](../features/auto-playlists.md): build a set from a track along a BPM ramp,
  harmonic mixing, highest rated first, must-include tracks, avoid playlists, randomness; preview with
  re-roll per slot; save as a playlist ([ADR 0029](../adr/0029-automatic-playlists.md)).
- The logo reads "Music Collection Organizer" with the M, C and O emphasised (just "MCO" on narrow screens).
- Tests: 8 unit tests for the generator; e2e for the dialog and saving.

## 2026-09-24 · Themes
- [Themes](../features/themes.md): Classic (now with light mode), Studio, Riso and Moss, each dark and
  light, with their own fonts and small signatures; picker with live previews on the profile screen,
  sun/moon toggle in the header ([ADR 0028](../adr/0028-themes.md)).
- Tests: e2e switches every theme and mode, checks they persist and the fonts load.

## 2026-09-24 · Drag out to other apps
- Chrome/Edge: drag a track's grip out for a copy of the file, a playlist's icon out for a `.m3u8`
  with absolute paths ([ADR 0027](../adr/0027-drag-out-with-downloadurl.md)).
- Tests: e2e checks the drag data (file copy readable, M3U8 contents); real drops into other apps
  can't be automated here.

## 2026-09-24 · Backups, restore, delete all, clearer start
- Profile backups as standard zips, restore (start screen or profile screen), "Delete all MCO data"
  ([ADR 0026](../adr/0026-profile-backups-and-wipe.md)); "Find folder" to relink music folders.
- Three-step first run; step 1 warns when the chosen folder looks like a music folder.
- Tests: zip unit tests (checked with Python's zipfile too); e2e for warning → profile → music step →
  backup → delete all → restore → Find folder.

## 2026-09-24 · Duplicate detection by sound
- Acoustic fingerprints (Philips-style band-energy bits) computed in the background analysis and kept
  in the browser's cache ([ADR 0025](../adr/0025-band-energy-fingerprints.md)); `ANALYSIS_VERSION` 3.
- [Duplicates](../features/duplicates.md) view: same-recording groups across names and formats (a WAV
  and its MP3 rip), plus "check these" by artist/title; best copy, "Use in playlists", "Not duplicates";
  "2×" badge in the table.
- Fixed: a track counted as analysed before its stored analysis was written, so opening it right away
  re-analysed; the stored analysis and fingerprint are now written first.
- Tests: fingerprint unit tests (synthetic rips, unrelated audio), a real WAV vs 128 kbps MP3 check
  (BER 0.04), e2e with an ffmpeg-made MP3 rip under another name.

## 2026-09-24 · 3D live view
- The live view can switch between the scrolling spectrogram and a 3D view where recent spectra run
  into the horizon ([live view](../features/live-view.md)).

## 2026-09-24 · Track pages never analyse after the background pass
- The background workers now store each track's full analysis (compressed, ≤512 spectrogram rows) in
  the browser's storage ([ADR 0024](../adr/0024-background-stores-full-analysis.md)); track pages
  show it with no analysis steps, even on the first visit. `ANALYSIS_VERSION` 2 re-analyses existing
  libraries once to fill it.
- Tests: format round trip; e2e checks no analysis step is shown on a first visit.

## 2026-09-24 · Stored track analysis, uninterrupted playback, wide windows
- Track pages store their full analysis on the first visit and reuse it; "Re-analyse" on demand
  ([ADR 0023](../adr/0023-store-track-page-analysis.md)).
- Opening the page of the playing track no longer restarts (and stops) playback.
- Layout: the page grows to 2560 px wide (was 1760) and the library fills the window's height
  (a grid row mismatch left the table short on tall windows).
- Tests: unit tests for the stored format; e2e for stored pages, Re-analyse and continuous playback.

## 2026-09-24 · Folder drops, playlist order, columns, notes
- Fixed: dropping on "+ Playlist" covered the page in blue (its `drop` class clashed with the page's
  drop overlay; both renamed).
- Tracks dropped on a folder create a playlist inside it; playlist colours tint the whole row.
- Playlists open in "#" order and can be rearranged by dragging; "Keep this order" saves a sorted order.
- Track table columns: show / hide, reorder by dragging headers or from the column menu.
- Track notes: an icon in the table opens a note editor; also on the track page.
- Tests: e2e for all of the above.

## 2026-09-24 · Playlist organising, colours, ratings; new drag
- In-app drags rebuilt on pointer events ([ADR 0022](../adr/0022-pointer-drag-inside-mco.md)): the
  native drag kept failing with a real mouse and showed a stray blue drag image. Now: a tag at the
  pointer, "+" on the target playlist, insertion lines, Escape to cancel.
- Playlists: drag to reorder and to move into / out of folders; ⋯ menu with colours, move up/down,
  move to folder, rename, delete.
- [Ratings](../features/ratings.md): half-star ratings in the table and on the track page; imported
  DJ-app ratings shown dimmed until you rate.
- Tests: e2e for reordering, nesting, the menu, colours, drag feedback and half-star ratings.

## 2026-09-24 · Library player, drag-and-drop fixes
- Player bar at the bottom of the library (play from any row, queue = current view, auto-advance).
- Drag to playlists fixed: the table no longer changes under a drag, notices are a toast, nested
  playlists re-render, closed folders open on hover, drop on "+ Playlist" creates one.
- Tests: e2e for the player bar and for drops onto new, nested and repeated playlists.

## 2026-09-24 · Add single songs
- Drop songs onto the library or use "+ Songs": kept by file handle in Chrome/Edge, copied into the MCO
  folder elsewhere ([ADR 0021](../adr/0021-single-songs.md)). No duplicates with music folders or
  imports; "Added songs" view; "Remove from collection" for selected tracks.
- Fixed: drops read `dataTransfer.files` after an `await`, when the browser has already emptied it.
- Tests: new e2e for single songs (link to import, reload, track page, folder adoption, removal).

## 2026-09-24 · M2 shipped: the library
- **Profiles** without passwords, **collections**, and the **MCO folder** as a JSON store
  ([ADR 0018](../adr/0018-local-profiles.md), [ADR 0009](../adr/0009-json-files-store.md)); browser
  storage on Safari/Firefox. No installable app ([ADR 0017](../adr/0017-no-installable-app-for-now.md)).
- **Imports**: rekordbox XML, Engine DJ m.db (sql.js), Serato database V2 + crates, Traktor NML,
  Apple Music / iTunes XML, M3U/M3U8. Imports first, then **link music folders**: tracks match files by
  trailing path, which also infers each folder's location on disk
  ([ADR 0020](../adr/0020-imports-then-link-folders.md)). DJ libraries found while scanning are offered
  for import.
- **Library view**: sidebar (library views, playlist tree, music folders, imported libraries), a
  virtualised track table with search, sort, multi-select and drag to playlists; folders and playlists
  with rename, delete, move and reorder.
- **Background analysis**: several tracks at once in a worker pool, browser decoding limited to two
  ([ADR 0019](../adr/0019-background-analysis-decoding.md)); quality, BPM, key and format columns fill
  in as it goes.
- **Track page** (`#/track/<id>`): everything the library knows plus the full Speklone analysis, player,
  live view and stems.
- Found while testing: a layout shift during `dragstart` makes Chromium cancel the drag (the selection
  bar now always keeps its space); a reload during the first write of a new file left it empty and
  locked the library (empty files now count as missing; damaged files are set aside as `*.damaged`).
- Tests: 52 Vitest (importers, path matching, merge rules, store resilience) and 8 Playwright, incl.
  the whole library flow and Engine/Serato imports in Edge.

## 2026-09-24 · M1 shipped
- Ported to **TypeScript 6 + Svelte 5 + Vite 8** ([ADR 0008](../adr/0008-typescript-svelte-vite.md)).
  TypeScript 7 (the Go compiler) isn't supported by svelte-check yet, hence 6.
- `src/core/`: analysis, parsers, clues, verdict, key notation, WAV writers, stem constants and the
  float64 patcher, logic unchanged apart from types. `src/workers/`: real module workers for analysis
  and stems (the old `Function.toString` worker would not survive minification).
- UI rebuilt as Svelte components; same look (the stylesheet carried over as `src/styles/app.css`),
  now branded MCO, "Analyze a file" mode.
- Bugs fixed while porting: analysis results could reach the wrong file when a second file was
  dropped mid-analysis (request ids + "latest wins"); stem Cancel during model load / audio prep was
  lost (per-run job ids); busy bar stuck after a superseded example; a quick pause/play could start a
  second play loop; ID3 UTF-16 text without a BOM lost its first character; "an WAV wrapper" wording.
- The stem model cache is shared with the legacy Speklone page (same origin): MCO reuses its copy
  instead of downloading 166 MB again.
- Tests: 34 Vitest (parsers on real ffmpeg-encoded fixtures, verdicts on synthetic signals, tempo/key,
  patcher, WAV round trips, **parity with the legacy page** incl. a real AIFF) and 7 Playwright tests
  in headless Edge (incl. real stem separation + cancel). `legacy/index.html` kept for parity
  ([ADR 0016](../adr/0016-keep-legacy-page-for-parity.md)).
- GitHub Actions: check + test + build + deploy to Pages on every push to `main`.

## 2026-09-24 · M0 shipped
- AI vault created: vision, roadmap, glossary, 19 feature docs, 15 ADRs, research notes.
- `CLAUDE.md` added as the agent entry point.
- MCO plan agreed: web-first local DJ collection manager; JSON files in `Documents/MCO`.
- Repo renamed `joaopmanso/speklone` → `joaopmanso/mco`; site now at https://joaopmanso.github.io/mco/.
  A new `joaopmanso/speklone` repo keeps the original Speklone page live at /speklone/ (frozen copy of
  `legacy/index.html`; briefly a redirect to /mco/ before the user asked to keep the old page).

## 2026-09-24 · Speklone
- Stem separation made fully client-side (WebGPU, model from Hugging Face + Cache Storage); local
  native engine removed. Deployed to GitHub Pages (joaopmanso/speklone).

## 2026-09-23 · Speklone
- First release and iterations: quality forensics, AIFF fix, MP4 audio-track fix, player, pause fix,
  live view, sidebar layout, start page, tempo & key, stem separation.
  See [2026-09-23-speklone.md](2026-09-23-speklone.md).
