---
status: accepted
date: 2026-09-28
---
# 0084. Playback first on the link to GLUE Home; failures say why

Refines [ADR 0047](0047-stream-channel-requests-at-once.md) (requests at once) and
[ADR 0076](0076-songs-stream-by-range.md) (streaming by range). Amends [ADR 0081](0081-turn-relay.md)'s
error message.

## Context
The user's tests (2026-09-28, GLUE Home 0.15, the TURN relay on):
- **On Wi-Fi, the first song took 15–30 s,** and the next ones were almost instant.
- **On 5G,** streaming failed with "Couldn't connect to Desktop, even through the relay".
  - The relay itself works: with the account's key, two peers in headless Edge connected through
    Cloudflare in under a second, relay-only, over UDP, TCP and TLS.
  - Relay-only against a STUN-only peer (a phone on mobile data against a home computer) also
    connected.
- **On the phone, the music stopped when a song's page opened.**

Reading the code (no device logs yet):
- **The first 2-byte stream probe** had 8 s to answer. On a timeout, streaming was switched off
  for that GLUE Home for the rest of the visit. Any other failure silently fell back to downloading
  the whole song. Both fit "a slow first song, fast after".
- **Playback waited behind other requests.** Page-load cover and waveform requests could fill all
  six places on the link.
- **Everything shared one ordered data channel,** so a song page's full analysis (megabytes) went
  out ahead of the music's next bytes. That is a likely cause of the stop on the phone.
- **GLUE Home looked a song up once per request.** A probe and its first parts could each start
  the same drive search (up to 25 s).
- **GLUE Home closed a connection** as soon as it went "disconnected", which is often brief on a
  phone.
- **After a hard reload,** the streaming service worker didn't control the page, so every song came
  whole.
- **A song ending on another song's page** didn't go on to the next one.
- **On a touch screen, a finger scrolling over a song's spectrogram** seeked whatever was playing,
  using the page song's time.

## Decision
- **Playback first.**
  - Requests for what's playing (`range`, `get`) take their place ahead of background requests in
    the queue.
  - Background requests (covers, waveforms, analyses, `have`) use at most four of the six places.
- **A second data channel for playback** on the same connection: `HomeChannel.play`, same label
  `stream`, served by the same code in GLUE Home. The music's bytes never queue behind a big
  answer.
- **No silent whole-file fallback.**
  - The first probe waits up to 25 s.
  - A connection that timed out or closed is made again once.
  - After that, the player shows the error. Streaming isn't switched off for the visit.
- **The connection error says what each side offered:** "(this device: relay; Desktop: local,
  public; checking)". A report then shows whether GLUE Home sent a relay address and how far ICE
  got.
- **GLUE Home:**
  - one lookup per song at a time, shared by the requests that need it;
  - a "disconnected" connection is closed only if it stays that way for 15 s.
- **Service worker:** a page it doesn't control asks it to claim the page.
- **Player:**
  - auto-advance runs everywhere except on the page of the song that ended;
  - the spectrogram seeks only the page's own song, and on a touch screen only on a tap.

## Alternatives considered
- **Separate connections for playback and background:** a second ICE negotiation and a second
  relay allocation, for what a second SCTP stream gives for free.
- **Unordered channels:** answers would need reassembly by offset, and ordering still matters
  within one answer.
- **Keep the whole-file fallback:** it hides a broken connection behind a long download, and it
  fails anyway when the connection is the problem.

## Consequences
- The 5G failure isn't fixed blind: the next report carries each side's candidates, which shows
  where it fails.
- A GLUE Home older than 0.14 (no `range`) no longer gets whole-file playback of streamable formats.
  Every installed copy updates itself.
- GLUE Home 0.16 carries its side (the shared lookup and the 15 s grace).
