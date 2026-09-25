<script lang="ts">
  /* GLUE's logo: an open glue stick with a drip (it glues DJ apps together), in the theme's colours.
     public/glue.svg is the same drawing in fixed colours, for the browser tab. */
  let { size = 30 }: { size?: number } = $props();
</script>

<svg class="gluestick" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
  <g transform="rotate(-14 16 16)">
    <path class="glue" d="M11 10V5.6C11 3.8 13.2 2.6 16 2.6s5 1.2 5 3V10z"/>
    <path class="glue" d="M18.4 9.5h2.4v4.3a1.2 1.2 0 0 1-2.4 0z"/>
    <rect class="dark" x="10" y="9.6" width="12" height="2.2" rx=".8"/>
    <rect class="body" x="10" y="11.4" width="12" height="15.2" rx="1.2"/>
    <path class="glue" d="M18.4 11.4h2.4v4.1a1.2 1.2 0 0 1-2.4 0z"/>
    <rect class="label" x="10" y="16.2" width="12" height="5.2"/>
    <rect class="shine" x="11.4" y="12.2" width="1.4" height="3.2" rx=".7"/>
    <rect class="shine" x="11.4" y="22.2" width="1.4" height="3.6" rx=".7"/>
    <path class="dark" d="M10.6 26.4h10.8l-.5 3.4H11.1z"/>
    <path class="ridge" d="M13 26.6v3M16 26.6v3M19 26.6v3"/>
  </g>
</svg>

<style>
  .gluestick { flex: none; overflow: visible; }
  /* Glue is always cream and the band always dark, whatever the theme; the tube takes the accent. */
  .glue { fill: #f6f3e8; stroke: color-mix(in srgb, var(--ink) 25%, transparent); stroke-width: .5; }
  .body { fill: var(--accent); }
  .dark { fill: color-mix(in srgb, var(--accent) 55%, var(--ground)); }
  .label { fill: #15140f; }
  .shine { fill: color-mix(in srgb, var(--accent) 45%, #fff); }
  .ridge { stroke: #15140f; stroke-width: .8; }
</style>
