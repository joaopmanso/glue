<script lang="ts">
  /* The performance numbers (ADR 0058), shown with ?perf: how long the collection took to open, the
     row list's cost, drawing per frame, long frames and slow clicks or keys. "Copy" puts them all on
     the clipboard to paste into a report. */
  import { onMount } from 'svelte';
  import { perf, pct } from '../lib/perf';
  import { perfStats, type Stat } from '../core/perf';

  let open = $state(true);
  let stats = $state<Record<string, Stat>>({});
  let recent = $state({ drawP95: 0, over50: 0, gapMax: 0 });
  let slow = $state<{ name: string; ms: number; target: string }[]>([]);
  let copied = $state(false);

  function refresh() {
    stats = perfStats();
    const gaps = perf.gaps.slice(-600), work = perf.work.slice(-600);   // about the last 10 s
    recent = { drawP95: pct(work, 95), over50: gaps.filter(g => g > 50).length, gapMax: Math.max(0, ...gaps) };
    slow = perf.events.slice(-5).reverse();
  }
  onMount(() => { refresh(); const t = setInterval(refresh, 500); return () => clearInterval(t); });

  const ms = (x: number | undefined) => x === undefined ? '–' : x < 10 ? x.toFixed(1) : String(Math.round(x));
  const line = (k: string) => { const s = stats[k]; return s ? `${ms(s.last)} ms (avg ${ms(s.total / s.n)}, max ${ms(s.max)}, ×${s.n})` : '–'; };

  async function copy() {
    const report = { at: new Date().toISOString(), ua: navigator.userAgent, stats: perfStats(), summary: perf.summary(), long: perf.long.slice(-20), events: perf.events.slice(-40) };
    try { await navigator.clipboard.writeText(JSON.stringify(report, null, 1)); copied = true; setTimeout(() => { copied = false; }, 1500); } catch { /* no clipboard */ }
  }
</script>

<div class="hud" class:shut={!open} aria-label="Performance numbers">
  <button type="button" class="head" onclick={() => { open = !open; }}>⏱ perf {open ? '▾' : '▸'}</button>
  {#if open}
    <dl>
      <dt>Open</dt><dd>{line('open.collection')}</dd>
      <dt>Store load</dt><dd>{line('store.load')}</dd>
      <dt>Rows</dt><dd>{line('rows')}</dd>
      <dt>Save</dt><dd>{line('store.flush')}</dd>
      <dt>Draw / frame</dt><dd>P95 {ms(recent.drawP95)} ms (last 10 s)</dd>
      <dt>Long frames</dt><dd>{recent.over50} over 50 ms · worst {ms(recent.gapMax)} ms (last 10 s)</dd>
    </dl>
    {#if slow.length}
      <div class="slow">{#each slow as e, i (i)}<div>{e.name} {Math.round(e.ms)} ms <span>{e.target}</span></div>{/each}</div>
    {/if}
    <div class="acts">
      <button type="button" onclick={() => { perf.reset(); refresh(); }}>Reset</button>
      <button type="button" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  {/if}
</div>

<style>
  .hud { position: fixed; left: 8px; bottom: 76px; z-index: 200; width: 330px; background: var(--raised); color: var(--ink); border: 1px solid var(--line-2); border-radius: 8px; font: 11.5px/1.35 ui-monospace, monospace; box-shadow: 0 6px 18px rgb(0 0 0 / .35); }
  .hud.shut { width: auto; }
  .head { all: unset; cursor: pointer; display: block; padding: 4px 8px; font-weight: 700; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; margin: 0; padding: 0 8px 6px; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  .slow { padding: 4px 8px; border-top: 1px solid var(--line); }
  .slow span { color: var(--muted); }
  .acts { display: flex; gap: 6px; padding: 4px 8px 6px; border-top: 1px solid var(--line); }
  .acts button { font: inherit; padding: 1px 8px; }
</style>
