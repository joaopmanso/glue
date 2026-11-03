<script lang="ts">
  /* A download on its way (ADR 0193): how far it is, the song it's on, and what had to be left out. */
  import { downloads } from '../../lib/downloads.svelte';
  import { fmtBytes } from '../../core/format';
  import { fmtLeft } from '../../core/transferRate';
  import Parts from '../Parts.svelte';

  const d = $derived(downloads.now);
  const left = $derived(d ? d.skipped.length : 0);
  // Nothing to measure yet (or the browser finishing the file): the bar says it's working, not how far.
  const unknown = $derived(!!d && (d.phase === 'finishing' || !d.got || !d.total));
  const pct = $derived(d && d.total ? Math.min(100, Math.floor(d.got / d.total * 100)) : 0);
</script>

{#if d}
  <div class="dl" id="download-panel" role="status" data-phase={d.phase}>
    <div class="head">
      <b title={d.name}>{d.phase === 'running' ? 'Downloading ' + d.name : d.phase === 'finishing' ? 'Finishing ' + d.name + '…' : d.phase === 'done' ? 'Saved ' + d.name : d.phase === 'cancelled' ? 'Download cancelled' : 'Couldn’t download ' + d.name}</b>
      {#if d.phase === 'running'}<button type="button" class="mini" id="download-cancel" onclick={() => downloads.cancel()}>Cancel</button>
      {:else if d.phase !== 'finishing'}<button type="button" class="x" id="download-dismiss" aria-label="Dismiss" onclick={() => downloads.dismiss()}>×</button>{/if}
    </div>
    {#if d.phase === 'running' || d.phase === 'finishing'}<div class="bar" class:unknown>{#if !unknown}<span style:transform={'scaleX(' + d.got / d.total + ')'}></span>{:else}<i></i>{/if}</div>{/if}
    {#if d.phase === 'running'}
      <p class="now" id="download-song" title={d.current}>{d.zip ? 'Song ' + d.at + ' of ' + d.count + ': ' : ''}{d.current}</p>
      {#if d.note}<p class="note" class:trouble={d.trouble} id="download-note">{d.note}</p>{/if}
      <p class="fine" id="download-progress"><Parts items={[pct + '%', fmtBytes(d.got) + (d.total ? ' of ' + fmtBytes(d.total) : ''), d.rate ? fmtBytes(d.rate) + '/s' : null, d.left != null && d.left > 0 ? fmtLeft(d.left) : 'working out the time left']} /></p>
      <p class="fine">Keep this tab open until it’s done.</p>
    {:else if d.phase === 'finishing'}
      <p class="fine">The browser checks the file before it appears. A big one takes a moment.</p>
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
  .bar i { display: block; width: 30%; height: 100%; background: var(--accent); animation: slide 1.4s ease-in-out infinite; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
  p { margin: 0; }
  .now { color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fine { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .note { color: var(--ink-2); font-size: 12.5px; }
  .note.trouble { color: var(--warn); }
  .err { color: var(--bad); font-size: 12.5px; }
  .warn { color: var(--warn); font-weight: 600; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; max-height: 160px; overflow-y: auto; }
  li { display: flex; justify-content: space-between; gap: 10px; color: var(--ink-2); }
  .n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .st { flex: none; max-width: 55%; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* A phone (ADR 0078): above the player and the tabs. */
  @media (max-width: 760px) { .dl { left: 8px; right: 8px; width: auto; bottom: calc(60px + 70px + env(safe-area-inset-bottom, 0px)); z-index: 35; } }
  @media (prefers-reduced-motion: reduce) { .bar span { transition: none; } .bar i { animation: none; width: 100%; opacity: .4; } }
</style>
