# Speklone

Spectral forensics for lossless and hi-res audio: spectrogram, lossy / upsample / padded-bit
detection, tempo and key, a player with a live view, and AI stem separation. Everything runs
in the visitor's browser; no audio ever leaves their machine.

## Deploy

It's a static site: upload `index.html` to any static host (GitHub Pages, Netlify, Cloudflare
Pages, S3…). It must be served over https for stem separation (browsers only allow
Cache Storage and WebGPU in secure contexts).

## Preview locally

```sh
npm start        # http://localhost:5174
```

Opening `index.html` straight from disk also works for everything except stem separation.

## Stem separation

[HT-Demucs](https://github.com/facebookresearch/demucs) (MIT), using the ONNX export at
[StemSplitio/htdemucs-onnx](https://huggingface.co/StemSplitio/htdemucs-onnx), run with
[onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web) on WebGPU.

- The first separation downloads the model (166 MB) straight from Hugging Face and keeps it in
  the browser's Cache Storage; later visits load it from there. Visitors can remove it from the
  stems bar.
- Speed depends on the graphics chip: on an integrated Intel Iris Xe it takes about 4× the
  track's length (a 4-minute track ≈ 15 minutes); dedicated GPUs are much faster.
- It needs WebGPU on a real graphics chip: current Chrome, Edge or Safari, or Firefox 141+ on
  Windows. The model doesn't fit in the 4 GB that browsers give WebAssembly, so there is no CPU
  fallback.
- The export does part of its inverse STFT in float64, which onnxruntime-web doesn't support.
  The page rewrites those tensors to float32 as it loads the model; output matches the original
  to about 1e-7.

Stems are Drums, Bass, Other and Vocals at 44.1 kHz. Click a stem to toggle it, Shift-click to
solo it; the player plays the current selection. Downloads are 24-bit WAV.
