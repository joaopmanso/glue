---
status: accepted
date: 2026-09-27
---
# 0074. Events: a calendar in GLUE, each event with a folder of playlists, reminders in GLUE and from GLUE Home

## Context
The user's list (2026-09-27): a calendar of events with their details (date, venue, set times,
lineup, flyer…), playlists assigned to an event or made for it, and reminders when an event is coming
with no playlist yet. The user chose "GLUE + desktop": a banner in GLUE, and notifications from
GLUE Home.

"Shows & sessions" ([feature](../features/shows-sessions.md), M4) was planned in 2026-09, never built.

## Decision
- **The store:**
  - A collection's events are one file, `events.json` (`{schemaVersion, items}`), beside
    `collection.json`. A calendar holds tens or hundreds of events, not thousands, and GLUE Home
    reads it in one go. Flyers are JPEGs in the collection's `events/` folder (at most 1400 px),
    named in the event.
  - **An event:**
    - name, start (and end);
    - the user's set (times); venue, address, city;
    - lineup (names, the user's marked); flyer; link; notes;
    - status (planned, played, cancelled); reminder days (7 by default, 0 for none);
    - its folder, and the playlists assigned to it.
  - Times are the event's local time as typed (`YYYY-MM-DDTHH:mm`), no time zone.
- **Playlists:**
  - **Its own folder:** each event gets a folder in Playlists (`Events › 2026-10-03 · Lux`). The
    folder, and the Events folder, carry `List.event` (the event's id, or `*`).
  - **Versions:** "Make a version of a playlist" copies one into that folder, to trim and reorder
    for the event. They're ordinary playlists: drag, menus, export, dock all work.
  - **Assigning** links a playlist elsewhere without moving it.
  - **Deleting** an event asks whether its folder (and the versions) goes too.
- **Screens:**
  - **A Calendar tab** (`#/events`): a month (Monday first), what's coming and what's been. A day's
    number adds an event there.
  - **An event's page** (`#/events/<id>`):
    - its details, flyer and lineup;
    - its playlists, each with its running time against the set; Play;
    - "Stats…", Edit, Delete.
- **Needs music** (`core/library/events` `needsMusic`): planned, within its reminder days (today
  included), and no songs in its playlists (its folder's and the assigned ones).
  - **In GLUE:** a banner above the library and the calendar (× hides it until tomorrow), and a
    count on the Calendar tab.
  - **GLUE Home 0.13:**
    - its service reads `events.json`, and only then the collection's playlists (`glue_list`, a
      new read-only command);
    - 90 s after it starts, then hourly;
    - a desktop notification once a day per event (`tauri-plugin-notification`), remembered by
      GLUE Home.
    - The settings: turn reminders off, or "Check now".
  - GLUE Home only reads the GLUE folder, so it reminds whether or not a website tab is open (no
    lease is needed to read, ADR 0051).

## Alternatives considered
- **One file per event** (like playlists): GLUE Home would need a folder listing for every look;
  there are few events.
- **Sessions inside an event** (the old plan): an event's folder of playlists does the same with
  what GLUE already has.
- **Clicking the notification to open the event:** desktop notifications from Tauri have no click
  handler on Windows; the text says where to go.

## Consequences
- Events aren't in cloud sync yet: they stay in this computer's GLUE folder (and its backups).
- Supersedes `features/shows-sessions.md`. Its BPM and key flow checks can come to the event page
  later.
- **Tests:**
  - Vitest: dates, set length, needs music, the month grid;
  - e2e:
    - an event with its folder;
    - an assigned playlist and a version made for it, trimmed;
    - the flyer (downscaled); kept over a reload;
    - deleting with its folder; the banner hidden until tomorrow;
  - GLUE Home (tauri-mock): one notification for the event that needs music, not for the others;
    once a day; Check now; off.
