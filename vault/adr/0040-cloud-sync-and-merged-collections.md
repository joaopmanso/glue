---
status: accepted
date: 2026-09-25
---
# 0040. Cloud sync of library data, merged collections, and edits that reach the owning device

## Context
The user (2026-09-25) wants to sign in on the website and see the complete collection from any
browser. Their use case:
- a local-only library on a laptop and another on a desktop;
- sign in with Google on both;
- when the second device links, choose between merging the collections or keeping them separate;
- everything is then reachable from any browser signed in with that Google account;
- a change made elsewhere (a playlist that only exists on the desktop, ratings, notes…) reaches the
  desktop's own files the next time GLUE opens there;
- audio stays on the devices (a desktop companion will sync files later);
- the cloud copy can be cleaned up.

[ADR 0036](0036-optional-accounts-and-cloud-signaling.md) said no library data in the cloud; this
changes that, as an opt-in.

## Decision
- **Opt-in per profile** ("Cloud sync" on the profile screen), and only when signed in.
- **What's uploaded:** a profile's own data files (collections, track records, analysis summaries,
  playlists, tags, imports), gzip + base64, one D1 row per file. **Never audio.**
  - The website sends a manifest (path, SHA-256, size); the Worker answers which files it lacks,
    and only those are uploaded. That means a few requests per edit, and a 10k-track library
    starts at about 600 files.
  - Uploads run after saves (at least 20 s later, at most one every 90 s).
  - The Worker only stores and returns text, which fits its 10 ms CPU budget.
- **Views:** any signed-in browser opens a device's collection from its cloud copy. The files are
  rebuilt in memory (`src/store/memdir.ts`) and loaded with the normal `CollectionStore`, so the
  usual library UI shows it. In a view, nothing is analysed, scanned, played or written to this
  computer; the music folders and DJ libraries sections are hidden.
- **Edits made in a view** (ratings, notes, tags, playlists and folders) are compared with the view
  as opened (`core/library/cloudEdits.ts`). The difference is queued in the cloud (`sync_ops`) for
  the device that owns the data. That device applies it to its own files when its collection opens
  (and every two minutes while open), acknowledges it, and uploads again. Viewers see waiting
  edits on top of the last copy. Last change wins.
- **Merged collections** (`sync_links`): only the grouping is stored. The browser merges the
  members' copies (`core/library/mergeCollections.ts`):
  - songs: same artist and title with lengths within 3 s, else same file name and size; shown as
    one row "on Laptop · Desktop";
  - playlists and folders with the same place and name become one;
  - tags join.

  Merged edits are translated back to each device's ids: an existing playlist changes where it
  lives, and a new one goes to every device. Unmerge any time; nothing on disk changes.
- **Linking a second device:** turning sync on when the account already has other devices'
  collections asks, per collection, "keep separate" or "merge with …". A same-named collection is
  suggested.
- **Clean-up:** delete one profile's cloud copy (per device), or everything (copies, merges,
  waiting edits). Removing a device removes its copy. Account deletion removes all.
- **Limits:** 1.8 MB per file (base64), 5,000 files per profile per device, 300 MB per account,
  20,000 waiting edits.

## Alternatives considered
- **A server-side merged library** (one canonical copy in the cloud): a real sync engine with
  conflicts, and the Worker would have to parse data.
- **CRDTs for everything:** robust, but heavy for a library whose files already have one writer per
  device; last-change-wins operations fit the use case.
- **R2 object storage for the files:** needs billing set up; D1 rows (≤ 2 MB) are enough for JSON
  shards.

## Consequences
- The account now holds library metadata (titles, artists, playlists, tags, notes) for synced
  profiles; the privacy text says so, and clean-up is one click.
- Waiting edits pile up for devices that never open again; they're capped, and they go with the
  device when it's removed.
- The desktop companion (later) can take over applying edits in the background and move audio files.
