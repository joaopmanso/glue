---
updated: 2026-09-24
---
# Roadmap

Each milestone ships to the live site and ends with a review. Status: `planned` · `in-progress` ·
`shipped`.

| Milestone | Status | Scope |
|---|---|---|
| **Speklone** | shipped (2026-09-23) | Quality forensics, tempo & key, player, live view, in-browser stems, start page, GitHub Pages. See [log](../log/2026-09-23-speklone.md). |
| **M0 Vault + repo** | shipped (2026-09-24) | This vault and `CLAUDE.md`; past features and decisions recorded; repo renamed `speklone` → `mco` (live at joaopmanso.github.io/mco); old address redirects. |
| **M1 Port** | in-progress | Vite + TypeScript + Svelte project; analysis, parsing, verdict and stems code moved into `src/core` unchanged apart from types; real module workers; today's UI rebuilt as "Analyze a file"; known bugs fixed (analysis race, lost stem Cancel, stuck busy bar, duplicate play loops); GitHub Actions deploy; parity tests against the old page. |
| **M2 Library foundation** | planned | Platform layer; MCO folder setup; JSON store (sharded atomic writes, schema versions, migrations); zip backups and restore; collections; add folders and files (picker + drop); scanner (+ FileSystemObserver); tag reading; track table; player bar; installable PWA. Features: [MCO folder](../features/mco-folder-backups.md), [library & scanner](../features/library-scanner.md). |
| **M3 Background analysis** | planned | Decoders in workers (WebCodecs + wasm decoders), worker pool, quality/BPM/key columns, Inspector, quality tiers and smart views. Features: [background analysis](../features/background-analysis.md), [quality tiers](../features/quality-tiers.md). |
| **M4 Lists** | planned | Playlists, folders, smart lists, Shows, Sessions, drag-drop, session tools. Features: [playlists](../features/playlists.md), [shows & sessions](../features/shows-sessions.md). |
| **M5 Imports** | planned | rekordbox XML, Engine DJ m.db, Traktor NML, Apple Music / iTunes XML, iCloud Drive folders, auto-detection, absolute-path inference, track matching. Features: [Rekordbox](../features/import-rekordbox.md), [Engine DJ](../features/import-engine.md), [Traktor](../features/import-traktor.md), [Apple & iCloud](../features/import-apple-icloud.md). |
| **M6 Exports** | planned | Live rekordbox.xml for Rekordbox and Engine DJ (with setup guides), Traktor NML, M3U8, quality policy on export. Feature: [exports](../features/exports.md). |
| **M7 Duplicates** | planned | Fingerprints, duplicate groups, "use preferred copy in all lists". Feature: [duplicates](../features/duplicates.md). |

## Later (not scheduled)
- **Desktop client** (Windows + macOS): auto-detect libraries anywhere on disk, read Rekordbox's
  master.db, native-speed stems, no folder-permission prompts.
- Direct write-back to Engine DJ's m.db and Rekordbox, always with automatic backups.
- Opt-in cloud save / sync between machines.
- Saved-stems library; cue-point and beat-grid viewing.
