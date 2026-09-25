---
status: proposed
date: 2026-09-25
---
# 0050. GLUE Home as the computer's library: saving and cloud sync move into it

Follows [ADR 0048](0048-local-link-to-glue-home.md). Would refine [ADR 0009](0009-json-files-store.md)
(who writes the JSON files) and [ADR 0040](0040-cloud-sync-and-merged-collections.md) (who syncs).

## Context
The user (2026-09-25): "The goal of having the Home app installed is for it to handle the collection
from that computer … all behaviour of cloud sync and data save can be delegated to the app instead of
calling any cloud services."

Today the website writes the GLUE folder through File System Access and syncs with GLUE Cloud itself;
GLUE Home only reads the GLUE folder, streams, analyses and receives songs.

## Proposal
- On a computer with GLUE Home, the website talks only to GLUE Home over the local link:
  - it loads the collection from GLUE Home (no folder permission prompt);
  - it sends its changes to GLUE Home, which writes the JSON files (same format, ADR 0009);
  - GLUE Home runs the cloud sync (ADR 0040, 0043) for that computer, always on, even with no tab open,
    and pushes other devices' changes to open tabs (server-sent events on the local link).
- Analysis: GLUE Home analyses the library in the background; the website asks it instead of running
  its own pool.
- Without GLUE Home the website keeps working as today.

## Open questions
- The website and GLUE Home writing at the same time during the change-over (one writer only: GLUE
  Home takes the lock once the link is up).
- Sign-in: GLUE Home holds the account's tokens; the website there no longer needs its own.
- The website's GLUE-folder code stays for computers without GLUE Home.

## Consequences
- The folder permission prompt and "Allow on every visit" stop mattering on such computers.
- More Rust (or Node-free TS in the service page) in GLUE Home: file writes, sync, events.
