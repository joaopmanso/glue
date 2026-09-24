<script lang="ts">
  import { themes } from '../lib/themes.svelte';
  import { app } from '../lib/app.svelte';
  import { drawLtas } from './render/ltas';
  import type { PlotRect } from './render/canvas';

  let cv = $state<HTMLCanvasElement>();
  let box = $state<HTMLDivElement>();
  let hoverX = $state<number | null>(null);
  let size = $state(0);
  let rect: PlotRect | null = null;

  $effect(() => {
    void size; void themes.version;
    const r = app.res, v = app.verdict;
    if (!r || !v || !cv) return;
    rect = drawLtas(cv, r, v, hoverX);
  });
  $effect(() => {
    if (!box) return;
    const ro = new ResizeObserver(() => size++);
    ro.observe(box);
    return () => ro.disconnect();
  });
  function onMove(e: PointerEvent) {
    if (!rect || !cv) return;
    const x = e.clientX - cv.getBoundingClientRect().left;
    hoverX = x >= rect.l && x <= rect.l + rect.pw ? x : null;
  }
</script>

<section class="panel" aria-label="Average spectrum">
  <div class="panel-head">
    <h3>Average spectrum</h3>
    <span class="hint">Mean level per frequency across the whole track, dBFS</span>
  </div>
  <div class="panel-body">
    <div class="canvas-box" id="ltas-box" bind:this={box}>
      <canvas id="ltas" bind:this={cv} aria-label="Average spectrum: frequency against mean level" onpointermove={onMove} onpointerleave={() => (hoverX = null)}></canvas>
    </div>
  </div>
</section>
