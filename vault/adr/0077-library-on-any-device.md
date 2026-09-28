---
status: accepted
date: 2026-09-28
---
# 0077. A device without a library of its own opens the account's library from GLUE Cloud, and plays it

## Context
The user's list (2026-09-28): signed in on another device (an iPhone), the library should load to
browse, listen and prepare playlists, without making a collection or a GLUE folder there. Songs can be
sent from the phone to a computer running GLUE Home. The user chose the merged library, opened by
itself and remembered.

- **What existed:** the start page's GLUE Cloud panel could open any synced collection as a cloud view
  (ADR 0040), built in memory.
- **What was missing:**
  - It had to be found and opened by hand.
  - Nothing in it played ("playing is this-computer only").
  - The Devices section, with "Send songs…", was hidden in it.

## Decision
- **Opens by itself** (`lib/anywhere`) when the device has no library of its own:
  - no GLUE folder (the start page);
  - or only an empty library in the browser's own storage, made before this.

  Signed in, once the account's cloud list is known, it opens:
  - what was opened here last (pref `cloudLibrary`, written whenever a cloud view opens);
  - else the biggest merged collection;
  - else the biggest collection of any device.

  Nothing is written to the device's storage.
- **It plays:**
  - each song of a cloud view points at a computer that has it (`t.remote`, in memory):
    - one whose GLUE Home is online first;
    - else one with a GLUE Home at all;
  - it streams from there (ADR 0076). `lib.playsHere` decides what plays, in one place.
- **Edits** (ratings, tags, notes, playlists) go to the owning computers through GLUE Cloud, as cloud
  views always did (ADR 0040).
- **Devices** shows in cloud views too, so "Send songs…" works from a phone: WebRTC to that GLUE
  Home's incoming folder (ADR 0044).

## Consequences
- **A phone, signed in, is a remote for the library:** browse, play, rate, tag, edit playlists, send
  songs home. Its analyses are the computers' (no analysis on the phone).
- **The cloud copy is fetched each time it opens** (only what changed, ADR 0043). Keeping it on the
  device for an instant, offline start is for later.
- **A computer opening its own collection as a cloud view** now streams its songs from its own GLUE
  Home rather than saying they're elsewhere.
- **The phone layout** is the next step ([phone app](../features/phone-app.md)).
- **Tests:** e2e `phone.spec`:
  - a device without a GLUE folder signs in;
  - the library opens by itself and nothing is made on it;
  - a song streams from the desktop's GLUE Home (its real service page);
  - a rating is queued for the desktop;
  - a song is sent to the desktop's GLUE Home;
  - after a reload it opens again.
