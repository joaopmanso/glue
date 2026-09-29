---
status: accepted
updated: 2026-09-28
---
# GLUE: one collection, the same on every device (GLUE Home as the computer's backend)

## Context
The user (2026-09-28) lost every playlist on every device, and states the goal:
- **One collection, identical on every device.** Laptop, desktop and iPhone show exactly the same
  songs, playlists, analyses, duplicate badges and DJ libraries. A collection only gains or loses
  items.
- **GLUE Home is its computer's backend.** Every task and every piece of information must be
  available remotely.
- **Conflicts are rare but handled:** a small box offers Keep this device's / Take the other /
  Merge.
- **Also asked for:**
  - DJ libraries visible remotely, with each computer's icon, and their playlists importable from
    any device;
  - the "2×/3×" duplicate badge for another computer's songs;
  - one device per computer, however many browsers;
  - an admin panel showing free-tier usage (TURN, D1…).

Decisions (asked on 2026-09-28):
- **One copy in GLUE Cloud** (supersedes ADR 0040's per-device copies with merge on the fly and last
  change wins);
- **ask for each conflict;**
- **a computer is its GLUE Home,** and browsers attach to it; without GLUE Home, a manual "same
  computer" merge.

What's wrong today (from exploring the code):
- **Each device uploads its own copy** (`src/lib/sync.svelte.ts pushNow`), and every viewer merges
  them its own way (overlay `core/library/overlay.ts`, cloud view `openGroupNow`). DJ libraries are
  never downloaded (`wanted` filters out `sources/`). Fingerprints live only in each browser's
  cache, so remote songs get no badge (`lib/dupes.svelte.ts` skips `t.remote`).
- **The playlist loss comes from `sync.overlay` and `overlayBase` outliving a collection switch
  or reopen.** `closeCollection` (library.svelte.ts ~475) never tells sync. The next `sendEdits`
  compares the old snapshot with the new store and sends `list-del` for every list. `translate`
  (mergeCollections.ts:111) carries that to every member.
  - DJ-library re-reads can mass-delete too (`store/linked.ts syncLinkedLists` 85-91).
  - There is no bin and no automatic backup.
- **A device is a browser profile** (random id in localStorage, created in `cloud/src/api.ts
  browserSession`). A GLUE Home is the companion of exactly one browser (`claim` revokes the
  others).
- **GLUE Home never uploads.** The cloud files uploads and acks under the caller's own device id.
  Its analysis drops the summary and the fingerprint (`home/ui/cache.ts analyse`).

## Three ways to use GLUE (every phase must keep all three working)
The user (2026-09-28): account for use without a cloud account or GLUE Home. Onboarding offers the
choice. A local-only user can turn on cloud sync later, without GLUE Home.

| Mode | What it is | Who does the computer's work |
|---|---|---|
| **Local only** | No account, nothing leaves the machine (ADR 0002). Today's library in the GLUE folder (or browser storage). | The open tab. |
| **Local + cloud sync** | Account, no GLUE Home. This browser's collection becomes the shared one in GLUE Cloud; other devices see it and edit it. | The open tab, while it's open. |
| **With GLUE Home** | The computer's GLUE Home runs without a tab, streams to other devices and acts for the computer. | GLUE Home; the open tab while it holds the lease. |

What this means for the design:
- **The "computer's worker" is whoever runs on that computer:** GLUE Home if there is one, else the
  open GLUE tab. The shared engine, analysis summaries, fingerprints and duplicate groups, the
  DJ-library follower and publishing, and file jobs all live in `src/store` and `src/core`, callable
  from a tab and from GLUE Home's service page alike.
- **Without GLUE Home**, a computer is its browser (`computer_id` = its device id; browsers merge by
  hand).
  - Its songs stream to other devices only while its tab is open (the website answers the channel
    like GLUE Home does; later phase, optional). Otherwise they show as "on Laptop" and can't be
    played elsewhere.
  - Its data (metadata, analyses, duplicates, DJ libraries) syncs whenever the tab runs.
- **Local only** never calls GLUE Cloud:
  - the shared engine is off;
  - the collection works exactly as today;
  - it still gets the bin, the guarded DJ re-reads and the daily backups (Phase 0);
  - duplicates and DJ libraries work locally as today.
- **Turning cloud sync on later** ("Turn on cloud sync" in the profile and in Settings) uses the
  Phase 4 seeding with one member: the local collection becomes the shared one, with the same ids.
  Turning it off keeps the local copy and stops syncing.
