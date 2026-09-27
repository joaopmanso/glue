<script lang="ts">
  /* The open player (ADR 0068): the visualiser, or the song, on the left; the queue on the right.
     - Queue: what's playing, "Next up" (queued: drag to reorder, × to remove, drop songs or playlists on
       it), "Next from …" (the rest of the list it was started from), and what played before. Double-click
       plays a song now; right-click has the song's menu with Play now and Remove from the queue.
     - Visualiser: festanqueiro/threejs-visualisers (lib/visualiser): a theme and its options, full screen
       (F or double-click), ← → or 1–9 switch themes. */
  import { untrack } from 'svelte';
  import { lib } from '../../lib/library.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { viz } from '../../lib/visualiser.svelte';
  import { drag } from '../../lib/drag.svelte';
  import { menu } from '../../lib/menu.svelte';
  import { trackMenu } from '../../lib/trackMenu';
  import { app } from '../../lib/app.svelte';
  import { bpmShown, fmtBpm } from '../../lib/bpm';
  import { keyLabel } from '../../core/audio/keys';
  import { fmtTime } from '../../core/format';
  import { readPref, writePref } from '../../lib/prefs';

  const SHOWN = 100;
  // Its height: dragged on its top edge (remembered); half the window at first.
  const maxH = () => Math.max(240, innerHeight - 64 - 120);
  let h = $state(Math.min(maxH(), Math.max(240, +readPref('playerHeight', '0') || Math.round(innerHeight * 0.5))));
  let sizing = $state(false);
  function startSize(e: PointerEvent) {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement, y0 = e.clientY, h0 = h;
    el.setPointerCapture(e.pointerId); sizing = true;
    const move = (m: PointerEvent) => { h = Math.min(maxH(), Math.max(240, h0 + y0 - m.clientY)); };
    const up = () => { sizing = false; el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); writePref('playerHeight', String(Math.round(h))); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  }
  const q = $derived(nowPlaying.q);
  const tr = (id: string, _v: number) => lib.store?.tracks.get(id) ?? null;
  const t = $derived(nowPlaying.track);
  const a = $derived.by(() => { void lib.version; return t ? lib.store?.analysis.get(t.id) ?? null : null; });
  const played = $derived(q.played.slice(-20).reverse());

  let wrap = $state<HTMLDivElement>(), stage = $state<HTMLDivElement>();
  $effect(() => {
    const el = stage;
    if (!viz.on || !el) return;
    untrack(() => void viz.mount(el));
    return () => viz.unmount();
  });
  let full = $state(false);
  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrap?.requestFullscreen().catch(e => (lib.notice = 'Full screen isn’t allowed here: ' + (e as Error).message));
  }
  function stageKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('select, button')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); viz.step(e.key === 'ArrowRight' ? 1 : -1); }
    else if (/^[1-9]$/.test(e.key) && viz.themes[+e.key - 1]) viz.setTheme(viz.themes[+e.key - 1].id);
    else if (e.key === 'f' || e.key === 'F') fullscreen();
  }

  // Dragging songs in and around Next up (the drag system's "queue" target, ADR 0068).
  const dropOn = $derived(drag.active && drag.target?.type === 'queue' ? drag.target : null);
  const lastOf = (which: 'upNext' | 'later') => (which === 'upNext' ? q.upNext.length : Math.min(q.later.length, SHOWN)) - 1;
  let showPlayed = $state(false);
  function press(e: PointerEvent, id: string) {
    if ((e.target as HTMLElement).closest('button')) return;
    const x = tr(id, lib.version);
    drag.begin(e, { kind: 'tracks', ids: [id], label: x?.title || x?.fileName || '1 song' });
  }
  function playRow(which: 'now' | 'upNext' | 'later' | 'played', i: number, id: string) {
    if (which === 'upNext' || which === 'later') nowPlaying.jumpTo(which, i);
    else if (which === 'played') void nowPlaying.play(id);
    else nowPlaying.toggle();
  }
</script>

<svelte:document onfullscreenchange={() => (full = !!document.fullscreenElement)} />

