---
status: accepted
date: 2026-09-24
supersedes: 0015
---
# 0017. No installable app for now (supersedes 0015)

## Context
ADR 0015 planned a PWA (manifest + service worker) so Chromium would keep folder permissions and
Safari wouldn't evict storage. The user decided against any installable app for now (2026-09-24).

## Decision
No web app manifest, no service worker, no "Install MCO" prompts. MCO stays a plain website.

## Consequences
- Chrome/Edge may ask to re-grant the MCO folder on a later visit; "Allow on every visit" in Chrome's
  prompt avoids that. The UI offers a single "Reconnect" button when access has lapsed.
- Safari's 7-day eviction of script-written storage applies to the OPFS copy used there; users are
  reminded to download a backup.
- Revisit together with the desktop client.
