---
status: proposed
date: 2026-09-25
---
# 0036. Optional accounts and a small cloud service for devices and signaling

## Context
The user wants a cloud tier (2026-09-25):
- GLUE Home on the main computer, reachable from the website anywhere;
- Google / Apple sign-in and a database of users;
- accounts optional for local use but required for GLUE Home;
- devices shown in the library;
- as peer-to-peer as possible.

[ADR 0002](0002-static-client-only-app.md) says client-only: no server, no accounts. This keeps its
core (audio and library data never go to us) but adds a server for identity and connections.

## Decision (proposed)
- **Accounts are optional.** With no account the site is exactly as today. Signing in adds
  devices and GLUE Home.
- **Hosted service: Supabase**, for three things:
  - **Auth** with Google and Apple (PKCE in the SPA; the site stays static on GitHub Pages);
  - **Postgres**, with row-level security per user;
  - **Realtime** broadcast / presence channels for WebRTC signaling and "online" status.
- **Stored in the cloud, and nothing else:**
  - `users`, `identities` (via Supabase Auth);
  - `devices`: id, user, kind (home / browser), name, public key, created, last seen, revoked;
  - `pairing_codes`: hash, user, expiry, used;
  - `plans` / relay usage, for a paid tier.
  - No track lists, file names, tags or audio.
- **Pairing GLUE Home:**
  - the signed-in site makes a single-use code (10 min, rate-limited, stored hashed);
  - GLUE Home enters it and gets its own device credential;
  - "sign in with the same account" in GLUE Home is Google-only (Apple rejects loopback
    redirects; see [research](../research/remote-access.md)).
- **Revoking** a device in the website ends its sessions and removes its key.
- **Superseding:** once accepted, this supersedes ADR 0002's "no server, no accounts". ADR 0002's
  "audio never leaves the user's machines except to their own devices" stays.

## Alternatives considered
- **Firebase (Auth + RTDB):** similar, more lock-in, Google-first.
- **Cloudflare Workers + Durable Objects + D1:** cheapest at scale and great for WebSocket
  signaling, but sign-in (Google, Apple, sessions) is ours to build and maintain.
- **No accounts; a manual pairing QR per device:** P2P-pure, but no Google / Apple login, no
  device list across browsers, no recovery.

## Consequences
- **Running costs:** Supabase free pauses after a week without activity, so real users need Pro
  ($25/month). Apple costs $99/year, and its secret must be rotated every 6 months (set a reminder,
  or automate it).
- **A privacy policy** and account deletion (delete user → devices → codes) become necessary.
- A custom domain for GLUE is recommended (branding, Apple, cookies).
