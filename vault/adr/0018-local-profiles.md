---
status: accepted
date: 2026-09-24
amends: 0009
---
# 0018. Local profiles, no password; profiles own collections

## Context
The user wants to "create a local user" without accounts. Chosen: profiles like streaming-app
profiles: several people or personas on one machine, each with their own collections and playlists,
no password (2026-09-24). Everything stays in the MCO folder.

## Decision
- A profile has an id, a name and a colour. No PIN. Switching is one click.
- The store layout of ADR 0009 gains a profile level:
```
MCO/mco.json                                   profiles list, last profile, format version
MCO/profiles/<pid>/profile.json                name, colour, collections list, last collection
MCO/profiles/<pid>/collections/<cid>/collection.json    name, music roots
                          …/tracks/<00..ff>.json        track records, sharded by id prefix
                          …/analysis/<00..ff>.json      analysis summaries, same sharding
                          …/lists/<lid>.json            one per folder / playlist
                          …/sources/<sid>.json          one per imported library
```
- Music folder handles are stored in IndexedDB keyed by profile, collection and root id.

## Consequences
- Profiles are a convenience, not security: anyone with the folder can read every profile.
- A profile's data can be moved or backed up by copying its folder.
