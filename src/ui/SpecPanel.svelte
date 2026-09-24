<script lang="ts">
  import { themes } from '../lib/themes.svelte';
  import { untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { player } from '../lib/player.svelte';
  import { fmtDb, fmtTime } from '../core/format';
  import { buildSpecImage, type PaletteName } from './render/palettes';
  import { drawSpec } from './render/spectrogram';
  import type { PlotRect } from './render/canvas';
  import PlayerBar from './PlayerBar.svelte';
  import StemsBar from './StemsBar.svelte';

  let specCv = $state<HTMLCanvasElement>();
  let liveCv = $state<HTMLCanvasElement>();
  let specBox = $state<HTMLDivElement>();
  let liveBox = $state<HTMLDivElement>();
  let img: HTMLCanvasElement | null = null;
  let imgVersion = $state(0);
  let size = $state(0);
  let hover = $state<{ x: number; y: number } | null>(null);
  let readout = $state('Hover to read values · click to play from there');
  let rect: PlotRect | null = null;

  // Recolour the spectrogram image when the data, floor or palette change.
  $effect(() => {
    const r = app.res, floor = app.dbFloor, lut = app.lut;
    if (!r) return;
    img = buildSpecImage(r.spec, r.cols, r.rows, floor, lut, img ?? undefined);
    untrack(() => imgVersion++);
  });

  // Redraw on anything visible changing (player.frame ticks every animation frame while playing).
  $effect(() => {
    const r = app.res;
    void imgVersion; void size; void player.frame; void player.time; void app.liveMode; void themes.version;
    if (!r || !specCv) return;
    rect = drawSpec(specCv, {
      res: r, verdict: app.verdict, img, lut: app.lut, dbFloor: app.dbFloor, markers: app.markers,
      playhead: player.ready && (player.started || !player.paused) ? player.time : null, hover,
    });
    if (app.liveOn && liveCv) player.live.draw(liveCv, rect.r, !!player.url, app.verdict?.cut ?? null, app.markers, app.liveMode, app.lut);
  });

  $effect(() => {
    const ro = new ResizeObserver(() => size++);
    if (specBox) ro.observe(specBox);
    if (liveBox) ro.observe(liveBox);
    return () => ro.disconnect();
  });

  $effect(() => {
    player.setLive(app.liveOn);
    player.onFrame = ts => { if (app.liveOn) player.live.capture(ts, app.lut, app.dbFloor); };
    return () => { player.onFrame = null; };
  });

  function inPlot(e: PointerEvent) {
    if (!rect || !specCv) return null;
    const b = specCv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    return { x, y, inside: x >= rect.l && x <= rect.l + rect.pw && y >= rect.t && y <= rect.t + rect.ph };
  }
  function onMove(e: PointerEvent) {
    const p = inPlot(e), r = app.res, R = rect;
    if (!p || !r || !R) return;
    if (!p.inside) { hover = null; return; }
    const t = (p.x - R.l) / R.pw * r.duration, f = (1 - (p.y - R.t) / R.ph) * r.sr / 2;
    const col = Math.min(r.cols - 1, Math.floor((p.x - R.l) / R.pw * r.cols)), row = Math.min(r.rows - 1, Math.max(0, Math.floor(f / (r.sr / 2) * r.rows)));
    const db = r.spec[col * r.rows + row];
    readout = fmtTime(t, true) + '  ·  ' + (f / 1000).toFixed(2) + ' kHz  ·  ' + (db < -199 ? '−∞ dB' : (db < 0 ? '−' : '') + Math.abs(db).toFixed(1) + ' dB');
    hover = { x: p.x, y: p.y };
  }
  function onDown(e: PointerEvent) {
    const r = app.res, R = rect;
    if (!r || !R || !specCv) return;
    const x = e.clientX - specCv.getBoundingClientRect().left;
    if (x < R.l || x > R.l + R.pw) return;
    player.seek((x - R.l) / R.pw * r.duration, true);
  }
</script>

<section class="panel spec-panel" aria-label="Spectrogram">
  <div class="panel-head">
    <h3>Spectrogram</h3>
    <div class="controls">
      <label for="db-floor">Floor <input type="range" id="db-floor" min="-170" max="-60" step="5" bind:value={app.dbFloor}> <span id="db-floor-val" class="mono">{fmtDb(app.dbFloor)}</span></label>
      <label for="palette">Colors
        <select id="palette" value={app.palette} onchange={e => app.setPalette((e.currentTarget as HTMLSelectElement).value as PaletteName)}>
          <option value="spek">Spek</option>
          <option value="inferno">Inferno</option>
          <option value="ice">Ice</option>
          <option value="gray">Grayscale</option>
        </select>
      </label>
      <label for="markers"><input type="checkbox" id="markers" bind:checked={app.markers}> Reference lines</label>
      <label for="live-toggle"><input type="checkbox" id="live-toggle" checked={app.liveOn} onchange={e => app.setLive((e.currentTarget as HTMLInputElement).checked)}> Live view</label>
    </div>
  </div>
  <div class="panel-body">
    <PlayerBar {readout} />
    <StemsBar />
    <div class="canvas-box" id="spec-box" bind:this={specBox}>
      <canvas id="spec" bind:this={specCv} aria-label="Spectrogram: time on the horizontal axis, frequency on the vertical axis, level as color"
        onpointermove={onMove} onpointerleave={() => (hover = null)} onpointerdown={onDown}></canvas>
    </div>
    {#if app.liveOn}
      <div class="live" id="live-wrap">
        <div class="live-head">
          <span class="label">Live</span>
          <span class="seg live-mode" role="radiogroup" aria-label="Live view style">
            <button type="button" role="radio" id="live-scroll" aria-checked={app.liveMode === 'scroll'} onclick={() => app.setLiveMode('scroll')}>Scrolling</button>
            <button type="button" role="radio" id="live-3d" aria-checked={app.liveMode === '3d'} onclick={() => app.setLiveMode('3d')}>3D</button>
          </span>
          <span class="readout" id="live-note">{app.liveMode === '3d' ? 'Recent spectra running into the distance; frequency across on a log scale, level as height.' : player.live.note}</span>
        </div>
        <div class="canvas-box" id="live-box" class:tall={app.liveMode === '3d'} bind:this={liveBox}><canvas id="live" bind:this={liveCv} aria-label={app.liveMode === '3d' ? 'Live 3D spectrum of the audio currently playing' : 'Live spectrogram of the audio currently playing'}></canvas></div>
      </div>
    {/if}
  </div>
</section>
