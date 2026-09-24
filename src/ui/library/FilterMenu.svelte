<script lang="ts">
  /* The table's value filters (quality, format, tags, genre): ticks for what's in the current view, with counts. */
  import { view, FILTER_GROUPS } from '../../lib/view.svelte';
  import FilterList from './FilterList.svelte';

  let open = $state(false);
  const n = $derived(view.filterValues.length);
</script>

<svelte:window onpointerdown={e => { if (open && !(e.target as HTMLElement).closest('.fm')) open = false; }} onkeydown={e => { if (e.key === 'Escape') open = false; }} />

<span class="fm">
  <button type="button" class="fbtn" class:on={n > 0} id="filter-btn" aria-haspopup="true" aria-expanded={open} onclick={() => (open = !open)}>
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12l-4.5 5.5V13l-3 1.5V8.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
    Filter{#if n}<b>{n}</b>{/if}
  </button>
  {#if open}
    <div class="pop" id="filter-menu" role="dialog" aria-label="Filter tracks">
      {#each FILTER_GROUPS as { g, title } (g)}<FilterList group={g} {title} search />{/each}
      <div class="foot">
        <span>Show only the ticked. Any of them within a group; all groups together.</span>
        <button type="button" disabled={!n} onclick={() => view.clearFilters()}>Clear all</button>
      </div>
    </div>
  {/if}
</span>

<style>
  .fm { position: relative; }
  .fbtn { display: inline-flex; align-items: center; gap: 6px; background: var(--surface); border: 1px solid var(--line-2); border-radius: var(--radius); padding: 7px 12px; cursor: pointer; font-size: 13px; color: var(--ink-2); }
  .fbtn:hover, .fbtn.on { border-color: var(--accent); color: var(--accent); }
  .fbtn svg { width: 14px; height: 14px; }
  .fbtn b { background: var(--accent); color: var(--accent-ink); border-radius: 9px; padding: 0 6px; font-size: 11px; }
  .pop { position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; width: 520px; max-height: min(620px, 75vh); overflow-y: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; background: var(--raised); border: 1px solid var(--line-2); border-radius: 8px; padding: 12px; box-shadow: 0 12px 32px rgb(0 0 0 / .45); }
  .foot { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; gap: 10px; color: var(--muted); font-size: 11.5px; border-top: 1px solid var(--line); padding-top: 8px; }
  .foot button { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); padding: 3px 10px; cursor: pointer; font-size: 12px; }
  .foot button:disabled { opacity: .4; cursor: default; }
  @media (max-width: 600px) { .pop { width: min(520px, calc(100vw - 32px)); grid-template-columns: 1fr; } }
</style>
