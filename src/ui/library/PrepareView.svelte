<script lang="ts">
  /* The Prepare tab (ADR 0052): the track's waveform with its beat grid, a player with tempo and key
     lock, a metronome, and the grid's corrections (saved on the track, overriding the analysis). */
  import { untrack } from 'svelte';
  import { lib } from '../../lib/library.svelte';
  import { player } from '../../lib/player.svelte';
  import { app } from '../../lib/app.svelte';
  import { prepare } from '../../lib/prepare.svelte';
  import { metronome } from '../../lib/metronome.svelte';
  import { playable } from '../../lib/nowPlaying.svelte';
  import { readPref, writePref } from '../../lib/prefs';
  import { fitCanvas } from '../render/canvas';
  import { drawWave, SCHEMES, type Scheme } from '../render/wave';
  import { fmtTime } from '../../core/format';
  import { fmtBpm, shownBpm } from '../../core/library/bpm';
  import type { Track } from '../../store/types';

  let { track }: { track: Track } = $props();
  const key = $derived('track:' + track.id);
  const mine = $derived(!track.remote);

  let scheme = $state<Scheme>((readPref('prepScheme', 'rgb') as Scheme));
  let span = $state(+readPref('prepSpan', '8') || 8);         // seconds in the deck view
  let range = $state(+readPref('prepRange', '8') || 8);       // the tempo fader's range (%)
  let show3d = $state(readPref('prep3d', '0') === '1');
  let pct = $state(0);                                        // tempo fader position (%)
  let message = $state('');
  $effect(() => { writePref('prepScheme', scheme); writePref('prepSpan', String(span)); writePref('prepRange', String(range)); writePref('prep3d', show3d ? '1' : '0'); });

  const grid = $derived.by(() => { void lib.version; void prepare.wave; return prepare.grid(lib.store?.tracks.get(track.id) ?? track); });
  const analysed = $derived.by(() => { void lib.version; return lib.store?.analysis.get(track.id)?.bpm ?? null; });
  const corrected = $derived(track.prep?.bpm != null || track.prep?.beat0 != null);
  const rangeName = $derived(lib.profile?.bpmRange);
  const shown = $derived(grid ? shownBpm(grid.bpm, rangeName, track.prep?.flip) : null);
  const other = $derived(grid ? shownBpm(grid.bpm, rangeName, !track.prep?.flip) : null);
  const here = $derived(player.sourceKey === key);
  const t = $derived(here ? player.time : 0);

  // The waveform, and this track in the player (unless it's already there).
  $effect(() => {
    const tr = untrack(() => track);
    if (tr.remote) return;
    void prepare.open(tr);
    untrack(() => {
      if (player.sourceKey === key) return;
      void lib.fileFor(tr).then(async f => { if (player.sourceKey !== key) player.setSource(await playable(f), { key, duration: tr.duration ?? undefined }); })
        .catch(e => { message = (e as Error).message; });
    });
  });
  // Leaving the tab: normal speed, no metronome, the live view back as the Details tab has it.
  $effect(() => () => { metronome.stop(); player.setRate(1); player.onFrame = null; player.setLive(app.liveOn); });

  function setTempo(p: number) { pct = Math.max(-range, Math.min(range, p)); player.setRate(1 + pct / 100); }
  function toggle() { if (!here) return; player.toggle(); }

  // ─── Drawing ────────────────────────────────────────────────────────────────
  let deck = $state<HTMLCanvasElement>(), over = $state<HTMLCanvasElement>(), cv3d = $state<HTMLCanvasElement>();
  let size = $state(0);
  $effect(() => { const ro = new ResizeObserver(() => size++); if (deck) ro.observe(deck); if (over) ro.observe(over); return () => ro.disconnect(); });
  // The overview only changes with the waveform, scheme, grid or size: drawn once to an image.
  let overImg: HTMLCanvasElement | null = null;
  $effect(() => {
    const w = prepare.wave, g = grid, sc = scheme; void size;
    if (!over || !w) return;
    const { w: W, h: H } = fitCanvas(over), dpr = Math.min(2, window.devicePixelRatio || 1);
    overImg ??= document.createElement('canvas');
    overImg.width = Math.round(W * dpr); overImg.height = Math.round(H * dpr);
    const c = overImg.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWave(c, W, H, w, { scheme: sc, t0: 0, t1: w.duration, grid: g, playhead: null });
  });
  $effect(() => {
    const w = prepare.wave, g = grid, sc = scheme, s = span, now = t; void size; void player.frame; void overImg;
    if (deck) { const { ctx, w: W, h: H } = fitCanvas(deck); drawWave(ctx, W, H, w, { scheme: sc, t0: now - s / 2, t1: now + s / 2, grid: g, playhead: now, numbers: true }); }
    if (over && w && overImg) {
      const { ctx, w: W, h: H } = fitCanvas(over);
      ctx.clearRect(0, 0, W, H); ctx.drawImage(overImg, 0, 0, W, H);
      const x0 = (now - s / 2) / w.duration * W, x1 = (now + s / 2) / w.duration * W;
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x0, 0, x1 - x0, H);
      ctx.fillStyle = '#ff3b3b'; ctx.fillRect(Math.round(now / w.duration * W), 0, 2, H);
    }
  });
  // 3D: the live view's ridges (captured while this tab shows them).
  $effect(() => {
    if (!show3d) { player.onFrame = null; return; }
    player.setLive(true);
    player.onFrame = ts => { if (!player.pending) player.live.capture(ts, app.lut, app.dbFloor); };
    return () => { player.onFrame = null; };
  });
  $effect(() => {
    void player.frame; void size;
    if (show3d && cv3d) player.live.draw(cv3d, 0, !!player.url, app.verdict?.cut ?? null, false, '3d', app.lut);
  });

  // Click or drag on the deck view scrubs; on the overview, jumps.
  let drag: { x: number; t: number } | null = null;
  function deckDown(e: PointerEvent) { if (!here) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag = { x: e.clientX, t: player.time }; }
  function deckMove(e: PointerEvent) {
    if (!drag || !deck) return;
    const W = deck.getBoundingClientRect().width;
    player.seek(Math.max(0, drag.t - (e.clientX - drag.x) / W * span));
  }
  function deckUp() { drag = null; }
  function overClick(e: MouseEvent) {
    const w = prepare.wave; if (!w || !here) return;
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    player.seek((e.clientX - b.left) / b.width * w.duration);
  }
  function wheel(e: WheelEvent) { e.preventDefault(); const z = [2, 4, 8, 16, 32]; const i = z.indexOf(span); span = z[Math.max(0, Math.min(z.length - 1, (i < 0 ? 2 : i) + (e.deltaY > 0 ? 1 : -1)))]; }

  // ─── Keys: Space plays, T taps, M metronome, ← → nudge the grid ─────────────
  function onKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if (el.closest('input, textarea, select, [contenteditable]')) return;
    const tr = lib.store?.tracks.get(track.id); if (!tr) return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.key === 't' || e.key === 'T') { if (mine) prepare.tap(tr, player.rate); }
    else if (e.key === 'm' || e.key === 'M') metronome.toggle(() => prepare.grid(lib.store?.tracks.get(track.id)));
    else if (mine && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); prepare.nudge(tr, (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 0.001 : 0.005)); }
  }
  const cur = () => lib.store?.tracks.get(track.id) ?? track;
  let bpmText = $state('');
  $effect(() => { bpmText = grid ? grid.bpm.toFixed(2) : ''; });
