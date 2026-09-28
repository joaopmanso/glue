---
status: accepted
date: 2026-09-28
---
# 0081. Relay connections that can't be direct through Cloudflare's TURN, with the owner's key

## Context
The user (2026-09-28): streaming "only works on local wifi and not internet which is wrong, it should
be available outside my wifi without me needing to set up any sort of port forwarding".
- **What devices had:** WebRTC with public STUN servers only (`core/transfer.ts`). On the same
  network, devices connect directly.
- **A phone on mobile data and a computer at home** are both behind routers. The carrier's router
  usually maps ports per destination, so STUN can't find a way through and the connection fails.
- **ADR 0037** already chose Cloudflare's TURN as the fallback relay. It was never built.
- **Cloudflare's pricing** (checked 2026-09-28, developers.cloudflare.com/realtime/pricing): the first
  1,000 GB each month are free (shared with its SFU), then $0.05 per GB.
- **Credentials:** a TURN key makes short-lived credentials (`POST
  rtc.live.cloudflare.com/v1/turn/keys/<id>/credentials/generate-ice-servers`, with a TTL). Browsers
  block port 53, and Cloudflare advises leaving those URLs out.

## Decision
- **GLUE Cloud's Worker** has `GET /v1/turn` for signed-in devices. It turns the account owner's TURN
  key (Worker secrets `TURN_KEY_ID`, `TURN_KEY_API_TOKEN`, from the repository's secrets through the
  cloud workflow) into credentials that last a day, without the port-53 URLs.
  - Without a key it returns none.
  - If Cloudflare refuses, it returns none with the reason. Devices then connect directly or not at
    all, as before.
- **The website and GLUE Home** ask for them once a day (`lib/ice.ts`, `home/ui/ice.ts`) and add them
  to the STUN servers.
  - WebRTC tries direct paths first and uses the relay only when they fail.
  - GLUE Home keeps a caller's early candidates while it asks, so none are lost.
- **The relay passes DTLS-encrypted bytes and can't read them.** Audio still goes only between the
  user's own devices (ADR 0002, 0036).

## Alternatives considered
- **Port forwarding or UPnP on the user's router:** the user ruled it out. It also fails behind a
  carrier's router.
- **Relaying through our Worker or a Durable Object:** GLUE would carry all the audio, and pay for it.
  WebSockets are also a poor fit for media.
- **Our own TURN server (coturn):** a server to run and patch, for what Cloudflare's service does.

## Consequences
- **Streaming and sending songs work away from home,** once the owner adds the key.
- **Relayed traffic costs money past 1,000 GB a month.** Any signed-in account can use the relay, so
  a per-account quota (ADR 0036's "relay quota") is needed before GLUE Cloud opens to many users.
- **Relayed transfers are slower** than direct ones (tens of Mbps).
