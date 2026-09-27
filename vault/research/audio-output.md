---
updated: 2026-09-27
---
# Choosing the sound card and driver (for the player, ADR 0068)

## In the browser
- **Output device:**
  - `HTMLMediaElement.setSinkId(deviceId)` (Chromium since 49).
  - `AudioContext.setSinkId(deviceId)` (Chrome 110+): once the element goes through Web Audio, the
    context's device is the one that counts. `''` is the default device.
  - Source: [Change the destination output device in Web Audio](https://developer.chrome.com/blog/audiocontext-setsinkid).
- **Listing the devices:**
  - `enumerateDevices()` returns every audio output, with its name, only once the page has the
    microphone permission; without it, only the default ones. So a page asks for the microphone
    (and stops the stream at once) just to list the outputs.
  - Sources: [Choose cameras, microphones and speakers from your web app](https://developer.chrome.com/blog/media-devices?hl=en),
    [Audio Output Devices API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Audio_Output_Devices_API).
  - Firefox has `navigator.mediaDevices.selectAudioOutput()` (a picker). Chromium doesn't.
    **[UNVERIFIED]** for current Chromium.
- **Drivers:**
  - A page plays through the system's shared audio: WASAPI shared mode on Windows. **[UNVERIFIED]**
    in Chromium's code; it's the usual statement.
  - No web API reaches ASIO, WASAPI exclusive mode or DirectSound.

## Natively (GLUE Home, the next step)
- **[cpal](https://github.com/RustAudio/cpal) 0.18:**
  - Windows: WASAPI by default, ASIO with the `asio` feature (and JACK).
  - macOS: CoreAudio.
  - No DirectSound. WASAPI exclusive mode isn't offered **[UNVERIFIED]**.
- **ASIO build:** needs LLVM/Clang (bindgen) and Visual Studio. The build script downloads the
  Steinberg ASIO SDK itself (or `CPAL_ASIO_DIR`). ASIO drivers are needed to run it (ASIO4ALL for
  testing).
- **ASIO SDK licence:** dual since October 2025, GPLv3 or Steinberg's proprietary licence (unchanged).
  A GLUE Home with ASIO is either GPLv3 or under that licence agreement.
  - Sources: [KVR](https://www.kvraudio.com/news/steinberg-moves-vst-3-sdk-to-mit-open-source-license-asio-now-gplv3-65179),
    [heise](https://www.heise.de/en/news/Steinberg-Releases-ASIO-and-VST-Audio-Interfaces-Under-Open-Source-Licenses-10963451.html),
    [Libre Arts](https://librearts.org/2025/11/steinberg-relicenses-vst3-and-asio/).
- **DirectSound** is the older Windows API; WASAPI superseded it. DJ apps list it for old sound cards.
  WASAPI (and ASIO) cover what a sound card offers today.

## The visualiser package
- **[festanqueiro/threejs-visualisers](https://github.com/festanqueiro/threejs-visualisers)**, ISC,
  maintained by the user:
  - eight themes (Nebula, Warp, Horizon, Sound System, Smoke, Kaleidoscope, Paint, Liquid 3D);
  - `new Visualizer(container, { analyser, theme, themeOptions, pixelRatio })`;
  - `analyser` can be a function (a new node per song);
  - `createAnalyser(ctx)`: fftSize 2048, smoothing 0.8, the settings the themes are tuned for.
- **Installing:** `github:…#vX.Y.Z` builds on install (npm 11 asks for the install script to be
  approved: `allowScripts` in package.json, per commit).
- **Size:** one ES module, about 1 MB (the Sound System's model inlined); with three.js, a 1.6 MB
  chunk (470 kB gzipped).
- **Releases:** its workflow tags and releases every push to main (patch version); the releases have
  no files attached.
