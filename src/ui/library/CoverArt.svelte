<script lang="ts">
  /* A song's cover (ADR 0072): the table's Cover column (small, bigger while hovered) and the track
     page. Nothing is drawn for a song without one. */
  import { covers, type CoverSize } from '../../lib/covers.svelte';
  import type { Track } from '../../store/types';

  let { t, size = 64, px = 26, zoom = false }: { t: Track; size?: CoverSize; px?: number; zoom?: boolean } = $props();
  const src = $derived.by(() => { void covers.version; return covers.get(t, size); });
  $effect(() => { if (src === undefined) covers.request(t, size); });
  $effect(() => { const tr = t, sz = size; covers.hold(tr, sz); return () => covers.drop(tr, sz); });

  // Hovered: the large one beside it, kept inside the window.
  let at = $state<{ x: number; y: number } | null>(null);
  const big = $derived.by(() => { void covers.version; return at ? covers.get(t, 320) : null; });
  $effect(() => { if (at && big === undefined) covers.request(t, 320); });
  const BIG = 240;
  // On the page itself: a table row's transform would place a fixed element from the row.
  const toBody = (el: HTMLElement) => { document.body.appendChild(el); return { destroy: () => el.remove() }; };
  function enter(e: PointerEvent) {
    if (!zoom || !src) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    at = { x: r.right + BIG + 12 > innerWidth ? Math.max(8, r.left - BIG - 8) : r.right + 8, y: Math.max(8, Math.min(innerHeight - BIG - 8, r.top + r.height / 2 - BIG / 2)) };
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span class="cov" class:has={!!src} style:width={px + 'px'} style:height={px + 'px'} data-cover={src ? covers.hashOf(t) : undefined}
  onpointerenter={enter} onpointerleave={() => (at = null)}>
  {#if src}<img {src} alt="Cover" width={px} height={px} draggable="false" />{/if}
</span>
{#if at && big}<img class="big" use:toBody src={big} alt="Cover" width={BIG} height={BIG} style:left={at.x + 'px'} style:top={at.y + 'px'} />{/if}

<style>
  .cov { display: inline-block; flex: none; border-radius: 3px; overflow: hidden; vertical-align: middle; }
  .cov.has { background: var(--raised); box-shadow: 0 0 0 1px var(--line); }
  .cov img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .big { position: fixed; z-index: 70; border-radius: 6px; box-shadow: 0 16px 40px rgb(0 0 0 / .55), 0 0 0 1px var(--line-2); pointer-events: none; background: var(--raised); }
</style>
