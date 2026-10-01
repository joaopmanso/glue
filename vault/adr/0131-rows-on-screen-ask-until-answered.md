---
status: accepted
date: 2026-10-01
---
# 0131. What rows on screen need from another computer is asked for until it's answered

## Context
The user, 2026-10-01: "the first time the collection loads remotely, for example on my laptop, the waveforms from
the initial page don't always load. I have to scroll down and back up." They asked that a song visible in the list
fetch its data when it lacks it, that a fetch for a row scrolled away be dropped, and that a margin of 10 to 15
songs either way keep scrolling smooth.

What already held (2026-09-30):
- rows load only while on screen;
- a row that scrolls away drops what it asked for (`hold`/`drop`);
- the table draws 12 rows beyond each edge.

Why the first screen still failed, found with the code map:
- **Thumbnails and waveforms** (`thumbs.svelte.ts`):
  - `remoteFiles.thumbs` dropped songs it couldn't ask about (the link to the other computer still opening, a
    time-out). The loader took that as "not made there yet", stored none, and retried after 8 s only if the row
    was still on screen;
  - another computer's song that wasn't readable yet was stored as none for good, so the cell never asked once it
    was.
- **Covers** (`covers.svelte.ts`) marked a song "tried" before asking. When the ask failed, that batch and the
  ones after it stayed tried for the session.
- Both carried their own copy of the "rows on screen" and retry logic, and the copies had drifted apart.

## Decision
- **One helper for both:** `src/lib/onScreen.ts`:
  - `OnScreen` counts the rows on screen;
  - `Retries` asks again only while a row is on screen.
- **An answer from another computer lists each song it reached:**
  - with its data, or null ("none there yet");
  - a song missing from the answer couldn't be asked.

  Covers' `art()` already answered this way; `thumbs()` now does too.
- **Couldn't ask:** the song stays unknown, not "none". It's asked again after 1, 2, 4… up to 15 s, for as long as
  its row is on screen. A song not readable yet stays unknown too, so its row asks as soon as it is.
- **None there yet:** it shows none, and is asked again after 8, 16… up to 60 s, ten times, or at once when its row
  comes back on screen.
- **A row that scrolls away cancels its retry.** What was queued for it is dropped, as before.
- The margin stays the table's 12 rows each way, within the user's 10 to 15.

## Alternatives considered
- **Retry the whole screen on a timer:** asks for rows that already have their data, and still leaves rows that
  scrolled away empty.
- **Wait for the link before asking at all:** the link can be up and a single ask still time out. Retrying per
  song covers both.

## Consequences
- The first screen fills in as soon as the other computer answers, without scrolling.
- One place decides how GLUE asks again (`Retries`); other loaders of row data should use it.
