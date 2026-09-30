---
status: accepted
date: 2026-09-30
---
# 0108. One id per computer: GLUE Home learns it, only the computer's GLUE folder writes its parts, nothing writes a stand-in

Amends [ADR 0091](0091-computers-and-sessions.md) (a merge moves GLUE Home's companion; attaching goes through the
local link GLUE Home already gave the tab) and [ADR 0101](0101-cloud-sync-is-the-accounts-collections.md) (who writes a
member's entry). Replaces [ADR 0097](0097-glue-home-syncs-shared-collections.md)'s rule for which member a GLUE folder
is.

## Context
The user's desktop on 2026-09-30 (read-only check of the GLUE folder):
- **The main collection listed three computers:** the laptop, "Desktop" (the account device `mmJiL…`, but its
  entry named the profile folder of Edge's own private library on the same computer), and `this-computer`
  (the desktop's own folder).
- **How it happened:**
  - A shared collection's store took this computer from `opts.me` (the signed-in browser's device), else the
    member whose profile was this folder's, else the stand-in `'this-computer'`.
  - Chrome opened the collection before sign-in had finished, so the store used the stand-in. Opening it
    saved the hidden TO BE SORTED folder, which made the stand-in a member.
  - Edge, signed in as the same computer but keeping its own library, counted as "holding" the desktop's
    songs (it could see their copies). It rewrote the desktop's entry with its own folder.
  - GLUE Home's engine then matched the stand-in by profile and wrote everything as it: phantom copies of
    every edited song, and a TO BE SORTED song twice.
- **Consequences:**
  - The engine saw all 13,015 of the desktop's songs as another computer's, so it stopped analysing them.
  - Other devices asked for the desktop's songs in Edge's folder, which isn't on the desktop's disk, so
    streaming failed.
  - GLUE Home's companion (the computer's device) was unknown. `join()` never moved it, and attaching needed
    a WebRTC request that didn't get through.

## Decision
- **A computer's id is its account device: GLUE Home's companion.**
  - GLUE Cloud answers `GET /v1/computer` (GLUE Home's credential).
  - Merging a browser into another device moves any GLUE Home's companion with it.
- **GLUE Home learns it** (`home/ui/identity.ts`, `HomeConfig.computer`). It checks at start, when online, hourly,
  and when a tab attaches:
  - first from GLUE Cloud;
  - failing that, from its disk: the one member of its GLUE folder's shared collections whose music folders
    it found here. GLUE Home vouches for it (`/v1/computer/attach`).
  - If GLUE Cloud and the disk disagree, nothing is written. Activity says why.
- **GLUE Home uses that id everywhere:** the engine's stores, the analysis, the shared sync and serving other
  devices (no more guessing from profiles).
  - `hello` gives it to a GLUE tab here; the tab opens the collection as it, and reopens if it opened as
    something else.
  - Requests naming the wrong profile folder find the collection's folder anyway (`folderOf`).
- **Only the GLUE folder recorded for a computer writes its parts** (`writesFor`): its copies, its analyses,
  its music folders and its entry.
  - Any folder may write while none is recorded.
  - Another folder on the same computer (another browser's own) reads them and writes none; it also removes
    no songs.
  - An unknown computer (no id, or the old stand-in) writes none of them anywhere (`toShared`,
    `analysisShared`, `collectionShared`).
  - A store opened without a known computer shows the collection as the member its folder names, and writes
    nothing for it.
- **A browser on a computer where GLUE Home keeps a GLUE folder uses it (Home mode),** even if it once kept a
  library in its own storage. That copy stays, unused.
  - It's never "a device with no library".
  - Attaching uses the local link it already has.
  - The GLUE folder remembers its computer (`mco.json.computer`) for when neither GLUE Home nor a sign-in
    says.
- **What was written under another id is put right by GLUE Home, once it knows its computer**
  (`core/shared/repair.ts`, `CollectionStore.foldComputer`):
  1. a backup (`backups/pre-repair-<date>-<profile>-<collection>.zip`);
  2. the stand-in's copies become the computer's (a duplicate of the same file goes), and the newer analysis
     is the computer's;
  3. the stand-in's folders and libraries become the computer's, and the entry names this folder again;
  4. two rows of one file fold into the older one (playlist places, rating, notes kept);
  5. the stand-in's duplicates file goes.

  Saved and sent up like an edit.

## Consequences
- **One computer id** in the collection's files, in GLUE Cloud's copy and on every device. GLUE Home analyses
  the desktop's songs again, and other devices stream from it again.
- **A computer whose GLUE Home can't tell which computer it is** (signed out, or GLUE Cloud and the disk
  disagree) reads shared collections and writes nothing per computer until it can. Activity says so.
- **A second browser on a computer** shares that computer's library through GLUE Home. It no longer keeps a
  separate one.
