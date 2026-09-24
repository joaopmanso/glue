---
updated: 2026-09-24
---
# Roadmap

Each milestone ships to the live site and ends with a review. Status: `planned` · `in-progress` ·
`shipped`.

| Milestone | Status | Scope |
|---|---|---|
| **Speklone** | shipped (2026-09-23) | Quality forensics, tempo & key, player, live view, in-browser stems, start page, GitHub Pages. See [log](../log/2026-09-23-speklone.md). |
| **M0 Vault + repo** | shipped (2026-09-24) | This vault and `CLAUDE.md`; past features and decisions recorded; repo renamed `speklone` → `mco` (live at joaopmanso.github.io/mco); the original Speklone page stays live at joaopmanso.github.io/speklone. |
| **M1 Port** | shipped (2026-09-24) | Vite + TypeScript + Svelte project; analysis, parsing, verdict and stems code moved into `src/core` unchanged apart from types; real module workers; today's UI rebuilt as "Analyze a file"; known bugs fixed (analysis race, lost stem Cancel, stuck busy bar, duplicate play loops); GitHub Actions deploy; parity tests against the old page. |
| **M2 Library** | shipped (2026-09-24) | Re-scoped with the user on 2026-09-24. Local **profiles** (no password), **collections**, **playlists** (folders, add/remove/reorder, drag and drop); MCO folder with JSON store (sharded atomic writes, schema versions, migrations); add music by folder picker or drag and drop; **imports** of Rekordbox XML, Engine DJ, Serato, Traktor NML, Apple Music / iTunes XML and M3U8, then **link music folders** to match files; **background analysis** of several tracks at once; a **track detail** page with the full Speklone analysis, player and stems. No installable app ([ADR 0017](../adr/0017-no-installable-app-for-now.md)). Features: [profiles](../features/profiles.md), [MCO folder](../features/mco-folder-backups.md), [library & scanner](../features/library-scanner.md), [playlists](../features/playlists.md), [background analysis](../features/background-analysis.md), [track detail](../features/track-detail.md), imports ([Rekordbox](../features/import-rekordbox.md), [Engine DJ](../features/import-engine.md), [Serato](../features/import-serato.md), [Traktor](../features/import-traktor.md), [Apple & iCloud](../features/import-apple-icloud.md)). |
| **M3 Organise** | planned | Shows and sessions, smart lists, quality tiers and filters, zip backups and restore, undo for deletes. Features: [shows & sessions](../features/shows-sessions.md), [quality tiers](../features/quality-tiers.md). |
| **M4 Exports** | planned | Live rekordbox.xml for Rekordbox and Engine DJ (with setup guides), Traktor NML, M3U8, quality policy on export. Feature: [exports](../features/exports.md). |
| **M5 Duplicates** | in-progress (fingerprints, groups and playlist clean-up shipped 2026-09-24) | Fingerprints, duplicate groups, "use preferred copy in all lists". Feature: [duplicates](../features/duplicates.md). |

## Later (not scheduled)
- **Desktop client** (Windows + macOS): auto-detect libraries anywhere on disk, read Rekordbox's
  master.db, native-speed stems, no folder-permission prompts.
- Direct write-back to Engine DJ's m.db and Rekordbox, always with automatic backups.
- Opt-in cloud save / sync between machines.
- Saved-stems library; cue-point and beat-grid viewing.
