---
status: accepted
date: 2026-09-28
---
# 0099. In a shared collection, a DJ library belongs to its computer

## Context
A DJ library (rekordbox XML, Engine DJ, Traktor, Apple Music) is a file on one computer. In a shared
collection ([ADR 0094](0094-one-shared-collection-in-glue-cloud.md)) its record (`sources/<id>.json`,
with its playlist tree) reaches every device. The user wants to see every computer's libraries, with
that computer's icon, and to import their playlists from any device. But only the computer that has the
file can read it again, follow it, or tell that a playlist is gone.

## Decision
- **A library in a shared collection records its computer** (`Source.computer`). It's set when this
  computer imports or re-reads it (`CollectionStore.putSource`), and when a collection is shared
  (`makeShared`) or moved in (`adopt`).
- **Only that computer reads it** (`CollectionStore.ownSource`):
  - following it live (djWatch);
  - matching found library files to it;
  - remembering where its file is;
  - Refresh / Update / Remove.
  Another computer's same app is a different library.
- **Everywhere else it shows with that computer's name and a computer icon**, and its playlists can be
  imported into GLUE from there (the tree is in the record). The copies are ordinary playlists of the
  shared collection, so every device gets them. The library's own computer then keeps them in step
  with the library (ADR 0063) when it next reads it.
- A library with no computer recorded (an older shared collection) is treated as this computer's, as
  before.

## Alternatives considered
- One record per library per computer (a copy of the tree for each device): no one could tell which is
  the real one.
- Hiding other computers' libraries: what the user asked to change.

## Consequences
- Removing a library is done on its computer; other devices can only import from it.
- GLUE Home doesn't read DJ libraries on its own yet: a computer's libraries are brought up to date when
  a GLUE tab runs there (or when GLUE Home follows them for that tab, ADR 0065).
