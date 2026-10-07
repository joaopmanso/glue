---
status: accepted
date: 2026-10-07
---
# 0159. GLUE Home's first run, a GLUE folder always offered, and its window signed in by GLUE Home

## Context
The user, 2026-10-07, three problems on a first run with GLUE Home:
- **Stuck on the start page.** Choosing "This computer, with GLUE Home" never offered a folder for GLUE's data, so the
  library never opened. The folder step showed only once the page had GLUE Home's local link, and then only when the
  page could pick folders itself (`canPickFolders`: the browser's folder window, or Home mode, which starts only once
  GLUE Home has a GLUE folder). In GLUE Home's own window (WebView2) there's no browser folder window, so nothing was
  offered. Without the link there was nothing to click at all.
- **GLUE Home had no first run.** Its window could only *choose* a GLUE folder that already has `mco.json`: on a new
  computer there is none, and it said so as an error.
- **GLUE Home's window showed the start page and asked for a sign-in** although GLUE Home is connected. The page looked
  for GLUE Home only with a link this browser kept from before, or once signed in (when the account has a GLUE Home). A
  new window has neither, so it booted to the start page; and the window (ADR 0151) kept a sign-in of its own.

## Decision
- **A GLUE folder is always offered** on the start page:
  - folders can be chosen whenever GLUE Home answers (its own folder window, `/fs/pick` as `glue`), not only in Home
    mode or with the browser's folder window;
  - GLUE Home answering on this computer, with nothing chosen yet, preselects "This computer, with GLUE Home";
  - "with GLUE Home" without its link says why and offers **Look for GLUE Home again**, and a folder in this browser
    for now (GLUE Home takes the library over when it answers);
  - the "open the account's library in this browser" helper (ADR 0077) stands aside while GLUE Home answers: the
    library is GLUE Home's folder, to be chosen.
- **GLUE Home's window looks for GLUE Home at once** (`localHome.find` in the window: `/connect`), so it opens on the
  library.
- **GLUE Home signs its window in, as this computer:**
  - as it opens the window, GLUE Home asks GLUE Cloud for a single-use code (`POST /v1/auth/window-code`, with its own
    access token; two minutes; stored hashed in `window_codes`, migration 0012) and puts it into that window only
    (`initialization_script`: `window.__glueHomeSignIn`, a JSON string);
  - the page, not signed in, trades it once (`POST /v1/auth/window`) for a session of GLUE Home's companion (its
    computer's browser device, ADR 0091, 0108); a GLUE Home with no companion yet gets one, a new browser device that
    becomes it (a device, not a session: it holds music);
  - a sign-out in the window is respected (`cloud.windowOut`) until a sign-in there;
  - in the window, signed in with GLUE Home not connected: **Connect GLUE Home to this account** gets a pairing code and
    hands it to GLUE Home (`gluehome://pair`), nothing to copy.
- **GLUE Home's first-run guide** (its window, until finished or hidden; `setupDone` in its settings; never for one set
  up before, connected with a GLUE folder): the account (optional), where GLUE keeps the library (found by itself,
  **Make a GLUE folder in Documents**: `Documents\GLUE`, or `GLUE (2)` when that name is another folder with things in
  it; or choose one), the incoming folder, start with the computer (the first-run dialog's question becomes this step),
  then **Open GLUE library**. A folder chosen as the GLUE folder must be GLUE's or empty (`folder_state`); a new, empty
  one is set up by GLUE when it first opens it (`mco.json`, then the profile, then the music).

## Alternatives considered
- **The session over the local link** (the page asks GLUE Home for one): any browser on the computer gets the local
  link's token (ADR 0115), so every browser there would be signed in to the account through GLUE Home. The code goes
  only into GLUE Home's own window, and works once.
- **Sharing the browser's sign-in with the window:** the window is a separate WebView profile; there's nothing to
  share without copying a refresh token between profiles.
- **A wizard window of its own for GLUE Home's first run:** the settings window is where these settings live; a
  guide at its top, put away when done, keeps one place for them.

## Consequences
- **A new computer with GLUE Home:** install → its guide (connect, a GLUE folder made, start with the computer) →
  **Open GLUE library** → the window, signed in → a profile → the music. No start page in between.
- **The window's session is the computer's device:** sync, Devices and the phone see one computer, as with a browser
  attached by GLUE Home (ADR 0091).
- **GLUE Cloud:** two routes and a table; codes expire in two minutes and are deleted when the next one is made.
- **Tests:** `tests/cloud.test.ts` (the code: only a GLUE Home's, once, two minutes, a removed GLUE Home's refused; the
  companion, or a new one); `e2e/homemode.spec.ts` (the window on the library, signed in by the code; a first run with
  no GLUE folder and no browser folder window); `e2e/home.spec.ts` (the guide; never for a GLUE Home set up before);
  `home/src-tauri` (`free_glue_folder`, the sign-in script). FakeHome has GLUE Home's folder dialog (`/fs/pick`) and a
  first run with no GLUE folder (`noGlue`).
