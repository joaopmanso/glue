---
updated: 2026-09-25
---
# Changelog

Newest first. Each entry: date, milestone, what changed, links.

## 2026-09-25 · Quiet content above the fade counts
- AIFFs still read "band-limited to about 15 kHz" although faint content reached past 20 kHz. The
  fade is measured on the average spectrum; quiet highs barely move it. Now the spectrogram's louder
  moments are checked too: quiet content up to 17 kHz or higher, with no wall, means Lossless
  ([ADR 0034](../adr/0034-quiet-content-above-the-fade.md)). Steady hiss doesn't count.
- `VERDICT_VERSION` 3: stored Caution / Suspect verdicts are re-checked again, without decoding.

## 2026-09-25 · Gentle roll-offs are no longer "Caution"
- Lossless files whose top end fades out gently from 17 kHz up (common on artist / Bandcamp /
  SoundCloud downloads) now read Lossless with a Note; shallow high "walls" (≥ 18.5 kHz, < 30 dB)
  are a Caution at most ([ADR 0033](../adr/0033-tolerate-gentle-roll-offs.md)).
- Existing verdicts are re-checked in the background from the stored analyses (no decoding), with a
  notice of how many changed. `VERDICT_VERSION` 2.
- Parity fixtures unchanged (their 5 kHz band limit is still a Caution).

