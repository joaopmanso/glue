---
status: accepted
date: 2026-09-28
---
# 0097. GLUE Home syncs its computer's shared collections, and writes song info edited elsewhere

## Context
A shared collection ([ADR 0094](0094-one-shared-collection-in-glue-cloud.md)) was synced only by an open
GLUE tab. The user wants GLUE Home to be the computer's backend: a change made on the laptop or the phone
should reach the desktop's GLUE folder, and its music files, with no tab open there. Song info edited on
another device (a title, a genre) must end up in the desktop's own file, as edits did before
([ADR 0087](0087-edits-reach-glue-home.md)).

## Decision
- **GLUE Home's service page runs the website's own shared engine** (`store/shared/engine`,
  `home/ui/sharedSync.ts`) against the GLUE folder through the local link's file API. It runs only while
  no GLUE tab holds the lease (the one-writer rule, ADR 0051), checked before each collection and before
  writing files:
  - when GLUE Cloud's room says a shared collection changed on another device;
  - 25 s after starting, then every minute.
- **Which member this GLUE folder is** (`core/shared/project meFor`): GLUE Home's device if it's a member,
  else the member whose profile the folder holds (a GLUE folder is on one computer).
- **Song info edited on one computer is marked on every other computer's copy** (`toShared`: an
  `INFO_FIELDS` change adds those fields to the others' `copies[c].unwritten`). Each computer writes its
  own file: GLUE Home with `writeUnwritten` (through `/fs/tags`), or the tab there. Then the file's new
  size and date, with nothing left to write, go back up.
- **GLUE Home reads the shared form everywhere it reads the GLUE folder** (`home/ui/library.ts here()`):
  streaming a song (`trackPath`), finding music folders, the background waveforms. A song this computer
  has no copy of isn't served from here.
- **Clashes** GLUE Home meets stay with the sync state in the GLUE folder (`cloud/shared/<cid>.json`). The
  next GLUE tab on this computer shows them ([ADR 0095](0095-ask-per-clash.md)): GLUE Home has no box.
- The old way (edits waiting in `sync_ops`, `home/ui/edits.ts`) stays for collections that aren't shared
  yet, until phase 7.

## Alternatives considered
- A `shared_conflicts` table so any device can answer GLUE Home's clashes: GLUE Home can't tell what the
  user meant any better than the next tab on its computer, and that tab comes soon enough.
- GLUE Home writing files without the lease check: breaks the one-writer rule.

## Consequences
- With GLUE Home running, the desktop's library is up to date before any tab opens, and edits made on
  the phone reach the desktop's files.
- If both sides changed a computer's own part (a copy's `unwritten` and its date) at once, that computer's
  side wins (merge3's per-computer rule). A title changed then may not be written into the file until
  it's edited again. Rare; watch for it.
- Still to do in phase 5: analysis summaries and fingerprints from GLUE Home, duplicates across
  computers, DJ libraries published for every device, file jobs.
