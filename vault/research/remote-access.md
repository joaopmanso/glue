---
updated: 2026-09-25
---
# Remote access, accounts and P2P: facts for GLUE Cloud

Checked on the web on 2026-09-25 for [GLUE Cloud](../features/glue-cloud.md). Claims not confirmed
are marked **[UNVERIFIED]**.

## Accounts: Supabase and alternatives
- **Supabase Auth with Apple on the web:**
  - needs an Apple Developer Program membership (US$99/year, https://developer.apple.com/programs/enroll/)
    and a Services ID;
  - the website URLs are Supabase's domain, with the callback at
    `https://<project>.supabase.co/auth/v1/callback`;
  - the web OAuth flow needs a new client secret every **6 months**, generated from the .p8 key.
    Missing it breaks sign-in with `invalid_client`, silently.
  - Sources: https://supabase.com/docs/guides/auth/social-login/auth-apple ·
    https://dev.to/oskarmakarov/sign-in-with-apple-broke-with-invalidclient-after-6-months-heres-why-and-how-to-never-deal-2mhk
  - Whether Apple still requires a `.well-known` domain file: **[UNVERIFIED]** (forums say no; the
    docs are unclear).
- **Redirect URLs:** an allowlist with glob wildcards and no domain restriction, so github.io
  works (https://supabase.com/docs/guides/auth/redirect-urls). PKCE is recommended for SPAs.
- **Realtime:** Broadcast and Presence are ephemeral pub/sub, authorised with row-level security,
  and used by others for WebRTC signaling
  (https://supabase.com/docs/guides/realtime/broadcast, https://github.com/orgs/supabase/discussions/28473).
- **Free limits:** 200 concurrent realtime connections, 100 messages/s, 50k MAU; **projects pause
  after 1 week of inactivity** (https://supabase.com/docs/guides/realtime/limits, https://supabase.com/pricing).
- **Pro:** $25/month, 500 connections and 500 messages/s, no pausing (price from third parties;
  Pro MAU of 100k **[UNVERIFIED]**).
- **Firebase Auth:** free to 50k MAU, then $0.0055/MAU; the Spark plan caps most providers at 3k
  daily users (https://firebase.google.com/docs/auth/limits).
- **Cloudflare Durable Objects** (WebSocket signaling):
  - free: 100k requests/day;
  - paid: the $5/month plan includes 1M requests, then $0.15 per million;
  - incoming WebSocket messages bill at 20:1, and hibernating sockets aren't billed for duration
    (https://developers.cloudflare.com/durable-objects/platform/pricing).
  - Auth would be ours to build. D1 pricing **[UNVERIFIED]**.

## WebRTC and relays
- **Share of connections that need TURN:** about 20% is the usual estimate. Other estimates run from
  0–50% depending on users, and 60–85% on corporate networks
  (https://www.100ms.live/blog/webrtc-turn-server,
  https://medium.com/l7mp-technologies/use-of-turn-in-webrtc-revisited-it-may-be-more-useful-than-you-thought-856059fd27a3).
  Industry figures, not measurements.
- **TURN prices:**
  - Cloudflare: **$0.05/GB** after 1,000 GB free each month; STUN is free. It may drop above about
    50–100 Mbps per client, and credentials last at most 48 h
    (https://developers.cloudflare.com/realtime/turn/faq/).
  - Twilio: $0.40–0.80/GB (https://www.twilio.com/en-us/stun-turn/pricing).
  - Metered: 500 MB/month free, then $99/month for 150 GB (https://www.metered.ca/stun-turn).
- **Throughput:**
  - A ~1.4 Mbps CD-quality stream is easy.
  - Bulk transfer tends to reach tens of Mbps and falls as round-trip time grows. It needs ~64 KB
    chunks and backpressure via `bufferedAmountLowThreshold`
    (https://dev.to/anirban00537/webrtc-data-channels-for-large-file-transfer-what-i-learned-the-hard-way-2ama).
    **[UNVERIFIED]** for our case.

## GLUE Home (Node.js) building blocks
- **node-datachannel** (libdatachannel bindings): prebuilt binaries for Windows, macOS and Linux,
  Node ≥ 18.20. A September 2026 release shipped stale binaries (issue #445), so pin versions
  (https://github.com/murat-dogan/node-datachannel).
- **werift:** pure TypeScript and maintained (https://github.com/shinyoshiaki/werift-webrtc).
  **Pion** (Go) v4 is current.
- **Node single executable apps** are still "active development":
  - `--build-sea` exists since Node 25.5;
  - native addons must be written out and loaded with `process.dlopen`, which is awkward for
    node-datachannel; werift avoids that
    (https://nodejs.org/api/single-executable-applications.html).

## Streaming to `<audio>` in the browser
- **Service workers can't create an `RTCPeerConnection`**; only pages can
  (https://issues.chromium.org/issues/40251342).
- **Moving a data channel to a worker:**
  - Safari can transfer one to dedicated and service workers;
  - Chromium announced dedicated workers only (M130), and whether it shipped is **[UNVERIFIED]**
    (https://groups.google.com/a/chromium.org/g/blink-dev/c/64yIg0Ya3No).
  - So the page holds the connection and relays bytes to the service worker over a `MessageChannel`.
- **206 responses built by a service worker:** Safari requires a 206 with `Content-Range`; Chrome
  and Edge 87+ handle it
  (https://philna.sh/blog/2018/10/23/service-workers-beware-safaris-range-request/).
- **The whole chain** (data channel → page → service worker → 206 → `<audio>` seeking):
  **[UNVERIFIED]**, with no end-to-end source found. Risks: the service worker being stopped
  mid-stream, and the page having to stay open. **Spike this first.**

## Signing in from a desktop app
- **Google:**
  - the loopback redirect (`http://127.0.0.1:port`) is still supported for desktop clients
    (https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration);
  - the device flow supports `openid email profile`
    (https://developers.google.com/identity/protocols/oauth2/limited-input-device).
- **Apple:**
  - redirect URIs must be real domains; localhost and IPs are rejected
    (https://developer.apple.com/forums/thread/696055);
  - no device flow found (**[UNVERIFIED]**, likely none).
- **Therefore:** GLUE Home pairs with a code made on the signed-in website, which works for Apple
  and Google accounts alike.
