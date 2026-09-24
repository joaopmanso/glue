---
status: accepted
date: 2026-09-24
---
# 0005. Load the stem model from Hugging Face and cache it in Cache Storage

## Context
The model is 166 MB, too big for GitHub Pages (100 MB file limit) and for the repo. Hugging Face serves
it with permissive CORS: `Access-Control-Allow-Origin` echoes any origin (including `null` for file://)
on huggingface.co, and `*` on the redirected CDN (checked 2026-09-24).

## Decision
Fetch `https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main/htdemucs_fp16weights.onnx`
directly from the browser, stream it with progress, verify the byte count, and store the response in
Cache Storage (`speklone-models-v1`; will become `mco-models-v1`). Call `navigator.storage.persist()`
first. Offer "Remove" in the UI.

## Consequences
- First run per device downloads 166 MB (~8 s on a good connection); later runs load from cache.
- Depends on Hugging Face availability and the repo staying up; pin the file (a revision hash) if it
  ever changes.
- Cache Storage requires a secure context (https or localhost).
