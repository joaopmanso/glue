---
status: accepted
date: 2026-09-28
---
# 0080. Play songs on audio elements a tap has unlocked

## Context
The user (2026-09-28), on an iPhone: streaming "works for some tracks but most of them say 'Browser
can't play this track'". The same songs play in every desktop browser.
- **How the player loaded a song:** it made a new `<audio>` element for every song
  (`player.setSource`). It called `play()` after the song's address was ready, and for another
  computer's song that means a round trip to its GLUE Home first (ADR 0076).
- **iOS Safari lets an element start playing only close to a tap** (the "user gesture" rule), unless
  that element was touched by an earlier tap. So a quick answer on the home Wi-Fi played, and a
  slower one was refused with `NotAllowedError`.
- **The message was misleading:** every refusal showed "This browser can't play this format",
  whatever the cause.
- **Desktop browsers** remember that the page was interacted with, so they never refused.
- **Web players do the same thing on iOS:** Howler.js keeps a pool of HTML5 audio elements unlocked
  during the first touch, and plays sounds on them later.

## Decision
- **Every tap, click or key press unlocks two spare `<audio>` elements**, if they aren't ready yet:
  made and `load()`ed while the tap is being handled.
- **A new song plays on a spare element**, so it can start after the network answers, and the next
  song can start by itself when one ends.
- **The last song's element is emptied and kept as a spare** (its listeners removed). The exception
  is an element that was ever joined to Web Audio (the live view, the visualiser): an element can
  join only once, so it's dropped.
- **Messages say what the browser said:**
  - "Tap ▶ to start" when it wants a tap;
  - "can't play this format" when the format isn't supported;
  - "couldn't decode" when decoding failed;
  - "the connection to its computer dropped" for network errors;
  - nothing when another song replaced it.

## Alternatives considered
- **One element for everything:** the least change for iOS, but the Web Audio graph ties an element
  to one context forever, and the desktop features (the live view, stems) swap sources.
- **Play the song's bytes through Web Audio** (decode, then an `AudioBufferSourceNode`): the whole
  file first, which is what streaming set out to avoid.
- **Ask for a tap every time:** it works, but every automatic next song would stop.

## Consequences
- **Songs chosen by a tap start on iOS however long the answer takes, and play on by themselves.**
  Not checked on a real iPhone yet **[UNVERIFIED]**; the user tries it.
- **An iPhone that still refuses a format now says so.** If some formats really don't play there,
  GLUE Home could send a copy the phone can play (a later decision).
- **On desktop, elements are now reused between songs,** and Web Audio's rule decides which ones.
