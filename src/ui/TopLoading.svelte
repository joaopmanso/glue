<script lang="ts">
  /* A line along the top of the page while GLUE opens something or works on a job (ADR 0177): seen whichever page is
     shown, so a wait is never only a still screen. */
  import { lib } from '../lib/library.svelte';

  const w = $derived(lib.loading ?? lib.job);
  const pct = $derived(w?.total ? Math.max(3, Math.min(100, (w.done / w.total) * 100)) : null);
</script>

{#if w}
  <div class="toploading" id="top-loading" aria-hidden="true"><span class:indet={pct == null} style:width={pct == null ? '30%' : pct + '%'}></span></div>
{/if}

<style>
  .toploading { position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 1000; pointer-events: none; overflow: hidden; }
  .toploading span { display: block; height: 100%; background: var(--accent); box-shadow: 0 0 6px var(--accent); transition: width .2s ease-out; }
  .toploading span.indet { animation: slide 1.2s ease-in-out infinite; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
  @media (prefers-reduced-motion: reduce) { .toploading span.indet { animation: none; } .toploading span { transition: none; } }
</style>
