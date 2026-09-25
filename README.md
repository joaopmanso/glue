# MCO: Music Collection Organizer

A local-first music collection tool for DJs, growing out of **Speklone** (spectral forensics: "is this
hi-res actually hi-res?"). Everything runs in the visitor's browser; no audio ever leaves their machine.

Live: https://joaopmanso.github.io/glue/ · original Speklone page: https://joaopmanso.github.io/speklone/

Today (M1) it analyses single files: quality verdict (transcodes, upsamples, padded bits, rip
fingerprints), spectrogram and average spectrum, tempo and key (Camelot / Open Key / musical), a player
with a live spectrogram, and HT-Demucs stem separation on WebGPU. The collection manager (library,
playlists, shows, sessions, imports/exports for Rekordbox and Engine DJ, duplicates) is on the
[roadmap](vault/product/roadmap.md).

## Develop

```sh
npm install
npm run dev        # http://localhost:5174/glue/
npm run check      # svelte-check (TypeScript)
npm test           # unit + parity tests (Vitest)
npx playwright test               # browser tests against the production build (uses installed Edge)
BASE_URL=https://joaopmanso.github.io/glue/ npx playwright test e2e/analyze.spec.ts   # same, against the live site
STEMS=1 npx playwright test e2e/stems.spec.ts   # slow: real stem separation
npm run build      # static site in dist/
```

Pushing to `main` runs the checks and tests on GitHub Actions and deploys `dist/` to GitHub Pages.

## Layout

- `src/core/`: pure TypeScript (analysis, parsers, verdict, key notation, stem model patch).
- `src/workers/`: analysis and stem-separation module workers.
- `src/lib/`: app state, player + live view, stems controller.
- `src/ui/`: Svelte components and canvas renderers.
- `legacy/index.html`: the original single-file Speklone page, kept as the reference for the parity
  tests and as the source of the frozen /speklone/ site.
- `vault/`: product docs, feature specs, ADRs, research. Start with [CLAUDE.md](CLAUDE.md).

## Stem separation

[HT-Demucs](https://github.com/facebookresearch/demucs) (MIT) via the ONNX export at
[StemSplitio/htdemucs-onnx](https://huggingface.co/StemSplitio/htdemucs-onnx), on
[onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web) with WebGPU. The first run downloads
the 166 MB model from Hugging Face and keeps it in the browser's Cache Storage. It needs WebGPU on a
real graphics chip (Chrome, Edge, Safari 26, Firefox 141+ on Windows); on an integrated Intel Iris Xe a
4-minute track takes about 15 minutes. See [vault/features/stem-separation.md](vault/features/stem-separation.md).
