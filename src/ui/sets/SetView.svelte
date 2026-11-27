<script lang="ts">
  /* A playlist as a mix (ADR 0199, 0200, 0201): planned on the beat in a style, on 2 or 3 decks; heard as it's shaped
     (the preview runs the file's mixer); songs moved, trimmed and reordered by hand, with undo; each hand-over's style
     and length; exported as one file (WAV 24-bit or MP3 320) with its tracklist. */
  import { onDestroy } from 'svelte';
  import { lib } from '../../lib/library.svelte';
  import { app } from '../../lib/app.svelte';
  import { sets } from '../../lib/sets/set.svelte';
  import { setExport } from '../../lib/sets/export.svelte';
  import { preview } from '../../lib/sets/preview.svelte';
  import { viewHash } from '../../lib/view.svelte';
  import { keyLabel } from '../../core/audio/keys';
  import { tempoOf } from '../../core/sets/tempo';
  import { clock, timesOf, tracklist } from '../../core/sets/tracklist';
    import { MIX_RATE, type FxStyle, type SetStyle } from '../../core/sets/types';
  import SetLanes from './SetLanes.svelte';

  let { id }: { id: string } = $props();
  $effect(() => { void lib.version; if (lib.store) void sets.open(id); });
  onDestroy(() => { preview.close(); sets.close(); });

  const list = $derived.by(() => { void lib.version; return lib.store?.lists.get(id) ?? null; });
  const plan = $derived(sets.plan);
  const tm = $derived(plan ? tempoOf(plan) : null);
  const length = $derived.by(() => { if (!plan?.items.length || !tm) return 0; const l = plan.items[plan.items.length - 1]; return tm.time(l.start + l.beats); });
  const times = $derived(plan ? timesOf(plan) : []);
  const tr = (x: string) => lib.store?.tracks.get(x);
  const nameOf = (x: string) => ({ artist: tr(x)?.artist ?? '', title: tr(x)?.title || tr(x)?.fileName || '' });
  const text = $derived(plan ? tracklist(plan, nameOf) : '');
  /** The playlist's songs that can't be planned (no tempo or length yet), and those left out to fit the length. */
  const plannable = $derived(list ? list.items.filter(x => { const t = tr(x); return !!t && !!sets.songOf(t); }) : []);
  const missing = $derived(list ? list.items.filter(x => tr(x)).length - plannable.length : 0);
  const leftOut = $derived(plan ? plannable.filter(x => !plan.items.some(i => i.id === x)).length : 0);

  // The preview follows the plan (a moment after the last change, so a drag isn't heard at every step).
  $effect(() => {
    const p = plan, n = Math.ceil((length + 3) * MIX_RATE);
    if (!p) return;
    const t = setTimeout(() => preview.setPlan(p, n), 120);
    return () => clearTimeout(t);
  });
  const now = $derived(preview.frame / MIX_RATE);
  /** The song playing at the playhead (the last one in). */
  const playingIdx = $derived.by(() => { let k = -1; times.forEach((t, i) => { if (t <= now + 0.01) k = i; }); return k; });

  const STYLES: [SetStyle, string, string][] = [['single', 'One at a time', 'An 8-bar blend between songs'], ['blend', 'Continuous', 'Long blends with a bass swap'], ['double', 'Double drops', 'Drops landing together where they fit']];
  const FXN: Record<FxStyle, string> = { blend: 'Blend', bassSwap: 'Bass swap', layer: 'Layer', filter: 'Filter sweep', echo: 'Echo out', cut: 'Cut', double: 'Double drop' };
  const fxName = (s: FxStyle | undefined) => FXN[s ?? 'blend'] ?? 'Blend';
  const LENGTHS: [number | null, string][] = [[null, 'No limit'], [1800, '30 min'], [2700, '45 min'], [3600, '1 hour'], [5400, '1 h 30'], [7200, '2 hours'], [10800, '3 hours']];

  /** The hand-over open on the timeline (after song `sel`), and the song selected there. */
  let sel = $state<number | null>(null), song = $state<number | null>(null);
  const fromSong = (i: number) => { if (tm && plan) void preview.play(Math.max(0, tm.time(plan.items[i].start)) * MIX_RATE); };

  // The running order: dragged into another order.
  let dragFrom = $state<number | null>(null), dragOver = $state<number | null>(null);
  function dropAt(to: number) { if (dragFrom != null && dragFrom !== to) { preview.pause(); sel = null; sets.reorder(dragFrom, to); } dragFrom = dragOver = null; }

  function key(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key === ' ' && !e.ctrlKey && !t.closest('button')) { e.preventDefault(); preview.toggle(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) sets.redo(); else sets.undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); sets.redo(); }
  }

  let copied = $state(false);
  async function copy() { try { await navigator.clipboard.writeText(text); copied = true; setTimeout(() => (copied = false), 1500); } catch { /* the page can't write the clipboard */ } }
  const pct = $derived(setExport.total ? Math.round(setExport.done / setExport.total * 100) : 0);
  const keyOf = (x: string) => { const k = lib.store?.analysis.get(x)?.key; return k ? keyLabel(k, app.keyNotation) : ''; };
