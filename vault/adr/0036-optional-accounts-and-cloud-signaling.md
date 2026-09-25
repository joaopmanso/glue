---
status: proposed
date: 2026-09-25
---
# 0036. Optional accounts and a small free cloud service (Cloudflare) for devices and signaling

## Context
The user wants a cloud tier (2026-09-25):
- GLUE Home on the main computer, reachable from the website anywhere;
- Google / Apple sign-in and a SQL database of users;
- accounts optional for local use but required for GLUE Home;
- devices shown in the library;
- as peer-to-peer as possible;
- and, asked about the hosted database: "can't we run a sql db for free?"

[ADR 0002](0002-static-client-only-app.md) says client-only: no server, no accounts. This keeps its
core (audio and library data never go to us) but adds a server for identity and connections.

## Decision (proposed)
- **Accounts are optional.** With no account the site is exactly as today. Signing in adds
  devices and GLUE Home.
- **Cloudflare free tier**, one vendor at $0 at our scale, with no pausing
  ([research](../research/remote-access.md)):
  - **Worker** (API): 100k requests/day, 10 ms CPU per request;
  - **D1**, a SQL database (SQLite): 5 GB, 5M rows read and 100k written per day;
  - **Durable Object** per user, holding the WebSocket signaling and presence (SQLite-backed, on
    the free plan; the hibernation API, so idle sockets cost nothing);
  - **TURN**: 1 TB/month free, then $0.05/GB.
- **Sign-in:**
  - The page signs in with Google Identity Services and gets an ID token. The Worker checks it
    against Google's published keys (WebCrypto) and issues GLUE's own short session token plus a
    refresh token.
  - Apple follows the same pattern later, once there's an Apple Developer membership. Google
    comes first (user, 2026-09-25).
- **Tables (D1):**
  - `users`;
  - `identities` (provider, subject, email);
  - `devices`: id, user, kind (home / browser), name, public key, created, last seen, revoked;
  - `pairing_codes`: hash, user, expiry, used;
  - `sessions` (refresh tokens, hashed);
  - later `plans` / relay usage.
  - No track lists, file names, tags or audio.
- **Pairing GLUE Home:**
  - the signed-in site makes a single-use code (10 min, rate-limited, stored hashed);
  - GLUE Home enters it and gets its own device credential;
  - "sign in with the same account" in GLUE Home is Google-only (Apple rejects loopback redirects).
- **Revoking** a device in the website ends its sessions and removes its key.
- **Superseding:** once accepted, this supersedes ADR 0002's "no server, no accounts". ADR 0002's
  "audio never leaves the user's machines except to their own devices" stays.

## Alternatives considered
- **Supabase:** auth with Google / Apple and realtime out of the box. The free projects pause
  after a week idle, though, so real use means Pro at $25/month.
- **Firebase:** similar; Google-first and more lock-in.
- **Self-hosted Postgres:** free only while it runs on the user's own machine, which defeats a
  service reachable from anywhere.
- **No accounts, manual QR pairing per device:** no Google / Apple login, no device list across
  browsers, no recovery.

## Consequences
- **We maintain sign-in code:** token checks, sessions, refresh, revocation. It's small, but it's
  security code; it gets tests.
- **Limits and costs:** we'd hit the free limits only at thousands of daily users; then Workers
  Paid is $5/month.
- **Account deletion** and a privacy policy become necessary.
- Deploying the Worker needs a Cloudflare account (the user's), an API token in CI, and Google
  OAuth client IDs for the site's origins.
