---
status: accepted
date: 2026-09-24
---
# 0014. Chrome/Edge get the full experience; Safari/Firefox a reduced one

## Context
Folder pickers, persisted folder access, writing into Documents and FileSystemObserver exist only in
Chromium. Mozilla rates the File System Access API "harmful" and WebKit "oppose"; neither plans to
ship it.

## Decision
Target Chromium (Chrome, Edge, Arc, Brave, Opera) for the full product. Safari and Firefox get:
drop-to-load music (per session), MCO data in OPFS, zip backup download/restore, analysis, lists and
exports as downloads. Capability flags from the platform layer (ADR 0007) decide what's shown; a
banner explains what Chrome/Edge add.

## Consequences
- The best experience needs Chrome/Edge; this is stated on first run.
- Two code paths in the platform layer, both tested.
