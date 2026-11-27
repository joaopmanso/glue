<script lang="ts">
  /* A playlist as a mix (ADR 0199, 0200): planned on the beat in a style, laid out on 2 or 3 decks, each hand-over's
     style chosen, exported as one file (WAV 24-bit or MP3 320) with its tracklist. */
  import { onDestroy } from 'svelte';
  import { lib } from '../../lib/library.svelte';
  import { sets } from '../../lib/sets/set.svelte';
  import { setExport } from '../../lib/sets/export.svelte';
  import { viewHash } from '../../lib/view.svelte';
  import { tempoOf } from '../../core/sets/tempo';
  import { clock, timesOf, tracklist } from '../../core/sets/tracklist';
  import type { FxStyle, SetStyle } from '../../core/sets/types';
  import SetLanes from './SetLanes.svelte';

  let { id }: { id: string } = $props();
  $effect(() => { void lib.version; if (lib.store) void sets.open(id); });
  onDestroy(() => sets.close());

  const list = $derived.by(() => { void lib.version; return lib.store?.lists.get(id) ?? null; });
  const plan = $derived(sets.plan);
  const length = $derived.by(() => { if (!plan?.items.length) return 0; const l = plan.items[plan.items.length - 1]; return tempoOf(plan).time(l.start + l.beats); });
  const times = $derived(plan ? timesOf(plan) : []);
  const tr = (x: string) => lib.store?.tracks.get(x);
  const nameOf = (x: string) => ({ artist: tr(x)?.artist ?? '', title: tr(x)?.title || tr(x)?.fileName || '' });
  const text = $derived(plan ? tracklist(plan, nameOf) : '');
  const missing = $derived(list && plan ? list.items.filter(x => !plan.items.some(i => i.id === x)).length : 0);

  const STYLES: [SetStyle, string, string][] = [['single', 'One at a time', 'An 8-bar blend between songs'], ['blend', 'Continuous', 'Long blends with a bass swap'], ['double', 'Double drops', 'Drops landing together where they fit']];
  const FX: [FxStyle, string][] = [['blend', 'Blend'], ['bassSwap', 'Bass swap'], ['filter', 'Filter sweep'], ['echo', 'Echo out'], ['cut', 'Cut'], ['double', 'Double drop']];
  function setFx(i: number, style: FxStyle) {
    const p = sets.plan;
    if (!p) return;
    const items = p.items.map((it, j) => j === i ? { ...it, fx: { ...(it.fx ?? {}), style } } : it);
    sets.plan = { ...p, items, edited: true }; sets.save();
  }
  let zoom = $state(2), copied = $state(false);
  async function copy() { try { await navigator.clipboard.writeText(text); copied = true; setTimeout(() => (copied = false), 1500); } catch { /* the page can't write the clipboard */ } }
  const pct = $derived(setExport.total ? Math.round(setExport.done / setExport.total * 100) : 0);
</script>

