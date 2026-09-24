<script lang="ts">
  /* One filter group's values with counts ("show only" ticks), for the Filter menu and the column headers. */
  import { view, valuesOf, type FilterGroup } from '../../lib/view.svelte';
  import { app } from '../../lib/app.svelte';
  import { lib } from '../../lib/library.svelte';
  import { tagColorOf } from '../../lib/tags.svelte';

  let { group, title = '', search = false }: { group: FilterGroup; title?: string; search?: boolean } = $props();
  let q = $state('');
  // Counted over the view with the other groups' filters, so every option of this group stays visible.
  const counts = $derived.by(() => {
    void lib.version; void view.filters;
    const m = new Map<string, number>();
    for (const r of view.rows(app.keyNotation, { except: group })) for (const v of valuesOf(group, r)) m.set(v, (m.get(v) ?? 0) + 1);
    for (const v of view.filters[group]) if (!m.has(v)) m.set(v, 0);   // a ticked value stays untickable
    return [...m].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  });
  const shown = $derived(q.trim() ? counts.filter(([v]) => v.toLowerCase().includes(q.trim().toLowerCase())) : counts);
  const chosen = $derived(view.filters[group]);
  const total = $derived(counts.reduce((a, [, n]) => a + n, 0));
</script>

<fieldset class="fl" data-group={group}>
  {#if title}<legend>{title}</legend>{/if}
  {#if search && counts.length > 8}<input class="fq" type="search" placeholder="Find…" bind:value={q} aria-label={'Find ' + (title || group)}>{/if}
  <label class="all"><input type="checkbox" checked={!chosen.length} disabled={!chosen.length} onchange={() => view.clearFilters(group)}> <span>All</span><small>{group === 'tag' ? '' : total}</small></label>
  <div class="vals">
    {#each shown as [value, count] (value)}
      <label><input type="checkbox" checked={chosen.includes(value)} onchange={() => view.toggleFilter(group, value)}>
        {#if group === 'tag' && value !== 'No tags'}<i class="dot" style:background={tagColorOf(value)}></i>{/if}<span>{value}</span><small>{count}</small></label>
    {:else}<p class="none">{q ? 'No match.' : 'Nothing here.'}</p>{/each}
  </div>
</fieldset>

<style>
  .fl { border: 0; margin: 0; padding: 0; display: grid; gap: 2px; align-content: start; min-width: 0; }
  legend { font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin-bottom: 4px; }
  .vals { display: grid; gap: 2px; max-height: 240px; overflow-y: auto; }
  label { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 3px 4px; border-radius: 4px; cursor: pointer; text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--ink); }
  label:hover { background: var(--surface); }
  label.all { border-bottom: 1px solid var(--line); border-radius: 4px 4px 0 0; padding-bottom: 5px; margin-bottom: 2px; color: var(--ink-2); }
  label span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  label small { color: var(--muted); font-family: var(--font-mono); font-size: 11px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .fq { background: var(--ground); border: 1px solid var(--line-2); border-radius: 4px; padding: 4px 8px; font-size: 12.5px; margin-bottom: 4px; }
  .none { color: var(--muted); font-size: 12.5px; padding: 3px 4px; }
</style>
