---
status: accepted
date: 2026-09-27
---
# 0073. The live 3D view is drawn by three.js on the GPU, and can be turned, zoomed and reset

## Context
The user's list (2026-09-27): "3D interactivity", a 3D view that can be moved.

The live view's 3D mode (2026-09-24, `render/waterfall.ts`) is a fixed perspective drawn on a 2D
canvas: every frame, 110 ridges of 220 bands painted back to front. It costs about 7 ms a frame in
headless Edge, and it can't be looked at from another side. The Prepare tab shows the same drawing.

three.js is already in GLUE, for the player's visualiser (ADR 0068). M7 phase 2 (ADR 0057) planned
GPU drawing.

## Decision
- **`src/ui/render/waterfall3d.ts`:**
  - **The surface:**
    - one mesh of 220 bands × 110 frames, "now" at the front;
    - height and palette colour from the live view's frames (`Live.frames`, unchanged);
    - the palette's colours go out as they are (no colour-space conversion), so it matches the 2D
      views.
  - **Around it:**
    - a light ridge line every 4 frames and a white front crest;
    - frequency lines on the floor, with labels at the front edge;
    - the file's cutoff as a dashed line; fog into the distance.
  - **In a wide box** the surface gets wider (up to 3×), so it fills it as the flat drawing did.
- **Moving it:**
  - OrbitControls: drag to turn, wheel to zoom, right-drag to move;
  - never under the floor; damped.
  - "Reset view" puts back the starting camera.
- **Drawn only when needed** (`ui/Live3D.svelte`): when a new spectrum arrives (`Live.pushed`), the
  palette or cutoff changes, the box is resized, or the camera moves. Not every animation frame.
- **Loaded when shown:** `waterfall3d` and three.js are a separate chunk.
- **Without WebGL:** the 2D drawing (`render/waterfall.ts`) is still used.
- **Used by** the Details live view (Scrolling | 3D) and Prepare's 3D.
- The canvas keeps its last frame (`preserveDrawingBuffer`), so the page and tests can read it.

## Alternatives considered
- **Raw WebGL2 shaders:** smaller, but a camera, controls and lines by hand for one view; three.js
  is already loaded for the visualiser.
- **Keeping the 2D drawing with a few fixed angles:** doesn't let the user move it, and stays at
  7 ms a frame.

## Consequences
- The first GPU renderer (M7 phase 2). The scrolling view and the spectrogram stay 2D for now.
- About 600 kB of three.js (150 kB gzipped) loads the first time 3D or the visualiser is shown.
- **Tests:**
  - e2e: 3D draws (pixels read back), a drag turns it, the wheel zooms, Reset brings back the exact
    view (`data-view`: azimuth, polar angle, distance);
  - Prepare's 3D mounts it.
