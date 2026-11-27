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
  import { edited, moveEnd, moveSong } from '../../core/sets/edit';
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
  const missing = $derived(list && plan ? list.items.filter(x => !plan.items.some(i => i.id === x)).length : 0);
  const len = (x: string) => tr(x)?.duration ?? undefined;

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
  const FX: [FxStyle, string, string][] = [['blend', 'Blend', 'Volumes crossed'], ['bassSwap', 'Bass swap', 'The lows swapped on the middle bar'], ['filter', 'Filter sweep', 'The outgoing song filtered away'], ['echo', 'Echo out', 'The outgoing song stops into its echo'], ['cut', 'Cut', 'Straight in on the bar'], ['double', 'Double drop', 'Both at full from the drop']];
  const fxName = (s: FxStyle | undefined) => FX.find(f => f[0] === (s ?? 'blend'))?.[1] ?? 'Blend';

  let sel = $state<number | null>(null);
  $effect(() => { if (plan && sel != null && sel >= plan.items.length - 1) sel = null; });
  const hand = $derived.by(() => {
    if (!plan || sel == null || !plan.items[sel + 1] || !tm) return null;
    const a = plan.items[sel], b = plan.items[sel + 1];
    return { a, b, at: tm.time(b.start), bars: Math.max(0, (a.start + a.beats - b.start) / 4) };
  });
  function setFx(i: number, style: FxStyle) {
    const p = sets.plan;
    if (!p) return;
    sets.apply(edited(p, p.items.map((it, j) => j === i ? { ...it, fx: { ...(it.fx ?? {}), style } } : it)));
  }
  function nudge(f: typeof moveEnd, i: number, beats: number) {
    const p = sets.plan;
    if (!p) return;
    const r = f(p.items, i, beats, len);
    if (r.d) sets.apply(edited(p, r.items));
  }
  function hear(i: number) {
    const p = sets.plan;
    if (!p || !tm) return;
    void preview.play(Math.max(0, tm.time(p.items[i + 1].start - 32)) * MIX_RATE);
  }
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
    {#if plan}<p class="meta mono" id="set-meta">{plan.items.length} songs · {clock(length)}{#if plan.edited} · shaped by hand{/if}{#if missing} · <span class="warnt">{missing} without a tempo or a length yet, left out</span>{/if}{#if sets.drawing} · drawing waveforms {sets.drawing}{/if}</p>{/if}
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
        {#if preview.loading}<span class="loading">Loading songs…</span>{/if}
        {#if playingIdx >= 0 && preview.playing}<span class="np">▶ {playingIdx + 1}. {nameOf(plan.items[playingIdx]?.id ?? '').title}</span>{/if}
      </div>
      <span class="seg three" role="radiogroup" aria-label="Style">
        {#each STYLES as [v, l, d] (v)}<button type="button" role="radio" id={'set-style-' + v} aria-checked={plan.style === v} title={d + (plan.edited ? ' (plans the set again: undo brings your changes back)' : '')} onclick={() => sets.replan({ style: v })}>{l}</button>{/each}
      </span>
      <span class="seg two" role="radiogroup" aria-label="Decks">
        {#each [2, 3] as n (n)}<button type="button" role="radio" id={'set-decks-' + n} aria-checked={plan.decks === n} onclick={() => sets.replan({ decks: n as 2 | 3 })}>{n} decks</button>{/each}
      </span>
      <label class="check"><input type="checkbox" id="set-fixed" checked={plan.tempo.mode === 'fixed'} onchange={e => sets.replan({ tempo: e.currentTarget.checked ? { mode: 'fixed', bpm: Math.round(plan.items[0]?.bpm ?? 124) } : { mode: 'songs' } })}> One tempo</label>
      {#if plan.tempo.mode === 'fixed'}<label>BPM <input type="number" id="set-bpm" min="60" max="200" value={plan.tempo.bpm} onchange={e => sets.replan({ tempo: { mode: 'fixed', bpm: Number(e.currentTarget.value) || 124 } })}></label>{/if}
      <label class="check"><input type="checkbox" id="set-keylock" checked={plan.items[0]?.keyLock ?? true} onchange={e => sets.replan({ keyLock: e.currentTarget.checked })}> Key lock</label>
      <span class="undo">
        <button type="button" class="ic" id="set-undo" disabled={!sets.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" onclick={() => sets.undo()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2"/></svg></button>
        <button type="button" class="ic" id="set-redo" disabled={!sets.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onclick={() => sets.redo()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5m5-5H9a5 5 0 0 0 0 10h2"/></svg></button>
      </span>
    </div>
    {#if preview.error}<p class="warnt small">{preview.error}</p>{/if}

    <SetLanes {plan} waves={sets.waves} frame={preview.frame} playing={preview.playing} bind:sel onseek={f => preview.seek(f)} />

    {#if hand && sel != null}
      {@const i = sel}
      <div class="hand" id="set-handover" aria-label="Hand-over">
        <div class="h-top">
          <span class="mono t">{clock(hand.at)}</span>
          <b>{nameOf(hand.a.id).title}</b> <span class="arrow">→</span> <b>{nameOf(hand.b.id).title}</b>
          <span class="mono bars" id="set-bars">{hand.bars} bars</span>
          <button type="button" class="btn-ghost sm" id="set-hear" onclick={() => hear(i)}>▶ Hear it</button>
          <button type="button" class="x" aria-label="Close" onclick={() => (sel = null)}>×</button>
        </div>
        <div class="h-row">
          <span class="fxs" role="radiogroup" aria-label="How it hands over">
            {#each FX as [v, l, d] (v)}<button type="button" role="radio" id={'set-hfx-' + v} aria-checked={(hand.a.fx?.style ?? 'blend') === v} title={d} onclick={() => setFx(i, v)}>{l}</button>{/each}
          </span>
          <span class="nudge">
            <span class="lbl">Length</span>
            <button type="button" id="set-shorter" title="4 bars shorter" onclick={() => nudge(moveEnd, i, -16)}>−4</button>
            <button type="button" id="set-longer" title="4 bars longer" onclick={() => nudge(moveEnd, i, 16)}>+4</button>
          </span>
          <span class="nudge">
            <span class="lbl">Next song in</span>
            <button type="button" id="set-earlier" title="4 bars earlier" onclick={() => nudge(moveSong, i + 1, -16)}>Earlier</button>
            <button type="button" id="set-later" title="4 bars later" onclick={() => nudge(moveSong, i + 1, 16)}>Later</button>
          </span>
        </div>
      </div>
    {/if}

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
              <span class="who"><b>{nameOf(it.id).title}</b>{#if nameOf(it.id).artist}<i>{nameOf(it.id).artist}</i>{/if}</span>
              <span class="mono meta2">{Math.round(it.bpm * 10) / 10}{#if keyOf(it.id)} · {keyOf(it.id)}{/if}</span>
              <span class="deck mono">{['A', 'B', 'C'][it.deck]}</span>
            </li>
            {#if i < plan.items.length - 1}
              <li class="ho" id={'set-ho-' + i}><button type="button" class:on={sel === i} onclick={() => (sel = sel === i ? null : i)}>{fxName(it.fx?.style)} · {Math.max(0, (it.start + it.beats - plan.items[i + 1].start) / 4)} bars</button></li>
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
            {#if setExport.result}<p class="ok small" id="set-done">Saved “{setExport.result}”.</p>{/if}
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
  .np { font-size: 12px; color: var(--muted); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .seg.three { grid-template-columns: repeat(3, auto); }
  .seg.two { grid-template-columns: repeat(2, auto); }
  .undo { display: flex; gap: 4px; margin-left: auto; }
  .ic { width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--line-2); background: var(--ground); color: var(--ink-2); display: grid; place-items: center; cursor: pointer; }
  .ic:disabled { opacity: .35; cursor: default; }
  .ic:not(:disabled):hover { border-color: var(--accent); color: var(--accent); }
  .ic svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  .hand { border: 1px solid color-mix(in srgb, var(--accent) 50%, var(--line)); border-radius: 10px; padding: 10px 12px; background: color-mix(in srgb, var(--accent) 5%, var(--surface)); display: grid; gap: 10px; animation: rise .15s ease-out; }
  @keyframes rise { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .h-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13.5px; }
  .h-top .t { color: var(--muted); font-size: 12px; }
  .h-top .arrow { color: var(--accent); }
  .h-top .bars { color: var(--ink-2); font-size: 12px; padding: 1px 6px; border: 1px solid var(--line-2); border-radius: 4px; }
  .h-top .x { margin-left: auto; background: none; border: 0; color: var(--muted); font-size: 18px; cursor: pointer; }
  .sm { padding: 3px 10px; font-size: 12.5px; }
  .h-row { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; }
  .fxs { display: flex; flex-wrap: wrap; gap: 4px; }
  .fxs button { padding: 4px 10px; border-radius: 14px; border: 1px solid var(--line-2); background: var(--ground); color: var(--ink-2); font-size: 12.5px; cursor: pointer; }
  .fxs button:hover { border-color: var(--accent); }
  .fxs button[aria-checked="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink, #111); font-weight: 600; }
  .nudge { display: flex; align-items: center; gap: 4px; font-size: 12px; }
  .nudge .lbl { color: var(--muted); margin-right: 2px; }
  .nudge button { padding: 3px 8px; border-radius: 5px; border: 1px solid var(--line-2); background: var(--ground); color: var(--ink-2); font-size: 12px; cursor: pointer; }
  .nudge button:hover { border-color: var(--accent); color: var(--accent); }

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
  .who { display: flex; gap: 8px; align-items: baseline; overflow: hidden; white-space: nowrap; }
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
