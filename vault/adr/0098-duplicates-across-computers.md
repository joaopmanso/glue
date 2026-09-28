---
status: accepted
date: 2026-09-28
---
# 0098. Duplicates across computers: each computer publishes its own matches

## Context
Songs are matched as "the same recording" by their acoustic fingerprints, which stay on the computer
that made them. So a shared collection showed no 2×/3× badge on another computer's songs.

## Decision
- Each computer matches its own songs as before. In a shared collection it also writes what it found to
  `dupes/<computer>.json` in the collection (`{v: 1, at, matches}`). The file is synced like the rest,
  and only that computer writes it.
- Every device joins the other computers' matches to its own when it builds the groups
  (`lib/dupes.svelte.ts`). So a group, its badge and the Duplicates view cover every computer's songs.
- "Probable" groups (same artist and title) already covered every song.
- A computer publishes when its matches change, or when its file is missing (a collection just shared).
- Cleaning up stays with each computer's own files: another computer's copy is never moved or deleted
  from here (`cleanUpPlan` skips them).

## Alternatives considered
- Sending the fingerprints themselves: much bigger, and each device would redo the matching.
- One file for the whole collection: every computer would write it, and every change would clash.

## Consequences
- A match between songs on two different computers (the same recording on both) needs both fingerprints
  in one place, so it isn't found yet. Songs that are the same song across computers are usually already
  one song with two copies (ADR 0096).
- GLUE Home doesn't run the matcher yet: a computer's matches are published when a GLUE tab runs there.
