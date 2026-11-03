<script lang="ts">
  /* A download on its way (ADR 0193): how far it is, the song it's on, and what had to be left out. */
  import { downloads } from '../../lib/downloads.svelte';
  import { fmtBytes } from '../../core/format';
  import Parts from '../Parts.svelte';

  const d = $derived(downloads.now);
  const left = $derived(d ? d.skipped.length : 0);
</script>

{#if d}
  <div class="dl" id="download-panel" role="status" data-phase={d.phase}>
    <div class="head">
      <b title={d.name}>{d.phase === 'running' ? 'Downloading ' + d.name : d.phase === 'finishing' ? 'Finishing ' + d.name + '…' : d.phase === 'done' ? 'Saved ' + d.name : d.phase === 'cancelled' ? 'Download cancelled' : 'Couldn’t download ' + d.name}</b>
      {#if d.phase === 'running'}<button type="button" class="mini" id="download-cancel" onclick={() => downloads.cancel()}>Cancel</button>
      {:else if d.phase !== 'finishing'}<button type="button" class="x" id="download-dismiss" aria-label="Dismiss" onclick={() => downloads.dismiss()}>×</button>{/if}
    </div>
    {#if d.phase === 'running' || d.phase === 'finishing'}<div class="bar"><span style:transform={'scaleX(' + (d.total ? Math.min(1, d.got / d.total) : 0) + ')'}></span></div>{/if}
    {#if d.phase === 'running'}
      <p class="now" title={d.current}>{d.current}</p>
      <p class="fine"><Parts items={[d.zip && d.saved + ' of ' + d.count + ' songs', fmtBytes(d.got) + (d.total ? ' of ' + fmtBytes(d.total) : '')]} /></p>
      <p class="fine">Keep this tab open until it’s done.</p>
    {:else if d.phase === 'done'}
      <p class="fine" id="download-sum"><Parts items={[d.zip && d.saved + ' song' + (d.saved === 1 ? '' : 's'), fmtBytes(d.got)]} /></p>
    {/if}
    {#if d.error}<p class="err">{d.error}</p>{/if}
    {#if left && d.phase !== 'running'}
      <p class="warn" id="download-left">Left out: {left} song{left === 1 ? '' : 's'}</p>
      <ul>{#each d.skipped as s, i (i)}<li><span class="n" title={s.name}>{s.name}</span><span class="st" title={s.why}>{s.why}</span></li>{/each}</ul>
    {/if}
  </div>
{/if}

<style>
  .dl { position: fixed; left: clamp(16px, 3vw, 32px); bottom: 76px; z-index: 26; width: min(420px, calc(100% - 32px)); background: var(--raised); border: 1px solid var(--line-2); border-radius: 10px; padding: 12px 14px; display: grid; gap: 7px; font-size: 13px; box-shadow: var(--shadow-pop); }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .head b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .x { background: none; border: 0; color: var(--muted); font-size: 16px; cursor: pointer; }
  .mini { flex: none; background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 2px 8px; cursor: pointer; }
  .mini:hover { border-color: var(--accent); color: var(--accent); }
  [data-phase="done"] .head b { color: var(--ok); }
  [data-phase="failed"] .head b { color: var(--bad); }
  .bar { height: 3px; background: var(--line); border-radius: 2px; overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--accent); transform-origin: left; transform: scaleX(0); transition: transform .2s; }
  p { margin: 0; }
  .now { color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fine { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .err { color: var(--bad); font-size: 12.5px; }
  .warn { color: var(--warn); font-weight: 600; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; max-height: 160px; overflow-y: auto; }
  li { display: flex; justify-content: space-between; gap: 10px; color: var(--ink-2); }
  .n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .st { flex: none; max-width: 55%; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* A phone (ADR 0078): above the player and the tabs. */
  @media (max-width: 760px) { .dl { left: 8px; right: 8px; width: auto; bottom: calc(60px + 70px + env(safe-area-inset-bottom, 0px)); z-index: 35; } }
  @media (prefers-reduced-motion: reduce) { .bar span { transition: none; } }
</style>
