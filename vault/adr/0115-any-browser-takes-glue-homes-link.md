---
status: accepted
date: 2026-09-30
---
# 0115. Any browser on GLUE Home's computer takes its link from GLUE Home itself

Amends [ADR 0048](0048-local-link-to-glue-home.md) (how a page gets the local link's token) and
[ADR 0091](0091-computers-and-sessions.md) (a second browser on the computer).

## Context
The user, 2026-09-30, with GLUE Home running and Chrome using it:
- In Edge, signing in showed the library in Edge's own storage, not the MCO folder.
- Every music folder said "Find folder", and every song "GLUE needs your permission to read 'Music Collection'
  again".
- "If I'm running [GLUE Home] and I have a session logged on, doesn't matter what browser I use, I should always
  be presented with the same session… the browser is meant to act as the UI only."

A page learnt the local link's token only over the account's channel: WebRTC through GLUE Cloud's signaling,
after signing in, from a GLUE Home online at that moment. The token was then kept in that browser. A browser
that never got it, like Edge, had no link. Signed in, it opened the account's collections in its own storage, with
music folders it couldn't read.

## Decision
- **GLUE Home hands the link to a GLUE page on its computer:** `GET /connect` on 127.0.0.1 answers
  `{ home, port, token }`.
  - It answers only the live website's origin (`https://joaopmanso.github.io`), which a web page can't fake.
  - Localhost origins get it only from a debug build, so a test run or another project's dev server never gets
    the token of the GLUE Home that holds the real library.
  - A program on the computer could fake the origin, but it can read the token from GLUE Home's settings file
    anyway.
- **When a page asks for it:**
  - at load, when this browser met a GLUE Home before (the current token, even after a restart on another
    port);
  - once signed in, when the account has a GLUE Home, before a device with no library of its own opens one in
    its storage;
  - never otherwise: asking 127.0.0.1 makes the browser ask a visitor about "apps on this device", and a phone
    never asks.
- **With the link, the page is GLUE Home's screen** (ADR 0104): GLUE Home's GLUE folder opens, and its music
  folders are GLUE Home's (no browser permission). A page on the start page, or on a library in its own storage,
  switches to it when the link appears.

## Consequences
- Chrome, Edge or any other browser on the desktop shows the same library, with or without signing in once it
  has met GLUE Home.
- Needs GLUE Home 0.37. With an older one, a browser keeps the token it learnt before, as until now.
- The library Edge had made in its own storage stays there, unused.
