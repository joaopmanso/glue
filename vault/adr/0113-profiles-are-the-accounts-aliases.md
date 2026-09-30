---
status: accepted
date: 2026-09-30
supersedes: 0018
---
# 0113. Profiles are the account's artist aliases; a GLUE folder keeps one library that every alias uses

Supersedes [ADR 0018](0018-local-profiles.md). Amends [ADR 0077](0077-library-on-any-device.md) (a device
with no library of its own never makes a profile from the account's name) and
[ADR 0101](0101-cloud-sync-is-the-accounts-collections.md) (cloud sync is the library's, on "This computer").

## Context
The user, 2026-09-30:
- A profile is an artist alias, the same list on every device: pick, create, rename, delete. It's for events
  later.
- A first sign-in with none asks for one.
- The iPhone made a profile "Joao Manso" (the account's name) instead of using "404". Only "404" is to stay.
- Collections belong to the account ([ADR 0112](0112-the-accounts-collections.md)).

Until now a profile was a folder in each GLUE folder (`profiles/<pid>/`) that owned its collections. It
existed only on that device, and GLUE Home's cache, streaming requests and backups are all keyed by that
folder.

## Decision
- **A profile is an alias:** an id, a name, a colour, and how BPMs show (`bpmRange`).
  - The account keeps the list: GLUE Cloud migration 0010, `profiles`, `GET/POST /v1/profiles`,
    `PATCH/DELETE /v1/profiles/<id>`. Each change is broadcast so the account's online devices update.
  - Each GLUE folder keeps a copy for when it's offline (`mco.json` `aliases`, `lastAlias`).
- **The list is seeded once.** The first computer with a GLUE folder of its own that signs in to an account
  with none sends its aliases, keeping their ids (`POST /v1/profiles/seed`, a single statement that does
  nothing once the account has had any). The desktop's "404" stays `b2df…`. A phone, or a browser's own
  storage, never seeds.
- **After that, the account's list is the truth:**
  - a device's own aliases that the account doesn't have drop out;
  - the alias in use becomes the account's one of the same name, or its only one; otherwise "Who's using
    GLUE?" asks;
  - a device with no library of its own uses the account's only alias, or asks (never the account's name);
  - with none at all, the first sign-in asks for one ("Your name or DJ name").
- **Nothing moves on disk.** A GLUE folder keeps one library: one existing profile folder, named in
  `mco.json.container` (the one used last).
  - Every alias opens it. `profiles` and `lastProfile` stay, so older GLUE versions and GLUE Home read the
    folder as before.
  - A GLUE folder with more than one profile folder from before offers a "Library" choice on "This
    computer". The others stay untouched.
- **"Who's using GLUE?"** lists the aliases (pick, create, rename, delete, BPM range). Backup and Cloud sync
  are the library's, so they move to the "This computer" card. Deleting an alias never deletes the library.

## Alternatives considered
- Moving each collection to `collections/<cid>` at the GLUE folder's top: about 80,000 of GLUE Home's cache
  keys, the streaming protocol and files in a OneDrive folder would all move. Deferred; paths are still
  built per profile folder, so it stays possible.
- One library per alias on each device: two copies of a 13,000-song collection on one computer, each synced
  on its own.

## Consequences
- The user opens the desktop first after the update, so "404" seeds the account. The laptop's own "404"
  becomes the account's; the iPhone's "Joao Manso" drops out of every list, and its library stays.
- Events can name an alias the same way on every device (next).
- A profile made while signed out, on a device whose account already has profiles, drops out the next time
  it signs in.
