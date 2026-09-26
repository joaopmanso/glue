---
status: accepted
date: 2026-09-26
---
# 0057. Keep Svelte, TypeScript, Vite and Tauri; fix how GLUE uses them (no React Native)

## Context
The user (2026-09-26) asked whether the stack will slow GLUE down as it grows:
- the UI is graphics-heavy and should use the GPU;
- a phone version is wanted for managing the collection on the go;
- is React Native or another stack worth moving to?

Two code audits (2026-09-26) found that the slow spots are in GLUE's own design, not the framework:
- **The row list** (`view.rows()`) isn't memoized. One global `lib.version` wakes it and the other
  derived values on every change, and it rebuilds the DJ values, search text and sort values of
  every track, in up to five callers.
- **Background analysis** re-sorts everything several times a second.
- **Drawing** is Canvas 2D on the main thread, with per-pixel JS loops. A Svelte `$state` tick every
  frame (`player.frame`) redraws whole views while playing. The GPU is used only by stems.
- **Reading, parsing and decoding** for analysis run on the main thread.

Measured at 50k tracks ([ADR 0058](0058-performance-budgets.md), [performance](../research/performance.md)):
opening 4.8 s, a sort up to 437 ms, one search keystroke 538 ms, 45 long frames during 5 s of
background changes.

## Decision
- **Keep the stack:**
  - the website: Svelte 5, TypeScript, Vite;
  - GLUE Home: Tauri 2 and Rust;
  - GLUE Cloud: a Cloudflare Worker.
- **Fix the architecture, in this order**, each step shipped and validated on its own:
  0. **Measure:** budgets, a synthetic collection, a perf test ([ADR 0058](0058-performance-budgets.md)).
  1. **Data pipeline:**
     - the store logs typed changes, and finer change signals replace the one version counter;
     - an incremental row index (search text, sort keys, filter values, counts per track);
     - one shared chain of derived rows for every caller;
     - background analysis applied in batches;
     - a lighter table.
  2. **GPU drawing:**
     - WebGL2 renderers (spectrogram, live view, 3D, Prepare waveform) through a small in-house
       helper, with 2D fallbacks;
     - one render loop that doesn't wake Svelte every frame;
     - an ImageBitmap cache for the row thumbnails.
  3. **Engine off the main thread:**
     - read, parse and decode in the worker (WebCodecs, with today's decoder as the fallback);
     - GLUE Home decodes with Symphonia (ADR 0051 stage 4) and streams songs by byte range.
  4. **A phone web app, remote + offline:**
     - a typed platform interface;
     - the cloud view becomes playable, streaming from GLUE Home over WebRTC through a service
       worker, with a TURN relay (ADR 0037);
     - an offline app shell (superseding ADR 0017), a cached cloud copy, an outbox for edits, and
       playlists kept on the phone;
     - a compact phone UI.
- **Later:** store apps with Tauri 2 mobile, wrapping the same Svelte app. Capacitor is the
  fallback; both plug in through the platform interface.

## Alternatives considered
- **React Native.** A rewrite of about 11k lines of UI and state code for three targets; the desktop
  ports are immature, and the website would need react-native-web. It loses what GLUE is built on:
  Web Audio, Canvas / WebGL, workers, File System Access, WebRTC. Its engine, Hermes, has no JIT, so
  the JavaScript analysis (FFT, tempo, key) would be much slower than on V8. React is also no faster
  than Svelte 5 for this UI (ADR 0008).
- **Flutter.** GPU-drawn UI, but a rewrite in Dart that drops the TypeScript core and parsers; its
  web build is heavy and weak at text-dense tables.
- **Moving the website into a desktop app.** The public site on its usual address, with GLUE Home as
  its engine, was chosen in ADR 0051.

## Consequences
- **No rewrite:** the core (parsers, analysis) and the UI stay, and the problems are fixed where they
  are.
- **The GPU is reachable today:**
  - WebGL2 runs in Chromium, Safari / WKWebView (iOS 15+) and Android WebView;
  - WebGPU runs in Chromium and Safari 26, and already runs stems.
- **Phone browsers have limits:**
  - iOS stops audio, WebRTC and Web Audio when the screen locks or the web app is in the background,
    so previews play in the foreground only. Lock-screen playback waits for the store app.
  - A web app on the Home Screen is exempt from Safari's 7-day storage eviction.
- **Each phase gets its own ADR** before it is built.
