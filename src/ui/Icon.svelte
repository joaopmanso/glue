<script lang="ts">
  /* The small line icons that replaced emoji glyphs (ADR 0191): one stroke, currentColor, sized to the text. */
  type Name = 'folder' | 'folder-open' | 'note' | 'disc' | 'gear' | 'play' | 'pause' | 'prev' | 'next' | 'chev-left' | 'chev-right' | 'chev-double';
  let { name, size = '1em' }: { name: Name; size?: string } = $props();
</script>

<svg class="icon" viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'folder'}<path d="M1.5 4.5v8h13V6H8L6.5 4.5z"/>
  {:else if name === 'folder-open'}<path d="M1.5 12.5v-8h5L8 6h5v1.5M1.5 12.5l2-5h11l-2 5z"/>
  {:else if name === 'note'}<path d="M6 12V3l7-1.5v9"/><circle cx="4.5" cy="12" r="1.8"/><circle cx="11.5" cy="10.5" r="1.8"/>
  {:else if name === 'disc'}<circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="1.6"/>
  {:else if name === 'gear'}<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>
  {:else if name === 'play'}<path d="M4.5 2.5v11l9-5.5z" fill="currentColor"/>
  {:else if name === 'pause'}<path d="M5 3v10M11 3v10" stroke-width="2.4"/>
  {:else if name === 'prev'}<path d="M11.5 2.5v11l-8-5.5z" fill="currentColor"/>
  {:else if name === 'next'}<path d="M4.5 2.5v11l8-5.5z" fill="currentColor"/>
  {:else if name === 'chev-left'}<path d="M10 3 5 8l5 5"/>
  {:else if name === 'chev-right'}<path d="m6 3 5 5-5 5"/>
  {:else if name === 'chev-double'}<path d="m3.5 3 5 5-5 5M8.5 3l5 5-5 5"/>
  {/if}
</svg>

<style>
  .icon { display: inline-block; flex: none; vertical-align: -0.125em; }
</style>
