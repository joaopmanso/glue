---
updated: 2026-09-30
---
# GLUE vault

The project's memory: what GLUE is, what it does, why it's built the way it is, and what comes next.
Written for both people and AI agents. Plain Markdown with relative links, so it reads on GitHub and
opens as an [Obsidian](https://obsidian.md) vault.

## Start here
- **[SYSTEM.md](SYSTEM.md): how GLUE works now**, in one place. Read this first.
- **[Handoff](log/handoff.md):** where things stand, what's waiting on the user, what's next.
- [Roadmap](product/roadmap.md): milestones and their status.
- [Vision](product/vision.md) and [Glossary](product/glossary.md): what GLUE is for, and the words we use.
- [Changelog](log/changelog.md): what changed lately, newest first (older entries in [log/archive/](log/archive/)).

The feature files and ADRs below are the detail and the history: look up the ones for what you're changing
(search for a term), rather than reading them in order.

## Sections
| Folder | Holds | One file per |
|---|---|---|
| [product/](product/) | vision, roadmap, glossary | topic |
| [features/](features/) | what each feature does, its status, how it works, how it's tested | feature |
| [adr/](adr/) | architecture decision records: context, decision, consequences | decision |
| [research/](research/) | sourced findings (browser APIs, DJ library formats, performance) | subject |
| [log/](log/) | the handoff (rewritten each session), the changelog (recent), and [archive/](log/archive/) (older handoffs and changelog) | — |

## Conventions
- **Status** (front matter `status:`): `idea` · `planned` · `in-progress` · `shipped` · `superseded`.
- **Features** follow [features/_template.md](features/_template.md); name files by slug
  (`import-rekordbox.md`). Link the ADRs that shaped them.
- **ADRs** follow [adr/_template.md](adr/_template.md) (MADR-style), numbered `NNNN-slug.md`, never
  renumbered. A changed decision gets a new ADR that supersedes the old one; the old one stays.
- **Research** always cites sources and marks anything unverified as **[UNVERIFIED]**.
- Dates are absolute (`2026-09-24`), never "last week".
- Every change to the app updates: [SYSTEM.md](SYSTEM.md) when how GLUE works changed, the feature's "Now"
  and status, the roadmap if a milestone moves, the changelog, and the handoff at the end of a session.
  Every new architectural choice gets an ADR.
- The changelog keeps about the last two weeks; older entries move to `log/archive/changelog-<from>-to-<to>.md`.

## Feature index
Shipped (from Speklone):
[quality forensics](features/quality-forensics.md) ·
[tempo & key](features/tempo-key.md) ·
[player](features/player.md) ·
[live view](features/live-view.md) ·
[stem separation](features/stem-separation.md) ·
[start page](features/start-page.md) · [homepage](features/homepage.md) ·
[deployment](features/deployment.md)

Planned (GLUE):
[GLUE folder & backups](features/glue-folder-backups.md) ·
[library & scanner](features/library-scanner.md) ·
[background analysis](features/background-analysis.md) ·
[quality tiers & filters](features/quality-tiers.md) ·
[playlists](features/playlists.md) ·
[right-click menus](features/context-menus.md) ·
[ratings](features/ratings.md) ·
[themes](features/themes.md) ·
[automatic playlists](features/auto-playlists.md) ·
[tags](features/tags.md) ·
[GLUE Cloud](features/glue-cloud.md) ·
[events](features/events.md) (was [shows & sessions](features/shows-sessions.md)) ·
[import: Rekordbox](features/import-rekordbox.md) ·
[import: Engine DJ](features/import-engine.md) ·
[import: Traktor](features/import-traktor.md) ·
[import: Apple Music & iCloud](features/import-apple-icloud.md) ·
[exports](features/exports.md) ·
[duplicates](features/duplicates.md) ·
[profiles](features/profiles.md) ·
[import: Serato](features/import-serato.md) ·
[track detail](features/track-detail.md) ·
[Prepare](features/prepare.md) ·
[performance](features/performance.md) ·
[song info & covers](features/song-info.md) ·
[stats](features/stats.md) ·
[browse](features/browse.md) ·
[phone app](features/phone-app.md)

## ADR index
| # | Decision | Status |
|---|---|---|
| [0001](adr/0001-record-architecture-decisions.md) | Record decisions as ADRs in this vault | accepted |
| [0002](adr/0002-static-client-only-app.md) | Static, client-only web app; no server | accepted |
| [0003](adr/0003-client-side-stems-webgpu.md) | Stem separation runs in the browser on WebGPU (HT-Demucs) | accepted |
| [0004](adr/0004-float64-model-patch.md) | Rewrite the model's float64 tensors to float32 at load | accepted |
| [0005](adr/0005-model-from-huggingface.md) | Load the model from Hugging Face, cache it in Cache Storage | accepted |
| [0006](adr/0006-tempo-key-algorithms.md) | Tempo and key detection algorithms | accepted |
| [0007](adr/0007-web-first-platform-layer.md) | Web first; OS access only through a platform layer | accepted |
| [0008](adr/0008-typescript-svelte-vite.md) | TypeScript + Svelte + Vite | accepted |
| [0009](adr/0009-json-files-store.md) | JSON files in the GLUE folder are the store; no database | accepted (layout amended by 0018) |
| [0010](adr/0010-import-export-before-write-back.md) | Read-only import and file export before any write-back | accepted |
| [0011](adr/0011-rekordbox-xml-shared-export.md) | One rekordbox XML file serves Rekordbox and Engine DJ | accepted |
| [0012](adr/0012-absolute-path-strategy.md) | How exports get absolute file paths | accepted |
| [0013](adr/0013-duplicate-tiers.md) | Three tiers of duplicate detection | accepted |
| [0014](adr/0014-chromium-full-others-reduced.md) | Chrome/Edge full, Safari/Firefox reduced | accepted |
| [0015](adr/0015-installable-pwa.md) | GLUE is an installable PWA | superseded by 0017 |
| [0016](adr/0016-keep-legacy-page-for-parity.md) | Keep the original Speklone page as the parity reference | accepted |
| [0017](adr/0017-no-installable-app-for-now.md) | No installable app for now | accepted |
| [0018](adr/0018-local-profiles.md) | Local profiles, no password; profiles own collections | superseded by 0113 |
| [0019](adr/0019-background-analysis-decoding.md) | Background analysis: browser decoding + analysis worker pool | accepted (decoding superseded by 0060) |
| [0020](adr/0020-imports-then-link-folders.md) | Imports bring metadata first; music folders linked afterwards | accepted |
| [0021](adr/0021-single-songs.md) | Songs can be added one by one, kept by file handle | accepted |
| [0022](adr/0022-pointer-drag-inside-mco.md) | Drags inside GLUE use pointer events, not HTML drag-and-drop | accepted |
| [0023](adr/0023-store-track-page-analysis.md) | Track pages store their full analysis (amends 0019) | superseded in part by 0024 |
| [0024](adr/0024-background-stores-full-analysis.md) | Background analysis stores the full analysis, in the browser's storage | accepted |
| [0031](adr/0031-row-thumbnails.md) | Mini spectrograms in the track table: tiny, per track, loaded on demand | accepted |
| [0030](adr/0030-detect-dj-libraries.md) | DJ libraries are detected in folders the user has allowed | accepted |
| [0029](adr/0029-automatic-playlists.md) | Automatic playlists: a greedy walk along a BPM ramp with weighted randomness | accepted |
| [0028](adr/0028-themes.md) | Themes: one token table, dark and light for each | accepted |
| [0027](adr/0027-drag-out-with-downloadurl.md) | Dragging out to other apps uses Chromium's DownloadURL | accepted |
| [0026](adr/0026-profile-backups-and-wipe.md) | Profile backups are zips; "delete all" removes only what GLUE made | accepted |
| [0025](adr/0025-band-energy-fingerprints.md) | Band-energy fingerprints for "same recording", kept in the browser's cache (amends 0013) | accepted |
| [0032](adr/0032-tags.md) | Tags as plain names on tracks and playlists; found tags stand in until edited | accepted |
| [0033](adr/0033-tolerate-gentle-roll-offs.md) | Tolerate gentle top-end roll-offs; re-check stored verdicts when the rules change | accepted |
| [0034](adr/0034-quiet-content-above-the-fade.md) | Count quiet content above a gentle fade (peak-hold reach) | accepted |
| [0035](adr/0035-rename-to-glue.md) | Rename GLUE to GLUE (Global Library Utility Exporter); keep internal identifiers | accepted (name spelled out by 0039) |
| [0036](adr/0036-optional-accounts-and-cloud-signaling.md) | Optional accounts and a small free cloud service (Cloudflare) for devices and signaling | accepted; "no library data in the cloud" superseded by 0040 (opt-in cloud sync) |
| [0037](adr/0037-p2p-webrtc-transport.md) | WebRTC data channels between the website and GLUE Home | proposed |
| [0038](adr/0038-glue-home-app.md) | GLUE Home: a small Node.js/TypeScript app that serves the main computer's library | superseded by 0044 |
| [0039](adr/0039-glue-unified.md) | GLUE stands for Global Library Unified Exporter | accepted |
| [0040](adr/0040-cloud-sync-and-merged-collections.md) | Cloud sync of library data, merged collections, and edits that reach the owning device | superseded by 0101 |
| [0041](adr/0041-passwords-tiers-admin.md) | Email + password accounts, user tiers, and an admin panel | accepted |
| [0042](adr/0042-merged-collection-in-the-local-library.md) | Sync by default, merge by itself, and show the merged collection in this computer's library | superseded by 0101 |
| [0043](adr/0043-batched-sync-and-progressive-loading.md) | Sync many files per request, keep one copy file per device, and show songs as they arrive | superseded by 0101 |
| [0044](adr/0044-glue-home-tauri-tray-app.md) | GLUE Home is a Tauri tray app; the website sends songs to it over WebRTC | accepted; pairing and the device model refined by 0045 (companion, code only) |
| [0045](adr/0045-glue-home-companion.md) | GLUE Home is the companion of the browser on its computer: code-only, streams its songs, updates itself | accepted |
| [0046](adr/0046-glue-home-shares-analysis-and-sorts-incoming.md) | GLUE Home keeps and shares the analyses; TO BE SORTED lists its incoming folder | accepted |
| [0047](adr/0047-stream-channel-requests-at-once.md) | Stream channel: requests at the same time, tagged bytes, time limits | accepted |
| [0048](adr/0048-local-link-to-glue-home.md) | A local link to this computer's GLUE Home; songs analysed on arrival; one row per song | accepted |
| [0049](adr/0049-folders-are-playlists.md) | Folders are playlists too (as in Engine DJ) | accepted |
| [0050](adr/0050-glue-home-as-the-computers-library.md) | GLUE Home as the computer's library: saving and cloud sync move into it | superseded by 0051 |
| [0051](adr/0051-glue-home-as-local-engine.md) | GLUE Home is the computer's disk and engine; the website stays at its public address | accepted |
| [0052](adr/0052-prepare-tab.md) | A Prepare tab: waveform, beat grid, metronome and the user's corrections | accepted |
| [0053](adr/0053-imported-copy-is-the-same-song.md) | An imported copy outside the music folders is the track that has the file | accepted |
| [0054](adr/0054-drag-dock-in-glue-home.md) | Songs go into the DJ apps by dragging from a GLUE Home "drag dock" | accepted |
| [0055](adr/0055-drag-dock-is-a-queue.md) | The drag dock is a queue | accepted |
| [0056](adr/0056-playlists-drag-with-the-browser.md) | Playlists drag with the browser's drag-and-drop, so they can be dropped on the drag dock | accepted |
| [0057](adr/0057-keep-the-stack-fix-the-architecture.md) | Keep Svelte, TypeScript, Vite and Tauri; fix how GLUE uses them (no React Native) | accepted |
| [0058](adr/0058-performance-budgets.md) | Performance budgets, measured on a synthetic collection | accepted |
| [0059](adr/0059-indexes-rebuilt-by-change-counters.md) | Indexes over the collection, rebuilt by per-kind change counters | accepted |
| [0060](adr/0060-decode-in-the-worker.md) | Read, parse and decode audio in the worker (mediabunny + WebCodecs) | accepted (supersedes 0019's decoding) |
| [0061](adr/0061-songs-onto-the-drag-dock.md) | Songs go onto the drag dock by dragging them there too | accepted |
| [0062](adr/0062-add-to-playlist-mirrors-the-sidebar.md) | "Add to playlist" lists the playlists as the sidebar shows them | accepted |
| [0063](adr/0063-dj-libraries-browsed-live.md) | DJ libraries are browsed live; playlists come into GLUE on demand and stay linked | accepted ("Live" amended by 0065) |
| [0065](adr/0065-live-sync-through-glue-home.md) | Live sync of DJ libraries is GLUE Home's; in the browser alone, Refresh | accepted |
| [0066](adr/0066-imported-records-find-their-files.md) | Imported records find their files by the folder's place; what an import no longer has goes | accepted |
| [0067](adr/0067-one-context-menu.md) | One context menu for the library page: right-click (or ⋯) on anything there | accepted |
| [0068](adr/0068-full-player.md) | A full player: a queue, an open view with the visualiser, the sound output; drivers through GLUE Home later | accepted |
| [0070](adr/0070-glue-home-cleans-up-duplicates.md) | GLUE Home moves duplicate music files aside, or recycles them, when asked | accepted |
| [0069](adr/0069-content-beyond-a-wall.md) | Content beyond a wall that follows the music isn't an encoder's cut; specks far under it are rounding | accepted |
| [0071](adr/0071-song-info-written-through-glue-home.md) | Song info is edited in GLUE and written into the music files by GLUE Home | accepted |
| [0072](adr/0072-covers-from-the-tags.md) | Covers come from the files' tags, kept as small JPEGs in the browser's cache | accepted |
| [0073](adr/0073-3d-view-on-the-gpu.md) | The live 3D view is drawn by three.js on the GPU, and can be turned, zoomed and reset | accepted |
| [0074](adr/0074-events-calendar.md) | Events: a calendar, each event with a folder of playlists; reminders in GLUE and from GLUE Home | accepted |
| [0075](adr/0075-drop-outs-under-a-wall.md) | Drop-outs under a wall tell an encoder's lowpass from a mastering one (amends 0069) | accepted |
| [0076](adr/0076-songs-stream-by-range.md) | Songs stream by byte range: the local link in Home mode, a service worker for other computers | accepted |
| [0077](adr/0077-library-on-any-device.md) | A device without a library of its own opens the account's library from GLUE Cloud, and plays it | superseded by 0101 |
| [0078](adr/0078-phone-layout.md) | On a narrow screen the library is a phone app: tabs, two-line rows, menus as sheets, a mini and full player | accepted |
| [0079](adr/0079-touch-layout-and-playlists-by-touch.md) | Every touch device gets the touch layout, and manages playlists there: folders, select, drag to reorder, remove with Undo | accepted |
| [0080](adr/0080-play-on-elements-a-tap-unlocked.md) | Songs play on audio elements a tap has unlocked (iOS), and failures say what the browser said | accepted |
| [0081](adr/0081-turn-relay.md) | Connections that can't be direct go through Cloudflare's TURN relay, with the owner's key: credentials from GLUE Cloud, encrypted end to end | accepted |
| [0082](adr/0082-covers-from-glue-home.md) | Other devices get covers from GLUE Home (kept there, or read from the tags) and keep them; never in GLUE Cloud | accepted |
| [0083](adr/0083-glue-home-activity-off-the-main-thread.md) | GLUE Home counts what it's asked, and does its file work off the main thread | accepted |
| [0084](adr/0084-playback-first-on-the-link-to-glue-home.md) | Playback first on the link to GLUE Home; failures say why | accepted |
| [0085](adr/0085-waveforms-from-glue-home.md) | Other computers' songs get their waveforms from GLUE Home too | accepted |
| [0086](adr/0086-covers-looked-up-by-glue-home.md) | GLUE Home looks up missing covers on public services | accepted |
| [0087](adr/0087-edits-reach-glue-home.md) | Other computers' songs can be edited; the owner's GLUE Home takes the edits in | superseded by 0101 |
| [0088](adr/0088-aiff-streams-as-wav.md) | Another computer's AIFF songs stream, as WAV worked out a piece at a time | accepted |
| [0089](adr/0089-edits-only-against-their-own-collection.md) | Edits are worked out only against the collection they came from; mass deletions are asked | accepted |
| [0090](adr/0090-bin-guarded-re-reads-daily-backups.md) | A bin for playlists, guarded DJ-library re-reads, daily backups | accepted |
| [0091](adr/0091-computers-and-sessions.md) | A device is a computer; signing in only to browse is a session | accepted |
| [0092](adr/0092-first-question-how-glue-is-used.md) | The first question: how GLUE is used on this device | accepted |
| [0093](adr/0093-free-tier-usage-in-the-admin-panel.md) | The admin panel shows free-tier usage, from Cloudflare's analytics with a read-only token | accepted |
| [0094](adr/0094-one-shared-collection-in-glue-cloud.md) | One shared collection in GLUE Cloud, the same on every device | accepted |
| [0095](adr/0095-ask-per-clash.md) | Ask per clash, on the device that made the change | accepted |
| [0096](adr/0096-move-merged-collections-into-the-shared-one.md) | Move merged collections into the shared one, one computer at a time | accepted |
| [0097](adr/0097-glue-home-syncs-shared-collections.md) | GLUE Home syncs its computer's shared collections, and writes song info edited elsewhere | accepted |
| [0098](adr/0098-duplicates-across-computers.md) | Duplicates across computers: each computer publishes its own matches | accepted |
| [0099](adr/0099-dj-libraries-belong-to-their-computer.md) | In a shared collection, a DJ library belongs to its computer | accepted |
| [0100](adr/0100-one-row-per-song-and-own-copies.md) | One row per song, its best copy; a computer removes only its own copies | accepted |
| [0101](adr/0101-cloud-sync-is-the-accounts-collections.md) | Cloud sync on means every collection is the account's; one sync only | accepted |
| [0104](adr/0104-glue-home-is-the-librarys-engine.md) | GLUE Home is the library's engine; the website on its computer is its screen | accepted |
| [0105](adr/0105-pace-cloud-pushes-and-analyse-more-at-once.md) | Pace pushes to GLUE Cloud; GLUE Home analyses as many songs at once as the computer allows | accepted; pacing superseded by 0106 |
| [0106](adr/0106-shared-collection-as-a-snapshot-and-a-log.md) | Keep the shared collection in GLUE Cloud as a snapshot and a log of changes | accepted |
| [0107](adr/0107-sync-looks-only-at-what-changed.md) | The shared sync looks only at the files that changed, and keeps its agreed copies file by file | accepted |
| [0108](adr/0108-one-id-per-computer.md) | One id per computer: GLUE Home learns it, only the computer's GLUE folder writes its parts, nothing writes a stand-in | accepted |
| [0109](adr/0109-one-meaning-of-not-analysed.md) | "Not analysed" means one thing everywhere; failures that pass are retried, never kept | accepted |
| [0110](adr/0110-screen-takes-glue-homes-analyses.md) | The screen takes GLUE Home's analyses when it needs them; a song page never re-analyses in Home mode | accepted |
| [0111](adr/0111-removing-a-folder-removes-its-songs.md) | Removing a music folder removes its songs; songs left with no file are offered once | accepted |
| [0112](adr/0112-the-accounts-collections.md) | The account's collections: one list with each computer's numbers, a rename and a deletion every device follows, no silent second collection | accepted |
| [0113](adr/0113-profiles-are-the-accounts-aliases.md) | Profiles are the account's artist aliases; a GLUE folder keeps one library that every alias uses | accepted (amended by 0114) |
| [0114](adr/0114-profiles-are-every-devices.md) | The account's profiles are every device's; each device picks its own | accepted |
| [0115](adr/0115-any-browser-takes-glue-homes-link.md) | Any browser on GLUE Home's computer takes its link from GLUE Home itself | accepted |
| [0116](adr/0116-hi-res-by-what-reaches-past-24-khz.md) | A hi-res file is judged by what reaches past 24 kHz above digital silence | accepted |
| [0117](adr/0117-duplicates-are-one-version.md) | Duplicates are the same version of a song; the user can say which aren't, and which are | accepted |
| [0118](adr/0118-mastering-lowpass-from-17-khz.md) | A steep top end from 17 kHz, with no drop-outs under it and strong content above, is a mastering lowpass | superseded by 0119 |
| [0119](adr/0119-content-beyond-a-wall-is-lossless.md) | A steep top end with content above that follows the music, and without frequent drop-outs under it, is lossless | accepted |
| [0120](adr/0120-one-copy-shown-and-used.md) | Only a song's best copy is shown and used; Duplicates is where copies are decided, in bulk | accepted |
| [0121](adr/0121-main-music-folder.md) | An optional main music folder: among duplicates, its copy is the best, after lossless | accepted |
| [0122](adr/0122-stop-stops-everything-dropped-folders-found.md) | GLUE Home's Stop stops everything; a dropped folder is found by GLUE Home at once | accepted |
| [0123](adr/0123-music-folders-that-come-and-go.md) | Music folders that come and go (network folders): their songs wait, nothing about them changes | accepted |
| [0124](adr/0124-no-file-songs-matched-and-linked.md) | Songs with no file are matched to the library's songs, with a certainty, and linked in bulk | accepted |
| [0125](adr/0125-dropped-songs-placed-by-glue-home.md) | A song dropped onto the page is placed by GLUE Home; the tab analyses only what just it can read | accepted |
| [0126](adr/0126-gluey-tours-and-help.md) | Gluey: a first tour once per person, a tour per feature, and help; seen kept across the account and the GLUE folder | accepted |
| [0127](adr/0127-graphify-code-map.md) | Coding sessions get a map of the code: a graphify knowledge graph of code and vault, built per computer | accepted |
| [0128](adr/0128-code-map-built-on-github.md) | The code map is built on GitHub for every push (branch `graphify`) and used by fixed rules: affected/explain/path, never query | accepted |
| [0129](adr/0129-code-map-docs-every-session.md) | The code map's docs are refreshed in every session that changes them (scripts/graph_docs.py, no skill); its view is on the site at /graph/ | accepted |
| [0130](adr/0130-same-file-on-two-computers-is-one-song.md) | The same file on two computers is one song with a copy on each: a scan joins it to the other computer's song, pairs made before are joined | accepted |
| [0131](adr/0131-rows-on-screen-ask-until-answered.md) | What rows on screen need from another computer is asked for until it's answered (onScreen.ts: OnScreen, Retries) | accepted |
| [0132](adr/0132-connections-to-glue-home-are-bounded.md) | Connections to GLUE Home are bounded: abandoned set-ups let go (30 s, 20 at once), failures answered, background reconnects paced | accepted |
| [0133](adr/0133-a-session-per-device-with-glue-home.md) | A session per device's tab with GLUE Home: opened at sign-in, kept alive, at most 5 (refused when full), told what happens | accepted |
| [0134](adr/0134-network-folders-found-quickly-and-read-past-odd-names.md) | Dropped folders in Home mode: a 5 s search then GLUE Home asks, the page saying so; scans read past odd names (':' fine on macOS) | accepted |
| [0135](adr/0135-analysis-around-network-folders-and-tags-by-glue-home.md) | Network folders' songs take turns (4 each) so the processor works on local songs; GLUE Home reads tags in batches; one "left" count | accepted |
| [0136](adr/0136-analysis-limits-are-the-users-with-speed-shown.md) | Analysis limits are the user's ("From each network folder at a time"), with the speed shown in GLUE Home and a suggestion | accepted |
| [0137](adr/0137-this-computer-never-a-remote-session.md) | This computer's browser is never a remote session nor counted; the direct link isn't dropped on one slow answer | accepted |
| [0138](adr/0138-what-the-user-asks-for-goes-first.md) | What the user asks for goes first: background requests to GLUE Home gated (3), playing ahead of the analysis, songs read whole | accepted |
| [0139](adr/0139-a-socket-for-background-loads-and-a-list-that-stays-put.md) | A socket for the background loads from GLUE Home (numbered, cancellable), and a list that stays put while it changes by itself | accepted |
| [0140](adr/0140-a-song-played-pauses-the-analysis-reads.md) | A song played pauses the analysis's reads, not only its new songs: the drive or NAS serves it first | accepted |
| [0141](adr/0141-songs-get-their-own-port-and-a-read-looks-up-only-its-folder.md) | Songs played get their own port on GLUE Home, and a file read looks up only its own folder (not the NAS, not another drive) | accepted |
| [0142](adr/0142-a-row-on-screen-always-gets-what-it-asked-for.md) | A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it | accepted |
| [0143](adr/0143-a-sync-takes-in-what-it-wrote-and-looking-for-glue-home-needs-a-reason.md) | A sync takes in what it wrote, even when it fails; this computer's GLUE Home is looked for only with a reason | accepted |
| [0144](adr/0144-flac-decoded-by-glue-and-a-song-given-up-on-says-so.md) | FLAC decoded by GLUE itself; a big song gets the time it needs; a song given up on says so | accepted |
| [0145](adr/0145-one-rule-for-the-same-name.md) | One rule for the same name (`core/library/names.ts`): Duplicates, No file linked, joining, covers | accepted |
| [0146](adr/0146-the-library-in-parts-by-concern.md) | The library's methods in parts by concern (`src/lib/library/`), behind the same `lib` | accepted |
| [0147](adr/0147-glue-home-analyses-natively.md) | GLUE Home analyses natively, in Rust (`crates/glue-audio`), held to the website's results | accepted |
| [0148](adr/0148-glue-home-analyses-songs-in-rust.md) | GLUE Home's queue hands each song to the native engine (`analyse_song`: read, analyse, write the cache in Rust) | accepted |
| [0149](adr/0149-dsd-analysed-as-its-pcm-conversion.md) | GLUE Home analyses DSD as its 88.2 kHz PCM conversion, and retries the JavaScript's failures once | accepted |
| [0150](adr/0150-glue-homes-connections-in-rust.md) | GLUE Home's connections to other devices are Rust's (`crates/glue-rtc`, webrtc-rs) | accepted |
| [0151](adr/0151-the-glue-window.md) | GLUE opens in GLUE Home's own window, showing the live site | accepted |
| [0152](adr/0152-the-library-store-in-rust.md) | The library store in Rust (`crates/glue-store`), held to the website's byte for byte | accepted |
| [0153](adr/0153-the-library-engine-in-rust.md) | GLUE Home's library engine in Rust (`crates/glue-engine`), tested end to end against the real one | accepted |
| [0154](adr/0154-the-analysis-queue-in-rust.md) | The analysis queue in GLUE Home's engine, in Rust (and where songs are) | accepted |
| [0155](adr/0155-the-shared-sync-in-rust.md) | GLUE Home syncs the shared collections in Rust, held to the website's sync | accepted |
| [0156](adr/0156-the-answers-to-other-devices-in-rust.md) | GLUE Home answers the account's other devices in Rust (the engine's `answer`; the cover look-up held to the website's) | accepted |
| [0157](adr/0157-one-analysis-pipeline-inside-its-number.md) | One analysis pipeline: a folder listed once, its songs' tags then their analyses, every read inside "songs at a time" | accepted |
| [0158](adr/0158-the-signaling-room-and-the-sessions-in-rust.md) | GLUE Home's signaling room, the sessions with other devices, songs received and which computer it is, in its Rust engine | accepted |
| [0159](adr/0159-glue-homes-first-run-and-its-window-signed-in.md) | GLUE Home's first-run guide, a GLUE folder always offered on the start page, and its window opening on the library, signed in by GLUE Home | accepted |
| [0160](adr/0160-glue-homes-service-in-its-engine.md) | GLUE Home's service (status, timers, Start / Stop, backups, reminders, updates, the native check) in its engine; the hidden service page removed | accepted |
| [0103](adr/0103-glue-home-analyses-its-computers-songs.md) | GLUE Home analyses its computer's songs; the tab takes the results; Stop, Analyse now, and what GLUE Home is doing | accepted |
| [0102](adr/0102-caches-follow-and-cloud-sync-off.md) | Caches follow a collection; turning cloud sync off keeps it here, the account's copy optionally goes in 30 days | accepted |
