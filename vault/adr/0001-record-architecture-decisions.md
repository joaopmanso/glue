---
status: accepted
date: 2026-09-24
---
# 0001. Record architecture decisions in this vault

## Context
The project is growing from one HTML page into a multi-module app built partly by AI agents across
many sessions. Decisions made in chat get lost, and agents repeat settled debates.

## Decision
Keep architecture decision records as numbered Markdown files in `vault/adr/`, one per decision,
following `_template.md`. Record decisions made before this ADR retroactively (0002–0006). Agents read
the relevant ADRs before working and add one for every new architectural choice. Superseded decisions
stay, marked `superseded by NNNN`.

## Consequences
- Decisions and their reasons are discoverable in one place, in the repo, versioned.
- Small overhead per decision.
