---
status: in-progress
milestone: M7
updated: 2026-09-28
adrs: [0057, 0076, 0077]
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
- **A compact phone UI:**
  - a bottom bar: Library, Playlists, Search, Offline;
  - two-line rows;
  - a sheet per track: play, add to playlist, tags, rating, note, keep offline;
  - a mini player with lock-screen metadata.
- **iOS limits:** audio, WebRTC and Web Audio stop when the screen locks or the web app is in the
  background. Previews play in the foreground only; lock-screen playback waits for the store app.

## How it works
- Built on phases 1–3 of [performance](performance.md): the shared row pipeline, the GPU drawing,
  and byte-range streaming.
- A typed platform interface (ADR 0007) with `web`, `memory` and later `native` implementations.

## Acceptance
- [ ] On a phone, over Wi-Fi and mobile data: open the desktop collection, edit, play a preview, keep a playlist offline and play it in airplane mode.

## Tests
- A Playwright phone project (Chromium, plus WebKit iPhone for the layout); offline runs.

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
- Next: the phone layout.
