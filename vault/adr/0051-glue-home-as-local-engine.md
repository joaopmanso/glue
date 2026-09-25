---
status: accepted
date: 2026-09-26
---
# 0051. GLUE Home is the computer's disk and engine; the website stays at its public address

Supersedes [ADR 0050](0050-glue-home-as-the-computers-library.md) (proposed). Builds on
[ADR 0048](0048-local-link-to-glue-home.md). Refines [ADR 0007](0007-web-first-platform-layer.md)
(a second platform) and [ADR 0009](0009-json-files-store.md) (who touches the files).

## Context
The user (2026-09-26), after a song sent from the laptop to the desktop played on the desktop but
showed no waveform and "This track's file is on Laptop … run GLUE Home on Laptop" on its page:

- "The expectation of running the Home App is to have almost a local version of GLUE."
- Keep the public website in the address bar; behind the scenes it uses the local API when GLUE Home
  is running, and GLUE Home stands between the website and the cloud.
- Moving the processing out of the browser is a chance to make analysis faster.
- If GLUE Home stops, the website falls back to working on its own; when GLUE Home is back it catches
  up with the cloud and the website uses it again.

Why the song misbehaved: the website can't read GLUE Home's incoming folder (it never granted it),
so the song stayed *the laptop's track* with a pointer to the copy (`remote.via`). Only playing
followed the pointer; the track page, waveform and summary didn't
([handoff](../log/2026-09-26-handoff.md)).

Options for where the library runs were put to the user on 2026-09-26; they chose "GLUE Home as disk
and engine" over "GLUE Home as the full backend".

## Decision
**Mode.** On a computer where GLUE Home answers on the local link, the website runs in *Home mode*.
The page stays on `joaopmanso.github.io/glue/` (same origin: its storage, prefs and sign-in are
unchanged). Anywhere else, the website works as before.

**1. GLUE Home is the disk.**
- The local link gains a file API, limited to the places GLUE Home may use: the GLUE folder, the
  collection's music folders, the incoming folder and its cache. It lists, reads (with Range), writes
  (to a temp file, then renamed over the target) and removes files.
- The website wraps it in a folder handle with the same shape as the browser's (`HomeDir`), so
  `store/`, scans and playback use it unchanged. `src/platform/` picks it in Home mode (ADR 0007).
- Choosing the GLUE folder or a music folder opens GLUE Home's native folder dialog, so GLUE Home
  knows the real path. There are no permission prompts in Home mode.

**2. The incoming folder is a hidden music folder.**
- In Home mode the website adds GLUE Home's incoming folder to the open collection as a music folder
  marked `hidden`. It doesn't show under Music folders.
- Songs sent to this computer become **this computer's tracks**: analysed, stored and synced like any
  other. The merge shows them on both computers.
- TO BE SORTED lists that folder's tracks. "Move to music folder…" is a file move through GLUE Home,
  and the track's path is updated in the same step.
- The `remote.via` / `remote.incoming` rows for this computer's own GLUE Home go away. Other
  computers' incoming folders still come over the channel (ADR 0046).

**3. One writer, handed over.**
- While a GLUE tab is open in Home mode, the tab is the writer: it runs the library and the cloud
  sync as today, through GLUE Home's disk.
- It holds a *lease* on the local link (renewed every few seconds). With no lease, GLUE Home's hidden
  service page runs the same sync code on its own, so the computer stays in sync with no tab open.
- A tab takes the lease only after GLUE Home has saved and paused. GLUE Home resumes only after the
  lease runs out.
- **GLUE Home stops:** the tab falls back to browser mode. It reopens the GLUE folder with the
  browser's handle, which may ask for permission once, and keeps syncing itself.
- **GLUE Home comes back:** it reads the GLUE folder again from disk, since the tab may have written
  in the meantime, and catches up with the cloud. The tab then takes the lease and switches back to
  Home mode.

**4. GLUE Home is the engine.**
- Background analysis in Home mode is done by GLUE Home.
- Rust decodes the audio (Symphonia: faster, and formats the browser can't decode). The website's
  own analysis code (`src/core/audio`) runs on it in several workers of the service page, one per
  core minus one.
- Results go to GLUE Home's cache (summary, details, mini spectrogram), where the website and other
  computers already read them (ADR 0046). The website's pool only asks and waits.

## Alternatives considered
- **Redirect to a page served by GLUE Home on `127.0.0.1`:** a new origin, so browser storage, prefs,
  folder permissions and the Google sign-in address would all have to move. The port would also have
  to be fixed for ever. Rejected by the user in favour of keeping the public address.
- **GLUE Home as the full backend** (owns the library at all times; the website only displays and
  sends changes): always one owner and a true proxy, but the library logic (`library.svelte.ts`)
  would have to be split into a client and a server. Much bigger and riskier. Not chosen (user,
  2026-09-26).
- **Patch the `remote.via` paths** (the handoff's fix): fixes the symptom. The song would still be
  another computer's track on the computer that has it.
- **Port the analysis to Rust:** fastest, but a rewrite of the spectral, tempo and key code, with a
  risk of small differences from today's results (ADR 0016 parity).

## Consequences
- On a computer with GLUE Home: no folder permission prompts, received songs are real tracks, sync
  runs without a tab, and analysis uses every core.
- GLUE Home becomes required-to-be-correct. Its file API is powerful, so it's limited to its roots,
  to the token, and to the GLUE site's origins (ADR 0048). Paths are checked after they're resolved,
  so `..` and links can't leave a root.
- Two ways to reach the disk to keep working. Tests run the store against both `MemDir` and a fake
  `HomeDir`.
- Handing the writer role over needs care: a tab never writes without the lease, and GLUE Home never
  writes while one is held.
- Analysis parity: Rust decoding and the browser's `decodeAudioData` can differ (MP3 priming samples,
  resampling to the audio context's rate). **[UNVERIFIED]** until measured: Home-mode results must be
  checked against browser results on the parity fixtures before this ships. Resample to the same
  rate as the browser if needed.
- GLUE Home needs the account's access to sync with no tab. Its device credential may not be allowed
  to push profile files today; the cloud Worker's rules are checked, and extended if needed, in the
  sync stage.
- Built in stages, each shipped and checked on the desktop:
  1. file API + `HomeDir` + native folder dialogs (Home mode loads and saves through GLUE Home);
  2. the hidden incoming music folder and the new TO BE SORTED;
  3. the writer lease, browser fallback, and GLUE Home syncing with no tab;
  4. analysis in GLUE Home (Rust decoding, parallel workers), with the parity check;
  5. removing the `via` / local-incoming paths; e2e for the whole send-to-desktop story.