</script>

<svelte:window onkeydown={key} />

<section class="setv" id="set-view" aria-labelledby="set-h">
  <header>
    <a class="back" href={viewHash({ kind: 'list', id })}>← {list?.name ?? 'Playlist'}</a>
    <h2 id="set-h">{list?.name ?? 'Set'} <small>as a mix</small></h2>
    {#if plan}<p class="meta mono" id="set-meta">{plan.items.length} songs · {clock(length)}{#if plan.length} (asked for {clock(plan.length)}){/if}{#if leftOut} · <span class="warnt" id="set-leftout">{leftOut} left out to fit</span>{/if}{#if plan.edited} · shaped by hand{/if}{#if missing} · <span class="warnt">{missing} without a tempo or a length yet, left out</span>{/if}{#if sets.drawing} · drawing waveforms {sets.drawing}{/if}</p>{/if}
  </header>

  {#if sets.status === 'planning'}<p class="hint" id="set-status">Planning the set… {sets.message}</p>
  {:else if sets.status === 'error'}<p class="warnt" id="set-status">{sets.message}</p>
  {:else if plan}
    <div class="tools" data-guide="set-controls">
      <div class="transport">
        <button type="button" class="play" id="set-play" class:on={preview.playing} aria-label={preview.playing ? 'Pause' : 'Play'} title="Play / pause (Space)" onclick={() => preview.toggle()}>
          {#if preview.playing}<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
          {:else}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>{/if}
        </button>
        <span class="time mono" id="set-time">{clock(now)} <i>/ {clock(length)}</i></span>
        {#if preview.loading}<span class="loading">{preview.by === 'home' ? 'GLUE Home is loading the songs…' : 'Loading songs…'}</span>{/if}
        {#if preview.by === 'home'}<span class="by" id="set-by" title="This computer's GLUE Home mixes the set and streams it here: no songs are copied into the browser">Mixed by GLUE Home</span>{/if}
        {#if playingIdx >= 0 && preview.playing}<span class="np">▶ {playingIdx + 1}. {nameOf(plan.items[playingIdx]?.id ?? '').title}</span>{/if}
      </div>
      <span class="seg three" role="radiogroup" aria-label="Style">
        {#each STYLES as [v, l, d] (v)}<button type="button" role="radio" id={'set-style-' + v} aria-checked={plan.style === v} title={d + (plan.edited ? ' (plans the set again: undo brings your changes back)' : '')} onclick={() => sets.replan({ style: v })}>{l}</button>{/each}
      </span>
      <span class="seg two" role="radiogroup" aria-label="Decks">
        {#each [2, 3] as n (n)}<button type="button" role="radio" id={'set-decks-' + n} aria-checked={plan.decks === n} onclick={() => sets.replan({ decks: n as 2 | 3 })}>{n} decks</button>{/each}
      </span>
      <label class="len">Length <select id="set-length" value={plan.length ?? ''} onchange={e => sets.replan({ length: e.currentTarget.value ? Number(e.currentTarget.value) : null })}>{#each LENGTHS as [v, l] (l)}<option value={v ?? ''}>{l}</option>{/each}</select></label>
      <label class="check"><input type="checkbox" id="set-fixed" checked={plan.tempo.mode === 'fixed'} onchange={e => sets.replan({ tempo: e.currentTarget.checked ? { mode: 'fixed', bpm: Math.round(plan.items[0]?.bpm ?? 124) } : { mode: 'songs' } })}> One tempo</label>
      {#if plan.tempo.mode === 'fixed'}<label>BPM <input type="number" id="set-bpm" min="60" max="200" value={plan.tempo.bpm} onchange={e => sets.replan({ tempo: { mode: 'fixed', bpm: Number(e.currentTarget.value) || 124 } })}></label>{/if}
      <label class="check"><input type="checkbox" id="set-keylock" checked={plan.items[0]?.keyLock ?? true} onchange={e => sets.replan({ keyLock: e.currentTarget.checked })}> Key lock</label>
      <span class="undo">
        <button type="button" class="ic" id="set-undo" disabled={!sets.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" onclick={() => sets.undo()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2"/></svg></button>
        <button type="button" class="ic" id="set-redo" disabled={!sets.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onclick={() => sets.redo()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5m5-5H9a5 5 0 0 0 0 10h2"/></svg></button>
      </span>
    </div>
    {#if preview.error}<p class="warnt small">{preview.error}</p>{/if}
    {#if preview.why}<p class="hint small">{preview.why}</p>{/if}

    <SetLanes {plan} waves={sets.waves} frame={preview.frame} playing={preview.playing} bind:sel bind:song onseek={f => preview.seek(f)} />

    <div class="cols">
      <section class="order" aria-label="Running order">
        <h3>Running order <small>drag to reorder: the set is planned again in that order</small></h3>
        <ol id="set-order">
          {#each plan.items as it, i (i)}
            <li class="song" class:playing={i === playingIdx && preview.playing} class:over={dragOver === i && dragFrom !== i} class:from={dragFrom === i} draggable="true"
              ondragstart={e => { dragFrom = i; e.dataTransfer?.setData('text/plain', String(i)); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; }}
              ondragover={e => { e.preventDefault(); dragOver = i; }} ondragleave={() => { if (dragOver === i) dragOver = null; }}
              ondrop={e => { e.preventDefault(); dropAt(i); }} ondragend={() => { dragFrom = dragOver = null; }}>
              <span class="grip" aria-hidden="true">⋮⋮</span>
              <span class="n mono">{i + 1}</span>
              <button type="button" class="t mono" title="Play from here" onclick={() => fromSong(i)}>{clock(times[i] ?? 0)}</button>
              <button type="button" class="who" class:on={song === i} title="Show it on the timeline" onclick={() => { song = song === i ? null : i; sel = null; }}><b>{nameOf(it.id).title}</b>{#if nameOf(it.id).artist}<i>{nameOf(it.id).artist}</i>{/if}</button>
              <span class="mono meta2">{Math.round(it.bpm * 10) / 10}{#if keyOf(it.id)} · {keyOf(it.id)}{/if}</span>
              <span class="deck mono">{['A', 'B', 'C'][it.deck]}</span>
            </li>
            {#if i < plan.items.length - 1}
              <li class="ho" id={'set-ho-' + i}><button type="button" class:on={sel === i} onclick={() => { sel = sel === i ? null : i; song = null; }}>{fxName(it.fx?.style)} · {Math.max(0, (it.start + it.beats - plan.items[i + 1].start) / 4)} bars</button></li>
            {/if}
          {/each}
        </ol>
      </section>
      <div class="side">
        <section class="export" data-guide="set-export" aria-label="Export">
          <h3>Export the mix</h3>
          {#if setExport.busy}
            <div class="prog" id="set-progress"><span style:width={pct + '%'}></span></div>
            <p class="mono small">{pct}%{#if setExport.left != null} · {clock(setExport.left)} left{/if} <button type="button" class="linkish" id="set-cancel" onclick={() => setExport.cancel()}>Cancel</button></p>
          {:else}
            <div class="ex-btns">
              <button type="button" class="btn" id="set-export-wav" onclick={() => list && void setExport.start(plan, list.name, 'wav')}>WAV <small>24-bit</small></button>
              <button type="button" class="btn-ghost" id="set-export-mp3" onclick={() => list && void setExport.start(plan, list.name, 'mp3')}>MP3 <small>320</small></button>
            </div>
            {#if setExport.result}<p class="ok small" id="set-done">Saved “{setExport.result}”{setExport.by === 'home' ? ', mixed by GLUE Home' : ''}.</p>{/if}
            {#if setExport.error}<p class="warnt small" id="set-error">{setExport.error}</p>{/if}
          {/if}
        </section>
        <section class="tl" aria-label="Tracklist">
          <h3>Tracklist <button type="button" class="linkish" id="set-copy" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button> <button type="button" class="linkish" onclick={() => list && setExport.saveTracklist(text, list.name)}>Save as text</button></h3>
          <pre id="set-tracklist">{text}</pre>
        </section>
      </div>
    </div>
  {/if}
</section>

<style>
  .setv { padding: 16px 22px 40px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-content: start; min-width: 0; }
  header { display: grid; gap: 2px; }
  .back { font-size: 12.5px; color: var(--muted); text-decoration: none; }
  .back:hover { color: var(--accent); }
  h2 { font-size: 22px; }
  h2 small { font-size: 14px; color: var(--muted); font-weight: 500; }
  h3 { font-size: 13px; color: var(--ink-2); font-weight: 650; margin: 0 0 8px; }
  h3 small { font-weight: 400; color: var(--muted); font-size: 11.5px; margin-left: 6px; }
  .meta, .hint { color: var(--muted); font-size: 12.5px; }
  .mono { font-family: var(--font-mono); }
  .warnt { color: var(--warn); }
  .ok { color: var(--ok); }
  .small { font-size: 12.5px; margin: 6px 0 0; }

  .tools { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; font-size: 13px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
  .tools label { display: flex; align-items: center; gap: 6px; color: var(--ink-2); }
  .tools input[type="number"] { width: 64px; background: var(--ground); border: 1px solid var(--line-2); border-radius: 5px; padding: 3px 6px; }
  .transport { display: flex; align-items: center; gap: 10px; margin-right: 6px; }
  .play { width: 38px; height: 38px; border-radius: 50%; border: 0; background: var(--accent); color: var(--accent-ink, #111); display: grid; place-items: center; cursor: pointer; transition: transform .1s, box-shadow .15s; }
  .play:hover { transform: scale(1.06); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent); }
  .play.on { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 30%, transparent); }
  .play svg { width: 20px; height: 20px; fill: currentColor; }
  .time { font-size: 15px; font-weight: 600; min-width: 128px; }
  .time i { font-style: normal; color: var(--muted); font-weight: 400; font-size: 12.5px; }
  .loading { font-size: 12px; color: var(--accent); animation: pulse 1s ease-in-out infinite alternate; }
  @keyframes pulse { from { opacity: .45; } to { opacity: 1; } }
  .by { font-size: 11px; font-weight: 600; color: var(--ok); border: 1px solid color-mix(in srgb, var(--ok) 45%, transparent); border-radius: 10px; padding: 1px 8px; }
  .np { font-size: 12px; color: var(--muted); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .seg.three { grid-template-columns: repeat(3, auto); }
  .seg.two { grid-template-columns: repeat(2, auto); }
  .undo { display: flex; gap: 4px; margin-left: auto; }
  .ic { width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--line-2); background: var(--ground); color: var(--ink-2); display: grid; place-items: center; cursor: pointer; }
  .ic:disabled { opacity: .35; cursor: default; }
  .ic:not(:disabled):hover { border-color: var(--accent); color: var(--accent); }
  .ic svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }


  .cols { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 18px; align-items: start; }
  .order ol { list-style: none; margin: 0; padding: 0; display: grid; }
  .song { display: grid; grid-template-columns: 16px 22px 62px minmax(0, 1fr) auto 18px; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 7px; font-size: 13px; background: var(--surface); border: 1px solid var(--line); cursor: grab; transition: background .12s, border-color .12s; }
  .song:hover { border-color: var(--line-2); }
  .song.playing { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }
  .song.over { border-color: var(--accent); box-shadow: 0 -2px 0 var(--accent); }
  .song.from { opacity: .45; }
  .grip { color: var(--muted); font-size: 11px; letter-spacing: -2px; }
  .song .n { color: var(--muted); font-size: 12px; text-align: right; }
  .song .t { background: none; border: 0; padding: 0; color: var(--ink-2); font-size: 12px; cursor: pointer; text-align: left; }
  .song .t:hover { color: var(--accent); }
  .who { display: flex; gap: 8px; align-items: baseline; overflow: hidden; white-space: nowrap; background: none; border: 0; padding: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; min-width: 0; }
  .who:hover b, .who.on b { color: var(--accent); }
  .len select { background: var(--ground); border: 1px solid var(--line-2); border-radius: 5px; padding: 3px 6px; color: var(--ink); font-size: 12.5px; }
  .who b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
  .who i { font-style: normal; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
  .meta2 { color: var(--muted); font-size: 11.5px; }
  .deck { font-size: 10.5px; color: var(--muted); border: 1px solid var(--line-2); border-radius: 3px; text-align: center; }
  .ho { padding: 1px 0 1px 46px; }
  .ho button { background: none; border: 0; padding: 2px 8px; border-left: 2px solid color-mix(in srgb, var(--accent) 50%, transparent); color: var(--muted); font-size: 11.5px; cursor: pointer; }
  .ho button:hover { color: var(--accent); }
  .ho button.on { color: var(--accent); border-left-color: var(--accent); font-weight: 600; }
  .side { display: grid; gap: 16px; }
  .export { border: 1px solid var(--line); border-radius: 10px; padding: 12px; background: var(--surface); }
  .ex-btns { display: flex; gap: 8px; }
  .ex-btns small { font-weight: 400; opacity: .75; margin-left: 2px; }
  .prog { height: 8px; border-radius: 4px; background: var(--raised); overflow: hidden; }
  .prog span { display: block; height: 100%; background: var(--accent); transition: width .3s; }
  .tl pre { margin: 0; white-space: pre-wrap; font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); background: var(--ground); border: 1px solid var(--line); border-radius: 8px; padding: 10px; max-height: 420px; overflow: auto; }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); font-size: 12px; cursor: pointer; text-decoration: underline; margin-left: 6px; }
  @media (max-width: 860px) { .cols { grid-template-columns: 1fr; } .meta2 { display: none; } .song { grid-template-columns: 16px 22px 56px minmax(0, 1fr) 18px; } .undo { margin-left: 0; } }
</style>
