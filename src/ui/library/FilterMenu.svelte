<script lang="ts">
  /* Quality and format filters for the track table: checkboxes for what's in the current view, with counts. */
  import { view, qualityOf, formatOf } from '../../lib/view.svelte';
  import { app } from '../../lib/app.svelte';
  import { lib } from '../../lib/library.svelte';

  let open = $state(false);
  // Counts over the current view without the filters, so every option stays visible.
  const counts = $derived.by(() => {
    void lib.version;
    const q = new Map<string, number>(), f = new Map<string, number>();
    for (const r of view.rows(app.keyNotation, { unfiltered: true })) {
      const a = qualityOf(r), b = formatOf(r.t);
      q.set(a, (q.get(a) ?? 0) + 1); f.set(b, (f.get(b) ?? 0) + 1);
    }
    const sort = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
    return { quality: sort(q), format: sort(f) };
  });
  const n = $derived(view.filters.quality.length + view.filters.format.length);
</script>

<svelte:window onpointerdown={e => { if (open && !(e.target as HTMLElement).closest('.fm')) open = false; }} onkeydown={e => { if (e.key === 'Escape') open = false; }} />

<span class="fm">
  <button type="button" class="fbtn" class:on={n > 0} id="filter-btn" aria-haspopup="true" aria-expanded={open} onclick={() => (open = !open)}>
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12l-4.5 5.5V13l-3 1.5V8.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
    Filter{#if n}<b>{n}</b>{/if}
  </button>
  {#if open}
    <div class="pop" id="filter-menu" role="dialog" aria-label="Filter tracks">
      {#each [['quality', 'Quality'], ['format', 'Format']] as [g, title] (g)}
        {@const group = g as 'quality' | 'format'}
        <fieldset>
          <legend>{title}</legend>
          {#each counts[group] as [value, count] (value)}
            <label><input type="checkbox" checked={view.filters[group].includes(value)} onchange={() => view.toggleFilter(group, value)}> <span>{value}</span><small>{count}</small></label>
          {:else}<p class="none">Nothing here.</p>{/each}
        </fieldset>
      {/each}
      <div class="foot">
        <span>Any of the ticked in a group; both groups together.</span>
        <button type="button" disabled={!n} onclick={() => view.clearFilters()}>Clear</button>
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
  .pop { position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; width: 460px; max-height: min(520px, 70vh); overflow-y: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: var(--raised); border: 1px solid var(--line-2); border-radius: 8px; padding: 12px; box-shadow: 0 12px 32px rgb(0 0 0 / .45); }
  fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 2px; align-content: start; }
  legend { font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin-bottom: 4px; }
  label { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 3px 4px; border-radius: 4px; cursor: pointer; }
  label:hover { background: var(--surface); }
  label span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  label small { color: var(--muted); font-family: var(--font-mono); font-size: 11px; }
  .none { color: var(--muted); font-size: 12.5px; }
  .foot { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; gap: 10px; color: var(--muted); font-size: 11.5px; border-top: 1px solid var(--line); padding-top: 8px; }
  .foot button { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); padding: 3px 10px; cursor: pointer; font-size: 12px; }
  .foot button:disabled { opacity: .4; cursor: default; }
  @media (max-width: 600px) { .pop { width: min(460px, calc(100vw - 32px)); grid-template-columns: 1fr; } }
</style>