</script>

<svelte:window onkeydown={onKey} />

<div class="prep" id="prepare">
  {#if track.remote}
    <p class="notice">This track is on <b>{track.remote.name}</b>. Prepare it on that computer: its grid and cues are saved there and come here by the sync.</p>
  {:else}
    <div class="ptop">
      <button type="button" class="play" id="prep-play" aria-label={player.paused || !here ? 'Play' : 'Pause'} disabled={!here} onclick={toggle}>
        {#if player.paused || !here}<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>
        {:else}<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 1.5h3.2v11H2.5zM8.3 1.5h3.2v11H8.3z" fill="currentColor"/></svg>{/if}
      </button>
      <span class="mono time">{fmtTime(t)} / {fmtTime(prepare.wave?.duration ?? track.duration ?? 0)}</span>
      <span class="bpmbig" id="prep-bpm" title="The BPM in use, at the current playback speed">
        {grid ? (grid.bpm * player.rate).toFixed(2) : '—'}<small>BPM{player.rate !== 1 ? ' at ' + (pct > 0 ? '+' : '') + pct.toFixed(1) + '%' : ''}</small>
      </span>
      <button type="button" class="tgl" class:on={metronome.on} id="prep-metronome" title="Metronome on the grid (M)" onclick={() => metronome.toggle(() => prepare.grid(lib.store?.tracks.get(track.id)))}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 1.5h5l2.5 13h-10zM8 11 12 3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>Metronome</button>
      <input type="range" min="0" max="1" step="0.05" bind:value={metronome.volume} aria-label="Metronome volume" class="mvol">
      <span class="tempo">
        <label for="prep-tempo">Tempo</label>
        <input type="range" id="prep-tempo" min={-range} max={range} step="0.05" value={pct} oninput={e => setTempo(+e.currentTarget.value)} ondblclick={() => setTempo(0)} title="Double-click: back to 0">
        <select aria-label="Tempo range" bind:value={range} onchange={() => setTempo(pct)}>{#each [8, 16, 50] as r (r)}<option value={r}>±{r}%</option>{/each}</select>
        <label class="kl"><input type="checkbox" checked={player.keyLock} onchange={e => player.setRate(player.rate, e.currentTarget.checked)}> Key lock</label>
        {#if pct}<button type="button" class="mini" onclick={() => setTempo(0)}>0%</button>{/if}
      </span>
    </div>

    <div class="deckwrap">
      <canvas class="deck" id="prep-deck" bind:this={deck} onpointerdown={deckDown} onpointermove={deckMove} onpointerup={deckUp} onwheel={wheel}></canvas>
      {#if prepare.status === 'loading'}<p class="over-msg"><span class="spin"></span>Drawing the waveform…</p>
      {:else if prepare.status === 'error'}<p class="over-msg err">Couldn’t read the track: {prepare.error}</p>{/if}
      <div class="dtools">
        <select aria-label="Waveform colours" id="prep-scheme" bind:value={scheme}>{#each SCHEMES as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select>
        <button type="button" class="mini" title="Zoom in (wheel)" onclick={() => (span = Math.max(2, span / 2))}>+</button>
        <button type="button" class="mini" title="Zoom out (wheel)" onclick={() => (span = Math.min(32, span * 2))}>−</button>
        <label class="kl"><input type="checkbox" bind:checked={show3d}> 3D</label>
      </div>
    </div>
    <canvas class="overview" id="prep-overview" bind:this={over} onclick={overClick}></canvas>

    <section class="grid" aria-label="Tempo and beat grid">
      <div class="grp">
        <span class="k">BPM</span>
        <input class="mono bpmin" id="prep-bpm-input" inputmode="decimal" bind:value={bpmText} onchange={() => { const v = +bpmText.replace(',', '.'); if (v) prepare.setBpm(cur(), v); }}>
        <button type="button" class="mini" title="−0.01 (shift: −0.1)" onclick={e => grid && prepare.setBpm(cur(), grid.bpm - (e.shiftKey ? 0.1 : 0.01))}>−</button>
        <button type="button" class="mini" title="+0.01 (shift: +0.1)" onclick={e => grid && prepare.setBpm(cur(), grid.bpm + (e.shiftKey ? 0.1 : 0.01))}>+</button>
        <button type="button" class="mini" id="prep-half" onclick={() => grid && prepare.setBpm(cur(), grid.bpm / 2)}>÷2</button>
        <button type="button" class="mini" id="prep-double" onclick={() => grid && prepare.setBpm(cur(), grid.bpm * 2)}>×2</button>
        <button type="button" class="mini" id="prep-tap" title="Tap along (T)" onclick={() => prepare.tap(cur(), player.rate)}>Tap</button>
      </div>
      <div class="grp">
        <span class="k">Grid</span>
        <button type="button" class="mini" id="prep-earlier" title="Earlier by 5 ms (←, shift: 1 ms)" onclick={e => prepare.nudge(cur(), e.shiftKey ? -0.001 : -0.005)}>◀</button>
        <button type="button" class="mini" id="prep-later" title="Later by 5 ms (→, shift: 1 ms)" onclick={e => prepare.nudge(cur(), e.shiftKey ? 0.001 : 0.005)}>▶</button>
        <button type="button" class="mini" id="prep-beat1" title="Make the playhead the first beat of a bar" disabled={!here} onclick={() => prepare.beatHere(cur(), player.time)}>Beat 1 here</button>
        <button type="button" class="mini" title="Place the grid on the audio again for this BPM" onclick={() => prepare.replace(cur())}>Place again</button>
      </div>
      <div class="grp">
        <span class="k">Shown as</span>
        <label class="kl" title="How this track's BPM shows in the library">
          <input type="checkbox" id="prep-flip" checked={!!track.prep?.flip} onchange={() => prepare.flip(cur())}>
          {other ? fmtBpm(other) : '—'} instead of {shown ? fmtBpm(shown) : '—'}
        </label>
      </div>
      <div class="grp end">
        {#if corrected}
          <span class="note">Your correction{analysed ? ' (analysis: ' + fmtBpm(analysed) + ')' : ''}</span>
          <button type="button" class="mini" id="prep-reset" onclick={() => prepare.reset(cur())}>Reset to analysis</button>
        {:else}<span class="note">From the analysis</span>{/if}
      </div>
    </section>
    {#if show3d}<canvas class="c3d" bind:this={cv3d}></canvas>{/if}
    {#if message}<p class="err">{message}</p>{/if}
    <p class="fine">Space plays · M metronome · T tap · ← → nudge the grid (shift: 1 ms) · wheel on the waveform zooms · drag it to scrub.</p>
  {/if}
</div>

<style>
  .prep { display: grid; gap: 10px; }
  .ptop { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; }
  .play { width: 38px; height: 38px; border-radius: 50%; border: 0; background: var(--accent); color: var(--accent-ink); display: grid; place-items: center; cursor: pointer; }
  .play:disabled { opacity: .4; cursor: default; }
  .play svg { width: 14px; height: 14px; }
  .time { font-size: 13px; color: var(--ink-2); }
  .mono { font-family: var(--font-mono); }
  .bpmbig { font-family: var(--font-mono); font-size: 22px; font-weight: 600; display: inline-flex; align-items: baseline; gap: 6px; }
  .bpmbig small { font-size: 11px; color: var(--muted); font-weight: 400; letter-spacing: .06em; }
  .tgl { display: inline-flex; gap: 6px; align-items: center; background: none; border: 1px solid var(--line-2); border-radius: 5px; color: var(--ink-2); padding: 5px 10px; cursor: pointer; font-size: 12.5px; }
  .tgl svg { width: 14px; height: 14px; }
  .tgl.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .mvol { width: 70px; }
  .tempo { display: inline-flex; gap: 8px; align-items: center; margin-left: auto; font-size: 12.5px; color: var(--ink-2); }
  .tempo input[type=range] { width: 180px; }
  .kl { display: inline-flex; gap: 5px; align-items: center; font-size: 12.5px; color: var(--ink-2); white-space: nowrap; }
  select { background: var(--ground); border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink); font-size: 12px; padding: 2px 4px; }
  .deckwrap { position: relative; }
  .deck { width: 100%; height: 210px; display: block; border-radius: var(--radius); cursor: grab; touch-action: none; }
  .overview { width: 100%; height: 44px; display: block; border-radius: 4px; cursor: pointer; }
  .dtools { position: absolute; top: 6px; right: 8px; display: flex; gap: 6px; align-items: center; background: rgba(0,0,0,.55); border-radius: 5px; padding: 3px 6px; }
  .dtools .kl { color: #ddd; }
  .over-msg { position: absolute; inset: 0; display: flex; gap: 10px; align-items: center; justify-content: center; color: #ccc; font-size: 13px; margin: 0; }
  .over-msg.err, .err { color: var(--bad); }
  .spin { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--accent); border-right-color: transparent; animation: spin .9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .grid { display: flex; flex-wrap: wrap; gap: 10px 26px; align-items: center; border: 1px solid var(--line); background: var(--surface); border-radius: var(--radius); padding: 8px 12px; }
  .grp { display: inline-flex; gap: 6px; align-items: center; }
  .grp.end { margin-left: auto; }
  .k { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-right: 2px; }
  .bpmin { width: 78px; background: var(--ground); border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink); padding: 3px 6px; font-size: 13px; }
  .note { color: var(--muted); font-size: 12px; }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 3px 9px; cursor: pointer; white-space: nowrap; }
  .mini:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .mini:disabled { opacity: .4; cursor: default; }
  .c3d { width: 100%; height: 260px; display: block; border-radius: var(--radius); background: #000; }
  .fine { color: var(--muted); font-size: 12px; margin: 0; }
  .notice { background: color-mix(in srgb, var(--accent) 8%, var(--surface)); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); border-radius: var(--radius); padding: 10px 14px; font-size: 13.5px; }
</style>
