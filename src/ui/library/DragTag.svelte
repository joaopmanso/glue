<script lang="ts">
  /* The small tag that follows the pointer during an in-app drag. */
  import { drag } from '../../lib/drag.svelte';
  import { lib } from '../../lib/library.svelte';

  const text = $derived.by(() => {
    const p = drag.payload, t = drag.target;
    if (!p) return '';
    if (p.kind === 'tracks') {
      if (t?.type === 'playlist') return 'Add ' + p.label + ' to ' + (lib.store?.lists.get(t.id)?.name ?? 'playlist');
      if (t?.type === 'new') return 'New playlist with ' + p.label;
      if (t?.type === 'row') return 'Move ' + p.label + ' here';
      return p.label;
    }
    if (t?.type === 'list' && t.at === 'into') return 'Move ' + p.label + ' into ' + (lib.store?.lists.get(t.id)?.name ?? 'folder');
    if (t?.type === 'top') return 'Move ' + p.label + ' to the top level';
    return p.label;
  });
  const ok = $derived(!!drag.target);
</script>

{#if drag.active && drag.payload}
  <div class="tag" class:ok style:transform={'translate(' + (drag.x + 14) + 'px, ' + (drag.y + 12) + 'px)'} aria-hidden="true">
    {#if ok && drag.payload.kind === 'tracks'}<span class="plus">+</span>{/if}{text}
  </div>
{/if}

<style>
  .tag { position: fixed; left: 0; top: 0; z-index: 100; pointer-events: none; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    background: var(--raised); color: var(--ink); border: 1px solid var(--line-2); border-radius: 14px; padding: 3px 10px; font-size: 12.5px; font-weight: 600; box-shadow: 0 6px 18px rgb(0 0 0 / .45); }
  .tag.ok { border-color: var(--accent); }
  .plus { display: inline-grid; place-items: center; width: 15px; height: 15px; border-radius: 50%; background: var(--accent); color: var(--accent-ink); font-weight: 800; margin-right: 6px; font-size: 12px; line-height: 1; }
  :global(body.mco-dragging), :global(body.mco-dragging *) { cursor: grabbing !important; user-select: none !important; }
</style>
