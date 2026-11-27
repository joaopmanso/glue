<script lang="ts">
  /* The flow's energy curve (ADR 0198): its points, dragged up and down when `onpoint` is given; the songs' energies as
     dots over it (the result). Energy 1 at the bottom, 10 at the top. */
  import { flowAt } from '../../core/library/autoplaylist';

  let { points, dots = [], onpoint, label = 'Energy curve', id }: {
    points: number[]; dots?: (number | null)[]; onpoint?: (i: number, v: number) => void; label?: string; id?: string;
  } = $props();

  const Wd = 300, Ht = 90, pad = 8;
  const x = (f: number) => pad + f * (Wd - 2 * pad);
  const y = (e: number) => Ht - pad - (e - 1) / 9 * (Ht - 2 * pad);
  const path = $derived.by(() => {
    if (!points.length) return '';
    let d = '';
    for (let i = 0; i <= 60; i++) { const f = i / 60; d += (i ? 'L' : 'M') + x(f).toFixed(1) + ' ' + y(flowAt(points, f)).toFixed(1); }
    return d;
  });
  let svg: SVGSVGElement | undefined = $state(), drag = $state(-1);
  function valueAt(e: PointerEvent) {
    const r = svg!.getBoundingClientRect(), py = (e.clientY - r.top) / r.height * Ht;
    return 1 + (Ht - pad - py) / (Ht - 2 * pad) * 9;
  }
  function down(i: number, e: PointerEvent) { if (!onpoint) return; drag = i; (e.currentTarget as Element).setPointerCapture(e.pointerId); onpoint(i, valueAt(e)); }
  function move(e: PointerEvent) { if (drag >= 0 && onpoint) onpoint(drag, valueAt(e)); }
  function key(i: number, e: KeyboardEvent) {
    if (!onpoint) return;
    const d = e.key === 'ArrowUp' ? 0.5 : e.key === 'ArrowDown' ? -0.5 : 0;
    if (d) { e.preventDefault(); onpoint(i, points[i] + d); }
  }
</script>

<svg bind:this={svg} {id} class="flow" class:edit={!!onpoint} viewBox={`0 0 ${Wd} ${Ht}`} role="group" aria-label={label}
  onpointermove={move} onpointerup={() => (drag = -1)} onpointercancel={() => (drag = -1)}>
  {#each [1, 4, 7, 10] as e (e)}<line class="g" x1={pad} x2={Wd - pad} y1={y(e)} y2={y(e)} />{/each}
  <path d={path} class="c" />
  {#each dots as e, i (i)}
    {#if e != null}<circle class="dot" cx={x(dots.length > 1 ? i / (dots.length - 1) : 0)} cy={y(e)} r="3"><title>{'Song ' + (i + 1) + ': energy ' + Math.round(e)}</title></circle>{/if}
  {/each}
  {#if onpoint}
    {#each points as p, i (i)}
      <circle class="h" class:on={drag === i} cx={x(points.length > 1 ? i / (points.length - 1) : 0)} cy={y(p)} r="6" tabindex="0" role="slider"
        aria-label={'Energy at point ' + (i + 1)} aria-valuemin={1} aria-valuemax={10} aria-valuenow={p}
        onpointerdown={e => down(i, e)} onkeydown={e => key(i, e)} />
    {/each}
  {/if}
</svg>

<style>
  .flow { width: 100%; height: 90px; display: block; background: var(--ground); border: 1px solid var(--line); border-radius: 6px; touch-action: none; }
  .g { stroke: var(--line); stroke-width: 1; }
  .c { fill: none; stroke: var(--accent); stroke-width: 2; opacity: 0.85; }
  .dot { fill: var(--ink-2); }
  .h { fill: var(--surface); stroke: var(--accent); stroke-width: 2; cursor: ns-resize; }
  .h.on, .h:focus-visible { fill: var(--accent); outline: none; }
</style>
