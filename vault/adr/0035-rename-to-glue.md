---
status: accepted
date: 2026-09-25
---
# 0035. Rename MCO to GLUE (Global Library Utility Exporter); keep internal identifiers

## Context
"MCO" is already taken. The user chose **GLUE**, Global Library Utility Exporter: a double meaning,
since it glues the DJ apps (rekordbox, Engine DJ, Serato, Traktor, Apple Music) together, with a
glue stick as the logo (2026-09-25). People already have data folders, backups and browser settings
written by MCO.

## Decision
- Everything a person sees says GLUE: page title, header (the full name with G, L, U, E
  emphasised and a glue-stick logo, `src/ui/GlueStick.svelte`), favicon (`public/glue.svg`),
  messages, backup file names ("GLUE backup - …zip"), docs.
- Internal identifiers stay `mco`: `mco.json`, `mco-backup.json`, IndexedDB `mco`, prefs `mco.*`,
  picker ids (`mco-home`…), the Web Lock name. Renaming them would orphan existing folders, stored
  folder permissions and backups for no visible gain.
- New users are told to make a folder called GLUE; existing MCO folders open as before (the
  welcome screen says GLUE was called MCO).
- Past ADRs and log entries keep the name they were written with.
- The repository and URL (`joaopmanso/mco`, `/mco/`) move separately, with the user's go-ahead:
  the page's origin (joaopmanso.github.io) stays the same, so browser data survives a path change.

## Consequences
- Code and file formats keep a legacy prefix; CLAUDE.md says so, so it isn't "fixed" by accident.
