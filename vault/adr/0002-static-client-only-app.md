---
status: accepted; "no server, no accounts" superseded by 0036 (optional accounts); audio still never leaves the user's own devices
date: 2026-09-23
---
# 0002. Build a static, client-only web app with no server

## Context
Users analyse private audio files; uploading them is slow and a privacy problem. The app must be
free to host and deployable anywhere.

## Decision
All parsing, analysis, playback and stem separation run in the visitor's browser. The site is static
files on GitHub Pages. No backend, no accounts, no telemetry. External fetches are limited to fonts,
the onnxruntime-web script (jsDelivr) and the stem model (Hugging Face).

## Alternatives considered
- Server-side analysis/separation: faster stems, but uploads, hosting cost and accounts.
- A local helper server (`npm start` with native onnxruntime-node): tried on 2026-09-23 and ~3.6×
  faster for stems, removed because the user wants no install and client-side processing. Recorded in
  [research/performance.md](../research/performance.md) for the future desktop client.

## Consequences
- Privacy by construction; zero hosting cost.
- Limited by browser sandboxing and performance (see ADRs 0003, 0007, 0012).
