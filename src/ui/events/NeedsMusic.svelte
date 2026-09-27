<script lang="ts">
  /* A reminder above the library and the calendar (ADR 0074): an event coming within its reminder days
     with no music yet. × hides it until tomorrow. */
  import { events, fmtWhen } from '../../lib/events.svelte';
  import { readPref, writePref } from '../../lib/prefs';
  import { dayKey } from '../../core/library/events';

  const today = dayKey(new Date());
  let hidden = $state<string[]>((() => { try { const v = JSON.parse(readPref('remindersHidden', '{}')) as Record<string, string>; return Object.entries(v).filter(([, d]) => d === today).map(([id]) => id); } catch { return []; } })());
  const shown = $derived(events.needing().filter(e => !hidden.includes(e.id)));
  function hide(id: string) {
    hidden = [...hidden, id];
    writePref('remindersHidden', JSON.stringify(Object.fromEntries(hidden.map(h => [h, today]))));
  }
</script>

{#each shown.slice(0, 2) as e (e.id)}
  <div class="remind" role="status" data-remind={e.id}>
    <span><b>{e.name}</b> ({fmtWhen(e.starts, { time: false })}) has no music yet.</span>
    <a class="go" href={'#/events/' + e.id}>Open the event</a>
    <button type="button" class="x" aria-label="Hide until tomorrow" title="Hide until tomorrow" onclick={() => hide(e.id)}>×</button>
  </div>
{/each}

<style>
  .remind { display: flex; align-items: center; gap: 12px; padding: 7px 12px; border: 1px solid color-mix(in srgb, var(--warn) 50%, var(--line-2)); border-radius: 8px; background: color-mix(in srgb, var(--warn) 10%, var(--surface)); font-size: 13.5px; }
  .remind span { flex: 1; min-width: 0; }
  .go { color: var(--accent); text-decoration: none; font-weight: 600; white-space: nowrap; }
  .x { background: none; border: 0; color: var(--muted); font-size: 18px; cursor: pointer; line-height: 1; }
</style>
