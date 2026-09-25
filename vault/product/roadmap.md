---
updated: 2026-09-25
---
# Roadmap

Each milestone ships to the live site and ends with a review. Status: `planned` · `in-progress` ·
`shipped`.

| Milestone | Status | Scope |
|---|---|---|
| **Speklone** | shipped (2026-09-23) | Quality forensics, tempo & key, player, live view, in-browser stems, start page, GitHub Pages. See [log](../log/2026-09-23-speklone.md). |
| **M0 Vault + repo** | shipped (2026-09-24) | This vault and `CLAUDE.md`; past features and decisions recorded; repo renamed `speklone` → `mco` (live at joaopmanso.github.io/mco); the original Speklone page stays live at joaopmanso.github.io/speklone. |
| **M1 Port** | shipped (2026-09-24) | Vite + TypeScript + Svelte project; analysis, parsing, verdict and stems code moved into `src/core` unchanged apart from types; real module workers; today's UI rebuilt as "Analyze a file"; known bugs fixed (analysis race, lost stem Cancel, stuck busy bar, duplicate play loops); GitHub Actions deploy; parity tests against the old page. |
| **M2 Library** | shipped (2026-09-24) | Re-scoped with the user on 2026-09-24. Local **profiles** (no password), **collections**, **playlists** (folders, add/remove/reorder, drag and drop); GLUE folder with JSON store (sharded atomic writes, schema versions, migrations); add music by folder picker or drag and drop; **imports** of Rekordbox XML, Engine DJ, Serato, Traktor NML, Apple Music / iTunes XML and M3U8, then **link music folders** to match files; **background analysis** of several tracks at once; a **track detail** page with the full Speklone analysis, player and stems. No installable app ([ADR 0017](../adr/0017-no-installable-app-for-now.md)). Features: [profiles](../features/profiles.md), [GLUE folder](../features/mco-folder-backups.md), [library & scanner](../features/library-scanner.md), [playlists](../features/playlists.md), [background analysis](../features/background-analysis.md), [track detail](../features/track-detail.md), [tags](../features/tags.md), imports ([Rekordbox](../features/import-rekordbox.md), [Engine DJ](../features/import-engine.md), [Serato](../features/import-serato.md), [Traktor](../features/import-traktor.md), [Apple & iCloud](../features/import-apple-icloud.md)). |
| **M3 Organise** | planned | Shows and sessions, smart lists, quality tiers and filters, zip backups and restore, undo for deletes. Features: [shows & sessions](../features/shows-sessions.md), [quality tiers](../features/quality-tiers.md). |
| **M4 Exports** | planned | Live rekordbox.xml for Rekordbox and Engine DJ (with setup guides), Traktor NML, M3U8, quality policy on export. Feature: [exports](../features/exports.md). |
| **M5 Duplicates** | in-progress (fingerprints, groups and playlist clean-up shipped 2026-09-24) | Fingerprints, duplicate groups, "use preferred copy in all lists". Feature: [duplicates](../features/duplicates.md). |
| **M6 GLUE Cloud** | in progress: accounts, cloud sync and merged collections in the library shipped ([ADR 0042](../adr/0042-merged-collection-in-the-local-library.md)); GLUE Home tray app with sending songs, streaming, shared analyses and the local link shipped ([ADR 0044](../adr/0044-glue-home-tauri-tray-app.md)–[0048](../adr/0048-local-link-to-glue-home.md)); next: the open bug in the [2026-09-26 handoff](../log/2026-09-26-handoff.md), then GLUE Home as the computer’s library ([ADR 0050](../adr/0050-glue-home-as-the-computers-library.md), proposed) | First release = phases 1–3. Optional accounts (Google first, Apple later) on Cloudflare's free tier, GLUE Home on the main computer (pairing code), devices in the library, remote browse / stream / download, upload to an incoming folder, duplicates across devices. Phases and open decisions: [GLUE Cloud](../features/glue-cloud.md); [ADR 0036](../adr/0036-optional-accounts-and-cloud-signaling.md), [0037](../adr/0037-p2p-webrtc-transport.md), [0038](../adr/0038-glue-home-app.md) (superseded by [0044](../adr/0044-glue-home-tauri-tray-app.md)); [research](../research/remote-access.md). |

## Later (not scheduled)
- **Desktop client** (Windows + macOS): auto-detect libraries anywhere on disk, read Rekordbox's
  master.db, native-speed stems, no folder-permission prompts.
- Direct write-back to Engine DJ's m.db and Rekordbox, always with automatic backups.
- Opt-in cloud save / sync between machines.
- Saved-stems library; cue-point and beat-grid viewing.
