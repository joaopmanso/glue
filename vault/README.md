---
updated: 2026-09-26
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
[ratings](features/ratings.md) ·
[themes](features/themes.md) ·
[automatic playlists](features/auto-playlists.md) ·
[tags](features/tags.md) ·
[GLUE Cloud](features/glue-cloud.md) ·
[shows & sessions](features/shows-sessions.md) ·
[import: Rekordbox](features/import-rekordbox.md) ·
[import: Engine DJ](features/import-engine.md) ·
[import: Traktor](features/import-traktor.md) ·
[import: Apple Music & iCloud](features/import-apple-icloud.md) ·
[exports](features/exports.md) ·
[duplicates](features/duplicates.md) ·
[profiles](features/profiles.md) ·
[import: Serato](features/import-serato.md) ·
[track detail](features/track-detail.md) ·
[Prepare](features/prepare.md)

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
| [0019](adr/0019-background-analysis-decoding.md) | Background analysis: browser decoding + analysis worker pool | accepted |
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