- **Adding GLUE Home later** ("+ GLUE Home") pairs it, attaches this browser (Phase 1), and GLUE Home
  takes over the computer's work. Removing it gives the work back to the tab.

## Computers and sessions (the user, 2026-09-28)
- **Several GLUE Homes on one account** (a desktop at home, a studio machine…).
  - Each is its own computer.
  - A track's `copies` say which computers have its file.
  - Playback streams from whichever computer that has it is online: this one first, then the fastest
    to answer.
  - Each GLUE Home works only for its own computer: its files, analyses, DJ libraries and jobs.
  - Nothing may assume a single GLUE Home per account (today `finder()`, `companionOnline`,
    `homeFor` and claim's revoke do).
- **Signing in to browse is a session, not a device.** For example, the iPhone signs in to play a
  song or make a playlist.
  - A **device** is a computer that holds music: a GLUE Home, or a browser with its own GLUE folder
    and collection.
  - A **session** is only a sign-in. It opens the shared collection (kept in the browser's storage
    for speed and offline use), streams, and edits.
  - A session doesn't appear in Devices, never creates a collection, and never joins a group. This
    also ends the "Safari on iOS, 0 tracks" member.
  - A browser becomes a device only when it gets a GLUE folder with its own music (the Phase O
    cards), or when it attaches to a GLUE Home.
- **Where sessions show:** in the admin panel, as all sessions with the last time and place seen,
  platform, device name and signed-in account. In the account menu, as "Signed in elsewhere",
  where each one can be signed out; this is not in Devices.
- **Cloud schema** (Phase 1):
  - `sessions`: today's refresh credentials plus `kind 'browse'|'device'`, platform, last seen and
    app version;
  - `devices` only for computers.
  - Existing browser devices with no collection upload become sessions (backfill), which removes the
    phone's empty member from the group.

## Phase O: onboarding with the choice (site; before or with Phase 2). Done 2026-09-28 (ADR 0092)
- **First run** (`Start.svelte`/`Welcome.svelte`) asks one question with three cards:
  - **"Just this computer"**: local only, and pick the GLUE folder;
  - **"This computer, synced to my other devices"**: sign in, then pick the GLUE folder, and cloud
    sync is on;
  - **"This computer, with GLUE Home"** (recommended for the computer that holds the music): sign
    in, install and pair GLUE Home; Home mode picks the folders.
  - A fourth, smaller entry: **"Open my library from another device"** (a phone or a second
    computer): sign in only (ADR 0077).
- **Each card says in one line what it means:** what leaves the machine, what works when the
  computer is off.
- **Settings › This computer** shows the current mode, with "Turn on cloud sync" / "Add GLUE Home" /
  "Stop syncing", so no choice is final.
- Existing users keep their mode (worked out from sign-in and pairing); nothing is asked again.
- **Tests:** e2e for each of the three first-run paths, for local-only then turning on sync, and for
  sync then adding GLUE Home (fake cloud plus stand-in GLUE Home).

Each phase below ships on its own (checks, unit and full e2e, then deploy; GLUE Home version bump
and tag when `home/` changes). The vault goes in the same commit (ADR per phase, changelog,
features, handoff).

## Phase 0: safety first (right away). Done 2026-09-28 (ADR 0089, 0090)
- **Fix the deletion bug** (sync.svelte.ts, library.svelte.ts):
  - `lib.onCollectionClosing` fires before `store = null`. `sync.leaveCollection()` sends pending
    edits against the old store, then clears the timers, `overlay`, `overlayBase`, `others`,
    `otherMembers` and `overlayGroup`, and bumps `run`.
  - The baseline is tied to its store: `sendEdits()` and `send()` return early when
    `lib.store !== overlayBaseStore`.
- **Mass-deletion guard:** more than 3 lists, or more than 10 %, deleted in one diff (`sendEdits`,
  `send`, and `home/ui/edits.ts` before applying) waits for a confirmation box, "Delete 42
  playlists on Desktop and Laptop?", instead of being sent.
- **Bin:**
  - `CollectionStore.deleteList` (store/collection.ts) first writes the list and its whole cascade
    to `GLUE/bin/<pid>/<cid>/<ts>-<id>.json`.
  - The sidebar gets **Recently deleted** with Restore. Restore puts a list back under its old
    parent if that still exists, else at the top.
  - Entries are purged after 30 days.
  - Deletions from every path land there: the UI, `apply`, GLUE Home, and DJ-library re-reads.
- **DJ-library re-reads** (`store/linked.ts`):
  - A copy whose list is missing is only marked (`pendingGone` on the Source). It is removed only
    if still missing on a read at least 1 minute later.
  - A read with fewer than half of the previous tree's lists removes nothing, and says the library
    looks incomplete.
- **Daily backups, 14 kept:** the writer (the tab holding the lease, else GLUE Home) runs
  `store/backup.ts buildBackup` into `backups/auto/<date>-<pid>.zip`.
- **Recovery (only with the user's go-ahead: it touches cloud data):** D1 Time Travel
  **[UNVERIFIED: a 7-day window on the free plan]**. Restore to before the loss, export the
  desktop's `lists/` rows, restore forward again, then bring the missing lists back with their ids
  and parents. The other route is re-importing from Engine DJ.
- **Tests:**
  - unit: a pure `EditSession` (the baseline) produces no ops across a store swap or reload;
    linked.ts guards; bin restore;
  - e2e: switching collections in a merged group sends no `list-del` (route intercept).

## Phase 1: computers, sessions, several GLUE Homes (cloud + site + GLUE Home). Done 2026-09-28 (ADR 0091)
Also, per "Computers and sessions" above:
- the `sessions` table and the backfill;
- browse sign-ins make no device;
- lookups go by computer and handle several homes (`finder`, `companionOnline`, `homeFor`,
  streaming source choice);
- admin › Sessions.
- **Migration `0005_computers.sql`:**
  - `devices.computer_id`: a home device's own id; a browser's attached home;
  - backfill from `companion_of`.
- **`claim`** revokes an older home of the same computer, not the other companions of a browser.
- **Attach:**
  - A browser checks `/hello` on 127.0.0.1:47400–47409, with or without a saved pref
    (`src/lib/localHome.svelte.ts`).
  - It gets the token over the channel (the `local` request, no longer limited to the companion).
  - It calls a new `POST /attach` on the local link (`local.rs`). GLUE Home then calls
    `/v1/computer/attach` with its own credential.
  - Reaching 127.0.0.1 is what proves "same computer".
  - Manual `POST /v1/devices/<id>/same-computer` for a browser without GLUE Home.
- **Devices UI** (`DevicesSection.svelte`, `lib/devices.ts`):
  - one row per computer, with its browsers as a sub-line;
  - colours and filters keyed by computer id, not name;
  - "Same computer as…" for browsers without GLUE Home.
  - `companionOf`/`companionOnline` (remoteFiles.svelte.ts) look up by computer.
- **Tests:** cloud tests for attach and claim; `fakeHome.ts` gets `/attach`; a homemode e2e with
  two browser contexts that ends with one row.

## Phase 2: the shared collection in GLUE Cloud (behind a switch; new collections first). Done 2026-09-28 (ADR 0094: 2a cloud, 2b core, 2c site)
- **Cloud (`0006_shared.sql`, new `cloud/src/shared.ts`, reusing `putFiles`/`bundle`):**
  - `shared_collections(user_id, id, name, seq, stats…)`;
  - `shared_files(user_id, collection_id, path, rev, hash, size, data, deleted_at, updated_by,
    updated_at)`, indexed on `rev`;
  - `shared_conflicts`.
  - Endpoints:
    - `changes?since=` (metadata only);
    - `bundle`;
    - `push`: rows of path, base rev, hash, data, as a conditional update `WHERE rev = base`; the
      rows that didn't change come back as `stale`;
    - `bin`: tombstones, kept 30 days.
  - After a push the signaling Durable Object broadcasts `{type:'shared', cid, seq}`.
- **Files per collection**, today's layout:
  - `c`: the collection;
  - `t/<xx>`, `a/<xx>`: track and analysis shards;
  - `l/<id>`: playlists and folders;
  - `s/<id>/m`, `s/<id>/t/<xx>`: DJ libraries, sharded;
  - `e`: events;
  - `d/<computer>`: duplicate groups;
  - `j/<computer>`: file jobs.
  - Records carry `stamps {id: [computer, at]}`.
- **Records** (pure projection in `src/core/shared/project.ts`):
  - A track has `copies: {[computer]: {rootId, relPath, status, size, mtime, unwritten?…}}`.
    Loading turns this computer's copy into today's top-level fields. `onDevices` and `remote`
    come from `copies`, which replaces `pointAt`.
  - Analysis is kept per computer.
  - The collection's `roots` become `rootsBy[computer]`.
  - A Source records its `computer`.
  - Only computer C writes `copies[C]` and its own analysis.
- **Same song on ingest:** export `trackKey` from `mergeCollections.ts` (artist and title with
  lengths within 3 s, else file name and size). `store/merge.ts` scans and imports add `copies[me]`
  to an existing track rather than making a new one. Add "Split this song".
- **Local:**
  - the collection stays in `profiles/<pid>/collections/<cid>/`, so `CollectionStore` and the UI
    are unchanged;
  - sync state in `GLUE/cloud/shared/<cid>/` (`base.json`, cursor, conflicts);
  - a phone keeps a full copy in OPFS (`lib/anywhere` opens it).
- **Engine** `src/store/shared/engine.ts`: no DOM, an adapter `{request, dir, computer, store}`,
  and the same code in a tab and in GLUE Home.
  - **pull:** changes, then bundle, then a 3-way merge per file; applied with the store's put and
    delete calls, flagged as coming from sync.
  - **push:** an outbox fed by a new `CollectionStore.onDirtyPath`; on stale, pull, merge and push
    again.
  - A tab uses it through `src/lib/shared.svelte.ts`.
- **Limits** **[UNVERIFIED D1 free tier: 500 MB per database, 5M rows read and 100k written per
  day]**:
  - about 1.2k rows and 4 MB at 8k tracks; about 2.5k rows and 20 MB at 50k;
  - analysis pushes held back to at most one every 10 minutes.

## Phase 3: conflicts. Done 2026-09-28 (ADR 0095; GLUE Home's side comes with phase 5)
- **Pure `src/core/shared/merge3.ts`** (base, local and remote, record by record):
  - track user fields field by field;
  - `copies` and analysis per computer, never asked;
  - list items with a 3-way merge (removals and additions from both sides; a reorder on both sides
    is a clash);
  - edited on one side and deleted on the other is a clash;
  - tags, genres and `ignoredDupes` are unions.
- **`ConflictBox.svelte`**, bottom right: "2 changes clash with Laptop".
  - Each item shows both values with device and time.
  - Buttons: **Keep this device's / Take Laptop's / Merge both** (merge only where it means
    something), plus "same for all".
  - Until answered, the cloud's value is kept.
- **GLUE Home** (no UI) never overwrites. It posts its side to `shared_conflicts`, and the next UI
  device asks.

## Phase 4: moving over (backup first). Done 2026-09-28 (ADR 0096: each computer moves its own, with a button)
- Force a backup zip on each device, and export every group member's `sync_files` into
  `backups/cloud-<date>/`. Apply the ops still waiting.
- The device with the most tracks (the desktop) offers **Make one shared collection**, listing the
  members and their counts.
  - `seedShared` reuses mergeCollections' origins and keeps ids: the desktop's collection id, and
    the desktop's list and track ids where it has them.
  - It builds `copies[computerOf(device)]`.
- Each member then:
  - moves its old folder aside to `<cid>.pre-shared/`;
  - pulls the shared collection;
  - stops its per-device push.
- The old cloud rows stay read-only for 30 days.
- Tests: a unit test for `seedShared` shaped like this user's data (7,989 tracks, 10, and an empty
  phone), and an e2e of the migration.

## Phase 5: the computer's worker (GLUE Home, or the open tab without one). In progress: 5a done 2026-09-28 (ADR 0097: GLUE Home syncs and writes song info); 5b done (ADR 0098: duplicates across computers); 5c done (ADR 0099: every computer's DJ libraries); GLUE Home analysing the library done (ADR 0103)
Everything below is written once, in `src/store` and `src/core`, and runs from GLUE Home's service
page, or from the tab on a computer without GLUE Home (while it's open), or with the lease.
- **Sync with no tab:** the Phase 2 engine through `HomeDisk` (it replaces `home/ui/edits.ts`),
  under the existing lease. It pushes as `updated_by = computer`.
- **Analysis** (`home/ui/cache.ts`):
  - keeps `r.summary` (`putAnalysis`, its computer's entry) and `r.fp`, as fingerprint packs in
    `GLUE/cache/fp/` through `store/fingerprints.ts`, shared by every browser on the computer;
  - `AnalysisPool(cores - 1)`.
- **Duplicates:** the matcher from `lib/dupes.svelte.ts`, moved into `core/`, runs on GLUE Home and
  publishes `d/<computer>`. `dupes.svelte.ts` adds other computers' groups to its own, so the
  2×/3× badge shows for remote songs.
- **DJ libraries:**
  - The service page runs `parseLibraryFiles`/`parseEngineDb` on what `libraries.rs` finds, with
    djWatch's rules and the Phase 0 guards.
  - `syncSource`/`applyImport` move to the store level, so they don't need `lib`, and publish
    `s/<id>`.
  - The sidebar shows every computer's libraries with that computer's icon (no more
    `{#if !lib.cloud}`).
  - Importing a playlist from another computer's library works from any device (`makeCopy`); the
    owning computer then keeps it in step.
- **File work:**
  - An info edit marks `unwritten` on every copy; each computer writes its own copy
    (`writeUnwritten`).
  - Moves, deletes and duplicate clean-up become `j/<computer>` jobs for that computer.
    `move-incoming` stays the fast path.

## Phase 6: admin panel usage (can run in parallel with 1–5; Worker + site). Done 2026-09-28 (ADR 0093); needs the user's CF_ANALYTICS_TOKEN
- **Admin › Usage:**
  - D1: database size (`meta.size_after`), rows read and written today;
  - Worker requests today;
  - TURN relay traffic this month.
  - Each shown against its free-tier limit (**[UNVERIFIED]** limits: D1 5 GB total and 500 MB per
    database, 5M reads and 100k writes a day; Workers 100k requests a day; TURN 1,000 GB a month).
- **Where the numbers come from:** Cloudflare's GraphQL Analytics API (`d1AnalyticsAdaptiveGroups`,
  `workersInvocationsAdaptive`, the Calls/TURN dataset) through a new admin-only
  `GET /v1/admin/usage`.
  - It needs a new Worker secret, `CF_ANALYTICS_TOKEN` (Account Analytics Read), set by the user in
    GitHub secrets, which the workflow uploads like the TURN key. The site never sees the token.
  - Our own counts from D1 too: rows per table, users, devices, bytes stored.
- **Tests:** `tests/cloud.test.ts` with a stubbed fetch to the analytics API; an e2e of the admin
  page.

## Phase 7: remove what's no longer needed. Done 2026-09-29 in the code (ADR 0101); the old D1 tables stay until every user has moved over (the user, 2026-09-29)
Once every device of the account is on the shared model, remove:
- the overlay (`overlay.ts`, `applyOverlay`, `ephemeral` for other devices);
- the cloud views (`openGroupNow`, `pointAt`, `enterCloudView`);
- the per-device mirrors;
- `cloudEdits`/`sync_ops`, `home/ui/edits.ts`.

After 30 days, drop the `sync_*` tables. Supersede ADRs 0040, 0042, 0043 and 0087.

## Critical files
- `src/lib/sync.svelte.ts`, `src/lib/library.svelte.ts`, `src/store/collection.ts`,
  `src/store/linked.ts`, `src/store/backup.ts`
- `cloud/src/api.ts`, `cloud/src/sync.ts`, new `cloud/src/shared.ts`, `cloud/migrations/0005`/`0006`
- `src/core/library/mergeCollections.ts`, new `src/core/shared/{project,merge3}.ts`, new
  `src/store/shared/engine.ts`
- `home/ui/service.ts`, `home/ui/cache.ts`, `home/src-tauri/src/local.rs`
- `src/ui/library/DevicesSection.svelte`, `LibSidebar.svelte`, new `ConflictBox.svelte`,
  `src/lib/dupes.svelte.ts`
- Tests: `tests/overlay.test.ts`, `tests/linked.test.ts`, `tests/cloud.test.ts`, new
  `tests/shared.test.ts`; e2e `library.spec`, `homemode.spec`, `phone.spec`, `e2e/fakeHome.ts`,
  `e2e/tauri-mock.ts`

## Verification
- **Sessions and several homes:** a phone that signs in to browse adds no row to Devices and shows
  in admin › Sessions. With two stand-in GLUE Homes, each serves its own songs, and a song on both
  streams from the one online.
- **Every phase is tested in all three modes:** local only (no GLUE Cloud calls at all: an e2e
  asserts no request to the Worker), cloud without GLUE Home (two browser contexts), and with the
  stand-in GLUE Home.
- **Each phase:** `npm run check`, `npx vitest run`, `FFMPEG=1 npx playwright test` (full suite;
  failures rerun alone). A phase that turns on a dormant switch gets an e2e that fails with the
  change removed.
- **Phase 0:** reproduce the collection-switch deletion in e2e before the fix, and see it pass
  after.
- **Phase 2–5:** two or three browser contexts plus the fake cloud plus the stand-in GLUE Home.
  Edit on one and see it on the others; a conflict raises the box; a desktop song's badge and DJ
  library show on the phone.
- **The user's hand tests after each deploy:** desktop, laptop and iPhone show the same library;
  two browsers on the desktop show one row.
- **Risks to keep watching:**
  - tracks with no copy on this computer must never be marked missing or relinked;
  - the D1 write quota;
  - the Rust `/attach` route is only compiled in CI;
  - D1 Time Travel's window for the recovery.