## 2026-09-25 · Tags, playlist insights, column filters, the player keeps playing
- Tags on tracks and playlists, made in MCO or found in files (Grouping, rekordbox My Tag,
  #hashtags): Tags column, editor, sidebar section (drop tracks on a tag), track page, rename /
  delete everywhere ([ADR 0032](../adr/0032-tags.md), [tags](../features/tags.md)).
- Filters: Tags and Genre groups; ▾ in the Quality, Format, Tags and Genre headers lists every
  value to tick (and sorts).
- Playlist insights: length, tempo flow, keys and harmonic mixes, quality, Venn of up to three tags;
  under playlists and in the builder.
- Playlist builder: "Look at tags" on by default (prefer / only / avoid); each proposed track shows
  its overview to play and scrub; rows fit phone widths (e2e checks no sideways overflow).
- Fixed: opening track B's page while A played stopped A. The page's source now waits until it's
  played there ([player](../features/player.md)).

## 2026-09-24 · Overview column, quality / format filters, track page scrollbar
- Mini spectrogram per row, playable and scrubbable, with a playhead and imported cue points
  ([ADR 0031](../adr/0031-row-thumbnails.md)).
- Filter the table by quality verdict and format; click a quality badge to filter by it.
- Fixed: the track page's verdict sidebar had a height cap and scrolled by a pixel or two whenever
  the tempo/key card made it just too tall (seen at 1080p and with display scaling); it's no longer
  its own scroller. e2e checks no element on the track page scrolls.

## 2026-09-24 · Playlist builder scrolls again; cue points and ratings imported
- Fixed: with many playlists the builder's Generate button was unreachable. A global `.cols` rule
  (the analysis page's columns, `align-items: start`) stopped the dialog's columns from fitting, so
  they couldn't scroll; the earlier test passed because scroll-into-view moves clipped content. The
  dialog's classes are now prefixed, and the e2e scrolls with the mouse wheel and checks the button is
  really on screen (it fails on the old code).
- Imports: rekordbox (POSITION_MARK) and Traktor (CUE_V2) cue points and loops are kept (position,
  hot-cue slot, name, colour); an imported rating becomes the track's own rating when it has none.
  Engine DJ and Serato cues are not read yet (Engine's quickCues blob and Serato's in-file tags).

## 2026-09-24 · Fix: "Couldn't save to your MCO folder … not of type 'WriteParams'"
- A playlist or import deleted while a save was running (constant during a 10k-track analysis) was
  still written as "nothing"; the write failed, was retried every second, and — because one failure
  aborted the whole save — held back every other change. Now each file saves on its own, a deleted
  item's file is removed instead, imports are removed through the store, and the error shows once.
- Test: the mid-save delete race.

## 2026-09-24 · DJ libraries detected automatically
- Sidebar › DJ libraries: libraries found in music folders, the MCO folder and remembered places, with
  Add / Update; "Look in…" allows another place (e.g. Traktor's); "Where are my libraries?" guide;
  manual Import kept ([ADR 0030](../adr/0030-detect-dj-libraries.md)).
- Fixed: a search requested while one was running was dropped; it now runs right after.

## 2026-09-24 · Build a playlist with several selected tracks
- With more than one track selected, the builder starts from the first and includes all the others.

## 2026-09-24 · Playlist builder fits smaller windows
- The dialog's top was cut off below ~1080p: it was centred in a box that couldn't scroll, its
  columns didn't scroll (nested grid sizing), and focusing the Generate button scrolled the clipped
  dialog. Now: columns scroll on their own (flex), the page scrolls for very short windows, focus
  doesn't scroll, and an empty result explains why. e2e checks five window sizes.

## 2026-09-24 · Background analysis on / off
- A per-collection switch replaces the session-only Pause; with it off, "Analyse" analyses selected
  tracks on demand ([background analysis](../features/background-analysis.md)).

## 2026-09-24 · Automatic playlists, full-name logo
- [Automatic playlists](../features/auto-playlists.md): build a set from a track along a BPM ramp,
  harmonic mixing, highest rated first, must-include tracks, avoid playlists, randomness; preview with
  re-roll per slot; save as a playlist ([ADR 0029](../adr/0029-automatic-playlists.md)).
- The logo reads "Music Collection Organizer" with the M, C and O emphasised (just "MCO" on narrow screens).
- Tests: 8 unit tests for the generator; e2e for the dialog and saving.

## 2026-09-24 · Themes
- [Themes](../features/themes.md): Classic (now with light mode), Studio, Riso and Moss, each dark and
  light, with their own fonts and small signatures; picker with live previews on the profile screen,
  sun/moon toggle in the header ([ADR 0028](../adr/0028-themes.md)).
- Tests: e2e switches every theme and mode, checks they persist and the fonts load.

## 2026-09-24 · Drag out to other apps
- Chrome/Edge: drag a track's grip out for a copy of the file, a playlist's icon out for a `.m3u8`
  with absolute paths ([ADR 0027](../adr/0027-drag-out-with-downloadurl.md)).
- Tests: e2e checks the drag data (file copy readable, M3U8 contents); real drops into other apps
  can't be automated here.

## 2026-09-24 · Backups, restore, delete all, clearer start
- Profile backups as standard zips, restore (start screen or profile screen), "Delete all MCO data"
  ([ADR 0026](../adr/0026-profile-backups-and-wipe.md)); "Find folder" to relink music folders.
- Three-step first run; step 1 warns when the chosen folder looks like a music folder.
- Tests: zip unit tests (checked with Python's zipfile too); e2e for warning → profile → music step →
  backup → delete all → restore → Find folder.

## 2026-09-24 · Duplicate detection by sound
- Acoustic fingerprints (Philips-style band-energy bits) computed in the background analysis and kept
  in the browser's cache ([ADR 0025](../adr/0025-band-energy-fingerprints.md)); `ANALYSIS_VERSION` 3.
- [Duplicates](../features/duplicates.md) view: same-recording groups across names and formats (a WAV
  and its MP3 rip), plus "check these" by artist/title; best copy, "Use in playlists", "Not duplicates";
  "2×" badge in the table.
- Fixed: a track counted as analysed before its stored analysis was written, so opening it right away
  re-analysed; the stored analysis and fingerprint are now written first.
- Tests: fingerprint unit tests (synthetic rips, unrelated audio), a real WAV vs 128 kbps MP3 check
  (BER 0.04), e2e with an ffmpeg-made MP3 rip under another name.

## 2026-09-24 · 3D live view
- The live view can switch between the scrolling spectrogram and a 3D view where recent spectra run
  into the horizon ([live view](../features/live-view.md)).

## 2026-09-24 · Track pages never analyse after the background pass
- The background workers now store each track's full analysis (compressed, ≤512 spectrogram rows) in
  the browser's storage ([ADR 0024](../adr/0024-background-stores-full-analysis.md)); track pages
  show it with no analysis steps, even on the first visit. `ANALYSIS_VERSION` 2 re-analyses existing
  libraries once to fill it.
- Tests: format round trip; e2e checks no analysis step is shown on a first visit.

## 2026-09-24 · Stored track analysis, uninterrupted playback, wide windows
- Track pages store their full analysis on the first visit and reuse it; "Re-analyse" on demand
  ([ADR 0023](../adr/0023-store-track-page-analysis.md)).
- Opening the page of the playing track no longer restarts (and stops) playback.
- Layout: the page grows to 2560 px wide (was 1760) and the library fills the window's height
  (a grid row mismatch left the table short on tall windows).
- Tests: unit tests for the stored format; e2e for stored pages, Re-analyse and continuous playback.

## 2026-09-24 · Folder drops, playlist order, columns, notes
- Fixed: dropping on "+ Playlist" covered the page in blue (its `drop` class clashed with the page's
  drop overlay; both renamed).
- Tracks dropped on a folder create a playlist inside it; playlist colours tint the whole row.
- Playlists open in "#" order and can be rearranged by dragging; "Keep this order" saves a sorted order.
- Track table columns: show / hide, reorder by dragging headers or from the column menu.
- Track notes: an icon in the table opens a note editor; also on the track page.
- Tests: e2e for all of the above.

## 2026-09-24 · Playlist organising, colours, ratings; new drag
- In-app drags rebuilt on pointer events ([ADR 0022](../adr/0022-pointer-drag-inside-mco.md)): the
  native drag kept failing with a real mouse and showed a stray blue drag image. Now: a tag at the
  pointer, "+" on the target playlist, insertion lines, Escape to cancel.
- Playlists: drag to reorder and to move into / out of folders; ⋯ menu with colours, move up/down,
  move to folder, rename, delete.
- [Ratings](../features/ratings.md): half-star ratings in the table and on the track page; imported
  DJ-app ratings shown dimmed until you rate.
- Tests: e2e for reordering, nesting, the menu, colours, drag feedback and half-star ratings.

## 2026-09-24 · Library player, drag-and-drop fixes
- Player bar at the bottom of the library (play from any row, queue = current view, auto-advance).
- Drag to playlists fixed: the table no longer changes under a drag, notices are a toast, nested
  playlists re-render, closed folders open on hover, drop on "+ Playlist" creates one.
- Tests: e2e for the player bar and for drops onto new, nested and repeated playlists.

## 2026-09-24 · Add single songs
- Drop songs onto the library or use "+ Songs": kept by file handle in Chrome/Edge, copied into the MCO
  folder elsewhere ([ADR 0021](../adr/0021-single-songs.md)). No duplicates with music folders or
  imports; "Added songs" view; "Remove from collection" for selected tracks.
- Fixed: drops read `dataTransfer.files` after an `await`, when the browser has already emptied it.
- Tests: new e2e for single songs (link to import, reload, track page, folder adoption, removal).

## 2026-09-24 · M2 shipped: the library
- **Profiles** without passwords, **collections**, and the **MCO folder** as a JSON store
  ([ADR 0018](../adr/0018-local-profiles.md), [ADR 0009](../adr/0009-json-files-store.md)); browser
  storage on Safari/Firefox. No installable app ([ADR 0017](../adr/0017-no-installable-app-for-now.md)).
- **Imports**: rekordbox XML, Engine DJ m.db (sql.js), Serato database V2 + crates, Traktor NML,
  Apple Music / iTunes XML, M3U/M3U8. Imports first, then **link music folders**: tracks match files by
  trailing path, which also infers each folder's location on disk
  ([ADR 0020](../adr/0020-imports-then-link-folders.md)). DJ libraries found while scanning are offered
  for import.
- **Library view**: sidebar (library views, playlist tree, music folders, imported libraries), a
  virtualised track table with search, sort, multi-select and drag to playlists; folders and playlists
  with rename, delete, move and reorder.
- **Background analysis**: several tracks at once in a worker pool, browser decoding limited to two
  ([ADR 0019](../adr/0019-background-analysis-decoding.md)); quality, BPM, key and format columns fill
  in as it goes.
- **Track page** (`#/track/<id>`): everything the library knows plus the full Speklone analysis, player,
  live view and stems.
- Found while testing: a layout shift during `dragstart` makes Chromium cancel the drag (the selection
  bar now always keeps its space); a reload during the first write of a new file left it empty and
  locked the library (empty files now count as missing; damaged files are set aside as `*.damaged`).
- Tests: 52 Vitest (importers, path matching, merge rules, store resilience) and 8 Playwright, incl.
  the whole library flow and Engine/Serato imports in Edge.

## 2026-09-24 · M1 shipped
- Ported to **TypeScript 6 + Svelte 5 + Vite 8** ([ADR 0008](../adr/0008-typescript-svelte-vite.md)).
  TypeScript 7 (the Go compiler) isn't supported by svelte-check yet, hence 6.
- `src/core/`: analysis, parsers, clues, verdict, key notation, WAV writers, stem constants and the
  float64 patcher, logic unchanged apart from types. `src/workers/`: real module workers for analysis
  and stems (the old `Function.toString` worker would not survive minification).
- UI rebuilt as Svelte components; same look (the stylesheet carried over as `src/styles/app.css`),
  now branded MCO, "Analyze a file" mode.
- Bugs fixed while porting: analysis results could reach the wrong file when a second file was
  dropped mid-analysis (request ids + "latest wins"); stem Cancel during model load / audio prep was
  lost (per-run job ids); busy bar stuck after a superseded example; a quick pause/play could start a
  second play loop; ID3 UTF-16 text without a BOM lost its first character; "an WAV wrapper" wording.
- The stem model cache is shared with the legacy Speklone page (same origin): MCO reuses its copy
  instead of downloading 166 MB again.
- Tests: 34 Vitest (parsers on real ffmpeg-encoded fixtures, verdicts on synthetic signals, tempo/key,
  patcher, WAV round trips, **parity with the legacy page** incl. a real AIFF) and 7 Playwright tests
  in headless Edge (incl. real stem separation + cancel). `legacy/index.html` kept for parity
  ([ADR 0016](../adr/0016-keep-legacy-page-for-parity.md)).
- GitHub Actions: check + test + build + deploy to Pages on every push to `main`.

## 2026-09-24 · M0 shipped
- AI vault created: vision, roadmap, glossary, 19 feature docs, 15 ADRs, research notes.
- `CLAUDE.md` added as the agent entry point.
- MCO plan agreed: web-first local DJ collection manager; JSON files in `Documents/MCO`.
- Repo renamed `joaopmanso/speklone` → `joaopmanso/mco`; site now at https://joaopmanso.github.io/mco/.
  A new `joaopmanso/speklone` repo keeps the original Speklone page live at /speklone/ (frozen copy of
  `legacy/index.html`; briefly a redirect to /mco/ before the user asked to keep the old page).

## 2026-09-24 · Speklone
- Stem separation made fully client-side (WebGPU, model from Hugging Face + Cache Storage); local
  native engine removed. Deployed to GitHub Pages (joaopmanso/speklone).

## 2026-09-23 · Speklone
- First release and iterations: quality forensics, AIFF fix, MP4 audio-track fix, player, pause fix,
  live view, sidebar layout, start page, tempo & key, stem separation.
  See [2026-09-23-speklone.md](2026-09-23-speklone.md).
