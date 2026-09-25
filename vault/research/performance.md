---
updated: 2026-09-24
---
# Performance notes

Dev machine: Windows 11 laptop, 12 threads, Intel Iris Xe (gen-12lp). Measured 2026-09-23/24.

## Stem separation (HT-Demucs fp16-weights ONNX, 7.8 s chunks)
| Engine | Per chunk | 4-min track | Notes |
|---|---|---|---|
| Browser WebGPU (Iris Xe), onnxruntime-web 1.30 | ~30–39 s | ~15 min | Thread count doesn't matter (1 vs 8 similar; ~30 s without cross-origin isolation) |
| Browser WASM CPU | — | — | `std::bad_alloc`: exceeds 4 GB even with mem arena/pattern off |
| Native onnxruntime-node 1.22 CPU, 12 threads | ~11 s | ~6–7 min | Removed (client-only rule); for the desktop client |
| Native Python onnxruntime CPU | ~9–10 s | — | Reference |
| DirectML (onnxruntime-node) | — | — | Failed to initialise on this machine |
Session creation: ~20 s first time (WebGPU and native). Model download ~8 s.

Re-measured 2026-09-25 (headed Edge, real Iris Xe adapter "intel gen-12lp", 40 s test WAV = 7 chunks):
the frozen Speklone page **37 s/chunk, 284 s total**; GLUE **38 s/chunk, 297 s total**, so the same
engine at the same speed. A 4:25 track is 46 chunks, about 28 min on this laptop either way (a user
remembered ~3 min in Speklone, which matches a clip of about 30 s). The first chunk is ~10 s slower
(shader compilation).

## Analysis (Speklone pipeline)
- 30 s 48 kHz/24-bit clip: full analysis < 1 s in Node.
- 4-min 48 kHz/24-bit AIFF: parse + analysis ~0.8 s (Node), plus tempo/key ~4 s (tempo FFT pass
  dominates: 80k frames × 1024-point FFT). Optimisation candidate for background analysis: hop 256
  for tempo, or analyse the first 2–3 minutes only.
- Synthetic 12 s demo (96 kHz): generation ~0.5 s + analysis ~0.4 s.
