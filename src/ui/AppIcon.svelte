<script lang="ts">
  /* A DJ app's badge (the user's list, 2026-09-27): drawn for GLUE, one per app, recognisable by its
     colours and letters. Not the apps' own logos (their trademarks). */
  let { app, size = 16 }: { app: string; size?: number } = $props();
  interface Badge { bg: string; fg: string; text: string; ring?: string; name: string }
  const BADGES: Record<string, Badge> = {
    engine: { bg: '#0d0d0d', fg: '#48e08b', text: 'E', ring: '#48e08b', name: 'Engine DJ' },
    rekordbox: { bg: '#050505', fg: '#ffffff', text: 'rb', ring: '#6b6b6b', name: 'rekordbox' },
    traktor: { bg: '#1f7ae0', fg: '#ffffff', text: 'T', name: 'Traktor' },
    serato: { bg: '#141a22', fg: '#39b4ff', text: 'S', ring: '#39b4ff', name: 'Serato' },
    apple: { bg: '#fa2d55', fg: '#ffffff', text: '♪', name: 'Apple Music' },
    m3u: { bg: '#4b5563', fg: '#ffffff', text: 'm3u', name: 'M3U' },
  };
  const b = $derived(BADGES[app] ?? { bg: '#4b5563', fg: '#fff', text: app.slice(0, 1).toUpperCase(), name: app });
  const small = $derived(b.text.length > 1);
</script>

<svg class="appicon" viewBox="0 0 20 20" width={size} height={size} role="img" aria-label={b.name}>
  <rect x="0.5" y="0.5" width="19" height="19" rx="5" fill={b.bg} stroke={b.ring ?? 'none'} stroke-opacity=".55" />
  <text x="10" y={small ? 13.6 : 14.6} text-anchor="middle" fill={b.fg} font-size={b.text.length > 2 ? 7 : small ? 9.5 : 12.5} font-weight="800" font-family="system-ui, sans-serif" letter-spacing={small ? -0.3 : 0}>{b.text}</text>
</svg>

<style>
  .appicon { flex: none; display: inline-block; vertical-align: -3px; }
</style>
