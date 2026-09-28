---
status: accepted
date: 2026-09-28
---
# 0091. A device is a computer; signing in only to browse is a session

Refines [ADR 0036](0036-optional-accounts-and-cloud-signaling.md) (devices),
[ADR 0045](0045-glue-home-companion.md) (GLUE Home as a browser's companion) and
[ADR 0077](0077-library-on-any-device.md) (the library on any device). This is phase 1 of the
[plan for one shared collection](../product/plan-shared-collection.md).

## Context
The user (2026-09-28):
- two browsers on one computer made two rows in Devices;
- a phone that signs in to listen or make a playlist shouldn't become a device ("I don't need any
  device details about that session on my phone on my Devices panel"), though sessions are
  interesting in the admin panel;
- an account can have several GLUE Homes, on several computers.

What caused it:
- A device was a browser profile: a random id kept in that browser's storage, made at every first
  sign-in (`browserSession`).
- A phone that opened the library once had also made an empty collection, which joined the merged
  group ("Safari on iOS, 0 tracks").

## Decision
- **Sessions:**
  - A new sign-in is a session (`devices.role = 'browse'`). It becomes a device when it holds music:
    it uploads a collection with songs (`manifest`), or it pairs a GLUE Home (`claim`).
  - `/v1/me` returns `devices` and `sessions` apart. Devices lists only devices.
  - Migration 0005 marks the browsers that never uploaded songs and serve no GLUE Home as sessions,
    and takes their empty collections out of merged groups.
  - The admin panel lists every sign-in, sessions and devices (`/v1/admin/sessions`).
- **A computer is one device:**
  - A signed-in browser finds a GLUE Home on its computer: `/hello` on 127.0.0.1:47400–47409, even
    with no saved link. If it's one of the account's GLUE Homes, the browser gets the local link's
    token over the channel (`local`) and calls the local link's `POST /attach`.
  - Only a page on that computer can reach it; that is the proof. GLUE Home passes it to its service
    page (a Tauri event), which calls `POST /v1/computer/attach` with GLUE Home's own credential.
  - GLUE Cloud then moves the browser's sign-ins onto the computer's device (the GLUE Home's
    companion; the first browser to attach becomes it) and removes the browser's own record. The
    browser refreshes as that device and reloads.
  - From then on the two browsers are one device everywhere: sync, edits, presence, Devices.
  - GLUE Cloud refuses when the browser has a library of its own that the computer's device doesn't
    have, because joining would drop it from the cloud. It stays its own device.
- **Without GLUE Home:** the menu of another browser's row in Devices offers "This browser is on the
  same computer" (`POST /v1/devices/<id>/same-computer`), under the same rule.
- **The signaling room keeps one connection per device and tab** (`conn`, kept in `sessionStorage`),
  so the browsers of one computer don't knock each other out. Without `conn`, it behaves as before.
- **Several GLUE Homes:** each pairs from its own computer's browser and stays. A new pairing only
  replaces an older companion of the same browser, as before.

## Consequences
- Devices shows computers, whichever browser opened GLUE. Phones that only browse aren't listed.
- A browser joins only while its computer's GLUE Home is online and signed in to the same account.
- The browser that joins gives up its own device id; anything it uploaded under it goes (only
  allowed when the computer's device has the same profiles).
- Phase 2 (the shared collection) builds on this: a computer, not a browser, holds `copies` of songs.
