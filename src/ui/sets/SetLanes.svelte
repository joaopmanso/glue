<script lang="ts">
  /* A set's timeline (ADR 0199, 0201): one lane per deck, each song where it plays, drawn as it's heard: its waveform
     shrinks as its volume comes down and loses its lows while its bass is cut, over a ghost of the song as it is.
     - One canvas per lane, the width of the view, drawn for what's on screen at every scroll or zoom (sharp at any
       zoom). Each pixel column is a time in the mix, through the tempo map to each song's own time: no drift where the
       tempo eases.
     - Over it, a handle per song: drag it to move the song and the ones after it, its left edge to trim its start, its
       right edge to move its end (whole bars). A click anywhere puts the playhead there.
     - The hand-overs as chips under the lanes; Ctrl + wheel zooms around the pointer. */
  import { tick, untrack } from 'svelte';
  import { overview } from '../../lib/columns.svelte';
  import { lib } from '../../lib/library.svelte';
  import { sets } from '../../lib/sets/set.svelte';
  import { column, paintColumn } from '../render/wave';
  import { theme } from '../render/canvas';
  import { tempoOf } from '../../core/sets/tempo';
  import { controlsAt } from '../../core/sets/automation';
  import { clock } from '../../core/sets/tracklist';
  import { edited, moveEnd, moveSong, trimIn } from '../../core/sets/edit';
  import { MIX_RATE, type SetItem, type SetPlan } from '../../core/sets/types';
  import type { Waveform } from '../../core/audio/waveform';

  let { plan, waves, frame, playing = false, sel = $bindable(null), onseek }: {
    plan: SetPlan; waves: Map<string, Waveform>; frame: number; playing?: boolean; sel?: number | null; onseek: (frame: number) => void;
  } = $props();

  const RULER = 24, FXROW = 28;
  const LANE = $derived(plan.decks === 2 ? 92 : 72);
  const tm = $derived(tempoOf(plan));
  const length = $derived.by(() => { const l = plan.items[plan.items.length - 1]; return l ? tm.time(l.start + l.beats) : 0; });

  let box = $state<HTMLDivElement>();
  let vw = $state(800), scroll = $state(0);
  /** Pixels per second; null until it has been fitted to the view. */
  let zoom = $state<number | null>(null);
  const z = $derived(zoom ?? Math.max(0.05, (vw - 24) / Math.max(1, length)));
  const fit = () => { zoom = null; if (box) box.scrollLeft = 0; };
  async function zoomTo(nz: number, at = vw / 2) {
    const t = (scroll + at) / z, n = Math.max(0.05, Math.min(60, nz));
    zoom = n; await tick();
    if (box) box.scrollLeft = t * n - at;
  }
  function wheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    void zoomTo(z * Math.exp(-e.deltaY * 0.0015), e.clientX - box!.getBoundingClientRect().left);
  }

  const hue = (i: number) => (i * 47 + 200) % 360;
  const name = (id: string) => { const t = lib.store?.tracks.get(id); return t ? (t.title || t.fileName) : id; };
  const len = (id: string) => lib.store?.tracks.get(id)?.duration ?? undefined;
  const FX: Record<string, string> = { blend: 'Blend', bassSwap: 'Bass swap', filter: 'Filter sweep', echo: 'Echo out', cut: 'Cut', double: 'Double drop' };
  const SHORT: Record<string, string> = { blend: 'Bl', bassSwap: 'BS', filter: 'Flt', echo: 'Echo', cut: 'Cut', double: 'DD' };

  const blocks = $derived(plan.items.map((it, i) => { const a = tm.time(it.start), b = tm.time(it.start + it.beats); return { i, it, x: a * z, w: Math.max(3, (b - a) * z) }; }));
  const overs = $derived(plan.items.slice(0, -1).map((it, i) => {
    const nx = plan.items[i + 1], a = tm.time(nx.start), b = tm.time(Math.max(nx.start, it.start + it.beats));
    return { i, x: a * z, w: Math.max(4, (b - a) * z), style: it.fx?.style ?? 'blend', bars: Math.max(0, (it.start + it.beats - nx.start) / 4) };
  }));
  const total = $derived(length * z + 40);
  const ticks = $derived.by(() => {
    const step = [5, 10, 15, 30, 60, 120, 300, 600, 1200].find(s => s * z >= 72) ?? 1800, out: number[] = [];
    const from = Math.floor(scroll / z / step) * step;
    for (let s = Math.max(0, from); s * z <= scroll + vw + 80 && s <= length + step; s += step) out.push(s);
    return out;
  });
  const head = $derived(frame / MIX_RATE * z);

  // ---- drawing ----
  let canvases: HTMLCanvasElement[] = $state([]);
  $effect(() => {
    const args = { plan, waves, z, scroll, vw, sel, scheme: overview.scheme, LANE };
    const raf = requestAnimationFrame(() => { for (let d = 0; d < args.plan.decks; d++) if (canvases[d]) paint(canvases[d], d, args); });
    return () => cancelAnimationFrame(raf);
  });

  function paint(c: HTMLCanvasElement, deck: number, o: { plan: SetPlan; waves: Map<string, Waveform>; z: number; scroll: number; vw: number; sel: number | null; scheme: typeof overview.scheme; LANE: number }) {
    const dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(o.vw * dpr)), H = Math.round((o.LANE - 1) * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    const T = theme(), items = o.plan.items, k0 = Math.floor(o.scroll * dpr), px = o.z * dpr;   // device pixels per second
    const X = (t: number) => t * px - k0;
    // The hand-overs, faint behind the two songs' lanes (the chosen one stronger).
    for (let i = 0; i + 1 < items.length; i++) {
      if (items[i].deck !== deck && items[i + 1].deck !== deck) continue;
      const a = X(tm.time(items[i + 1].start)), b = X(tm.time(items[i].start + items[i].beats));
      if (b < 0 || a > W) continue;
      ctx.fillStyle = o.sel === i ? 'rgba(245,197,24,.16)' : 'rgba(245,197,24,.06)';
      ctx.fillRect(a, 0, Math.max(1, b - a), H);
    }
    const mid = H / 2, room = mid - 6 * dpr;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.deck !== deck) continue;
      const xa = X(tm.time(it.start)), xb = X(tm.time(it.start + it.beats));
      if (xb < 0 || xa > W) continue;
      // The block: the song's colour, rounded.
      ctx.fillStyle = `hsl(${hue(i)} 38% 15%)`;
      ctx.beginPath(); ctx.roundRect(Math.max(-8, xa), 3 * dpr, Math.min(W + 8, xb) - Math.max(-8, xa), H - 6 * dpr, 6 * dpr); ctx.fill();
      ctx.strokeStyle = `hsl(${hue(i)} 60% 55% / .55)`; ctx.lineWidth = dpr; ctx.stroke();
      const w = o.waves.get(it.id);
      const c0 = Math.max(0, Math.floor(xa)), c1 = Math.min(W, Math.ceil(xb)), end = it.start + it.beats;
      // Phrase lines (every 16 bars from its in-point), bar ticks when there's room.
      const barPx = 240 / it.bpm * px;
      for (let b = it.start, n = 0; b < end; b += 4, n++) {
        if (n % 16 !== 0 && barPx < 9) continue;
        const x = Math.round(X(tm.time(b))) + 0.5;
        if (x < c0 || x > c1) continue;
        ctx.strokeStyle = n % 16 === 0 ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.07)';
        ctx.beginPath(); ctx.moveTo(x, n % 16 === 0 ? 3 * dpr : H - 9 * dpr); ctx.lineTo(x, H - 3 * dpr); ctx.stroke();
      }
      if (!w) {
        ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(c0, mid - 1, c1 - c0, 2);
        continue;
      }
      for (let k = c0; k < c1; k++) {
        const ba = Math.max(it.start, tm.beat((k + k0) / px)), bb = Math.min(end, tm.beat((k + k0 + 1) / px));
        if (bb <= ba) continue;
        const sa = it.in + (ba - it.start) * 60 / it.bpm, sb = it.in + (bb - it.start) * 60 / it.bpm;
        const col = column(w, sa * w.rate, sb * w.rate), ctl = controlsAt(items, i, (ba + bb) / 2);
        // A ghost of the song as it is, then the song as heard: its volume, its lows while the bass is cut.
        const hp = Math.round(col.p / 255 * room);
        ctx.fillStyle = 'rgba(255,255,255,.09)'; ctx.fillRect(k, mid - hp, 1, hp * 2);
        const g = Math.max(0, Math.min(1, ctl.gain));
        if (g > 0.01) paintColumn(ctx, o.scheme, { l: col.l * ctl.low, m: col.m * ctl.mid, h: col.h * ctl.high, p: col.p * g * (ctl.low < 0.5 ? 0.82 : 1) }, k, 1, mid, room, '#f4f4f6', T.accent || '#f5c518');
      }
    }
  }

  // ---- dragging ----
  type Mode = 'move' | 'in' | 'end';
  let drag: { mode: Mode; i: number; x: number; items: SetItem[]; moved: boolean; bpm: number } | null = null;
  let dragging = $state<{ i: number; mode: Mode; d: number } | null>(null);
  function down(e: PointerEvent, i: number, mode: Mode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { mode, i, x: e.clientX, items: plan.items, moved: false, bpm: tm.bpmAt(plan.items[i].start) };
    sets.grab();
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 4) return;
    drag.moved = true;
    const beats = dx / z * drag.bpm / 60;
    const f = drag.mode === 'move' ? moveSong : drag.mode === 'in' ? trimIn : moveEnd;
    const r = f(drag.items, drag.i, beats, len);
    dragging = { i: drag.i, mode: drag.mode, d: r.d };
    if (r.items !== plan.items) sets.drag(edited(plan, r.items));
  }
  function up(e: PointerEvent) {
    const d = drag;
    drag = null; dragging = null;
    if (!d) return;
    if (d.moved) sets.drop();
    else { sets.drop(); seekAt(e.clientX); }
  }
  function seekAt(clientX: number) {
    if (!box) return;
    const x = clientX - box.getBoundingClientRect().left + scroll;
    onseek(Math.max(0, Math.min(length, x / z)) * MIX_RATE);
  }
  let seeking = false;
  function rulerDown(e: PointerEvent) { if (e.button !== 0) return; seeking = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); seekAt(e.clientX); }

  // While playing, the view follows the playhead.
  $effect(() => {
    const x = head;
    if (!box || !playing) return;
    untrack(() => { if (!drag && (x > scroll + vw * 0.9 || x < scroll)) box!.scrollLeft = Math.max(0, x - vw * 0.15); });
  });
