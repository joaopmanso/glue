---
status: accepted
date: 2026-10-01
---
# 0133. A session per device with GLUE Home: opened at sign-in, kept alive, limited, and told what happens

## Context
The user, 2026-10-01: "it seems we are doing a lot of individual calls between remote and desktop. It would be
better if we use some sort of session. I login on laptop, it connects directly to the desktop app and starts a
private secure session. from that moment on we can just have realtime 'conversation' between the two. we can have
a configurable max sessions in the app."

What there was:
- **The transport was already direct and encrypted:** WebRTC data channels, DTLS end to end, signaled through the
  account's room (ADR 0037, 0044).
- **`remoteFiles` kept one channel per GLUE Home** for requests (ADR 0046, 0047).
- **It wasn't a session:**
  - it opened only at the first request, and nothing kept it alive;
  - two slow answers closed it, and the next request opened another;
  - sending songs opened its own connection every time.
- **GLUE Home kept a connection per handshake.** It didn't know who was connected, had no limit (the leak of ADR
  0132), and showed nothing.
- **Devices asked again and again:**
  - TO BE SORTED every 30 s;
  - a waveform "not made yet" every 8 s and more;
  - a song page whose analysis was being made, every 8 s.

The user's choices: a GLUE Home that's full refuses the new device; at most 5 by default; both parts at once.

## Decision
- **A session per device's tab with each of the account's other GLUE Homes.** The website opens it when signed in
  with a collection open, without waiting for a first request (`remoteFiles.tend`, every 15 s).
  - Its offer says which tab (`tab`, the tab's id) and who (`name`).
  - Everything goes through it:
    - requests on the 'stream' channel;
    - what's playing on its second channel (ADR 0084);
    - songs sent on a 'files' channel opened on the same connection (no new handshake).
  - **Heartbeat:** a `ping` every 15 s. Two unanswered and the session closes; the next 15 s opens it again (paced
    after a failure, ADR 0132).
- **GLUE Home 0.41 keeps a session table** (`home/ui/sessions.ts` decides, `service.ts` keeps):
  - one per device's tab: the same tab connecting again replaces its own, even when full;
  - at most the settings' number ("Most at once", 5 unless set, 1 to 50);
  - a new one when full is refused with why ("GLUE Home on Desktop is full: 5 devices connected…"), and noted in
    its activity;
  - its window lists the devices connected (name, since, requests), each with Disconnect. A disconnected tab is
    refused for an hour, since it would only reconnect.
- **GLUE Home says it's a session first** (`{t:'session'}` on the channel). Only then does the website ping, send
  songs on it, and wait to be told. An older GLUE Home is used as before.
- **GLUE Home tells every session what happened** (`{t:'event'}`):
  - `made`: songs it analysed, gathered for half a second. The rows' spectrograms and waveforms come at once, a song
    page waiting for its analysis shows it at once, and "none there yet" isn't asked again on a timer;
  - `incoming`: TO BE SORTED changed (a song arrived and was analysed, or one was moved). The devices ask then, and
    otherwise only every 5 minutes, instead of every 30 s.

## Alternatives considered
- **One session per device, tabs sharing it** (a SharedWorker or BroadcastChannel holding the connection): fewer
  sessions, but a hard dependency between tabs and more to go wrong. Tabs are counted instead; the limit is
  changeable.
- **Dropping the longest-idle session when full:** the user chose refusing, so nobody connected is disturbed.
- **A WebSocket through GLUE Cloud:** the music and the library would pass through a server, against ADR 0002.

## Consequences
- A device holds one connection per GLUE Home and tab for as long as GLUE is open on it. GLUE Home holds at most
  "Most at once".
- What the devices ask for again is what they'd need without events: a GLUE Home before 0.41, or one whose event
  didn't come. Those fall back to the old timers.
- A browser with GLUE open in several tabs uses a session per tab.