<section class="setv" id="set-view" aria-labelledby="set-h">
  <header>
    <a class="back" href={viewHash({ kind: 'list', id })}>← {list?.name ?? 'Playlist'}</a>
    <h2 id="set-h">{list?.name ?? 'Set'} <small>as a mix</small></h2>
    {#if plan}<p class="meta mono" id="set-meta">{plan.items.length} songs · {clock(length)}{#if missing} · <span class="warnt">{missing} without a tempo or a length yet, left out</span>{/if}</p>{/if}
  </header>

  {#if sets.status === 'planning'}<p class="hint" id="set-status">Planning the set… {sets.message}</p>
  {:else if sets.status === 'error'}<p class="warnt" id="set-status">{sets.message}</p>
  {:else if plan}
    <div class="controls" data-guide="set-controls">
      <span class="seg three" role="radiogroup" aria-label="Style">
        {#each STYLES as [v, l, d] (v)}<button type="button" role="radio" id={'set-style-' + v} aria-checked={plan.style === v} title={d} onclick={() => sets.replan({ style: v })}>{l}</button>{/each}
      </span>
      <span class="seg two" role="radiogroup" aria-label="Decks">
        {#each [2, 3] as n (n)}<button type="button" role="radio" id={'set-decks-' + n} aria-checked={plan.decks === n} onclick={() => sets.replan({ decks: n as 2 | 3 })}>{n} decks</button>{/each}
      </span>
      <label class="check"><input type="checkbox" id="set-fixed" checked={plan.tempo.mode === 'fixed'} onchange={e => sets.replan({ tempo: e.currentTarget.checked ? { mode: 'fixed', bpm: Math.round(plan.items[0]?.bpm ?? 124) } : { mode: 'songs' } })}> One tempo</label>
      {#if plan.tempo.mode === 'fixed'}<label>BPM <input type="number" id="set-bpm" min="60" max="200" value={plan.tempo.bpm} onchange={e => sets.replan({ tempo: { mode: 'fixed', bpm: Number(e.currentTarget.value) || 124 } })}></label>{/if}
      <label class="check"><input type="checkbox" id="set-keylock" checked={plan.items[0]?.keyLock ?? true} onchange={e => sets.replan({ keyLock: e.currentTarget.checked })}> Key lock</label>
      <label class="zoom">Zoom <input type="range" min="0.25" max="30" step="0.25" bind:value={zoom}></label>
    </div>

    <SetLanes {plan} waves={sets.waves} {zoom} />

    <div class="export" data-guide="set-export">
      {#if setExport.busy}
        <div class="prog" id="set-progress"><span style:width={pct + '%'}></span></div>
        <span class="mono">{pct}%{#if setExport.left != null} · {clock(setExport.left)} left{/if}</span>
        <button type="button" class="btn-ghost" id="set-cancel" onclick={() => setExport.cancel()}>Cancel</button>
      {:else}
        <button type="button" class="btn" id="set-export-wav" onclick={() => list && void setExport.start(plan, list.name, 'wav')}>Export the mix: WAV</button>
        <button type="button" class="btn-ghost" id="set-export-mp3" onclick={() => list && void setExport.start(plan, list.name, 'mp3')}>MP3 320</button>
        {#if setExport.result}<span class="ok" id="set-done">Saved “{setExport.result}”.</span>{/if}
        {#if setExport.error}<span class="warnt" id="set-error">{setExport.error}</span>{/if}
      {/if}
    </div>

    <div class="cols">
      <section class="fx" aria-label="Hand-overs">
        <h3>Hand-overs</h3>
        <ol id="set-fx">
          {#each plan.items.slice(0, -1) as it, i (i)}
            {@const nx = plan.items[i + 1]}
            <li>
              <span class="mono t">{clock(times[i + 1] ?? 0)}</span>
              <span class="who">{nameOf(it.id).title} → {nameOf(nx.id).title}</span>
              <span class="mono">{Math.max(0, (it.start + it.beats - nx.start) / 4)} bars</span>
              <select aria-label="How it hands over" value={it.fx?.style ?? 'blend'} onchange={e => setFx(i, e.currentTarget.value as FxStyle)}>{#each FX as [v, l] (v)}<option value={v}>{l}</option>{/each}</select>
            </li>
          {/each}
        </ol>
      </section>
      <section class="tl" aria-label="Tracklist">
        <h3>Tracklist <button type="button" class="linkish" id="set-copy" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button> <button type="button" class="linkish" onclick={() => list && setExport.saveTracklist(text, list.name)}>Save as text</button></h3>
        <pre id="set-tracklist">{text}</pre>
      </section>
    </div>
  {/if}
</section>

<style>
  .setv { padding: 16px 22px 40px; display: grid; gap: 12px; align-content: start; min-width: 0; }
  header { display: grid; gap: 2px; }
  .back { font-size: 12.5px; color: var(--muted); text-decoration: none; }
  .back:hover { color: var(--accent); }
  h2 { font-size: 22px; }
  h2 small { font-size: 14px; color: var(--muted); font-weight: 500; }
  h3 { font-size: 13px; color: var(--muted); font-weight: 600; margin: 0 0 6px; }
  .meta, .hint { color: var(--muted); font-size: 12.5px; }
  .mono { font-family: var(--font-mono); }
  .warnt { color: var(--warn); }
  .ok { color: var(--ok); font-size: 13px; }
  .controls { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; font-size: 13px; }
  .controls label { display: flex; align-items: center; gap: 6px; color: var(--ink-2); }
  .controls input[type="number"] { width: 64px; background: var(--ground); border: 1px solid var(--line-2); border-radius: 5px; padding: 3px 6px; }
  .seg.three { grid-template-columns: repeat(3, auto); }
  .seg.two { grid-template-columns: repeat(2, auto); }
  .zoom input { accent-color: var(--accent); }
  .export { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .prog { width: min(360px, 60vw); height: 8px; border-radius: 4px; background: var(--raised); overflow: hidden; }
  .prog span { display: block; height: 100%; background: var(--accent); }
  .cols { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 18px; }
  .fx ol { list-style: none; margin: 0; padding: 0; display: grid; }
  .fx li { display: grid; grid-template-columns: 56px minmax(0, 1fr) 64px 130px; gap: 8px; align-items: center; padding: 4px 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); font-size: 13px; }
  .fx .t { color: var(--muted); font-size: 12px; }
  .fx .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fx select { background: var(--ground); border: 1px solid var(--line-2); border-radius: 5px; padding: 3px 6px; font-size: 12.5px; }
  .tl pre { margin: 0; white-space: pre-wrap; font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); background: var(--ground); border: 1px solid var(--line); border-radius: 6px; padding: 10px; max-height: 360px; overflow: auto; }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); font-size: 12px; cursor: pointer; text-decoration: underline; margin-left: 6px; }
  @media (max-width: 760px) { .cols { grid-template-columns: 1fr; } .fx li { grid-template-columns: 48px minmax(0, 1fr) 110px; } .fx li > :nth-child(3) { display: none; } }
</style>
