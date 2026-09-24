---
status: accepted
date: 2026-09-24
---
# 0010. Read-only import and file export before any write-back

## Context
Rekordbox's master.db is SQLCipher-encrypted with a reverse-engineered key that already broke once
(6.6.5); Engine DJ asks third-party tools not to open its database while it runs and never to change
the schema. A bug writing into either could damage a DJ's library.

## Decision
v1 never writes into another app's library. Imports read copies (rekordbox XML, Engine m.db, Traktor
NML, Apple Music / iTunes XML). Hand-back is through files each app imports itself: rekordbox XML
(Rekordbox and Engine DJ), Traktor playlist NML, M3U8. Direct write-back comes later (desktop era),
opt-in, with an automatic backup before every write.

## Consequences
- Zero risk to the user's DJ libraries.
- One manual step per app (import the MCO playlist), made as easy as possible by a live export file
  (ADR 0011).
