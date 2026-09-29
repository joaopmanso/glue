---
status: accepted
date: 2026-09-29
---
# 0104. GLUE Home is the library's engine; the website on its computer is its screen

## Context
The user, after testing GLUE Home 0.27 (2026-09-29), in their words:
- "The web version is nothing more than an UI when the home app is installed. It doesn't do anything
  rather than proxy it to the home app… having home app installed supersedes the browser."
- Like Plex.

With 0.27 the tab still ran the library, and GLUE Home helped. GLUE Home analysed only when the tab handed
the analysis over through the account's peer channel, which didn't happen on the user's desktop. Removing
13,000 songs ran in the tab, one cache file at a time, and stopped when the browser closed.

## Decision
- **On a computer where GLUE Home runs, its service page is the only writer of the library:** the
  engine, `home/ui/engine.ts`.
  - It keeps one `CollectionStore` per collection. The analysis, the shared sync and the tab's edits all
    use that one store, so no copy goes stale.
- **A GLUE tab there is its screen** (`src/lib/engine.svelte.ts`). It reads the library through the local
  link as before, and sends every change to the engine:
  - **Edits as records** (`StoreOp`: a track, a list, a list deleted, the collection's settings, a source,
    an analysis, an event).
    - The tab's store has a client mode (`CollectionStore.sink`): a change shows at once, is sent, and is
      never written from the tab.
    - The engine applies them in order with the same store methods (`CollectionStore.apply`) and saves.
    - Every existing editor (playlists, tags, ratings, notes, song info, removing songs and folders)
      works through this unchanged.
  - **The engine's feed** (`wait`, a long poll): the files it changed, which the tab reads again; and the
    songs it analysed, whose mini spectrogram, waveform, details and fingerprint the tab takes from its
    cache (`/cache` on the local link).
  - **Analysis:** only the engine's queue (ADR 0103, without the handover). "Analyse now", Stop and Resume
    go to it, and the analysis bar shows its numbers ("by GLUE Home").
  - The tab's own cloud sync doesn't run; the engine syncs.
  - The tab lets go of the writer lease at once (`/lease?release=1`). The lease is now only for tabs from
    before the engine: while one holds it, the engine forgets its stores and writes nothing.
- **The line to the engine is a new `/rpc` route on the local link** (Rust, `local.rs`):
  - the request waits in its thread for the service page's answer (`emit_to service rpc`, the `rpc_reply`
    command, 90 s at most);
  - it works with or without an account.
- **A read-only token** (`readToken`) is refused on every file-writing route. It's handed out now; tabs
  switch to it once the last work still done in the tab (scans, DJ-library imports, song-info writing)
  runs on the engine too (the next steps).
- **Durable jobs** (`j/jobs.json` in GLUE Home's cache; the first: removing songs, for other devices'
  requests) go on after a restart.
- **Removing songs no longer waits on this browser's cache:** the cache is cleared afterwards, in the
  background.

## Alternatives considered
- Keep the tab as the engine with GLUE Home helping (0.27): what the user rejected, and what failed
  them.
- Send whole files instead of records: the engine's own changes (an analysis updating a song) and the
  tab's (a rating on another song in the same shard) would overwrite each other.

## Consequences
- Closing the browser stops nothing that was asked: edits are sent within a fraction of a second and the
  engine does the rest.
- Still in the tab for now: scanning music folders, importing and following DJ libraries, writing song
  info into files, finding duplicates. Their results already go through the engine as edits. Moving them
  (and the read-only token), the "GLUE Home isn't running" bar with its browser fallback, and other
  devices' requests are the plan's next steps.
