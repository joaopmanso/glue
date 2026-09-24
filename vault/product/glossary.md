---
updated: 2026-09-24
---
# Glossary

- **MCO folder**: the folder the user picks or creates once (normally `Documents/MCO`). It *is* the
  library: JSON files, backups, imports, exports. See [ADR 0009](../adr/0009-json-files-store.md).
- **Collection**: a named library inside the MCO folder, with its own music roots and lists. One MCO
  folder can hold several (e.g. "Main", "Weddings").
- **Root**: a music folder added to a collection (e.g. `~/Music`, an external drive folder, iCloud
  Drive). Tracks are stored relative to their root.
- **Absolute path**: a root's real location on disk (`C:\Users\x\Music`). Browsers don't reveal it, but
  every DJ-app export format needs it. See [ADR 0012](../adr/0012-absolute-path-strategy.md).
- **Track**: one audio file in a root, plus its tags and format facts.
- **Analysis**: what MCO measured about a track: quality verdict and tier, bandwidth cutoff, effective
  bit depth, BPM, key, tuning.
- **Verdict**: the per-track quality conclusion (e.g. "Genuine hi-res", "Transcoded", "Upsampled",
  "Padded", "Lossy · not hi-res").
- **Quality tier**: the verdict reduced to a sortable rank used by filters and duplicate preference.
  See [quality tiers](../features/quality-tiers.md).
- **Source**: an imported external library (Rekordbox XML, Engine DJ database, Traktor NML, Apple
  Music / iTunes XML). Read-only inside MCO.
- **List**: anything that holds tracks in order. Kinds: **folder**, **playlist**, **smart list**,
  **show**, **session**.
- **Playlist**: a free-form ordered list of tracks.
- **Smart list**: a list defined by rules (quality tier, BPM range, key, tags…), filled automatically.
- **Show**: a gig: date, venue, notes. Contains sessions.
- **Session**: an ordered set within a show: time slot, target BPM/energy, notes. Exported to DJ apps
  as a playlist.
- **Duplicate group**: copies of the same song found by one of three tiers (exact / same recording /
  probable). See [ADR 0013](../adr/0013-duplicate-tiers.md).
- **Preferred copy**: the copy in a duplicate group that lists and exports should use.
- **Camelot / Open Key / Musical**: three notations for musical key (8A = Open Key 1m = A minor).
- **Harmonic neighbours**: keys that mix cleanly with a given key: one step either way round the
  wheel, or its relative major/minor.
- **Stems**: drums, bass, other and vocals separated from a mix by HT-Demucs.
- **Platform layer**: the only code allowed to touch the OS (folders, files, permissions). Web today,
  desktop later. See [ADR 0007](../adr/0007-web-first-platform-layer.md).
