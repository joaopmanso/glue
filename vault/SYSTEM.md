---
updated: 2026-10-02
---
# GLUE: how it works now

**Read this first.** It says how GLUE works today, in one place. The ADRs (`vault/adr/`) say *why*, one
decision at a time, including ones later replaced. Open one only when you need the reasoning behind
something here; `grep -l` the ADR folder for a term rather than reading the index. A change that alters
anything below updates this file in the same commit.

## 1. The pieces
| Piece | What it is | Where |
|---|---|---|
| **Website** | Svelte 5 + TypeScript app on GitHub Pages (https://joaopmanso.github.io/glue/). Works alone, offline, without an account. | `src/` |
| **GLUE folder** | The user's data: JSON files, no database (ADR 0009). Chosen on first run (usually `Documents/GLUE`), or kept in the browser's own storage (OPFS) on a device with no folder. | see §2 |
| **GLUE Home** | Tauri 2 tray app on the user's computer (Windows, macOS). When it runs, it is the library's engine and the website on that computer is its screen (ADR 0104). | `home/` (Rust in `src-tauri`, service and settings pages in `ui`) |
| **GLUE Cloud** | Optional account: a Cloudflare Worker with D1 and a Durable Object for signaling. It holds the account's collections (never music), profiles and devices. | `cloud/` |

How a computer uses GLUE (the "This computer" card; ADR 0092):
- **Just this computer:** a GLUE folder, no account. Nothing leaves the computer, not even profiles.
- **Synced:** signed in. Collections are the account's, the same on every device.
- **With GLUE Home:** its songs stream to the user's other devices, and it analyses and writes the library.
- **Another device** (a phone, someone else's computer): sign in only. The account's collections are kept in
  the browser's storage and songs stream from the computers that have them (ADR 0077).

## 2. The GLUE folder
Lowercase `mco` names are the real file and setting names (from GLUE's old name); data depends on them, so they
stay.
```
mco.json                      index: profiles (library folders), lastProfile, aliases, aliasesV, lastAlias,
                              container, computer, appearance
profiles/<pid>/profile.json   a library folder: collections [{id,name}], lastCollection, cloudSync
profiles/<pid>/collections/<cid>/
  collection.json             name, music folders (roots), or the shared form (§4)
  tracks/<shard>.json         songs, sharded by the first 2 characters of the id
  analysis/<shard>.json       analysis summaries, same shards
  lists/<id>.json             one per playlist / folder / smart list
  sources/<id>.json           one per imported DJ library
  events.json                 the calendar (ADR 0074)
  dupes/<computer>.json       duplicates found on that computer (ADR 0098)
files/                        songs added on their own (copies, `fileKey: copy:…`)
backups/                      zips: daily (auto/), and pre-<why>-<date>-… before anything big
cloud/shared/<cid>.json       sync cursor and waiting clashes; cloud/shared/<cid>/<path> the agreed copy of each file
```
- **The store** (`src/store/collection.ts`, `CollectionStore`): one per open collection. It loads the files and
  keeps maps (tracks, analysis, lists, sources). It writes only the files that changed, marked per shard and
  debounced; `#saving` shows while writing. `store/home.ts` handles `mco.json` and `profile.json`;
  `store/fsx.ts` does atomic writes through a swap file. Loading lists every folder first, then reads the files through
  the handles the listing gave (`fsx.listFiles`), 32 at a time, counting them for the loading bar (`onProgress`,
  ADR 0177).
- **A song (`Track`):**
  - `status` is `linked`, `missing` or `unlinked`;
  - `rootId` + `relPath` place it in a music folder; `importPath` is where a DJ library had it; `fileKey` is used
    for copies; `sources` are the DJ libraries it came from;
  - tags and info, `rating`, `prep` (the Prepare tab: bpm, grid, cues), `unwritten` (info not yet written into
    the file).
- **Music folders (`roots`):** handles live in IndexedDB (`handleKey`), or GLUE Home finds them (§5). The
  incoming folder is a hidden root (`INCOMING_ROOT`) shown as "TO BE SORTED".
- **A music folder that can't be reached** (a network folder not connected, a drive not plugged in; an empty folder
  counts) is away, not gone: its songs aren't marked missing, analysed, rescanned or written into. They wait for it
  (ADR 0123).
- **A folder or song inside a music folder that can't be read** is skipped and said; its songs stay as they were
  (`scanFolder` `unreadable`, `applyScan` `unsure`, ADR 0134). GLUE Home's disk takes `:` and `\` in names except
  on Windows (`disk.rs` `inside`).
- **Songs with no file** (a DJ library's records whose files are gone) are matched to the library's songs on the
  "No file linked" page (`core/library/relink.ts`, a certainty each) and linked (`linkRecords`): the song takes
  their playlists and what was set on them, and their record's path (`Track.aka`), so a new read of the DJ library
  keeps them linked (ADR 0124). Matched a hundred songs at a time (`relinkIndex`: each song's names worked out once),
  and again only when the songs it compares changed (`lib/relink.svelte.ts`).
- **Caches** are not in the GLUE folder:
  - in the browser (OPFS `cache/`): details (the full analysis), thumbs (mini spectrograms), waveforms,
    fingerprints, covers, kept per collection;
  - in GLUE Home: `t/ w/ d/ p/ s/` keyed by profile, collection and song, plus `j/jobs.json` and `s/pending.json`.

## 3. Profiles and the library (ADRs 0113, 0114)
- **A profile is an artist alias:** id, name, colour, BPM range. The user sees these on "Who's using GLUE?".
  - Signed in, the account keeps the list: the union of every device's profiles (`POST /v1/profiles/merge`
    adds ids it never had).
  - A deleted profile is final everywhere (`gone`).
  - Each device keeps its own choice (`lastAlias`).
  - Code: `src/lib/profiles.svelte.ts`, `lib.alias`, `lib.useAlias`, `lib.createProfile`.
- **A GLUE folder has one library:** one profile folder, `mco.json.container`, which every alias opens (`lib.profile`
  is that folder). Older GLUE folders with several profile folders get a "Library" choice on "This computer".
- The BPM range belongs to the alias (`lib.bpmRange`). Backup and Cloud sync belong to the library, on "This
  computer".

## 4. Collections and the account's collections
- **A collection:** music folders, DJ libraries, songs, playlists, analyses, events. The sidebar views count songs
  with one function, `analysisState` (§6).
- **The library's own views** (All tracks, Recently added, a tag, Browse and its values) show one row per song, its
  best copy (`view.inLibrary`), and never a song whose file couldn't be analysed: that's only in "Couldn't
  analyse". Playlists and folders show what the user put in them. The phone counts the same way.
- **The table** (`TrackTable.svelte`): each view remembers where it was scrolled (`view.scrolls`), so a song's
  page and back finds it there. An artist, album, genre or label clicked opens that value's songs (a `facet`
  view, as Browse does); the second click on the one selected song still edits the value in place.
- "Lower quality" (internally `attention`, until 2026-09-30 "Needs attention") lists warn or bad verdicts, for
  information.
- **Removing a music folder removes this computer's songs in it** (ADR 0111). Songs left with no file are offered
  once (a bar, backup first).
- **Signed in with cloud sync on, every collection is the account's** (ADRs 0101, 0112), one copy in GLUE Cloud:
  - **Shared form** (`src/core/shared/project.ts`):
    - `collection.json` has `shared`, `members` (computer → its library folder and name) and `rootsBy` (each
      computer's music folders);
    - a song has `copies[computer]` (its file on each computer);
    - the same file on two computers (its size, and its name or "Name (2)") is one song, with a copy on each
      (ADR 0130): a scan makes a new file another computer's song's copy here (`applyScan`, `store.addCopy`), and
      pairs made before are joined when a collection opens and after a sync (`joinCopies`; GLUE Home's `repairs.rs`
      where it runs, ADR 0166);
    - analyses are stored per computer.
    - `here(meta, me)` projects it for this computer: another computer's song gets `remote`. `toShared` and
      `collectionShared` write back.
    - Only the GLUE folder recorded for a computer writes that computer's parts (`writesFor`, ADR 0108).
    - A store opened as the computer's own writes nothing once `collection.json` says shared: it reads it before each
      save and is opened again (`OutdatedStore`; GLUE Home's engine lets go of it). A record found without `copies`
      gets its writer's copy where it's read: the member whose music folder or DJ library it's from, else the only
      member, else nobody's (`withCopies`, ADR 0161).
  - **A computer's id** is its account device: the browser device that GLUE Home is the companion of. GLUE Home
    learns it (its engine's `identity.rs`, `GET /v1/computer`, ADR 0158; GLUE Cloud not answering as it should changes
    nothing); the tab gets it from GLUE Home's `hello`. Nothing is ever written under an unknown or stand-in id.
  - **Sync** (`src/store/shared/engine.ts`, ADRs 0106, 0107; GLUE Home's is its Rust port, `crates/glue-engine/src/sync.rs`,
    held to it by `tests/golden/sync`, ADR 0155):
    - GLUE Cloud keeps a snapshot (`shared_files`) and a log (`shared_log`); a push is one log entry on the
      latest revision, otherwise the device pulls, merges and pushes again;
    - only files marked changed are looked at, and every file every 30 minutes;
    - `merge3` merges per field; for per-computer parts, a computer's own side wins;
    - clashes wait in a box (ADR 0095); a computer never clashes with itself (`Place.own`: its GLUE Home, its
      browser's sign-in; one recorded before is dropped, ADR 0163).
    - GLUE Home syncs where it runs (`crates/glue-engine/src/shared.rs`); otherwise the tab does
      (`src/lib/shared.svelte.ts`). With GLUE Home, its clashes show in the tab's box (the engine's `clashes` and
      `resolve`, asked on attaching and after each batch of the feed, ADR 0163).
    - the files a sync wrote are told as it writes them (`syncShared(…, changed)`), and read again into the open
      collection even when the sync fails partway or the collection was opened again (ADR 0143).
    - the chip ("Synced") says in its tooltip where the last sync's time went: saving first, from GLUE Cloud, to it,
      reading the files it wrote, the rest (`shared.status.took`; the console too when over 2 s).
  - **The account's list of collections** (`GET /v1/shared`):
    - each computer's numbers (`stats.by`: songs, last change), sent after a sync only by a computer with songs
      or music folders;
    - rename (`PATCH`), and delete as a tombstone: 410 for its routes, `gone` in the list; each device backs it
      up, then forgets it; purged after 30 days.
    - The panel is one box per collection with its computers; a × takes a line off.
  - **Joining** (`shared.ensure`):
    - the account's first collection is shared quietly;
    - with others there, the box asks: put it into one (`moveInto`, which joins only once that worked), keep it as
      its own, or not now;
    - "New collection…" is the account's own.

## 5. GLUE Home
- **Local link** (`home/src-tauri/src/local.rs`), `http://127.0.0.1:47400–47409`:
  - `/hello` (who it is);
  - `/connect`: hands the link's token to the live website's origin, so any browser on the computer gets it
    (ADR 0115). The website looks for it (ten ports) every 15 s only while one of the account's GLUE Homes may be on
    this computer; otherwise once, and when which are online changes (ADR 0143). At the page's start, a browser that
    met one asks its last port; not answered within 0.3 s, the ten ports meanwhile (on Windows a port nobody answers on
    takes about 2 s to say so, ADR 0177);
  - `/fs/*` (GLUE Home's disk: `roots`, `list`, `file` with byte ranges, `write`, `mkdir`, `remove`, `stat`,
    `tags`, `dupes`, `pick`);
  - `/cache` (its analyses), `/rpc` (the engine, every request answered in Rust, ADR 0153, 0154), `/lease`, `/attach`,
    `/incoming`, `/dock`, `/folders`.
  - Every route but `/hello` and `/connect` needs the token (full, or read-only).
  - Stopped (Stop in the tray or settings, `running: false`), it answers only GLUE Home's own windows: the website
    carries on in the browser as if GLUE Home were quit, and nothing runs in GLUE Home (ADR 0122).
- **GLUE Home is Rust** (0.59, ADR 0160): its engine does the work, including its service (`crates/glue-engine/src/service.rs`:
  the status for the tray and the settings window, the Activity list, the timers: the shared sync 25 s after start then
  every minute and 2 s after an edit, the day's backups `backups/auto` (14 kept), a moved collection's cache followed,
  reminders (`reminders.rs`, the website's rule), which computer this is, updates when nothing is being sent; Start /
  Stop / Restart; new settings acted on). One engine for GLUE Home's whole run (its GLUE folder changes in place). Its
  pages are the settings window and the drag dock (no hidden page; `tests/homeBundle.test.ts` keeps the store, the
  sync, ICE and the platform layer out of them):
  - **engine, in Rust since 0.52** (ADR 0153, `crates/glue-engine`, `home/src-tauri/src/engine.rs`): one store per
    collection (`crates/glue-store`, ADR 0152), written straight to disk. It applies the tab's edits (ops over `/rpc`
    `edit`), saves them, and feeds changes back (`wait`); its jobs (removing songs) carry on after a restart. It
    repairs parts written under another id (ADR 0108), after a backup it makes itself. The settings window asks it
    things through `engine_cmd` and hears its status (`status`). Without a GLUE folder chosen it runs over an empty one
    of GLUE Home's own: online, taking songs sent to it, refusing a tab's requests (ADR 0158).
  - **analysis, in the engine since 0.53** (ADR 0154, `crates/glue-engine/src/queue.rs`, `library.rs`, `analyse.rs`):
    **one pipeline inside "songs at a time"** (ADR 0157): every file GLUE Home reads for the library goes through the
    queue's places, in this order: songs asked for now (a tab's "Analyse now", another device waiting for one:
    `analyse_for`), new songs' tags (`tags.rs`, only the tags; into the library together, so rows show who and
    what first), the library's songs, then the background's thumbnails for other devices. Each job counted in the
    window's meter and list, and its place given back however it ends (`Slot`, `Stepping`). An edit queues its own
    songs (`queue_edit`: added, or whose file changed); the collections are looked through only at start, after a
    sync took changes in, and on Restart. Passing failures (time-outs, memory) are retried, never stored (ADR 0109);
    after the third try the song is saved as failed, with why (ADR 0144). A song has 2 minutes, or a second a MB.
    Results go into the collection through the engine's stores while no pre-engine tab holds the lease. The engine
    finds songs and music folders itself (one drive search per folder, saved in the settings).
  - **FLAC is decoded by GLUE** (`src/core/formats/flac.ts`, ADR 0144; an ID3v2 tag before the stream is skipped), in every analysis worker (`decode.ts`): exact,
    any rate, read a part at a time; the browser's decoders for the other formats, and when it can't.
  - shared sync (in the engine since 0.54, ADR 0155: `shared.rs` with `sync.rs`, GLUE Cloud called from Rust with this
    GLUE Home's token), song info written into files (`writeUnwritten`), backups,
    duplicates moved or recycled
    (ADR 0070), reminders, updates.
  - **DJ libraries, in Rust** (0.64, ADR 0167): `crates/glue-interop` reads rekordbox XML, Traktor NML, Apple Music XML,
    Serato, Engine DJ's `m.db` (SQLite, from a copy in memory) and M3U as the website's `src/core/interop` does, and
    brings them in as its `applyImport` and `syncLinkedLists` do (held to it byte for byte: `tests/golden/interop`,
    `tests/golden/import`). The engine's `dj.rs` follows every collection's libraries it can reach (a music folder,
    the GLUE folder, `hl:` a file chosen with its dialog) every 5 s, by date, and reads a changed one again as its own
    edit; it finds new ones in the music folders and the GLUE folder (`djFind`), and imports the one the page adds
    (`djImport`). The page only shows each one's state (`dj`) and asks for Refresh (`djRefresh`).
  - **Cues, loops and beat grids from every app** (0.65, ADR 0168): each record keeps them (`SourceTrack.cueList`,
    `grid`), Engine DJ's from `PerformanceData` (`enginePerf.ts`, `glue_interop::perf`); Prepare shows each app's and
    takes them on a click. GLUE writes into a DJ app's library only as ADR 0168 allows (through GLUE Home, opt-in per
    library, a backup first, the app closed): not yet in this release.
  - **The main DJ library** (0.66, ADR 0169): one per computer, `Source.main` (kept through every read). A song's BPM is
    GLUE's correction, then the main library's grid, then the analysis (`bpmInUse`); its grid and cues GLUE's own,
    else the main library's (`lib/cues.ts` `mainOf`, `prepare.grid`). The two-way sync is with it.
  - **Engine DJ kept in step both ways** (0.67, ADR 0170): with `Source.sync` on the main Engine DJ library, GLUE Home's
    `djsync.rs` (after each look, when GLUE's library or a database changed) merges each song's hot cues, saved loops
    and grid three ways (`glue_interop::sync`; pads are its hot cues, memory loops its saved loops) against what they
    last agreed on (GLUE Home's cache `dj/…`), writes Engine DJ's `PerformanceData` only while Engine DJ and its
    analyser aren't running (`Host::apps_running`), after a copy (`dj-backups/`, one a database each time Engine DJ has
    been closed, the last 3 kept, ADR 0173), and takes Engine DJ's changes into
    `prep` as its own edit; clashes are settled in Prepare (`djClashes`, `djResolve`).
  - **Its playlists stay in its DJ collection** (0.71, ADR 0178): GLUE's copies are imports, following the library one
    way (`syncLinkedLists`, the gone-list removal and the library's order as for any library). 0.68–0.70 kept every
    playlist in GLUE's folder of the library in step both ways (ADR 0171–0173); 0.71 takes those copies out once
    (`djlists.rs` `dj_clear_copies`: a backup, the bin, `listsOut` in the cache) and doesn't merge playlists. Its
    three-way merge (`dj_sync_lists`, `glue_interop::enginedb`, `glue_interop::sync::splice`) is parked for the next
    step: GLUE's own playlists mirrored in the app's "GLUE" folder. Engine DJ's songs whose file the duplicates'
    clean-up took are still pointed at the copy kept (`dj_relink`, ADR 0172). A damaged library's entries are put back
    by hand with `crates/glue-interop/examples/restore_lists.rs` (ADR 0173).
  - **Its Collection and its drives' copies** (0.73, ADR 0182; `djdrives.rs`): Engine DJ shows the computer's Collection
    (the database in the Music folder, `engine_collection`); a drive's database holds a copy of the lists with its
    songs, the same ids. GLUE Home reads the tree from the Collection (`combine_engine_with_tree`, `origin.tree`),
    writes every playlist change there (a new id free in every database, `make_room`), then makes what changed (the
    tree before and after) in each drive's copy (`dj_to_drives`: only what changed; a list there only if it holds that
    drive's songs or is there already). Once, F:'s GLUE-only lists and clashes put right (`dj_tree_repair`,
    `treeFixed`). `djPlaylists: false` turns GLUE's playlist writes off.
  - **Edited from its DJ collection** (0.72, ADR 0179; `djedit.rs`): the page's `djEdit` operations (new, rename, move,
    delete; songs add, remove, shift) wait in GLUE Home's cache (`ops`), are put on `Source.tree` at once (`wait`) and
    again after each read, and are written by the sync while Engine DJ is closed (a backup, one transaction, a
    savepoint each; a new list's `n:` id becomes Engine DJ's, remembered in `made`). The cache is written one at a time
    (`dj_keep`). With the cues, each song's info both ways (`djinfo.rs`: title, artist, album, genre, comment, label,
    year, rating; each side against its own last-agreed value; both changed: GLUE's; taken in as edited fields).
  - **GLUE's own playlists in its "GLUE" folder** (0.72, ADR 0180; `djmirror.rs`): a list without `origin` whose
    `apps` (or a folder's it's in) has "engine", with the folders it's in, under a top-level "GLUE" folder in Engine DJ;
    which is which in GLUE Home's cache (`mirror`, `glueFolder`), merged three ways as ADR 0171–0173 did (`mirrorBase`,
    `mirrorOrders`, `splice`); one made in the GLUE folder in Engine DJ comes into GLUE; gone from a side, asked
    (`djQuestions`, `djListResolve`); turned off, taken out. The page sets it (**Keep in Engine DJ**) and shows the
    app's icon.
  - **One DJ sync at a time** (0.72.1): the timer's turn isn't started again while one runs (`dj_ticking`), and every
    sync and the answers that change what it keeps hold `dj_one`; what it wrote into Engine DJ is kept in the cache at
    once (`dj_keep`), before anything else can fail. Two at once made GLUE's playlist again and again (2026-10-09);
    0.72.1 puts that right once (`dj_mirror_repair`: the GLUE folders 0.72 made emptied, GLUE's copies into the bin,
    backups first, `mirrorFixed`).
  - **A song that can't go to Engine DJ** (0.72.2): `Songs::song` says why (`missed`: not here, another computer's,
    no Engine DJ library on its drive…); the GLUE folder's merge keeps it in GLUE's list where it was (`keep_unsent`),
    and GLUE Home keeps the reasons by list (`unsent`, `djUnsent`): a **!** by the list's icon and a line in its view;
    the activity says it when it changes. An edit of Engine DJ's own playlists says it in the activity.
  - **Its drive's Engine DJ library** (0.72.3, ADR 0181): the start disk's found in the Music folder too; a file's real
    place (links followed); none on its drive: said (making one, `enginedb::create_like`, is held until it's known
    what Engine DJ does with what GLUE writes: the GLUE folder isn't shown in Engine DJ, 2026-10-10). The page's **Move to music folder** (TO BE SORTED) lists only the collection's
    music folders (GLUE Home's `/folders` has every one it was ever told of).
  - streaming to other devices over WebRTC, signaled through GLUE Cloud (ICE servers: `src/core/ice.ts`, asked with each one's credential; the site's `remoteFiles.svelte.ts`).
    The other device's player gets the bytes as they arrive (ADR 0174): the streaming service worker answers a range
    as a stream, the page fetching it in pieces (256 KB, then 2 MB) when the player has room; the song's start (a new
    connection, the first answer, the first music, the first sound, and the route: direct, through the router or the
    relay) is a console line once the song plays (`GLUE: Started in …`; not on the player, ADR 0176).
    Back from the background after more than 10 s (a phone kills its sockets there), the room is connected again and
    the sessions made again at once; a handshake waits up to 8 s for the room (ADR 0175).
    **GLUE Home's side of the signaling is its engine's** (0.57, ADR 0158, `crates/glue-engine/src/room.rs`): the room's
    socket (`home/src-tauri/src/signal.rs`, tungstenite over TLS), a ping every 30 s, a new token at 50 minutes, again
    after 1, 2, 4… 60 s, removed (4001) and replaced (4000); offers answered through glue-rtc (`rtc::Conns`), early
    candidates held; a `shared` message starts a sync; ICE servers `ice.rs`.
    Bounded (ADR 0132): a connection not open within 30 s is let go, and an offer it can't take is answered
    "bye". The website says "bye" when it gives up, and waits 5 to 60 s before connecting again for background asks.
  - **The library store in Rust** (ADR 0152, `crates/glue-store`): `CollectionStore`, the shared projections and the
    repair, ported line for line with JavaScript's JSON rules, held byte for byte to the TypeScript by
    `tests/golden/store` (recorded by `tests/store.golden.test.ts`, replayed by `crates/glue-store/tests/golden.rs`).
    The engine's since 0.52 (ADR 0153). Its backups are read by the website's `readBackup`
    (`tests/golden/store/backup.zip`).
  - **The GLUE window** (ADR 0151, 0.50, `home/src-tauri/src/window.rs`): the tray and "Open GLUE library" open the
    live site in GLUE Home's own window (`?app=window`, `inWindow()`); only the site stays in it (other links go to
    the browser, Google's sign-in is its popup, downloads go to Downloads). The settings' "Open the library in" can
    send it to the browser. It finds GLUE Home at once (`/connect`) and opens on the library; GLUE Home signs it in as
    this computer with a single-use code it puts into the window as it opens it (ADR 0159, `window_code`,
    `__glueHomeSignIn`, traded at `/v1/auth/window`).
  - **Its first run** (ADR 0159, 0.58): a guide at the top of its window (the account, the GLUE folder found or made in
    Documents, the incoming folder, start with the computer), until finished or hidden (`setupDone`); a new, empty GLUE
    folder is set up by the website the first time it opens it.
  - **GLUE Home's connections are Rust's** (ADR 0150, 0.49, `crates/glue-rtc`, `home/src-tauri/src/rtc.rs`): the peer
    connections, their channels, pings, uploads, cache files, songs sent in and every song byte sent out; what they find
    and do (candidates, states, activity, songs received) goes to the engine on one thread, in order. **The library's
    answers are the engine's** (0.55, ADR 0156:
    `crates/glue-engine/src/answers.rs`, `covers.rs`, `incoming.rs`): rtc.rs hands each request to `Engine::answer`
    and sends what it says (data and bytes, or a song's file from disk). Messages up to 256 KB. Tests: `crates/glue-rtc/tests`, `scripts/rtc-probe.mjs`
    (Edge), `e2e/home-rtc.ts` (the e2e stand-in, in the test's service page, which also holds the test engine's room
    socket: the test's `routeWebSocket` stands in for GLUE Cloud's room).
  - **Sessions** (ADR 0133, 0.41): each device's tab keeps one with each of the account's other GLUE Homes,
    opened at sign-in (`remoteFiles.tend`), kept alive by a `ping` every 15 s; requests, playing and songs sent all go
    through it. Never to this computer's own GLUE Home (ADR 0137: 127.0.0.1 only). GLUE Home keeps one per tab, at most
    "Most at once" (5, other devices only: its own computer's browser isn't counted), refuses a new one when full, and lists them
    with Disconnect (the engine's `sessions.rs`, `room.rs`, ADR 0158; Disconnect refuses that tab for an hour). It says `{t:'session'}` first, then tells every session what happened:
    `made` (songs analysed: rows and song pages show them at once) and `incoming` (TO BE SORTED changed);
    covers for songs whose tags have none, looked up on public services (`covers.rs`, ADR 0086, 0156; held to the
    website's `coverSearch.ts` by `tests/golden/covers.json`).
  - **No audio JavaScript** (ADR 0147, 0.47): songs arriving in the incoming folder (the engine's `analyse_incoming`
    since 0.57, ADR 0158; those that came while it was off, `analyse_waiting`), covers from
    tags (only the tags read) and from cover services, and waveforms from kept details are the Rust engine's, like the
    analysis (the last three in the engine's answers since 0.55, ADR 0156). `tests/homeBundle.test.ts` fails when
    `home/ui` reaches the website's analysis, decoders, workers or audio packages; CI fails on a worker in
    `home/dist`.
  - finding music folders on disk (`library.ts` `locate`, `folderOf`): one drive search per folder, and what's
    found is kept in its settings (ADR 0122).
- **The tab in Home mode** (`src/platform/homeDisk.ts`, `src/lib/engine.svelte.ts`, `localHome.svelte.ts`):
  - It reads the GLUE folder through the link.
  - **It's only GLUE Home's screen** (ADR 0162): `lib.homeRuns()` (`engineClient.runs`: the engine answered, asked
    before a collection opens) and it starts none of the library's work: no shared sync, analysis, daily backup,
    verdict re-check and open-time repairs (GLUE Home's, ADR 0166), song info into files, duplicates (matching, groups, playlists' best copies, ADR
    0164, 0165), or DJ libraries (finding, importing from where they are, following: GLUE Home's, ADR 0167; the page
    still follows one only a browser was allowed into, a `place:`).
  - Its store is a client (`CollectionStore.sink` sends every change as an op), and it releases the writer lease. A
    song goes with the record the tab had (`was`): the engine applies only the fields changed from it over its own
    (`changed_over`), so a change GLUE Home made meanwhile stays (ADR 0163). The engine's store is its files' only
    writer: the analysis builds and saves its results under one hold of it.
  - Overviews and details come from GLUE Home's `/cache` when the browser has none (ADR 0110).
  - **What the user asks for goes first** (ADR 0138, 0139): the page's background loads from GLUE Home's cache go on a
    socket (GLUE Home 0.42, `ws.rs`, `src/platform/homeSocket.ts`: numbered, cancellable), else through a gate (3 at a
    time, `src/lib/gate.ts`), leaving the browser's other connections for playing; while a song plays
    (here or streamed), GLUE Home starts no new analysis beyond 2, and the running ones' reads wait (ADR 0140,
    `local.rs` `Paced`); its engine reads a song whole from disk, in Rust (ADR 0148).
  - **Songs played have their own port** (GLUE Home 0.42.2, ADR 0141: `local.rs` `PLAY_PORT`, `playPort` in `/hello`
    and `/connect`; `localHome.playUrl`, `platform.fileLink(…, play)`): the browser's 6 connections there are the
    songs' only. A file read resolves only its own folder (`main.rs` `resolved`, remembered), never the NAS or
    another drive for a song elsewhere.
  - The analysis bar shows GLUE Home's own queue (its `status`: left + running), the same "left" its window shows
    (ADR 0135). A network folder's songs take turns, at most "From each network folder at a time" (the user's, no limit unless set, ADR 0136; `home/ui/lanes.ts`); its window shows the speed (tiles, a ten-minute chart, and meters of the songs running reading or analysing, `cache.steps`) and a suggestion (`home/ui/speed.ts`); new songs' tags are read
    by GLUE Home in its queue (0.56, ADR 0157; the tab reads none); for an older GLUE Home, 200 a request
    (`/fs/read-tags`).
  - A folder dropped onto the library is found by GLUE Home (rpc `where`, a 5 s search, then its dialog asks; the page
    says which, ADR 0134) and becomes its folder (`home:<id>`); one
    inside a music folder isn't added (ADR 0122).
  - A song dropped onto the library is found by GLUE Home (rpc `whereFile`): in a music folder it's that folder's
    song; elsewhere GLUE Home keeps its path (`Track.filePath`). The tab analyses only songs only it can read (a
    browser handle and no `filePath`); GLUE Home analyses the rest (ADR 0125).
- **Overviews and covers load for the rows on screen** (`thumbs`, `waves`, `covers`):
  - newest request first;
  - a row that scrolls away drops what it asked for (`hold`/`drop`), so a jump down the list loads the new rows
    at once; rows are held by the song's id, and what a cancel took is asked again when the row is back (`lost`,
    ADR 0142);
  - the table draws 12 rows beyond each edge, and keeps the song at the top of its window where it is when the list
    changes by itself (ADR 0139);
  - from another computer, asked until answered (`src/lib/onScreen.ts`, ADR 0131): a song the ask couldn't reach
    is asked again soon while its row is on screen; "none there yet" later, or when its row is back.
  - A page opens Home mode when it has the link, whatever the browser; on the start page or a browser-storage
    library it switches over when GLUE Home appears.
- **Releases:**
  - version in `home/src-tauri/tauri.conf.json`, `Cargo.toml` and `Cargo.lock`;
  - a push to `main` with a new version builds and publishes the signed release (tag `home-v<version>`, made by
    the build: one build per change); GLUE Home updates itself within a few hours.

## 6. Analysis
- **Where it runs:** in GLUE Home where it runs, natively (ADR 0148: its queue hands each song to `analyse_song`, which
  reads, analyses and writes the cache in Rust); otherwise in the tab, in a worker pool (`src/lib/pool.ts`,
  `src/workers/`). It makes the summary (verdict and tier, bandwidth, bit depth, BPM, key), the full details, a
  fingerprint, a mini spectrogram and a waveform. Versions: `ANALYSIS_VERSION` 3, `VERDICT_VERSION` 8
  (`src/store/types.ts`).
- **The native engine** (`crates/glue-audio`, ADR 0147): the same analysis in Rust, a line-for-line port with
  JavaScript's numbers, for GLUE Home (0.44 linked it, 0.45 made every stored file and decoded lossy files, with a check
  against the stored results in GLUE Home's window, 0.46 analyses with it, 0.47 has no audio JavaScript left, 0.48
  decodes DSD and retries the JavaScript's failures once, ADR 0149). DSD (DSF, DSDIFF) is analysed as its 88.2 kHz PCM
  conversion (`formats/dsd.rs`), with a finding that says so. A deadline (`glue_audio::control`) stops a song past `timeFor`. In e2e tests the mock stands in with
  the website's pipeline (`e2e/home-analyse.ts`, built into `.e2e-home/`, never `home/dist`). Lossy goldens come from Edge (`e2e/golden.spec.ts`, `GOLDEN=1`). CLI: `glue-audio analyse | bench`. Held to the TypeScript's results by `tests/golden` (`tests/golden.test.ts` writes them and fails when
  they're stale; `crates/glue-audio/tests/golden.rs` compares). A native summary has `engine: "glue-audio <version>"`.
- **`analysisState(t, a)`** (`src/core/library/analysed.ts`) returns done, failed, waiting, elsewhere (another
  computer's song) or nofile. The sidebar, Stats, the analysis bar and both queues use it.
- **Quality verdicts:** `src/core/audio/verdict.ts` (Speklone's forensics); `tests/parity.test.ts` checks them
  against `legacy/index.html`.
  - A hi-res file is judged by what reaches past 24 kHz above digital silence (`ultrasonic`, ADR 0116). A quiet
    top end that carries on is genuine; content that stops at 22 or 24 kHz, then falls off a cliff, is
    upsampled.
  - A steep top end with content above that follows the music, and without frequent drop-outs under it (under
    12 %), is a lowpass in the master: "Lossless" (ADR 0119).
  - A song on another computer whose analysis failed there for good is "failed" on every device too.
  - A rule change bumps `VERDICT_VERSION`, and stored verdicts are judged again from the details kept, never the file:
    on open in the browser (`recheckVerdicts`), once a run in GLUE Home where it runs (`verdicts.rs`,
    `glue_audio::recheck`, ADR 0166).
  - The tab tries a failing song twice before saving it as failed, since a failed song leaves the library's lists.
- **Duplicates** (`src/lib/dupes.svelte.ts`, `core/library/duplicates.ts`):
  - who matches and groups: GLUE Home where it runs (`crates/glue-engine/src/dupes.rs`, ADR 0164, 0165: its cached
    fingerprints, five seconds after its analysis saves results, published in a shared collection; the groups
    (`buildGroups`) and the playlists' best copies (`bestLists`) after every match and half a second after the songs,
    the user's say or another computer's matches change; the page asks it, `dupes`, and shows its groups); otherwise
    the page (a worker, the browser's fingerprints, the same pure functions);
  - how they're found: fingerprints ("same recording"), and artist + title with lengths within 3 s ("probable",
    `nameGroups`: split into copies of one version);
  - names are compared one way everywhere (ADR 0145, `core/library/names.ts`): `songName` for Duplicates and No file
    linked (release labels and featuring credits left out, "(Live at …)" kept), `fold` for joining a collection, `bare`
    for the cover look-up;
  - only copies of the same version count (`sameVersion`: the same version words, lengths within 10 s or 6 %,
    ADR 0117);
  - the user's say: "Keep · not a duplicate" on a copy (`meta.dupApart`), and "Mark as duplicates" on chosen
    songs (`meta.dupManual`);
  - only the best copy shows and is used, anywhere but Duplicates and a music folder's own files; playlists are
    rewritten to the best copies whenever groups change (`bestInLists`, ADR 0120);
  - the best copy: genuine, then lossless, then the optional main music folder's (`meta.mainRoot`, ADR 0121), then
    resolution; "Make it the best" overrides;
  - each group has a certainty (0–100) and concerns; the page filters by type and certainty, ticks all shown, and a
    bulk removal leaves out groups with concerns unless included.
- **Other analysis:** duplicates (fingerprints, three tiers, ADR 0013); stems in the browser (HT-Demucs,
  `src/core/stems`).

## 7. GLUE Cloud (`cloud/`)
- **Accounts:** Google, or email and password.
- **Devices** (`devices`, ADR 0091): a browser that holds music is a `device`; one that only looks is a `browse`
  session; a GLUE Home is `home`, the companion of its computer's browser. Pairing is by code.
- **Collections:** `shared_collections`, `shared_files`, `shared_log` (§4). **Profiles:** `profiles` (§3). The old
  `sync_*` tables are unused, and kept until the user says otherwise.
- **Signaling Durable Object:** presence, and broadcasts to the account's devices (`shared`, including `gone`, and
  `profiles`), plus WebRTC signals; TURN relay credentials come from `/v1/turn`.
- **Operations:** a daily cron purges deleted collections; there's an admin panel (`#/admin`).
- **Gluey's "seen"** (`users.guide`, ADR 0126): `/v1/me` returns it, `PATCH /v1/me/guide` merges it.
- **GLUE Home's window signed in** (ADR 0159, `window_codes`, migration 0012): a GLUE Home asks for a single-use code
  (`/v1/auth/window-code`, two minutes); its window trades it once (`/v1/auth/window`) for a session of GLUE Home's
  companion (made when it has none).
- **Deploy:** `.github/workflows/cloud.yml` applies D1 migrations, then deploys.

## 8. The website's layout
- **Routes:** `#/<view>` the library on a view, `#/track/<id>` a song's page (a sheet over the library, which stays
  mounted underneath: `TrackSheet.svelte`; tabs, Previous and Next replace the address, so closing, `closeTrack`, is one
  step back, or the library's address when it was opened directly; 2026-10-08), `#/events` (and `#/events/<id>`), `#/analyze`, `#/admin`,
  `#/help`. A view's address (`view.svelte.ts` `viewHash` / `viewOf`, 2026-10-08): `#/all-tracks`, `#/recently-added`,
  `#/not-analysed`, `#/couldnt-analyse`, `#/lower-quality`, `#/no-file`, `#/duplicates`, `#/playlist/<id>`,
  `#/dj-library/<id>[/<playlist>]`, `#/folder/<id>`, `#/tag/<name>`, `#/browse/<field>[/<value>]`. Choosing a view is a step
  in the browser's history (Back and Forward go through views); an address opens its view (one gone since: All tracks);
  `#/` alone is the library as it was (a song page's "← Library"), made the view's address (`router.replace`). A view
  that goes while shown (a playlist deleted, "Added songs" emptied) gives way to All tracks.
- **State** (`src/lib/`):
  - `library.svelte.ts` (the library's state, `lib`) and its methods by concern in `src/lib/library/` (ADR 0146):
    `glueFolder`, `profiles`, `collections`, `folders`, `djLibraries`, `edits`, `files`, `analysis`; a new method goes
    in its concern's part (`this: Library`), a new field in the class (the fields keep their order, ADR 0146);
  - `view.svelte.ts` and `sidebar.svelte.ts` (what's shown);
  - `shared.svelte.ts`, `profiles.svelte.ts`, `account.svelte.ts`, `anywhere.svelte.ts` (the account);
  - `engine.svelte.ts`, `localHome.svelte.ts` (GLUE Home);
  - `player.svelte.ts`, `thumbs.svelte.ts`, `dupes.svelte.ts`.
- **Opening** (ADR 0177): `lib.loading` (the step, files read of how many, the collection being opened) from the page's
  start until the library or the start page is there; `Opening.svelte` shows it as a card with a bar (the start, and
  the library while a collection opens: the collection list keeps naming it), `TopLoading.svelte` as a line along the
  top of every page (also while `lib.job` runs).
- **UI** (`src/ui/`, `src/ui/library/` for the library): `Welcome.svelte` (start, "Who's using GLUE?"),
  `LibraryView.svelte`, `LibSidebar.svelte`, `TrackDetail.svelte`, `CloudPanel.svelte`, and `src/ui/phone/` for
  the phone layout (ADR 0078).
- **OS access** only through `src/platform/` (ADR 0007): the browser's handles, or GLUE Home's disk.
- **Gluey** (ADR 0126):
  - tours as data (`src/core/guide/tours.ts`), pointing at `data-guide` parts of the UI;
  - `src/lib/guide.svelte.ts` runs them; `src/ui/guide/` draws them;
  - the first tour shows once per person: "seen" is the union of the browser's, the GLUE folder's (`mco.json`
    `guide`) and the account's;
  - help articles are `src/help/*.md` (one per feature; Gluey's panel and `#/help`); tips the first time some
    views open (`src/core/guide/tips.ts`). A feature's change updates its article and its tour.

## 9. Known issues and next
- Under full-suite load, a few e2e tests are timing-sensitive (a play button late, "Marked fine" against a
  finishing analysis, a playback check). They pass on their own.
- Next:
  - events naming a profile (alias);
  - M4 step 3: the rekordbox XML export with cues and grid.
- Open milestones: `vault/product/roadmap.md`. The user's latest state: `vault/log/handoff.md`.
