<script lang="ts">
  import { player } from '../lib/player.svelte';
  import { fmtTime } from '../core/format';

  let { readout }: { readout: string } = $props();
  let seeking = $state<number | null>(null);   // 0–1000 while the seek bar is being dragged
  const d = $derived(player.duration || 0);
  const t = $derived(Math.min(player.time, d || Infinity));
  const shown = $derived(seeking != null ? seeking / 1000 * d : t);
</script>

<div class="player" id="player">
  <button type="button" class="play" id="play-btn" aria-label={player.paused ? 'Play' : 'Pause'} disabled={!player.url} onclick={() => player.toggle()}>
    {#if player.paused}
      <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>
    {:else}
      <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 1.5h3.2v11H2.5zM8.3 1.5h3.2v11H8.3z" fill="currentColor"/></svg>
    {/if}
  </button>
  <span class="ptime" id="p-time">{fmtTime(shown)} / {fmtTime(d)}</span>
  <input type="range" id="seek" min="0" max="1000" step="1" aria-label="Playback position" disabled={!player.url}
    value={seeking ?? (d ? Math.round(t / d * 1000) : 0)}
    oninput={e => (seeking = +(e.currentTarget as HTMLInputElement).value)}
    onchange={e => { player.seek(+(e.currentTarget as HTMLInputElement).value / 1000 * d); seeking = null; }}>
  <label class="vol" for="volume">Volume <input type="range" id="volume" min="0" max="1" step="0.01" value={player.volume} oninput={e => player.setVolume(+(e.currentTarget as HTMLInputElement).value)}></label>
  <span class="readout" id="spec-readout" title="Space plays or pauses · ← → skip 5 s">{readout}</span>
  {#if player.message}<span class="p-msg" id="p-msg">{player.message}</span>{/if}
</div>
