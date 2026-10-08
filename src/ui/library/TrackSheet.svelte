<script lang="ts">
  /* A song's page as a sheet over the library (the user, 2026-10-08: not a page of its own, faster): the library stays
     as it was underneath (its scroll, its selection), dimmed. ✕, Esc, a click beside it or Back close it. */
  import TrackDetail from './TrackDetail.svelte';
  import { closeTrack } from '../../lib/view.svelte';
  import type { TrackTab } from '../../lib/route.svelte';

  let { id, tab }: { id: string; tab: TrackTab } = $props();
  let box = $state<HTMLElement>();
  $effect(() => { box?.focus({ preventScroll: true }); });

  function key(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    // A menu or another dialog open on top closes first.
    if (document.querySelector('.cmenu') || document.querySelectorAll('[aria-modal="true"]').length > 1) return;
    e.preventDefault();
    closeTrack();
  }
</script>

<svelte:window onkeydown={key} />
<div class="scrim" role="presentation" onpointerdown={e => { if (e.button === 0 && !(e.target as HTMLElement).closest('.sheet')) closeTrack(); }}>
  <div class="sheet" id="track-sheet" role="dialog" aria-modal="true" aria-label="Song" tabindex="-1" bind:this={box}>
    <button type="button" class="x" id="sheet-close" aria-label="Close" title="Close (Esc)" onclick={closeTrack}>✕</button>
    {#key id}<TrackDetail {id} {tab} />{/key}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 40; background: color-mix(in srgb, var(--ground) 55%, transparent); animation: fade .14s ease-out; }
  .sheet { position: absolute; top: 0; right: 0; bottom: 0; width: min(1240px, 84vw); overflow-y: auto; overscroll-behavior: contain;
    background: var(--ground); border-left: 1px solid var(--line-2); box-shadow: -24px 0 60px rgb(0 0 0 / .35); padding: 16px 28px 28px; outline: none;
    animation: slide .18s ease-out; }
  .x { position: sticky; top: 0; float: right; z-index: 3; margin: -4px -12px 0 12px; width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--line-2);
    background: var(--surface); color: var(--ink-2); cursor: pointer; font-size: 14px; line-height: 1; }
  .x:hover { border-color: var(--accent); color: var(--accent); }
  @keyframes slide { from { transform: translateX(40px); opacity: .4; } to { transform: none; opacity: 1; } }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .sheet, .scrim { animation: none; } }
  @media (max-width: 900px) { .sheet { width: 100vw; padding: 12px 14px 20px; } }
</style>
