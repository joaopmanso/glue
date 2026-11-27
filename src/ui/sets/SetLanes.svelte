<script lang="ts">
  /* A set's lanes (ADR 0199): one per deck, each song where it plays in the mix (its waveform, beat grid and name), the
     hand-overs shaded across the lanes, a ruler in minutes. Scrolls sideways; `zoom` is pixels per second. */
  import { drawWave } from '../render/wave';
  import { overview } from '../../lib/columns.svelte';
  import { lib } from '../../lib/library.svelte';
  import { tempoOf } from '../../core/sets/tempo';
  import { clock } from '../../core/sets/tracklist';
  import type { SetPlan } from '../../core/sets/types';
  import type { Waveform } from '../../core/audio/waveform';

  let { plan, waves, zoom }: { plan: SetPlan; waves: Map<string, Waveform>; zoom: number } = $props();
  const LANE = 64, RULER = 22;
  const tm = $derived(tempoOf(plan));
  const blocks = $derived(plan.items.map((it, i) => {
    const a = tm.time(it.start), b = tm.time(it.start + it.beats), p = 60 / it.bpm;
    return { i, it, x: a * zoom, w: Math.max(2, (b - a) * zoom), t0: it.in, t1: it.in + it.beats * p, bar: ((Math.round((it.in - it.beat0) / p) % 4) + 4) % 4 };
  }));
  const overlaps = $derived(plan.items.slice(0, -1).map((it, i) => {
    const nx = plan.items[i + 1], a = tm.time(nx.start), b = tm.time(Math.max(nx.start, it.start + it.beats));
    return { i, x: a * zoom, w: Math.max(2, (b - a) * zoom), style: it.fx?.style ?? 'blend' };
  }));
  const total = $derived(plan.items.length ? Math.max(...blocks.map(b => b.x + b.w)) : 0);
  const ticks = $derived.by(() => { const step = zoom > 4 ? 30 : zoom > 1 ? 60 : 300, out: number[] = []; for (let s = 0; s * zoom <= total; s += step) out.push(s); return out; });
  const name = (id: string) => { const t = lib.store?.tracks.get(id); return t ? (t.title || t.fileName) : id; };
  const FX: Record<string, string> = { blend: 'Blend', bassSwap: 'Bass swap', filter: 'Filter', echo: 'Echo out', cut: 'Cut', double: 'Double drop' };

  function draw(c: HTMLCanvasElement, o: { wave: Waveform | null; w: number; t0: number; t1: number; bpm: number; beat0: number; bar: number }) {
    const paint = (o: { wave: Waveform | null; w: number; t0: number; t1: number; bpm: number; beat0: number; bar: number }) => {
      const dpr = window.devicePixelRatio || 1, W = Math.min(4096, Math.max(1, Math.round(o.w))), H = LANE - 6;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = o.w + 'px'; c.style.height = H + 'px';
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawWave(ctx, W, H, o.wave, { scheme: overview.scheme, t0: o.t0, t1: o.t1, grid: { bpm: o.bpm, beat0: o.beat0, bar: o.bar }, playhead: null });
    };
    paint(o);
    return { update: paint };
  }
</script>

<div class="lanes" id="set-lanes" style:--decks={plan.decks} data-guide="set-lanes">
  <div class="inner" style:width={total + 40 + 'px'} style:height={RULER + plan.decks * LANE + 'px'}>
    <div class="ruler">{#each ticks as s (s)}<span style:left={s * zoom + 'px'}>{clock(s)}</span>{/each}</div>
    {#each Array(plan.decks) as _, d (d)}<div class="lane" style:top={RULER + d * LANE + 'px'}><i>Deck {d + 1}</i></div>{/each}
    {#each overlaps as o (o.i)}
      <div class="ov" class:cut={o.style === 'cut'} style:left={o.x + 'px'} style:width={o.w + 'px'} style:top={RULER + 'px'} style:height={plan.decks * LANE + 'px'} title={FX[o.style]}><b>{FX[o.style]}</b></div>
    {/each}
    {#each blocks as b (b.i)}
      <div class="blk" data-song={b.it.id} style:left={b.x + 'px'} style:width={b.w + 'px'} style:top={RULER + b.it.deck * LANE + 3 + 'px'} title={name(b.it.id) + (b.it.guessed ? ' (beat grid guessed)' : '')}>
        <canvas use:draw={{ wave: waves.get(b.it.id) ?? null, w: b.w, t0: b.t0, t1: b.t1, bpm: b.it.bpm, beat0: b.it.beat0, bar: b.bar }}></canvas>
        <span class="nm">{b.i + 1}. {name(b.it.id)}{#if b.it.guessed} <em>grid guessed</em>{/if}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .lanes { overflow-x: auto; overflow-y: hidden; border: 1px solid var(--line); border-radius: 8px; background: var(--ground); }
  .inner { position: relative; min-width: 100%; }
  .ruler { position: absolute; inset: 0 0 auto 0; height: 22px; border-bottom: 1px solid var(--line); }
  .ruler span { position: absolute; top: 4px; font-size: 11px; color: var(--muted); font-family: var(--font-mono); transform: translateX(2px); border-left: 1px solid var(--line); padding-left: 3px; }
  .lane { position: absolute; left: 0; right: 0; height: 64px; border-bottom: 1px dashed color-mix(in srgb, var(--line) 70%, transparent); }
  .lane i { position: sticky; left: 4px; font-style: normal; font-size: 10.5px; color: var(--muted); }
  .ov { position: absolute; background: color-mix(in srgb, var(--accent) 16%, transparent); border-left: 1px solid var(--accent); border-right: 1px solid var(--accent); pointer-events: none; z-index: 2; }
  .ov.cut { background: none; border-right: 0; }
  .ov b { position: absolute; bottom: 2px; left: 4px; font-size: 10.5px; color: var(--accent); font-weight: 600; white-space: nowrap; }
  .blk { position: absolute; height: 58px; border-radius: 5px; overflow: hidden; background: #0b0b10; outline: 1px solid var(--line-2); }
  .blk canvas { display: block; }
  .nm { position: absolute; left: 6px; top: 3px; font-size: 11.5px; color: #fff; text-shadow: 0 1px 2px #000; white-space: nowrap; max-width: calc(100% - 10px); overflow: hidden; text-overflow: ellipsis; }
  .nm em { color: var(--warn); font-style: normal; }
</style>
