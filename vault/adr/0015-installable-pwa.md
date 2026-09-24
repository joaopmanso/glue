---
status: superseded by 0017
date: 2026-09-24
---
# 0015. Make MCO an installable PWA

## Context
In a normal Chrome tab, folder permission must be re-granted per visit unless the user picks "Allow
on every visit". Installed PWAs keep granted permissions automatically. Safari deletes script-written
storage after 7 days without interaction, except for installed web apps.

## Decision
Ship a web app manifest and a service worker that caches the app shell (not audio), and invite
installation ("Install MCO") from the first-run flow and Settings.

## Consequences
- Installed MCO behaves close to a desktop app: its own window, offline start, remembered folders.
- A service worker adds update handling: show "New version available · Reload".
