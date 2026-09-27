---
status: shipped
milestone: M3
updated: 2026-09-27
adrs: [0074, 0049, 0051]
---
# Events

## What it does
A calendar of gigs and sessions. Each event has its details (when, the set, where, who's playing, a
flyer, a link, notes) and its music: playlists made for it in its own folder, and playlists assigned
to it. When an event is coming and has no music yet, GLUE says so, and GLUE Home sends a desktop
reminder.

## Behaviour
- **The Calendar tab** (`#/events`)
  - A month, Monday first (‹ › and Today; the month is remembered).
  - Events show on their day: planned, played (green), cancelled (struck through), needing music
    (orange).
  - "Coming up" (with "in N days" and the song count) and "Been".
  - "+ New event", or a day's number, opens the editor for that day.
- **The editor**
  - name, day, status; doors and end; my set from–to;
  - venue, address, city;
  - lineup: one per line; the profile's name, or "(me)", marks the user;
  - link, notes, reminder days (7; 0 for none).
- **An event's page** (`#/events/<id>`)
  - "In 3 days" / "Today" / "Been", the name, when and where; Edit, Stats…, Delete….
  - **Music:**
    - "Make a version of a playlist…" copies one into the event's folder (Playlists › Events ›
      '2026-10-03 · Lux'), to trim and reorder there;
    - "Assign a playlist…" links one where it is;
    - "New empty playlist"; "Open its folder".
    - Each playlist shows its songs and running time against the set (1:30:00), with a bar, Play,
      and Unassign for assigned ones.
  - **The flyer:** add, change, remove (kept at most 1400 px).
  - **Details:** the set, where, lineup (the user's name highlighted), link, reminder.
- **In Playlists:** the Events folder and each event's folder are ordinary folders. Their menu has
  "Open the event" (and "Open the calendar").
- **Needs music:** planned, within its reminder days, no songs in its playlists.
  - A banner above the library and the calendar (× hides it until tomorrow).
  - The Calendar tab's count.
  - A line on the event's page.
  - GLUE Home's notification, once a day per event.
- **Deleting:** asks whether its folder and the versions in it go too; assigned playlists always
  stay.

## How it works
- **Rules:** `core/library/events.ts` (types, `parseLocal`, `daysUntil`, `isPast`, `setSeconds`,
  `needsMusic`, `folderName`, `monthGrid`).
- **The store:** `store/collection` `events` (`events.json`), `putEvent`, `deleteEvent`;
  `List.event`.
- **State:** `lib/events.svelte.ts` (create, update, remove, assign, `makeVersion`, `listsOf`,
  `tracksOf`, `needing`, flyers).
- **UI:** `ui/events/CalendarView`, `EventPage`, `EventEditor`, `NeedsMusic`; routes in
  `lib/route`; the tab in `App.svelte`.
- **GLUE Home:**
  - `home/ui/reminders.ts`, run by `service.ts`: 90 s after starting, hourly, and on "Check now";
  - `bridge.notify` (`@tauri-apps/plugin-notification`), `bridge.glueList` (Rust `glue_list`).
  - The settings: This computer's library › Remind me…, Check now.

## Acceptance
- [x] Create an event; its folder appears; assign a playlist; make a version and trim it; the flyer;
  kept over a reload; delete it with its folder.
- [x] The reminder in GLUE; hidden until tomorrow; GLUE Home's notification once a day.
- [ ] The user gets a real Windows notification from GLUE Home 0.13.

## Tests
- Vitest: `tests/events.test.ts`.
- e2e:
  - `e2e/events.spec.ts`;
  - `e2e/home.spec.ts` "GLUE Home reminds…" (tauri-mock records the notifications).

## Limits & open questions
- Not in cloud sync yet.
- Clicking a notification doesn't open the event (Tauri's desktop notifications have no click
  handler on Windows).
- The old plan's set checks (BPM and key flow, clashes) could come to the event page.
- Exports of an event's folder go with the playlists exports ([exports](exports.md)).
