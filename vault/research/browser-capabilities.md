---
updated: 2026-09-24
---
# Browser capabilities for a local-first music library

Researched 2026-09-24. **[UNVERIFIED]** marks claims not confirmed from a primary source.

## File System Access API (pickers, persistent folders)
- `showOpenFilePicker` / `showSaveFilePicker` / `showDirectoryPicker`: **Chromium desktop only**
  (Chrome/Edge 86+). Firefox rates it "harmful", WebKit "oppose"; no plans to ship.
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) ·
  [caniuse #6615](https://github.com/Fyrd/caniuse/issues/6615) ·
  [WebKit position](https://github.com/WebKit/standards-positions/issues/28)
- Options: `id`, `mode: 'read' | 'readwrite'`, `startIn` = handle or `'desktop' | 'documents' |
  'downloads' | 'music' | 'pictures' | 'videos'`. Needs a secure context and a user gesture.
  [spec](https://wicg.github.io/file-system-access/)
- **Chromium blocklist** ([source](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/file_system_access/chrome_file_system_access_permission_context.cc)):
  - *Folder itself blocked, children allowed*: home, Desktop, **Documents**, Downloads; macOS
    `~/Library/CloudStorage`, `~/Library/Containers`, `~/Library/Mobile Documents`.
  - *Blocked with everything inside*: Program Files, Windows, **AppData (Roaming and Local)**,
    ProgramData, Chrome profile, `~/.ssh`, `~/.gnupg`; macOS `/Applications`, `~/Library`,
    `/System/Volumes`; Linux `/etc`, `~/.config`, …
  - **Not blocked**: Music, Pictures, Videos → `~/Music` can be granted whole.
  - Consequence: Rekordbox master.db (AppData / `~/Library/Pioneer`) is unreachable; `Documents/MCO`
    and `Documents/Native Instruments` are fine; iCloud Drive's `com~apple~CloudDocs` is grantable.
- **Persistence**: store handles in IndexedDB; `queryPermission` / `requestPermission` (needs a click).
  Chrome 122+ prompt offers "Allow this time / Allow on every visit / Don't allow".
  **Installed PWAs keep permissions automatically.**
  [Chrome blog](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)
- **No absolute paths** anywhere in the API (`kind`, `name`, `resolve()` → relative segments).
- Drag-drop: `DataTransferItem.getAsFileSystemHandle()` Chromium only (persistable);
  `webkitGetAsEntry()` everywhere, folders included, per-session only. `readEntries()` returns batches:
  loop until empty **[UNVERIFIED]**.
- `FileSystemWritableFileStream`: Chrome 86, Firefox 111, Safari 26 (useful for OPFS outside Chromium).
  Writes go to a swap file, committed on `close()`.
- `FileSystemObserver` (`observe(handle, {recursive:true})`, change types appeared / disappeared /
  modified / moved / unknown / errored): **Chrome 133+ desktop** only.
  [Chrome blog](https://developer.chrome.com/blog/file-system-observer)

## OPFS and storage
- OPFS: all major browsers; same `FileSystemDirectoryHandle` API. Safari private mode has no OPFS.
- Quotas: Chrome ~60 % of disk per origin; Firefox min(10 %, 10 GiB) best-effort; Safari ~60 %.
  Eviction is LRU, whole-origin, best-effort storage only.
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- **Safari deletes script-written storage after 7 days without interaction, except installed web apps.**
- `navigator.storage.persist()`: Firefox prompts; Chrome/Safari decide by heuristics.
- (Considered and not chosen, see ADR 0009) `@sqlite.org/sqlite-wasm` `opfs-sahpool` needs no
  COOP/COEP; `opfs` needs SharedArrayBuffer.

## Audio decoding in workers
- `AudioContext` / `OfflineAudioContext` / `decodeAudioData`: **main thread only**.
  [WebAudio v2 #16](https://github.com/WebAudio/web-audio-api-v2/issues/16)
- **WebCodecs `AudioDecoder`** in dedicated workers: Chrome 94, Firefox 130, Safari 26. Codec strings:
  flac, mp3, mp4a.*, opus, vorbis, ulaw, alaw, pcm-*. **No ALAC.** Requires demuxing (mp4box.js /
  mediabunny for m4a; Ogg/FLAC frame parsing). AAC needs AudioSpecificConfig, FLAC needs STREAMINFO as
  `description` **[UNVERIFIED]**. Per-browser AAC support unclear (Firefox?) → `isConfigSupported()`.
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioDecoder) ·
  [codec registry](https://www.w3.org/TR/webcodecs-codec-registry/)
- **wasm-audio-decoders** ([repo](https://github.com/eshaz/wasm-audio-decoders)), all with worker
  variants: `mpg123-decoder` (MP3, 77 KiB), `@wasm-audio-decoders/flac` (67 KiB),
  `@wasm-audio-decoders/ogg-vorbis` (99 KiB), `ogg-opus-decoder` (115 KiB), `opus-decoder`,
  `@wasm-audio-decoders/aac` (226 KiB, faad2). Licences **[UNVERIFIED]**: mpg123 LGPL-2.1; libFLAC /
  libopus / libvorbis BSD-3; **faad2 GPL-2.0 → don't use**.

## Dragging files out of the browser
- Chromium `DownloadURL` drag type (`mime:name:url`), non-standard, one file per drag. Windows: a
  temp-file copy handed via CF_HDROP; macOS: file promise. Always a **copy**, never the user's original
  file. blob: URLs and Rekordbox acceptance **[UNVERIFIED]**. [dt.in.th](https://dt.in.th/DownloadURL)

## WebGPU (2026)
- Chrome/Edge: Windows/macOS/ChromeOS 113+, Android 121, Linux (Intel Gen12+ 144, NVIDIA Wayland 147).
- Safari 26: macOS, iOS, iPadOS, visionOS.
- Firefox: Windows 141; Apple Silicon 145 (macOS 26) / 147; Linux, Intel Macs, Android not yet.
  [gpuweb status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)
- Headless Edge on this dev machine exposes the real Intel Iris Xe (vendor `intel`, arch `gen-12lp`).
