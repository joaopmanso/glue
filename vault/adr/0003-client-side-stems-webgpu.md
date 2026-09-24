---
status: accepted
date: 2026-09-23
---
# 0003. Run stem separation in the browser on WebGPU with HT-Demucs

## Context
The user wanted AI stem separation (drums, bass, other, vocals), running client-side. HT-Demucs is the
best open (MIT) model; a working ONNX export exists (StemSplitio/htdemucs-onnx, 166 MB fp16 weights,
STFT inside the graph, input (1, 2, 343980) at 44.1 kHz, output (1, 4, 2, N)).

## Decision
Run HT-Demucs with onnxruntime-web on the **WebGPU** execution provider in a module worker, with the
reference chunking (7.8 s chunks, ¼ overlap, linear crossfade overlap-add). Reject software GPU
adapters. Without a real GPU, show a message instead of trying the CPU.

## Alternatives considered
- WASM CPU: fails. Weights + activations exceed WebAssembly's 4 GB, even with `enableCpuMemArena` and
  `enableMemPattern` off (tested 2026-09-24). onnxruntime-web has no 64-bit build.
- Spleeter (smaller, 11 kHz bandwidth, lower quality): rejected for quality.
- Native onnxruntime in a local server: faster, but violates client-only (ADR 0002).

## Consequences
- Works for anyone with WebGPU on real hardware (Chrome/Edge, Safari 26, Firefox 141+ on Windows).
- Slow on integrated GPUs (~30 s per 7.8 s chunk on Iris Xe, ~4× real time).
- Unavailable without WebGPU; the rest of the app is unaffected.
