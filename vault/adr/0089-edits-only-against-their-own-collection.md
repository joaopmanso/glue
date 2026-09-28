---
status: accepted
date: 2026-09-28
---
# 0089. Edits are worked out only against the collection they came from; mass deletions are asked

Fixes a data loss in [ADR 0042](0042-merged-collection-in-the-local-library.md)'s overlay and
[ADR 0040](0040-cloud-sync-and-merged-collections.md)'s edit operations. A first step of the plan
for one shared collection (handoff 2026-09-28, "The user's fifth list").

## Context
On 2026-09-28 every playlist disappeared, on every device.
- **The cause, reproduced in e2e:** with a merged collection shown in a device's own library, the
  sync kept its snapshot of the merged view (`overlayBase`) and the overlay itself when that
  collection was closed. This happened on a switch, on a reopen from the profile screen, and on the
  move between GLUE Home and the browser.
- The next `sendEdits` compared the old snapshot with the new collection. Every playlist the other
  devices had looked deleted, so `list-del` edits went to each of them (`translate`), and they
  applied them.
- **Nothing held a mass deletion back,** and there was no bin.

## Decision
- **The library tells sync before a collection closes** (`lib.onCollectionClosing`).
  `sync.leaveCollection()` sends what changed against the closing collection, then forgets the
  overlay, its snapshot, the other members and the timers.
- **The snapshot is tied to its store** (`baseStore`, and `cloudStore` for the cloud view): edits
  are only worked out when the open store is the one the snapshot came from.
- **Deleting many playlists at once waits for a yes** (`keepDeletes`: more than 3, or more than a
  tenth of them), in all three places:
  - when this device sends edits;
  - when a cloud view sends them;
  - when edits made elsewhere are applied here.

  No: the deletions are dropped. GLUE Home, which can't ask, leaves more than 3 deletions to a GLUE
  tab.

## Consequences
- A switch or reopen can no longer delete another device's playlists.
- A real deletion of many playlists asks once.
- Still to come (the same plan, phase 0): a bin for deleted playlists, confirmed removals when a DJ
  library is re-read, and daily backups.
