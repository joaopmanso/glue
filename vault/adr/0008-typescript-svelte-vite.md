---
status: accepted
date: 2026-09-24
---
# 0008. Use TypeScript, Svelte and Vite

## Context
The single 2,790-line `index.html` can't carry a library manager (virtualised 50,000-row tables,
drag-drop trees, several workers, many views). Code map (2026-09-24) found real bugs from implicit
globals and source-order coupling.

## Decision
TypeScript (strict) + Svelte 5 + Vite, static build deployed to GitHub Pages by GitHub Actions.
Vitest for unit tests, Playwright (Edge channel, no browser download) for end-to-end. Workers are real
module workers (`new Worker(new URL(...), { type: 'module' })`), not `Function.toString` blobs, which
minification would break.

## Alternatives considered
- React: bigger ecosystem, heavier runtime; Svelte's compiled output stays fast with large lists.
- Plain JS modules, no build: simplest tooling, but no types across a large codebase.

## Consequences
- A build step and `node_modules` for development; the deployed site is still static files.
- The analysis core ports as typed modules with logic unchanged.
