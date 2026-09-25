---
status: shipped
milestone: Speklone
updated: 2026-09-24
adrs: [0003, 0004, 0005]
---
# Stem separation

## What it does
Splits a track into Drums, Bass, Other and Vocals with HT-Demucs, entirely in the visitor's browser.
Stems can be toggled (Shift/Alt-click solos), played through the normal player and live view, and
downloaded as 24-bit WAV, singly or as the selected mix.

## Behaviour
- First run downloads the model (166 MB) from Hugging Face and keeps it in Cache Storage
  ("Model saved on this device · Remove"). Later runs load it from the cache.
- Progress with chunk count and time remaining; Cancel.
- Browsers without WebGPU on a real GPU get an explanatory message; everything else keeps working.
- The claude.ai preview can't run it (its CSP blocks the model download and file saves).

## How it works
- A module worker imports onnxruntime-web 1.30.0 (`ort.webgpu.min.mjs`, jsDelivr), downloads the
  model with progress, **patches float64 tensors to float32** ([ADR 0004](../adr/0004-float64-model-patch.md)),
  and creates a WebGPU session (software adapters like SwiftShader are rejected).
- Input: stereo 44.1 kHz (browser resamples on decode), 343,980-sample (7.8 s) chunks, ¼ overlap,
  linear crossfade overlap-add (same as the reference implementation).
- Output tensor (1, 4, 2, N) in order drums, bass, other, vocals.

## Performance (measured 2026-09-23, see [research/performance.md](../research/performance.md))
- Intel Iris Xe (WebGPU): ~30 s per 7.8 s chunk → a 4-minute track ≈ 15 minutes.
- Browser CPU (WASM): **fails**: model + activations exceed WebAssembly's 4 GB, even with memory
  arenas off. No 64-bit onnxruntime-web build exists yet.
- Native onnxruntime-node CPU (12 threads): ~11 s per chunk; removed because separation must be
  client-side. Candidate for the future desktop client.

## Acceptance (met)
- [x] 30 s clip: stems sum back to the mix with residual 32.7 dB below it; plausible spectral balance
  (bass 95 % < 150 Hz).
- [x] Deployed site: model downloads from Hugging Face (CORS ok), second visit uses the cache.

## Limits & open questions
- Fixed in M1: Cancel during model load / audio prep was lost. Each run now has a job id; Cancel marks
  that id in the worker and the page ignores replies for old ids (`src/lib/stems.svelte.ts`,
  `src/workers/stems.worker.ts`). Covered by `e2e/stems.spec.ts`.
- The model cache (`mco-models-v1`) also reads the legacy page's `speklone-models-v1` copy: both pages
  share the joaopmanso.github.io origin.
- Stems are always 44.1 kHz (model's fixed rate).
- GLUE: optional saving to `GLUE/stems/` (later).