</script>

<div class="lw">
<div class="lanes" id="set-lanes" data-guide="set-lanes" bind:this={box} bind:clientWidth={vw} onscroll={() => (scroll = box!.scrollLeft)} onwheel={wheel}>
  <div class="inner" style:width={Math.max(total, vw) + 'px'} style:height={RULER + plan.decks * LANE + FXROW + 'px'}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="ruler" onpointerdown={rulerDown} onpointermove={e => seeking && seekAt(e.clientX)} onpointerup={() => (seeking = false)}>
      {#each ticks as s (s)}<span style:left={s * z + 'px'}>{clock(s)}</span>{/each}
    </div>
    <div class="paint" style:width={vw + 'px'} style:height={plan.decks * LANE + 'px'} style:top={RULER + 'px'}>
      {#each Array(plan.decks) as _, d (d)}
        <canvas bind:this={canvases[d]} style:top={d * LANE + 'px'} style:height={LANE - 1 + 'px'} style:width={vw + 'px'}></canvas>
        <i class="dk" style:top={d * LANE + 4 + 'px'}>{['A', 'B', 'C'][d]}</i>
      {/each}
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="hit" style:top={RULER + 'px'} style:height={plan.decks * LANE + 'px'} onpointerdown={e => { if (e.button === 0) seekAt(e.clientX); }}></div>
    {#each blocks as b (b.i)}
      <div class="blk" class:active={dragging?.i === b.i} data-song={b.it.id} style:left={b.x + 'px'} style:width={b.w + 'px'} style:top={RULER + b.it.deck * LANE + 3 + 'px'} style:height={LANE - 7 + 'px'} style:--h={hue(b.i)}
        title={name(b.it.id) + (b.it.guessed ? ' (beat grid guessed)' : '') + (b.i ? ' · drag to move it and the songs after it' : '')}
        onpointerdown={e => down(e, b.i, 'move')} onpointermove={move} onpointerup={up} role="button" tabindex="-1" aria-label={name(b.it.id)}>
        <span class="nm" style:max-width={Math.max(0, b.w - 14) + 'px'}><b>{b.i + 1}</b> {name(b.it.id)}{#if b.it.guessed} <em>grid guessed</em>{/if}</span>
        {#if b.w > 90}<span class="sub mono">{Math.round(b.it.bpm * 10) / 10}{#if b.it.trim} · {b.it.trim > 0 ? '+' : ''}{b.it.trim} dB{/if}</span>{/if}
        {#if dragging?.i === b.i}<span class="dd mono">{dragging.d > 0 ? '+' : ''}{dragging.d / 4} bars</span>{/if}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span class="hd l" title="Drag: start it later or earlier in the song" onpointerdown={e => down(e, b.i, 'in')} onpointermove={move} onpointerup={up}></span>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span class="hd r" title="Drag: end it later or earlier (its hand-over with it)" onpointerdown={e => down(e, b.i, 'end')} onpointermove={move} onpointerup={up}></span>
      </div>
    {/each}
    <div class="fxrow" style:top={RULER + plan.decks * LANE + 'px'}>
      {#each overs as o (o.i)}
        <button type="button" class="hchip" class:on={sel === o.i} class:cut={o.style === 'cut'} style:left={o.x + 'px'} style:width={o.w + 'px'} title={FX[o.style] + ' · ' + o.bars + ' bars'} onclick={() => (sel = sel === o.i ? null : o.i)}>
          {o.w > 92 ? FX[o.style] : o.w > 30 ? SHORT[o.style] : ''}
        </button>
      {/each}
    </div>
    <div class="head" style:left={head + 'px'} style:height={RULER + plan.decks * LANE + 'px'}></div>
  </div>
</div>
  <div class="foot">
    <p class="tip">Drag a song to bring it in earlier or later, its edges to trim its start or end, a bar at a time. Click anywhere to put the playhead there; a hand-over’s chip opens it.</p>
    <div class="zoom">
    <button type="button" title="Zoom out" aria-label="Zoom out" onclick={() => zoomTo(z / 1.6)}>−</button>
    <button type="button" title="The whole set" onclick={fit}>Fit</button>
    <button type="button" title="Zoom in (or Ctrl + wheel)" aria-label="Zoom in" onclick={() => zoomTo(z * 1.6)}>+</button>
    </div>
  </div>
</div>

<style>
  .lanes { position: relative; overflow-x: auto; overflow-y: hidden; border: 1px solid var(--line); border-radius: 10px; background: #08080c; user-select: none; }
  .inner { position: relative; }
  .ruler { position: absolute; inset: 0 0 auto 0; height: 24px; border-bottom: 1px solid #ffffff14; cursor: text; background: #0e0e14; }
  .ruler span { position: absolute; top: 5px; font-size: 10.5px; color: #8b8b99; font-family: var(--font-mono); border-left: 1px solid #ffffff24; padding-left: 4px; pointer-events: none; }
  .paint { position: sticky; left: 0; display: block; }
  .paint canvas { position: absolute; left: 0; display: block; border-bottom: 1px solid #ffffff0d; }
  .dk { position: absolute; left: 6px; font-style: normal; font-size: 10px; font-weight: 700; color: #ffffff40; pointer-events: none; }
  .hit { position: absolute; left: 0; right: 0; cursor: text; }
  .blk { position: absolute; border-radius: 6px; cursor: grab; outline: 1px solid transparent; transition: outline-color .12s; touch-action: none; }
  .blk:hover { outline-color: hsl(var(--h) 70% 65% / .8); }
  .blk.active { cursor: grabbing; outline: 2px solid hsl(var(--h) 80% 65%); }
  .nm { position: absolute; left: 6px; top: 4px; padding: 1px 5px; border-radius: 4px; background: #000000a6; font-size: 12px; font-weight: 600; color: #fff; text-shadow: 0 1px 3px #000, 0 0 2px #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
  .nm b { color: hsl(var(--h) 85% 70%); margin-right: 2px; }
  .nm em { color: var(--warn); font-style: normal; font-weight: 500; font-size: 11px; }
  .sub { position: absolute; left: 6px; bottom: 4px; padding: 0 5px; border-radius: 3px; background: #0000008c; font-size: 10px; color: #ffffffa0; text-shadow: 0 1px 2px #000; pointer-events: none; }
  .dd { position: absolute; right: 12px; top: 5px; font-size: 11px; background: #000c; color: #fff; padding: 1px 6px; border-radius: 4px; pointer-events: none; }
  .hd { position: absolute; top: 0; bottom: 0; width: 9px; cursor: ew-resize; opacity: 0; transition: opacity .12s; }
  .hd.l { left: -2px; border-left: 3px solid hsl(var(--h) 80% 65%); border-radius: 6px 0 0 6px; }
  .hd.r { right: -2px; border-right: 3px solid hsl(var(--h) 80% 65%); border-radius: 0 6px 6px 0; }
  .blk:hover .hd, .blk.active .hd { opacity: 1; }
  .fxrow { position: absolute; left: 0; right: 0; height: 28px; background: #0e0e14; border-top: 1px solid #ffffff14; }
  .hchip { position: absolute; top: 4px; height: 20px; min-width: 4px; padding: 0 4px; border-radius: 10px; border: 1px solid #f5c51860; background: #f5c51814; color: #f5c518; font-size: 10.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; transition: background .12s; }
  .hchip:hover { background: #f5c51830; }
  .hchip.on { background: #f5c518; color: #111; border-color: #f5c518; }
  .hchip.cut { border-style: dashed; }
  .head { position: absolute; top: 0; width: 2px; margin-left: -1px; background: #ff4d4d; box-shadow: 0 0 6px #ff4d4d; pointer-events: none; z-index: 3; }
  .head::before { content: ''; position: absolute; top: 0; left: -5px; border: 6px solid transparent; border-top-color: #ff4d4d; }
  .lw { position: relative; min-width: 0; }
  .foot { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
  .tip { flex: 1; font-size: 11.5px; color: var(--muted); margin: 0; }
  .zoom { display: flex; gap: 2px; }
  .zoom button { height: 20px; min-width: 24px; padding: 0 6px; font-size: 11px; border-radius: 4px; border: 1px solid #ffffff26; background: #16161e; color: #ddd; cursor: pointer; }
  .zoom button:hover { border-color: var(--accent); color: var(--accent); }
</style>
