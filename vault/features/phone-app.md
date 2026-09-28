---
status: in-progress
milestone: M7
updated: 2026-09-28
adrs: [0057, 0076, 0077, 0078]
---
# Phone app (remote + offline)

## What it does
GLUE on a phone, in its browser for now:
- manage the desktop collection on the go: playlists, tags, ratings, notes, synced through GLUE Cloud;
- preview songs, streamed from the computer's GLUE Home;
- download chosen playlists to play offline.
There's no analysis on the phone. Store apps come later: Tauri 2 mobile, with Capacitor as the
fallback.

## Behaviour (planned, [ADR 0057](../adr/0057-keep-the-stack-fix-the-architecture.md) phase 4)
- **The cloud view becomes playable:**
  - each track knows which computer has it;
  - songs stream from GLUE Home by byte range, over WebRTC (ADR 0037), through a service worker;
  - on mobile data, a TURN relay.
- **Offline:**
  - an offline app shell (superseding ADR 0017), installable to the Home Screen;
  - the last cloud view kept on the phone;
  - an outbox, so edits made offline reach GLUE Cloud later;
  - playlists kept on the phone in its private storage.
- **A compact phone UI** (built 2026-09-28, see below; still to come: "keep offline" in the song's
  sheet, and lock-screen metadata for the mini player).
- **iOS limits:** audio, WebRTC and Web Audio stop when the screen locks or the web app is in the
  background. Previews play in the foreground only; lock-screen playback waits for the store app.

## How it works
- Built on phases 1–3 of [performance](performance.md): the shared row pipeline, the GPU drawing,
  and byte-range streaming.
- A typed platform interface (ADR 0007) with `web`, `memory` and later `native` implementations.

## Acceptance
- [ ] On a phone, over Wi-Fi and mobile data: open the desktop collection, edit, play a preview, keep a playlist offline and play it in airplane mode.

## Tests
- `e2e/phone-ui.spec.ts`: the phone layout at 390 × 844 with touch (tabs, rows, the player, sheets,
  playlists, browse, search, a song's page in the frame, no sideways scroll).
- `e2e/phone.spec.ts`: a signed-in phone opening the account's library, streaming, rating, sending.
- `e2e/narrow.spec.ts`: the phone layout draws only the rows on screen at 600 and 420 px.
- Still to come: WebKit (iPhone) for the layout; offline runs.

## Streaming done (2026-09-28)
- Byte-range streaming through a service worker is built ([ADR 0076](../adr/0076-songs-stream-by-range.md)); checked
  in Edge. Safari on an iPhone is the open question below.

## Limits & open questions
- **[UNVERIFIED]:**
  - Safari passing media byte ranges through a service worker;
  - data channels staying alive while the screen is locked.
  A spike on a real iPhone comes first.

## The library on any device (2026-09-28, [ADR 0077](../adr/0077-library-on-any-device.md))
- **A browser without a library of its own, signed in:** the account's library opens by itself from
  GLUE Cloud (the last one opened there, else the biggest merged collection, else the biggest
  collection). Nothing is made on the device.
- **Its songs stream** from a computer that has them ([ADR 0076](../adr/0076-songs-stream-by-range.md)).
- **Edits** go to the owning computers.
- **Devices › Send songs…** sends songs from the phone to a GLUE Home.
- The phone layout: next section.

## The phone layout (2026-09-28, [ADR 0078](../adr/0078-phone-layout.md))
- **When:** below 760 px wide, the library is a phone app with its own frame. Above that, nothing
  changes.
- **Tabs at the bottom:**
  - **Library:** All tracks, Recently added, TO BE SORTED, Needs attention, tags, music folders, and
    adding music (a folder, or songs).
  - **Browse:** artists, albums, genres, labels, years (the same lists as the desktop's Browse).
  - **Playlists:** the tree, a level at a time; a new playlist, or one built by the playlist builder;
    each list's ⋯.
  - **Search.**
  - **More:** the calendar, stats, analyze a file, light or dark, closing a cloud library or switching
    profile, the account and devices.
  - Each tab remembers where it was. Tapping the open tab goes back to its first screen.
- **Songs:**
  - Two-line rows: the cover, the title, the artist, BPM, key and length.
  - Play, Shuffle and Sort above the list.
  - A tap plays the song, and the list plays on after it.
  - ⋯ or a long press opens its menu.
- **Menus:** every menu is a sheet from the bottom, with the same entries as the desktop's right-click
  menus. The tag and genre pickers are sheets too. The note editor sits across the top.
- **The player:**
  - a mini player above the tabs;
  - a tap opens the full player: the cover, seek, shuffle, repeat, and the queue (Next up, Next from…).
- **Pages in the same frame:** a song's page (Details and Prepare), the calendar, an event. A back button
  replaces the desktop header; the tabs and the player stay. Nothing is wider than the screen.
- **Code:**
  - `lib/phone.svelte.ts` (the tabs, stacks and sheet);
  - `ui/phone/`: `PhoneApp`, `PhoneSongs`, `PhonePlayer`, `ActionSheet`.