{#snippet row(id: string, which: 'now' | 'upNext' | 'later' | 'played', i: number)}
  {@const x = tr(id, lib.version)}
  {#if x}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <li class="qr" class:now={which === 'now'} class:dim={x.status !== 'linked'} data-q={which} data-id={id}
      class:drop-before={dropOn?.which === which && dropOn.index === i} class:drop-after={(which === 'upNext' || which === 'later') && dropOn?.which === which && dropOn.index === i + 1 && i === lastOf(which)}
      data-drop={which === 'upNext' || which === 'later' ? 'queue' : undefined} data-which={which} data-index={which === 'upNext' || which === 'later' ? i : undefined}
      onpointerdown={e => { if (which !== 'now') press(e, id); }} ondblclick={() => { if (!drag.suppressClick) playRow(which, i, id); }}
      oncontextmenu={e => menu.context(e, () => trackMenu([id], which === 'upNext' || which === 'later' ? { inQueue: { which, index: i } } : {}), 'Song')}>
      <span class="qgrip" aria-hidden="true">{which === 'upNext' || which === 'later' ? '⠿' : ''}</span>
      <span class="qn">{#if which === 'now'}<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>{:else if which === 'played'}↺{:else}{i + 1}{/if}</span>
      <span class="qt"><b>{x.title || x.fileName}</b><small>{x.artist}</small></span>
      <span class="qd mono">{x.duration ? fmtTime(x.duration) : ''}</span>
      {#if which === 'upNext' || which === 'later'}
        <button type="button" class="qx" aria-label="Remove from the queue" title="Remove from the queue" onclick={() => nowPlaying.dequeue(which, i)}>×</button>
      {:else}<span></span>{/if}
    </li>
  {/if}
{/snippet}

<section class="pp" id="player-panel" aria-label="Player" style:height={h + 'px'}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="sizer" class:on={sizing} role="separator" aria-orientation="horizontal" aria-label="Player height" title="Drag to make the player taller or shorter" onpointerdown={startSize}></div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
  <div class="stagewrap" class:full bind:this={wrap} tabindex="0" onkeydown={stageKey} ondblclick={e => { if (viz.on && !(e.target as HTMLElement).closest('.vctl')) fullscreen(); }}>
    {#if viz.on}
      <div class="stage" bind:this={stage}></div>
      <div class="vctl">
        <select aria-label="Visualiser" id="viz-theme" value={viz.theme} onchange={e => viz.setTheme(e.currentTarget.value)}>
          {#each viz.themes as th, i (th.id)}<option value={th.id}>{i + 1}. {th.name}</option>{/each}
        </select>
        {#each viz.current?.options ?? [] as o (o.id)}
          <label class="vopt">{o.name}
            <select value={viz.value(o.id)} onchange={e => viz.setOption(o.id, e.currentTarget.value)}>
              {#each o.values as v (v.id)}<option value={v.id}>{v.name}</option>{/each}
            </select>
          </label>
        {/each}
        <span class="grow"></span>
        <button type="button" class="vb" id="viz-full" title="Full screen (F, or double-click)" onclick={fullscreen}>{full ? 'Exit full screen' : 'Full screen'}</button>
        <button type="button" class="vb" id="viz-off" title="Hide the visualiser" onclick={() => viz.show(false)}>Hide</button>
      </div>
      {#if viz.loading}<p class="vnote">Loading the visualiser…</p>{:else if viz.error}<p class="vnote err">{viz.error}</p>{:else if !t}<p class="vnote">It moves with the music: play something.</p>{/if}
    {:else}
      <div class="song">
        {#if t}
          <p class="label">Now playing</p>
          <h2>{t.title || t.fileName}</h2>
          <p class="artist">{t.artist}{#if t.album}<span> · {t.album}</span>{/if}</p>
          <p class="facts mono">
            {#if bpmShown(t, a)}<span>{fmtBpm(bpmShown(t, a)!)} BPM</span>{/if}
            {#if a?.key}<span>{keyLabel(a.key, app.keyNotation)}</span>{/if}
            {#if a && !a.error}<span class="qb" data-grade={a.grade}>{a.label}</span>{/if}
          </p>
          {#if q.from}<p class="from">Playing from <b>{q.from}</b></p>{/if}
        {:else}
          <h2 class="none">Nothing playing</h2>
        {/if}
        <button type="button" class="btn" id="viz-on" onclick={() => viz.show(true)}>Show the visualiser</button>
      </div>
    {/if}
  </div>

  <div class="queue" id="player-queue">
    <div class="qhead">
      <h3>Queue</h3>
      <span class="qsum">{q.upNext.length + q.later.length} to come</span>
    </div>
    <div class="qscroll">
      {#if t}<ul class="qlist">{@render row(t.id, 'now', 0)}</ul>{/if}

      <div class="qsec">
        <h4>Next up{#if q.upNext.length}<small>{q.upNext.length}</small>{/if}</h4>
        {#if q.upNext.length}<button type="button" class="qclear" id="clear-upnext" onclick={() => nowPlaying.clearQueue('upNext')}>Clear</button>{/if}
      </div>
      {#if q.upNext.length}
        <ul class="qlist" id="up-next">{#each q.upNext as id, i (id + ':' + i)}{@render row(id, 'upNext', i)}{/each}</ul>
      {/if}
      <div class="qdrop" class:hot={!!dropOn && dropOn.index === null} data-drop="queue" data-which="upNext">{q.upNext.length ? 'Drop here to queue at the end' : 'Nothing queued. Drag songs or playlists here, or right-click › Add to queue.'}</div>

      {#if q.later.length}
        <div class="qsec">
          <h4>Next from {q.from || 'the list'}<small>{q.later.length}</small></h4>
          <button type="button" class="qclear" id="clear-later" onclick={() => nowPlaying.clearQueue('later')}>Clear</button>
        </div>
        <ul class="qlist" id="next-from">{#each q.later.slice(0, SHOWN) as id, i (id + ':' + i)}{@render row(id, 'later', i)}{/each}</ul>
        {#if q.later.length > SHOWN}<p class="qmore">…and {q.later.length - SHOWN} more</p>{/if}
      {/if}

      {#if played.length}
        <div class="qsec">
          <button type="button" class="qtoggle" id="show-played" aria-expanded={showPlayed} onclick={() => (showPlayed = !showPlayed)}><span aria-hidden="true">{showPlayed ? '▾' : '▸'}</span> Played before<small>{q.played.length}</small></button>
          <button type="button" class="qclear" id="clear-played" title="Forget what played (Previous then restarts the song)" onclick={() => nowPlaying.clearQueue('played')}>Clear</button>
        </div>
        {#if showPlayed}<ul class="qlist" id="played-before">{#each played as id, i (id + ':' + i)}{@render row(id, 'played', i)}{/each}</ul>{/if}
      {/if}
    </div>
  </div>
</section>

<style>
  .pp { position: fixed; left: 0; right: 0; bottom: 64px; z-index: 19; display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 420px); background: var(--surface); border-top: 1px solid var(--line); box-shadow: 0 -18px 44px rgb(0 0 0 / .45); animation: rise .18s ease-out; }
  .sizer { position: absolute; left: 0; right: 0; top: -4px; height: 8px; cursor: ns-resize; z-index: 3; touch-action: none; }
  .sizer::after { content: ''; position: absolute; left: 50%; top: 2px; width: 44px; height: 4px; margin-left: -22px; border-radius: 2px; background: var(--line-2); transition: background .12s; }
  .sizer:hover::after, .sizer.on::after { background: var(--accent); }
  @keyframes rise { from { transform: translateY(24px); opacity: 0; } }
  .stagewrap { position: relative; min-width: 0; min-height: 0; overflow: hidden; background: #000; outline: none; }
  .stagewrap.full { background: #000; }
  .stage { position: absolute; inset: 0; }
  .vctl { position: absolute; left: 0; right: 0; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 12px; background: linear-gradient(rgb(0 0 0 / .55), transparent); opacity: .25; transition: opacity .2s; color: #eee; font-size: 12.5px; }
  .stagewrap:hover .vctl, .stagewrap:focus-within .vctl, .stagewrap:not(.full) .vctl:focus-within { opacity: 1; }
  .vctl select { background: rgb(0 0 0 / .55); color: #eee; border: 1px solid rgb(255 255 255 / .25); border-radius: 5px; padding: 3px 6px; font-size: 12.5px; }
  .vopt { display: inline-flex; gap: 6px; align-items: center; }
  .grow { flex: 1; }
  .vb { background: rgb(0 0 0 / .55); color: #eee; border: 1px solid rgb(255 255 255 / .25); border-radius: 5px; padding: 3px 10px; cursor: pointer; font-size: 12.5px; }
  .vb:hover { border-color: var(--accent); color: var(--accent); }
  .vnote { position: absolute; left: 0; right: 0; bottom: 18px; text-align: center; color: rgb(255 255 255 / .7); font-size: 13px; margin: 0; z-index: 2; }
  .vnote.err { color: var(--warn); }
  .song { height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 8px; padding: 0 clamp(20px, 5vw, 64px); background: radial-gradient(ellipse at 20% 30%, color-mix(in srgb, var(--accent) 16%, var(--surface)), var(--ground) 70%); }
  .song h2 { font-size: clamp(24px, 3.2vw, 42px); line-height: 1.1; margin: 0; color: var(--ink); }
  .song h2.none { color: var(--muted); }
  .song .artist { font-size: 17px; color: var(--ink-2); margin: 0; }
  .song .artist span { color: var(--muted); }
  .facts { display: flex; gap: 14px; align-items: center; color: var(--ink-2); font-size: 13px; margin: 4px 0; }
  .qb { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; padding: 1px 6px; border-radius: 3px; border: 1px solid currentColor; }
  .qb[data-grade="ok"] { color: var(--ok); } .qb[data-grade="warn"] { color: var(--warn); } .qb[data-grade="bad"] { color: var(--bad); } .qb[data-grade="info"] { color: var(--muted); }
  .from { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
  .from b { color: var(--ink-2); font-weight: 600; }
  .queue { display: flex; flex-direction: column; min-height: 0; border-left: 1px solid var(--line); }
  .qhead { display: flex; align-items: baseline; justify-content: space-between; padding: 14px 16px 8px; }
  .qhead h3 { margin: 0; font-size: 15px; }
  .qsum { color: var(--muted); font-size: 12px; }
  .qscroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px 14px; }
  .qsec { display: flex; justify-content: space-between; align-items: center; padding: 12px 8px 4px; }
  .qsec h4 { margin: 0; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qsec h4 small { margin-left: 8px; font-family: var(--font-mono); letter-spacing: 0; }
  .qclear { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 11.5px; padding: 1px 8px; cursor: pointer; flex: none; }
  .qclear:hover { color: var(--accent); border-color: var(--accent); }
  .qlist { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
  .qr { position: relative; display: grid; grid-template-columns: 10px 22px minmax(0, 1fr) auto 22px; gap: 8px; align-items: center; padding: 5px 6px; border-radius: 5px; cursor: default; user-select: none; }
  .qr:hover { background: var(--raised); }
  .qr.now { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .qr.now .qt b, .qr.now .qn { color: var(--accent); }
  .qr.dim .qt b { color: var(--muted); }
  .qr.drop-before { box-shadow: inset 0 2px 0 var(--accent); }
  .qr.drop-after { box-shadow: inset 0 -2px 0 var(--accent); }
  .qn { color: var(--muted); font: 11.5px var(--font-mono); text-align: right; display: grid; justify-items: end; }
  .qn svg { width: 10px; height: 10px; }
  .qt { display: grid; min-width: 0; line-height: 1.25; }
  .qt b { font-weight: 550; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
  .qt small { color: var(--muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qd { color: var(--muted); font-size: 11.5px; }
  .qx { background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 15px; line-height: 1; border-radius: 4px; opacity: 0; width: 22px; height: 22px; }
  .qr:hover .qx, .qx:focus-visible { opacity: 1; }
  .qx:hover { color: var(--bad); background: var(--surface); }
  .qdrop { margin: 6px 6px 0; padding: 10px; border: 1px dashed var(--line-2); border-radius: 6px; color: var(--muted); font-size: 12px; text-align: center; }
  .qdrop.hot { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .qmore { color: var(--muted); font-size: 12px; padding: 6px 8px; margin: 0; }
  .qgrip { color: var(--muted); font-size: 11px; opacity: 0; cursor: grab; }
  .qr:hover .qgrip { opacity: .8; }
  .qtoggle { background: none; border: 0; padding: 0; cursor: pointer; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
  .qtoggle:hover { color: var(--ink); }
  .qtoggle small { margin-left: 8px; font-family: var(--font-mono); letter-spacing: 0; }
  @media (max-width: 800px) { .pp { grid-template-columns: 1fr; grid-template-rows: 40% 60%; } .queue { border-left: 0; border-top: 1px solid var(--line); } }
</style>
