<script lang="ts">
  /* The live view in 3D (ADR 0073): the GPU surface (render/waterfall3d, three.js, loaded when shown)
     that turns, zooms and moves with the pointer, with Reset view. Redrawn when a new spectrum comes in
     or the view moves, not every frame. Without WebGL, the flat 3D drawing (render/waterfall). */
  import { onMount } from 'svelte';
  import { player } from '../lib/player.svelte';
  import { app } from '../lib/app.svelte';
  import { theme, fitCanvas } from './render/canvas';
  import { drawWaterfall, WF_DEPTH, WF_FPS } from './render/waterfall';
  import type { Waterfall3D } from './render/waterfall3d';

  let { cut = null, label = 'Live 3D spectrum of the audio currently playing' }: { cut?: number | null; label?: string } = $props();
  let box = $state<HTMLDivElement>(), cv = $state<HTMLCanvasElement>();
  let flat = $state(false);          // no WebGL: the 2D drawing
  let idle = $state(true);           // nothing captured yet
  let view = $state('');             // the camera, for tests: azimuth, polar angle, distance
  let labels = $state<{ text: string; x: number; y: number }[]>([]);
  let w3: Waterfall3D | null = null;
  let redo = 0;                      // bumps to redraw with the same frames (a new cutoff)
  $effect(() => { void cut; redo++; });

  onMount(() => {
    let raf = 0, alive = true, seen = -1, lut: Uint8ClampedArray | null = null, seenRedo = -1, W = 0, H = 0, dirty = true;
    const nyq = () => (player.live.ctx?.sampleRate ?? 44100) / 2;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || !box || !cv) return;
      const live = player.live;
      idle = !live.drawn;
      if (flat) {
        if (live.pushed === seen && app.lut === lut && W === box.clientWidth && H === box.clientHeight) return;
        seen = live.pushed; lut = app.lut; W = box.clientWidth; H = box.clientHeight;
        const { ctx, w, h } = fitCanvas(cv);
        drawWaterfall(ctx, { l: 0, t: 0, w, h }, live.frames, app.lut, nyq(), theme(), cut, WF_DEPTH / WF_FPS);
        return;
      }
      if (!w3) return;
      if (box.clientWidth !== W || box.clientHeight !== H) { W = box.clientWidth; H = box.clientHeight; w3.resize(W, H); dirty = true; }
      if (live.pushed !== seen || app.lut !== lut || redo !== seenRedo) {
        seen = live.pushed; lut = app.lut; seenRedo = redo;
        w3.update(live.frames, app.lut, nyq(), cut, theme().accent);
        dirty = true;
      }
      if (w3.controls.update()) dirty = true;
      if (!dirty) return;
      dirty = false;
      w3.render();
      const v = w3.view();
      const f = (x: number) => (Math.abs(x) < 0.005 ? 0 : x).toFixed(2);
      view = f(v.az) + ',' + f(v.polar) + ',' + f(v.dist);
      labels = w3.labels(W, H);
    };
    void import('./render/waterfall3d').then(m => {
      if (!alive || !cv) return;
      w3 = m.create3D(cv);
      if (!w3) flat = true;
      else w3.controls.addEventListener('change', () => { dirty = true; });
      frame();
    });
    return () => { alive = false; cancelAnimationFrame(raf); w3?.dispose(); w3 = null; };
  });
</script>

<div class="live3d" id="live3d" bind:this={box} data-view={view} data-flat={flat ? '' : undefined}>
  <canvas bind:this={cv} aria-label={label}></canvas>
  {#each labels as l (l.text)}<span class="tick" style:left={l.x + 'px'} style:top={l.y + 'px'}>{l.text}</span>{/each}
  {#if idle}<p class="idle">{player.url ? 'Press play to see what’s sounding right now' : 'Open a file to use the live view'}</p>{/if}
  {#if !flat}
    <div class="tools">
      <span>Drag to turn · wheel to zoom · right-drag to move</span>
      <button type="button" id="reset-3d" onclick={() => w3?.reset()}>Reset view</button>
    </div>
  {/if}
</div>

<style>
  .live3d { position: relative; width: 100%; height: 100%; overflow: hidden; background: #030406; border-radius: inherit; }
  canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: grab; }
  canvas:active { cursor: grabbing; }
  .tick { position: absolute; transform: translate(-50%, 4px); font: 10.5px var(--font-mono); color: rgb(255 255 255 / .45); pointer-events: none; white-space: nowrap; }
  .idle { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: var(--muted); font: 11px var(--font-mono); pointer-events: none; }
  .tools { position: absolute; top: 6px; right: 8px; display: flex; gap: 10px; align-items: center; font-size: 11px; color: rgb(255 255 255 / .45); }
  .tools button { background: rgb(0 0 0 / .5); border: 1px solid rgb(255 255 255 / .2); border-radius: 4px; color: rgb(255 255 255 / .8); font-size: 11.5px; padding: 2px 9px; cursor: pointer; }
  .tools button:hover { border-color: var(--accent); color: var(--accent); }
  @media (max-width: 640px) { .tools span { display: none; } }
</style>
