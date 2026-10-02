---
status: accepted
date: 2026-10-02
---
# 0143. A sync takes in what it wrote, even when it fails; this computer's GLUE Home is looked for only with a reason

## Context
The user, 2026-10-02, on the laptop (no GLUE Home on it):
- **The desktop's songs on its network folder didn't show,** only its songs on local drives; the iPhone showed them
  all. Choosing the profile again (the collection opened anew) showed them.
- **Dozens of `GET http://127.0.0.1:47407/hello net::ERR_CONNECTION_REFUSED`** in Chrome's console.

From the code:
- **A sync writes as it pulls** (`src/store/shared/engine.ts` `pull`): each page of the log's changes into this
  device's files, and its cursor saved. Only when the whole sync (pull, then push) succeeded did the tab read the files
  again (`shared.svelte.ts`), and only if the same store was still open (`lib.store !== s` dropped it otherwise). A
  sync that failed after its pull, or a collection opened again meanwhile, left the files on disk and not on screen,
  and the next sync, from the saved cursor, had nothing to say about them. The desktop's 9,807 new songs were one
  long log. GLUE Home's own sync (`home/ui/sharedSync.ts`) had the same gap for its engine.
- **Looking for GLUE Home asks ten ports** (47400–47409, `discover`), and every port that doesn't answer is an error
  in the console, which no page can hide. Signed in to an account with a GLUE Home, the tab looked on this computer
  every 15 s, on every computer, for ever.

## Decision
- **A sync says which files it wrote as it writes them** (`syncShared(p, hint, changed)`: `pull` and `push` fill the
  caller's list). The tab reads them again into the open collection when it's that one, whether the sync succeeded,
  failed partway, or the collection was opened again meanwhile (`shared.takeIn`). GLUE Home's engine does the same.
- **This computer's GLUE Home is looked for only with a reason** (`localHome.lookIfAccountHasOne`):
  - every 15 s while one of the account's GLUE Homes may be here: this browser's computer's (`companionOf`), or one
    not placed on a computer yet (just installed);
  - otherwise once, and again when which of them are online changes (a second browser on that computer joins it,
    ADR 0091).
  - Looks within 10 s of each other share one (`discover`).

## Alternatives considered
- **Reopening the collection after every sync:** the whole collection read again for a few files.
- **Asking GLUE Cloud which computer a GLUE Home is on before looking:** the account already says (`companionOf`).

## Consequences
- **What a sync brought shows,** whatever happens after it.
- **A computer without GLUE Home looks once a visit** (10 console errors, from the browser, once), not every 15 s.
- **GLUE Home installed while the page is open** is found when it appears in the account (not placed yet: looked for
  every 15 s).
