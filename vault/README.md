---
updated: 2026-09-28
---
# GLUE vault

The project's memory: what GLUE is, what it does, why it's built the way it is, and what comes next.
Written for both people and AI agents. Plain Markdown with relative links, so it reads on GitHub and
opens as an [Obsidian](https://obsidian.md) vault.

## Start here
- [Vision](product/vision.md): what GLUE is for and the principles it keeps.
- [Roadmap](product/roadmap.md): milestones and their status.
- [Glossary](product/glossary.md): the words we use (collection, root, source, show, session…).
- [Changelog](log/changelog.md): what changed, newest first.

## Sections
| Folder | Holds | One file per |
|---|---|---|
| [product/](product/) | vision, roadmap, glossary | topic |
| [features/](features/) | what each feature does, its status, how it works, how it's tested | feature |
| [adr/](adr/) | architecture decision records: context, decision, consequences | decision |
| [research/](research/) | sourced findings (browser APIs, DJ library formats, performance) | subject |
| [log/](log/) | changelog and session write-ups | release / session |

## Conventions
- **Status** (front matter `status:`): `idea` · `planned` · `in-progress` · `shipped` · `superseded`.
- **Features** follow [features/_template.md](features/_template.md); name files by slug
  (`import-rekordbox.md`). Link the ADRs that shaped them.
- **ADRs** follow [adr/_template.md](adr/_template.md) (MADR-style), numbered `NNNN-slug.md`, never
  renumbered. A changed decision gets a new ADR that supersedes the old one; the old one stays.
- **Research** always cites sources and marks anything unverified as **[UNVERIFIED]**.
- Dates are absolute (`2026-09-24`), never "last week".
- Every change to the app updates: the feature's status/notes, the roadmap if a milestone moves, and
  the changelog. Every new architectural choice gets an ADR.

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
[GLUE folder & backups](features/mco-folder-backups.md) ·
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
| [0018](adr/0018-local-profiles.md) | Local profiles, no password; profiles own collections | accepted |
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
| [0035](adr/0035-rename-to-glue.md) | Rename MCO to GLUE (Global Library Utility Exporter); keep internal identifiers | accepted (name spelled out by 0039) |
| [0036](adr/0036-optional-accounts-and-cloud-signaling.md) | Optional accounts and a small free cloud service (Cloudflare) for devices and signaling | accepted; "no library data in the cloud" superseded by 0040 (opt-in cloud sync) |
| [0037](adr/0037-p2p-webrtc-transport.md) | WebRTC data channels between the website and GLUE Home | proposed |
| [0038](adr/0038-glue-home-app.md) | GLUE Home: a small Node.js/TypeScript app that serves the main computer's library | superseded by 0044 |
| [0039](adr/0039-glue-unified.md) | GLUE stands for Global Library Unified Exporter | accepted |
| [0040](adr/0040-cloud-sync-and-merged-collections.md) | Cloud sync of library data, merged collections, and edits that reach the owning device | accepted; partly superseded by 0042 (sync by default, automatic merge, merged collection in the library) |
| [0041](adr/0041-passwords-tiers-admin.md) | Email + password accounts, user tiers, and an admin panel | accepted |
| [0042](adr/0042-merged-collection-in-the-local-library.md) | Sync by default, merge by itself, and show the merged collection in this computer's library | accepted |
| [0043](adr/0043-batched-sync-and-progressive-loading.md) | Sync many files per request, keep one copy file per device, and show songs as they arrive | accepted |
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
| [0077](adr/0077-library-on-any-device.md) | A device without a library of its own opens the account's library from GLUE Cloud, and plays it | accepted |
| [0078](adr/0078-phone-layout.md) | On a narrow screen the library is a phone app: tabs, two-line rows, menus as sheets, a mini and full player | accepted |
| [0079](adr/0079-touch-layout-and-playlists-by-touch.md) | Every touch device gets the touch layout, and manages playlists there: folders, select, drag to reorder, remove with Undo | accepted |
| [0080](adr/0080-play-on-elements-a-tap-unlocked.md) | Songs play on audio elements a tap has unlocked (iOS), and failures say what the browser said | accepted |
| [0081](adr/0081-turn-relay.md) | Connections that can't be direct go through Cloudflare's TURN relay, with the owner's key: credentials from GLUE Cloud, encrypted end to end | accepted |
| [0082](adr/0082-covers-from-glue-home.md) | Other devices get covers from GLUE Home (kept there, or read from the tags) and keep them; never in GLUE Cloud | accepted |
| [0083](adr/0083-glue-home-activity-off-the-main-thread.md) | GLUE Home counts what it's asked, and does its file work off the main thread | accepted |
| [0084](adr/0084-playback-first-on-the-link-to-glue-home.md) | Playback first on the link to GLUE Home; failures say why | accepted |
| [0085](adr/0085-waveforms-from-glue-home.md) | Other computers' songs get their waveforms from GLUE Home too | accepted |
| [0086](adr/0086-covers-looked-up-by-glue-home.md) | GLUE Home looks up missing covers on public services | accepted |
| [0087](adr/0087-edits-reach-glue-home.md) | Other computers' songs can be edited; the owner's GLUE Home takes the edits in | accepted |
| [0088](adr/0088-aiff-streams-as-wav.md) | Another computer's AIFF songs stream, as WAV worked out a piece at a time | accepted |
| [0089](adr/0089-edits-only-against-their-own-collection.md) | Edits are worked out only against the collection they came from; mass deletions are asked | accepted |
| [0090](adr/0090-bin-guarded-re-reads-daily-backups.md) | A bin for playlists, guarded DJ-library re-reads, daily backups | accepted |
| [0091](adr/0091-computers-and-sessions.md) | A device is a computer; signing in only to browse is a session | accepted |
| [0092](adr/0092-first-question-how-glue-is-used.md) | The first question: how GLUE is used on this device | accepted |
| [0093](adr/0093-free-tier-usage-in-the-admin-panel.md) | The admin panel shows free-tier usage, from Cloudflare's analytics with a read-only token | accepted |
| [0094](adr/0094-one-shared-collection-in-glue-cloud.md) | One shared collection in GLUE Cloud, the same on every device | accepted |
