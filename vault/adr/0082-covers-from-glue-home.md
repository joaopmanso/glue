---
status: accepted
date: 2026-09-28
---
# 0082. Other devices get songs' covers from GLUE Home, and keep them; GLUE Cloud never has them

## Context
The user (2026-09-28): "The cover art is not displayed on the mobile phone, while I don't want cover
art to be pushed to the cloud because that could grow very fast with a lot of users but the Home App
should provide this info, probably best to have it saved locally for faster access."
- **Where covers were:** each browser's own cache (ADR 0072). A track keeps its cover's hash.
- **A phone showing the account's library** (ADR 0077) has neither the files nor that cache.
- **GLUE Home** already serves other devices the songs, mini spectrograms and analyses (ADR 0046,
  0076).

## Decision
- **GLUE Home keeps covers in its cache:**
  - `a/<hash>-64.jpg` and `-320.jpg`, shared by an album's songs;
  - per song, the hash of its cover ('' for none).
  - They come from three places:
    - **the website on the same computer hands over** the covers it made, as it hands over analyses;
    - **GLUE Home's own analyses** keep the cover they find;
    - **otherwise, on request, GLUE Home reads the song's tags,** only the bytes the tags need (a
      mediabunny `CustomSource` over its file reads), with the website's own cover code.
- **A new request, `art`** (GLUE Home 0.15): a device asks for the covers of the rows on its screen,
  in one request, with the hashes it knows. GLUE Home answers each song's hash and JPEG.
- **The device keeps the covers in its own cache** (`art/<collection>/…`, the same place as a
  computer's), so they show at once next time.
- **GLUE Cloud never stores or carries covers.**

## Alternatives considered
- **Covers in GLUE Cloud's sync:** what the user ruled out. It grows with every user's library, for
  data a computer already has.
- **The phone reads the tags itself, through a stream of the song:** a round trip per song and far
  more bytes, where GLUE Home can answer many songs at once.

## Consequences
- **A phone shows covers whenever the computer with the songs is online,** and the ones it has seen
  even when that computer is off.
- **An older GLUE Home** (before 0.15) doesn't know `art`: the phone shows no covers until it
  updates.
- **Covers found by GLUE Home** aren't written into the collection (GLUE Home never writes the GLUE
  folder, ADR 0051). The website finds them again itself.
