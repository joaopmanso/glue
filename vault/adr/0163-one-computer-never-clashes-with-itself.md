---
status: accepted
date: 2026-10-08
---
# 0163. One computer never clashes with itself; GLUE Home shows its clashes; a tab sends only what it changed

## Context
The shared sync (ADR 0094, 0095) keeps a clash when the same field was changed differently on two sides: the cloud's
value stays in place, this side's is kept with the sync state until the user answers in a box (`ConflictBox`).

On 2026-10-08 the desktop's sync state held 61 clashes, all "by" the desktop's own GLUE Home: the page and GLUE Home
both wrote the same songs' length and format (and the duplicates file) before ADR 0162. They could never be answered:
with GLUE Home running the page doesn't sync (ADR 0162), the box is shown only by a page that syncs, and GLUE Home has
no screen for them. The same would hide a real clash (a title changed on the laptop and on the desktop).

Showing them through GLUE Home brought a third problem to light. A tab in Home mode sends GLUE Home's engine whole
song records (`CollectionStore.sink`): a cover found a moment after GLUE Home settled a clash sent the song as the tab
still had it, and put the old title back. The engine's analysis did the same: it read a song under the store's lock,
let go, and saved the record as it was read, over anything saved in between.

## Decision
- **A computer never clashes with itself.** A sync's `Place` names this computer's other devices (`own`: its GLUE Home,
  and the browser's sign-in when it isn't the computer's). A change one of them pushed is merged without a clash (the
  cloud's value kept, as before); a clash recorded from one before is dropped when the sync state is read, and gone
  with the next save. The website (`store/shared/engine.ts`) and GLUE Home (`sync.rs`) alike, held together by the
  sync golden `own`.
- **With GLUE Home running, its clashes show in the tab** (the same box): the engine answers `clashes` (the open
  collection's) and `resolve` (one answered: its value into the file, the clash forgotten, the file read again and in
  the feed, sent with the next sync). The tab asks when it attaches and after each batch of the feed.
- **The engine's store is the file's writer:** an answer saves what the store has waiting, writes the file and reads
  it back while holding the store; the analysis builds and saves its results under one hold of it.
- **A tab sends a song with the record it had** (`{ m: 'tracks', ts, was }`): the engine applies only the fields that
  changed from it over its own record (`changed_over`); a new song, or none sent, as before. An older GLUE Home ignores
  `was`; an older tab sends none.

## Alternatives considered
- **Settling the 61 by editing the desktop's sync state by hand:** once, for one computer; the rule settles them on
  every computer and keeps new ones from being recorded.
- **Fixing the cover reader alone:** any edit the tab makes in the moment before it reads GLUE Home's change back
  would do the same (a rating, a tag).
- **Field-level ops in the store (patches) everywhere:** a change to the store's ops and both stores' goldens; `was`
  keeps the ops as they are and does the merge where the race is, in the engine.

## Consequences
- The desktop's 61 clashes go with GLUE Home 0.60's first sync there.
- A clash between two computers shows on the computer with GLUE Home too, answered there.
- Edits a tab makes while GLUE Home changes the same song both survive, field by field.
