<script lang="ts">
  /* A set's timeline (ADR 0199, 0201, 0202): one lane per deck, each song where it plays, drawn as it's heard: its
     waveform shrinks as its volume comes down and loses its lows while its bass is cut, over a ghost of the song as it is.
     - One canvas per lane, the width of the view, drawn for what's on screen at every scroll or zoom (sharp at any
       zoom). Each pixel column is a time in the mix, through the tempo map to each song's own time.
     - Navigating: the wheel zooms around the pointer; dragging empty space, or a song not selected, scrolls; the time
       bar on top puts the playhead where it's clicked or dragged.
     - A click on a song selects it and opens its box (play from it, key lock, level, in earlier or later); Shift or
       Ctrl + click adds songs to the selection (ADR 0205). Only a selected song is dragged (it and the ones after it;
       several selected move together) or trimmed by its edges, a bar at a time; pressing on a song and holding still
       grabs it, selected, to drag.
     - A selected song's bass strip, along its foot: dragged across, its bass is cut over those bars (or opened where it
       was cut); a click on a stretch drawn by hand lets it go (ADR 0205).
     - A hand-over's chip under the lanes opens its box where it is: its style, length, the next song in earlier or
       later, Hear it. */
  import { tick, untrack } from 'svelte';
  import { overview } from '../../lib/columns.svelte';
  import { lib } from '../../lib/library.svelte';
  import { app } from '../../lib/app.svelte';
  import { sets } from '../../lib/sets/set.svelte';
  import { preview } from '../../lib/sets/preview.svelte';
  import { column, paintColumn } from '../render/wave';
  import { theme } from '../render/canvas';
  import { keyLabel } from '../../core/audio/keys';
  import { tempoOf } from '../../core/sets/tempo';
  import { bassSwapAt, controlsAt } from '../../core/sets/automation';
  import { clock } from '../../core/sets/tracklist';
  import { clearLows, edited, moveEnd, moveSong, moveSongs, setLows, trimIn } from '../../core/sets/edit';
  import { MIX_RATE, type BassChoice, type FxStyle, type SetItem, type SetPlan } from '../../core/sets/types';
  import type { Waveform } from '../../core/audio/waveform';

  let { plan, waves, frame, playing = false, sel = $bindable(null), song = $bindable(null), onseek }: {
    plan: SetPlan; waves: Map<string, Waveform>; frame: number; playing?: boolean;
    /** The hand-over open (after song `sel`), and the song selected. */
    sel?: number | null; song?: number | null;
    onseek: (frame: number) => void;
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
  // The wheel zooms (a sideways swipe scrolls, as it would). Not passive: it keeps the page from scrolling.
  $effect(() => {
    const el = box;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      void zoomTo(z * Math.exp(-e.deltaY * 0.0015), e.clientX - el.getBoundingClientRect().left);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  const hue = (i: number) => (i * 47 + 200) % 360;
  const tr = (id: string) => lib.store?.tracks.get(id);
  const name = (id: string) => { const t = tr(id); return t ? (t.title || t.fileName) : id; };
  const len = (id: string) => tr(id)?.duration ?? undefined;
  const keyOf = (id: string) => { const k = lib.store?.analysis.get(id)?.key; return k ? keyLabel(k, app.keyNotation) : ''; };
  const FX: [FxStyle, string, string, string][] = [
    ['blend', 'Blend', 'Bl', 'Volumes crossed'], ['bassSwap', 'Bass swap', 'BS', 'The lows swapped where the incoming song drops (the bass marker)'],
    ['layer', 'Layer', 'Lay', 'Both along, the bass changing hands 16 bars before the end'], ['filter', 'Filter sweep', 'Flt', 'The outgoing song filtered away'],
    ['echo', 'Echo out', 'Echo', 'The outgoing song stops into its echo'], ['cut', 'Cut', 'Cut', 'Straight in on the bar'], ['double', 'Double drop', 'DD', 'Both at full from the drop'],
  ];
  const fxOf = (s: string) => FX.find(f => f[0] === s) ?? FX[0];

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
    const args = { plan, waves, z, scroll, vw, sel, song, scheme: overview.scheme, LANE };
    const raf = requestAnimationFrame(() => { for (let d = 0; d < args.plan.decks; d++) if (canvases[d]) paint(canvases[d], d, args); });
    return () => cancelAnimationFrame(raf);
  });

  function paint(c: HTMLCanvasElement, deck: number, o: { plan: SetPlan; waves: Map<string, Waveform>; z: number; scroll: number; vw: number; sel: number | null; song: number | null; scheme: typeof overview.scheme; LANE: number }) {
    const dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(o.vw * dpr)), H = Math.round((o.LANE - 1) * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    const T = theme(), items = o.plan.items, k0 = Math.floor(o.scroll * dpr), px = o.z * dpr;   // device pixels per second
    const X = (t: number) => t * px - k0;
    // The hand-overs, faint behind the two songs' lanes (the open one stronger).
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
      // The block: the song's colour, rounded (lighter when selected).
      ctx.fillStyle = `hsl(${hue(i)} 38% ${o.song === i ? 22 : 15}%)`;
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

  // ---- pointer: scroll, select, move, trim, the bass by hand ----
  type Mode = 'pan' | 'move' | 'in' | 'end';
  /** The songs selected together with `song` (ADR 0205): more than one, they move together. */
  let picks = $state<number[]>([]);
  const chosen = $derived(song == null ? [] : picks.includes(song) ? picks : [song]);
  let drag: { mode: Mode; i: number; x: number; y: number; scroll0: number; items: SetItem[]; moved: boolean; bpm: number; add: boolean; group: number[]; hold?: ReturnType<typeof setTimeout> } | null = null;
  let dragging = $state<{ i: number; mode: Mode; d: number } | null>(null);
  let panning = $state(false);
  /** A song grabbed by holding still on it. */
  let lifted = $state<number | null>(null);
  const HOLD = 350;
  function down(e: PointerEvent, i: number, mode: Mode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    // Only a selected song is moved: any other is scrolled past, unless the pointer holds still on it a moment.
    const m: Mode = mode === 'move' && (add || !chosen.includes(i)) ? 'pan' : mode;
    const d: NonNullable<typeof drag> = drag = { mode: m, i, x: e.clientX, y: e.clientY, scroll0: scroll, items: plan.items, moved: false, bpm: i >= 0 ? tm.bpmAt(plan.items[i].start) : 120, add,
      group: chosen.length > 1 && chosen.includes(i) ? chosen : [i] };
    if (m !== 'pan') sets.grab();
    else if (mode === 'move' && i >= 0 && !add) d.hold = setTimeout(() => {
      if (drag !== d || d.moved) return;
      song = i; picks = []; sel = null; lifted = i;
      d.mode = 'move'; d.group = [i]; d.items = plan.items;
      sets.grab();
    }, HOLD);
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 4 && Math.abs(e.clientY - drag.y) < 4) return;
    drag.moved = true;
    clearTimeout(drag.hold);
    if (drag.mode === 'pan') { panning = true; if (box) box.scrollLeft = drag.scroll0 - dx; return; }
    const beats = dx / z * drag.bpm / 60;
    const r = drag.mode === 'move' && drag.group.length > 1 ? moveSongs(drag.items, drag.group, beats, len)
      : (drag.mode === 'move' ? moveSong : drag.mode === 'in' ? trimIn : moveEnd)(drag.items, drag.i, beats, len);
    dragging = { i: drag.i, mode: drag.mode, d: r.d };
    if (r.items !== plan.items) sets.drag(edited(plan, r.items));
  }
  function up() {
    const d = drag;
    drag = null; dragging = null; panning = false; lifted = null;
    if (!d) return;
    clearTimeout(d.hold);
    if (d.mode !== 'pan') { sets.drop(); return; }
    if (d.moved) return;
    // A click (no drag): a song selected (or let go; with Shift or Ctrl, added to the selection or taken out of it),
    // empty space lets the boxes go.
    sel = null;
    if (d.i < 0) { song = null; picks = []; return; }
    if (d.add && song != null) {
      const now = chosen.includes(d.i) ? chosen.filter(j => j !== d.i) : [...chosen, d.i].sort((a, b) => a - b);
      picks = now; song = now.length ? (now.includes(song) ? song : now[now.length - 1]) : null;
      return;
    }
    picks = []; song = song === d.i ? null : d.i;
  }

  // The selected song's bass strip: dragged across, its bass cut (or opened where it was off) over those bars.
  let lowDrag = $state<{ i: number; a: number; b: number; on: boolean; moved: boolean; x: number } | null>(null);
  const beatAtX = (clientX: number) => box ? tm.beat(Math.max(0, (clientX - box.getBoundingClientRect().left + scroll) / z)) : 0;
  function lowDown(e: PointerEvent, i: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const it = plan.items[i], b = beatAtX(e.clientX) - it.start;
    lowDrag = { i, a: b, b, on: controlsAt(plan.items, i, it.start + b).low < 0.5, moved: false, x: e.clientX };
  }
  function lowMove(e: PointerEvent) {
    if (!lowDrag) return;
    if (!lowDrag.moved && Math.abs(e.clientX - lowDrag.x) < 4) return;
    lowDrag = { ...lowDrag, moved: true, b: beatAtX(e.clientX) - plan.items[lowDrag.i].start };
  }
  /** The bars a bass drag covers: from the bar it started in to the one it ended in. */
  const lowBars = (d: { a: number; b: number }) => [Math.floor(Math.min(d.a, d.b) / 4) * 4, Math.ceil(Math.max(d.a, d.b) / 4) * 4] as const;
  function lowUp() {
    const d = lowDrag;
    lowDrag = null;
    if (!d) return;
    if (d.moved) { const [a, b] = lowBars(d); apply(setLows(plan.items, d.i, a, b, d.on)); return; }
    const k = plan.items[d.i].lows?.findIndex(r => d.a >= r.from && d.a < r.to) ?? -1;
    if (k >= 0) apply(clearLows(plan.items, d.i, k));
  }
  /** A stretch of a song (beats from its start) on screen: left and width (px) inside its block. */
  const spanPx = (it: SetItem, from: number, to: number) => { const x0 = tm.time(it.start) * z; return { l: tm.time(it.start + from) * z - x0, w: Math.max(2, (tm.time(it.start + to) - tm.time(it.start + from)) * z) }; };
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
  // A hand-over or song chosen elsewhere (the running order) is brought into view.
  $effect(() => {
    const i = sel ?? song;
    if (i == null || !box) return;
    const x = sel != null ? overs[sel]?.x : blocks[song!]?.x;
    untrack(() => { if (x != null && (x < scroll || x > scroll + vw - 120)) box!.scrollLeft = Math.max(0, x - vw * 0.3); });
  });
  $effect(() => { if (song != null && song >= plan.items.length) song = null; if (sel != null && sel >= plan.items.length - 1) sel = null; });

  // ---- the boxes ----
  const POP = 360;
  const popLeft = (x: number) => Math.max(8, Math.min(vw - POP - 8, x - scroll));
  const hand = $derived.by(() => {
    if (sel == null || !plan.items[sel + 1]) return null;
    const a = plan.items[sel], b = plan.items[sel + 1];
    return { i: sel, a, b, at: tm.time(b.start), bars: Math.max(0, (a.start + a.beats - b.start) / 4), like: sets.like(a.id, b.id), x: overs[sel]?.x ?? 0 };
  });
  const picked = $derived(song != null && chosen.length < 2 && plan.items[song] ? { i: song, it: plan.items[song], at: tm.time(plan.items[song].start), x: blocks[song]?.x ?? 0 } : null);
  function apply(items: SetItem[]) { sets.apply(edited(plan, items)); }
  function setFx(i: number, style: FxStyle) { apply(plan.items.map((it, j) => j === i ? { ...it, fx: { ...(it.fx ?? {}), style } } : it)); }
  const BASS: [BassChoice, string, string][] = [['auto', 'Auto', 'As the style has it (drag the bass marker to move where it changes hands)'], ['out', 'Outgoing', 'The outgoing song keeps its bass all through'], ['in', 'Incoming', 'The incoming song has its bass from the start'], ['both', 'Both', 'Both basses at once: double bass']];
  /** Whose bass plays (the swap point is kept: where the incoming song's bass comes in, or where it was moved). */
  function setBass(i: number, bass: BassChoice) {
    apply(plan.items.map((it, j) => {
      if (j !== i) return it;
      const { bass: _, ...rest } = it.fx ?? { style: 'blend' as FxStyle };
      void _;
      return { ...it, fx: bass === 'auto' ? rest : { ...rest, bass } };
    }));
  }
  // The open hand-over's bass marker: where the bass changes hands, dragged a bar at a time.
  const swapMark = $derived.by(() => {
    if (sel == null || !plan.items[sel + 1]) return null;
    const a = plan.items[sel], s = plan.items[sel + 1].start, len = a.start + a.beats - s, at = bassSwapAt(a.fx, len);
    return at == null ? null : { i: sel, s, len, at, x: tm.time(s + at) * z };
  });
  let swapDrag: { x: number; at: number; i: number; s: number; len: number; bpm: number } | null = null;
  function swapDown(e: PointerEvent) {
    if (!swapMark || e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    swapDrag = { x: e.clientX, at: swapMark.at, i: swapMark.i, s: swapMark.s, len: swapMark.len, bpm: tm.bpmAt(swapMark.s) };
    sets.grab();
  }
  function swapMove(e: PointerEvent) {
    const d = swapDrag;
    if (!d) return;
    const at = Math.max(0, Math.min(Math.floor(d.len / 4) * 4, Math.round((d.at + (e.clientX - d.x) / z * d.bpm / 60) / 4) * 4));
    const it = plan.items[d.i];
    if (at !== it.fx?.swap) sets.drag(edited(plan, plan.items.map((x, j) => j === d.i ? { ...x, fx: { ...(x.fx ?? { style: 'blend' as FxStyle }), swap: at, bass: 'auto' } } : x)));
  }
  function swapUp() { if (swapDrag) { swapDrag = null; sets.drop(); } }
  function nudge(f: typeof moveEnd, i: number, beats: number) { const r = f(plan.items, i, beats, len); if (r.d) apply(r.items); }
  function setItem(i: number, patch: Partial<SetItem>) { apply(plan.items.map((it, j) => j === i ? { ...it, ...patch } : it)); }
  const hear = (i: number) => void preview.play(Math.max(0, tm.time(plan.items[i + 1].start - 32)) * MIX_RATE);
  const fromSong = (i: number) => void preview.play(Math.max(0, tm.time(plan.items[i].start)) * MIX_RATE);
  function keys(e: KeyboardEvent) { if (e.key === 'Escape' && (sel != null || song != null)) { sel = null; song = null; picks = []; } }
  /** Each song selected changed alike (the box for several). */
  function setEach(f: (it: SetItem) => Partial<SetItem>) { const on = new Set(chosen); apply(plan.items.map((it, j) => on.has(j) ? { ...it, ...f(it) } : it)); }
  function nudgeGroup(beats: number) { const r = moveSongs(plan.items, chosen, beats, len); if (r.d) apply(r.items); }
  const group = $derived(chosen.length > 1 ? { n: chosen.length, x: blocks[chosen[0]]?.x ?? 0, lock: chosen.every(i => plan.items[i]?.keyLock) } : null);
</script>

<svelte:window onkeydown={keys} />

<div class="lw">
<div class="lanes" class:panning id="set-lanes" data-guide="set-lanes" bind:this={box} bind:clientWidth={vw} onscroll={() => (scroll = box!.scrollLeft)}>
  <div class="inner" style:width={Math.max(total, vw) + 'px'} style:height={RULER + plan.decks * LANE + FXROW + 'px'}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="ruler" id="set-ruler" title="Click or drag: play from here" onpointerdown={rulerDown} onpointermove={e => seeking && seekAt(e.clientX)} onpointerup={() => (seeking = false)}>
      {#each ticks as s (s)}<span style:left={s * z + 'px'}>{clock(s)}</span>{/each}
    </div>
    <div class="paint" style:width={vw + 'px'} style:height={plan.decks * LANE + 'px'} style:top={RULER + 'px'}>
      {#each Array(plan.decks) as _, d (d)}
        <canvas bind:this={canvases[d]} style:top={d * LANE + 'px'} style:height={LANE - 1 + 'px'} style:width={vw + 'px'}></canvas>
        <i class="dk" style:top={d * LANE + 4 + 'px'}>{['A', 'B', 'C'][d]}</i>
      {/each}
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="hit" style:top={RULER + 'px'} style:height={plan.decks * LANE + 'px'} onpointerdown={e => down(e, -1, 'pan')} onpointermove={move} onpointerup={up}></div>
    {#each blocks as b (b.i)}
      <div class="blk" class:on={chosen.includes(b.i)} class:lift={lifted === b.i} class:active={dragging?.i === b.i} data-song={b.it.id} style:left={b.x + 'px'} style:width={b.w + 'px'} style:top={RULER + b.it.deck * LANE + 3 + 'px'} style:height={LANE - 7 + 'px'} style:--h={hue(b.i)}
        title={name(b.it.id) + (b.it.guessed ? ' (beat grid guessed)' : '') + (chosen.includes(b.i) ? (b.i ? (chosen.length > 1 ? ' · drag to move the songs selected' : ' · drag to move it and the songs after it') : '') : ' · click to select (Shift or Ctrl: add it) · press and hold to grab it')}
        onpointerdown={e => down(e, b.i, 'move')} onpointermove={move} onpointerup={up} role="button" tabindex="-1" aria-label={name(b.it.id)} aria-pressed={chosen.includes(b.i)}>
        <span class="nm" style:max-width={Math.max(0, b.w - 14) + 'px'}><b>{b.i + 1}</b> {name(b.it.id)}{#if b.it.guessed} <em>grid guessed</em>{/if}</span>
        {#if b.w > 90}<span class="sub mono">{Math.round(b.it.bpm * 10) / 10}{#if b.it.trim} · {b.it.trim > 0 ? '+' : ''}{b.it.trim} dB{/if}{#if !b.it.keyLock} · no key lock{/if}</span>{/if}
        {#if dragging?.i === b.i}<span class="dd mono">{dragging.d > 0 ? '+' : ''}{dragging.d / 4} bars</span>{/if}
        {#each b.it.lows ?? [] as r, k (k)}
          {@const q = spanPx(b.it, r.from, r.to)}
          <span class="low" class:cut={!r.on} style:left={q.l + 'px'} style:width={q.w + 'px'} title={(r.on ? 'Bass opened' : 'Bass cut') + ', bars ' + (r.from / 4 + 1) + '–' + r.to / 4}></span>
        {/each}
        {#if lowDrag?.i === b.i && lowDrag.moved}
          {@const [la, lb] = lowBars(lowDrag)}
          {@const q = spanPx(b.it, la, lb)}
          <span class="low ghost" class:cut={!lowDrag.on} style:left={q.l + 'px'} style:width={q.w + 'px'}></span>
        {/if}
        {#if song === b.i && chosen.length < 2}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class="lows" id="set-lows" title="The bass: drag along here to cut it over those bars (or open it where it's cut); click a stretch to let it go"
            onpointerdown={e => lowDown(e, b.i)} onpointermove={lowMove} onpointerup={lowUp}><i>bass</i></span>
        {/if}
        {#if song === b.i && chosen.length < 2}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class="hd l" title="Drag: start it later or earlier in the song" onpointerdown={e => down(e, b.i, 'in')} onpointermove={move} onpointerup={up}></span>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class="hd r" title="Drag: end it later or earlier (its hand-over with it)" onpointerdown={e => down(e, b.i, 'end')} onpointermove={move} onpointerup={up}></span>
        {/if}
      </div>
    {/each}
    <div class="fxrow" style:top={RULER + plan.decks * LANE + 'px'}>
      {#each overs as o (o.i)}
        {@const f = fxOf(o.style)}
        <button type="button" class="hchip" class:on={sel === o.i} class:cut={o.style === 'cut'} style:left={o.x + 'px'} style:width={o.w + 'px'} title={f[1] + ' · ' + o.bars + ' bars'} onclick={() => { sel = sel === o.i ? null : o.i; song = null; }}>
          {o.w > 92 ? f[1] : o.w > 30 ? f[2] : ''}
        </button>
      {/each}
    </div>
    {#if swapMark}
      <div class="swapline" style:left={swapMark.x + 'px'} style:top={RULER + 'px'} style:height={plan.decks * LANE + 'px'}></div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span class="swap" id="set-swap" style:left={swapMark.x + 'px'} style:top={RULER + plan.decks * LANE + 4 + 'px'} title="Where the bass changes hands: drag it (a bar at a time)"
        onpointerdown={swapDown} onpointermove={swapMove} onpointerup={swapUp}>bass</span>
    {/if}
    <div class="head" style:left={head + 'px'} style:height={RULER + plan.decks * LANE + 'px'}></div>
  </div>
</div>

  {#if hand}
    {@const i = hand.i}
    <div class="pop" id="set-pop-fx" role="dialog" aria-label="Hand-over" style:left={popLeft(hand.x) + 'px'} style:top={RULER + plan.decks * LANE + FXROW + 6 + 'px'}>
      <div class="p-top">
        <span class="mono t">{clock(hand.at)}</span>
        <span class="who"><b>{name(hand.a.id)}</b> <span class="arrow">→</span> <b>{name(hand.b.id)}</b></span>
        <button type="button" class="x" aria-label="Close" onclick={() => (sel = null)}>×</button>
      </div>
      <p class="facts mono"><span id="set-bars">{hand.bars} bars</span>{#if hand.like != null} · sound {Math.round(hand.like * 100)} % alike{/if}</p>
      <span class="fxs" role="radiogroup" aria-label="How it hands over">
        {#each FX as [v, l, , d] (v)}<button type="button" role="radio" id={'set-hfx-' + v} aria-checked={(hand.a.fx?.style ?? 'blend') === v} title={d} onclick={() => setFx(i, v)}>{l}</button>{/each}
      </span>
      <div class="rows" role="radiogroup" aria-label="Whose bass plays">
        <span class="lbl">Bass</span>
        {#each BASS as [v, l, d] (v)}<button type="button" role="radio" class="bs" id={'set-bass-' + v} aria-checked={(hand.a.fx?.bass ?? 'auto') === v} title={d} onclick={() => setBass(i, v)}>{l}</button>{/each}
      </div>
      <div class="rows">
        <span class="lbl">Length</span>
        <button type="button" id="set-shorter" title="4 bars shorter" onclick={() => nudge(moveEnd, i, -16)}>−4 bars</button>
        <button type="button" id="set-longer" title="4 bars longer" onclick={() => nudge(moveEnd, i, 16)}>+4 bars</button>
        <span class="lbl">Next in</span>
        <button type="button" id="set-earlier" title="4 bars earlier" onclick={() => nudge(moveSong, i + 1, -16)}>Earlier</button>
        <button type="button" id="set-later" title="4 bars later" onclick={() => nudge(moveSong, i + 1, 16)}>Later</button>
      </div>
      <button type="button" class="hear" id="set-hear" onclick={() => hear(i)}>▶ Hear it</button>
    </div>
  {/if}
  {#if picked}
    {@const i = picked.i}
    {@const t = tr(picked.it.id)}
    <div class="pop" id="set-pop-song" role="dialog" aria-label="Song" style:left={popLeft(picked.x) + 'px'} style:top={RULER + plan.decks * LANE + FXROW + 6 + 'px'} style:--h={hue(i)}>
      <div class="p-top">
        <span class="num mono">{i + 1}</span>
        <span class="who"><b>{t?.title || t?.fileName || ''}</b>{#if t?.artist} <i>{t.artist}</i>{/if}</span>
        <button type="button" class="x" aria-label="Close" onclick={() => (song = null)}>×</button>
      </div>
      <p class="facts mono">{clock(picked.at)} · {Math.round(picked.it.bpm * 10) / 10} BPM{#if keyOf(picked.it.id)} · {keyOf(picked.it.id)}{/if} · deck {['A', 'B', 'C'][picked.it.deck]}{#if picked.it.guessed} · <span class="warnt">grid guessed</span>{/if}</p>
      <div class="rows">
        <button type="button" class="hear" id="set-song-play" onclick={() => fromSong(i)}>▶ Play from here</button>
        <label class="ck"><input type="checkbox" id="set-song-keylock" checked={picked.it.keyLock} onchange={e => setItem(i, { keyLock: e.currentTarget.checked })}> Key lock</label>
      </div>
      <div class="rows">
        <span class="lbl">Level</span>
        <button type="button" id="set-song-quieter" onclick={() => setItem(i, { trim: Math.max(-12, Math.round(((picked.it.trim ?? 0) - 1) * 10) / 10) })}>−1 dB</button>
        <span class="mono val" id="set-song-level">{(picked.it.trim ?? 0) > 0 ? '+' : ''}{picked.it.trim ?? 0} dB</span>
        <button type="button" id="set-song-louder" onclick={() => setItem(i, { trim: Math.min(12, Math.round(((picked.it.trim ?? 0) + 1) * 10) / 10) })}>+1 dB</button>
        {#if i > 0}
          <span class="lbl">Comes in</span>
          <button type="button" id="set-song-earlier" onclick={() => nudge(moveSong, i, -16)}>Earlier</button>
          <button type="button" id="set-song-later" onclick={() => nudge(moveSong, i, 16)}>Later</button>
        {/if}
      </div>
      {#if picked.it.lows?.length}
        <div class="rows" id="set-song-lows">
          <span class="lbl">Bass</span>
          {#each picked.it.lows as r, k (k)}
            <button type="button" class="lowchip" class:cut={!r.on} title="Let it go" onclick={() => apply(clearLows(plan.items, i, k))}>{r.on ? 'open' : 'cut'} bars {r.from / 4 + 1}–{r.to / 4} ×</button>
          {/each}
        </div>
      {/if}
      <p class="hint">{i ? 'Drag it to move it and the songs after it; ' : ''}drag its edges to trim its start or end; drag along its bass strip to cut or open the bass over some bars. <a href={'#/track/' + picked.it.id}>Its page</a></p>
    </div>
  {/if}
  {#if group}
    <div class="pop" id="set-pop-songs" role="dialog" aria-label="Songs selected" style:left={popLeft(group.x) + 'px'} style:top={RULER + plan.decks * LANE + FXROW + 6 + 'px'}>
      <div class="p-top">
        <span class="who"><b>{group.n} songs selected</b></span>
        <button type="button" class="x" aria-label="Close" onclick={() => { song = null; picks = []; }}>×</button>
      </div>
      <div class="rows">
        <span class="lbl">Level</span>
        <button type="button" id="set-group-quieter" onclick={() => setEach(it => ({ trim: Math.max(-12, Math.round(((it.trim ?? 0) - 1) * 10) / 10) }))}>−1 dB</button>
        <button type="button" id="set-group-louder" onclick={() => setEach(it => ({ trim: Math.min(12, Math.round(((it.trim ?? 0) + 1) * 10) / 10) }))}>+1 dB</button>
        <label class="ck"><input type="checkbox" id="set-group-keylock" checked={group.lock} onchange={e => { const on = e.currentTarget.checked; setEach(() => ({ keyLock: on })); }}> Key lock</label>
      </div>
      <div class="rows">
        <span class="lbl">Come in</span>
        <button type="button" id="set-group-earlier" onclick={() => nudgeGroup(-16)}>Earlier</button>
        <button type="button" id="set-group-later" onclick={() => nudgeGroup(16)}>Later</button>
      </div>
      <p class="hint">Drag any of them to move them together; the others stay where they are. Shift or Ctrl + click adds a song or takes it out.</p>
    </div>
  {/if}

  <div class="foot">
    <p class="tip">Wheel: zoom · drag: scroll · click a song to select it (Shift or Ctrl: several), then drag it or its edges, or press and hold to grab it · its bass strip cuts or opens the bass · the time bar plays from where you click.</p>
    <div class="zoom">
      <button type="button" title="Zoom out" aria-label="Zoom out" onclick={() => zoomTo(z / 1.6)}>−</button>
      <button type="button" title="The whole set" onclick={fit}>Fit</button>
      <button type="button" title="Zoom in (or the wheel)" aria-label="Zoom in" onclick={() => zoomTo(z * 1.6)}>+</button>
    </div>
  </div>
</div>

<style>
  .lw { position: relative; min-width: 0; }
  .lanes { position: relative; overflow-x: auto; overflow-y: hidden; border: 1px solid var(--line); border-radius: 10px; background: #08080c; user-select: none; }
  .lanes.panning, .lanes.panning * { cursor: grabbing !important; }
  .inner { position: relative; }
  .ruler { position: absolute; inset: 0 0 auto 0; height: 24px; border-bottom: 1px solid #ffffff14; cursor: col-resize; background: #0e0e14; z-index: 2; }
  .ruler:hover { background: #15151d; }
  .ruler span { position: absolute; top: 5px; font-size: 10.5px; color: #8b8b99; font-family: var(--font-mono); border-left: 1px solid #ffffff24; padding-left: 4px; pointer-events: none; }
  .paint { position: sticky; left: 0; display: block; }
  .paint canvas { position: absolute; left: 0; display: block; border-bottom: 1px solid #ffffff0d; }
  .dk { position: absolute; left: 6px; font-style: normal; font-size: 10px; font-weight: 700; color: #ffffff40; pointer-events: none; }
  .hit { position: absolute; left: 0; right: 0; cursor: grab; touch-action: none; }
  .blk { position: absolute; border-radius: 6px; cursor: pointer; outline: 1px solid transparent; transition: outline-color .12s; touch-action: none; }
  .blk:hover { outline-color: hsl(var(--h) 70% 65% / .6); }
  .blk.on { outline: 2px solid hsl(var(--h) 85% 65%); cursor: grab; box-shadow: 0 0 18px hsl(var(--h) 80% 55% / .35); }
  .blk.active { cursor: grabbing; }
  .blk.lift { cursor: grabbing; transform: translateY(-2px); box-shadow: 0 8px 22px #000c, 0 0 0 2px hsl(var(--h) 85% 65%); transition: transform .1s, box-shadow .1s; }
  /* Stretches of bass by hand, along the song's foot: cut (hatched red) or opened (orange). */
  .low { position: absolute; bottom: 2px; height: 6px; border-radius: 3px; background: #ff8a1f; pointer-events: none; opacity: .9; }
  .low.cut { background: repeating-linear-gradient(135deg, #ff4d4d 0 4px, #ff4d4d55 4px 8px); }
  .low.ghost { opacity: .55; outline: 1px dashed #fff8; }
  .lows { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; cursor: crosshair; border-top: 1px dashed hsl(var(--h) 70% 65% / .5); background: #0000004d; touch-action: none; }
  .lows i { position: absolute; right: 12px; bottom: 1px; font-style: normal; font-size: 9px; font-weight: 700; letter-spacing: .04em; color: #ffffff80; pointer-events: none; }
  .lowchip { color: #ff8a1f !important; }
  .lowchip.cut { color: #ff6b6b !important; }
  .nm { position: absolute; left: 6px; top: 4px; padding: 1px 5px; border-radius: 4px; background: #000000a6; font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
  .nm b { color: hsl(var(--h) 85% 70%); margin-right: 2px; }
  .nm em { color: var(--warn); font-style: normal; font-weight: 500; font-size: 11px; }
  .sub { position: absolute; left: 6px; bottom: 4px; padding: 0 5px; border-radius: 3px; background: #0000008c; font-size: 10px; color: #ffffffa0; pointer-events: none; }
  .dd { position: absolute; right: 12px; top: 5px; font-size: 11px; background: #000c; color: #fff; padding: 1px 6px; border-radius: 4px; pointer-events: none; }
  .hd { position: absolute; top: 0; bottom: 0; width: 10px; cursor: ew-resize; }
  .hd.l { left: -3px; border-left: 4px solid hsl(var(--h) 85% 65%); border-radius: 6px 0 0 6px; }
  .hd.r { right: -3px; border-right: 4px solid hsl(var(--h) 85% 65%); border-radius: 0 6px 6px 0; }
  .fxrow { position: absolute; left: 0; right: 0; height: 28px; background: #0e0e14; border-top: 1px solid #ffffff14; }
  .hchip { position: absolute; top: 4px; height: 20px; min-width: 4px; padding: 0 4px; border-radius: 10px; border: 1px solid #f5c51860; background: #f5c51814; color: #f5c518; font-size: 10.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; transition: background .12s; }
  .hchip:hover { background: #f5c51830; }
  .hchip.on { background: #f5c518; color: #111; border-color: #f5c518; }
  .hchip.cut { border-style: dashed; }
  .swapline { position: absolute; width: 0; border-left: 2px dashed #ff8a1f; margin-left: -1px; pointer-events: none; z-index: 2; }
  .swap { position: absolute; z-index: 4; transform: translateX(-50%); height: 20px; padding: 0 7px; border-radius: 10px; background: #ff8a1f; color: #111; font-size: 10.5px; font-weight: 700; line-height: 20px; cursor: ew-resize; touch-action: none; box-shadow: 0 0 0 2px #0e0e14; }
  .rows .bs[aria-checked="true"] { background: #ff8a1f; border-color: #ff8a1f; color: #111; font-weight: 600; }
  .head { position: absolute; top: 0; width: 2px; margin-left: -1px; background: #ff4d4d; box-shadow: 0 0 6px #ff4d4d; pointer-events: none; z-index: 3; }
  .head::before { content: ''; position: absolute; top: 0; left: -5px; border: 6px solid transparent; border-top-color: #ff4d4d; }

  .pop { position: absolute; z-index: 20; width: 360px; max-width: calc(100% - 16px); box-sizing: border-box; padding: 10px 12px; border-radius: 10px; background: var(--surface); border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line)); box-shadow: 0 12px 32px #000a; display: grid; gap: 8px; font-size: 12.5px; animation: pop .12s ease-out; }
  #set-pop-song { border-color: hsl(var(--h) 70% 55%); }
  @keyframes pop { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
  .p-top { display: flex; align-items: center; gap: 8px; }
  .p-top .t { color: var(--muted); font-size: 11.5px; }
  .p-top .num { color: hsl(var(--h, 45) 85% 65%); font-weight: 700; }
  .who { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who i { font-style: normal; color: var(--muted); }
  .arrow { color: var(--accent); }
  .x { background: none; border: 0; color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px; }
  .x:hover { color: var(--ink); }
  .facts { margin: 0; color: var(--muted); font-size: 11.5px; }
  .warnt { color: var(--warn); }
  .fxs { display: flex; flex-wrap: wrap; gap: 4px; }
  .fxs button { padding: 3px 9px; border-radius: 13px; border: 1px solid var(--line-2); background: var(--ground); color: var(--ink-2); font-size: 12px; cursor: pointer; }
  .fxs button:hover { border-color: var(--accent); }
  .fxs button[aria-checked="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink, #111); font-weight: 600; }
  .rows { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
  .rows .lbl { color: var(--muted); margin-left: 4px; }
  .rows .lbl:first-child { margin-left: 0; }
  .rows button { padding: 3px 8px; border-radius: 5px; border: 1px solid var(--line-2); background: var(--ground); color: var(--ink-2); font-size: 12px; cursor: pointer; }
  .rows button:hover { border-color: var(--accent); color: var(--accent); }
  .val { min-width: 48px; text-align: center; }
  .ck { display: inline-flex; align-items: center; gap: 5px; margin-left: 8px; color: var(--ink-2); }
  .hear { justify-self: start; padding: 4px 12px !important; border-radius: 14px !important; background: color-mix(in srgb, var(--accent) 14%, var(--ground)) !important; border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent) !important; color: var(--accent) !important; font-weight: 600; cursor: pointer; }
  .hint { margin: 0; color: var(--muted); font-size: 11px; }
  .hint a { color: var(--accent); }

  .foot { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
  .tip { flex: 1; font-size: 11.5px; color: var(--muted); margin: 0; }
  .zoom { display: flex; gap: 2px; }
  .zoom button { height: 20px; min-width: 24px; padding: 0 6px; font-size: 11px; border-radius: 4px; border: 1px solid #ffffff26; background: #16161e; color: #ddd; cursor: pointer; }
  .zoom button:hover { border-color: var(--accent); color: var(--accent); }
</style>
