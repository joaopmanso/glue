---
status: accepted
date: 2026-09-30
---
# 0112. The account's collections: one list with each computer's numbers, a rename and a deletion every device follows, no silent second collection

Amends [ADR 0101](0101-cloud-sync-is-the-accounts-collections.md) (when a collection becomes the account's) and
[ADR 0102](0102-caches-follow-and-cloud-sync-off.md) (a deletion next to turning cloud sync off).

## Context
The user, 2026-09-30:
- "Who's using GLUE?" showed two boxes, "My collection · 0 songs · changed just now", and the collection menu
  had two "My collection". They made one collection, and expect one box listing its devices: each one's
  songs, whether it's linked, and its last change.
- Collections belong to the account (the user's decision): a default one, more when asked for, seen by every
  device.

What the code did:
- `shared_collections.stats` was never written, hence "0 songs".
- `updated_at` moves on every push, so any sync made it "changed just now".
- `shared.ensure()` quietly made a collection the account's whenever none of the account's was missing here.
  So a second local collection (8 songs of TO BE SORTED) became a second account collection with nobody
  asked (`c8f50116…`).
- `moveInto()` added the account's collection to the profile before it had worked.
- A rename never reached GLUE Cloud, and a deletion (`DELETE /v1/shared/<id>`) wiped the rows at once, so
  other devices never heard of it.

## Decision
- **Each computer's numbers are the collection's** (`stats`: `{ tracks, by: { <computer>: { songs, at,
  changed } } }`):
  - whoever syncs (GLUE Home where it runs, else the tab) sends `POST /v1/shared/<id>/stats` with the
    collection's songs and this computer's, when they changed;
  - each push records when that computer last changed the collection;
  - a GLUE Home's numbers are its computer's (its companion, ADR 0108).
- **One box per collection, with its computers** (GLUE Cloud panel, "Who's using GLUE?"):
  - for each computer: its name, whether GLUE Home runs there, online or last seen, its songs, and its last
    change;
  - Rename and Delete on the box.
- **A rename is the account's**: `PATCH /v1/shared/<id>` and the collection's own name, which syncs.
- **A deletion is every device's:**
  - `DELETE /v1/shared/<id>` asks for the name to be typed first;
  - GLUE Cloud keeps a tombstone (`deleted_at`): syncing it answers 410, the list names it in `gone`, and the
    account's online devices hear it at once;
  - each device makes a backup (`backups/pre-deleted-<date>-<collection>.zip`), then forgets the collection
    (out of the profile's list; its files stay in the GLUE folder);
  - the daily purge removes it with its files after 30 days;
  - "Delete everything in my cloud" still removes from GLUE Cloud only (`?cloudOnly=1`), and each computer
    keeps its copy.
- **No silent second collection:**
  - while the account has collections, a local one becomes the account's only when asked: the box (put into
    one, keep as its own, not now), also when all the account's collections are here already;
  - a collection made on purpose ("New collection…") is the account's own;
  - an account with none still takes the first collection quietly.
- **Putting a collection into the account's joins it only once that worked**; a failure leaves the profile
  as it was.

## Alternatives considered
- A default collection per account in GLUE Cloud (`POST /v1/shared/default`): nothing needs it once no
  collection is made the account's quietly.
- Deleting at once: the other devices keep syncing a collection that isn't there (404), and can't tell it
  from a hiccup.

## Consequences
- The user deletes `c8f50116…` from its box. Every device backs it up and forgets it; the old moved
  collection `1b05deae…` is untouched.
- The panel's counts come from the computers themselves: a computer that hasn't synced since this change
  shows no count until it does.
