---
status: proposed
date: 2026-09-25
---
# 0037. WebRTC data channels between the website and GLUE Home

## Context
The website on another computer must list GLUE Home's library, stream tracks with seeking,
download files and upload new ones. It should stay peer-to-peer where possible, work behind home
routers, and be encrypted. The site is HTTPS on github.io, so a plain HTTP server at home can't be
called (mixed content) without certificates and port forwarding.

## Decision (proposed)
- **WebRTC data channels** between the page and GLUE Home:
  - signaling over the user's realtime channel ([ADR 0036](0036-optional-accounts-and-cloud-signaling.md));
  - STUN for direct connections (LAN or internet);
  - **Cloudflare TURN** as the relay fallback ($0.05/GB after 1 TB/month free; ~20% of connections
    are commonly estimated to need it). The relay is where a paid quota can live.
- **Trust:** each device has a keypair; the public key is in the device list. Offers and answers
  are signed, and the DTLS fingerprint is checked against the signature, so the signaling service
  can't man-in-the-middle.
- **Protocol:** small JSON requests / binary replies, in 64 KB chunks with backpressure:
  - `hello`, `collections`, `snapshot` (the library, compressed);
  - `file.range`, `thumbs`, `fingerprints`;
  - `upload.begin` / `chunk` / `end` (resumable, SHA-256 checked).
- **Playback:** the page holds the connection and relays bytes to a service worker, which answers
  `…/remote/<device>/<track>` with 206 Range responses, so `<audio>` plays and seeks natively.
  This chain is unverified end to end, so **phase 2 starts with a spike**. If it fails, the fallback
  is fetching the file into a Blob before playing: slower start, same seeking.
- **In the app** this is a platform provider (`src/platform/remote.ts`, [ADR 0007](0007-web-first-platform-layer.md)).

## Alternatives considered
- **Tunnels** (Cloudflare Tunnel, Tailscale Funnel, ngrok): simple HTTPS, but not P2P, all audio
  goes through a third party, and there's per-user setup.
- **Port forwarding + certificates** (per-user subdomain, DNS-01): fragile on home routers and
  CGNAT.
- **WebTransport / WebSockets to a relay we run:** we'd carry all audio and pay for bandwidth.

## Consequences
- **The page must stay open** while it streams or uploads: no background uploads when the tab is
  closed.
- **Speed:** relayed transfers are slower (tens of Mbps) and cost money; a 10 GB upload through
  TURN is about $0.50.
