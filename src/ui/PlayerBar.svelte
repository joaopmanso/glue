<script lang="ts">
  import { player } from '../lib/player.svelte';
  import { fmtTime } from '../core/format';
  import { nowPlaying } from '../lib/nowPlaying.svelte';

  let { readout }: { readout: string } = $props();
  let seeking = $state<number | null>(null);   // 0–1000 while the seek bar is being dragged
  // While another track plays on, this bar belongs to the page's own track (player.pending) until it's played.
  const wait = $derived(player.pending);
  const d = $derived(wait ? wait.opts.duration ?? 0 : player.duration || 0);
  const t = $derived(wait ? 0 : Math.min(player.time, d || Infinity));
  const shown = $derived(seeking != null ? seeking / 1000 * d : t);
</script>

<div class="player" id="player">
  <button type="button" class="play" id="play-btn" aria-label={wait || player.paused ? 'Play' : 'Pause'} disabled={!player.url && !wait} onclick={() => player.toggle()}>
    {#if wait || player.paused}
      <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>
    {:else}
      <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 1.5h3.2v11H2.5zM8.3 1.5h3.2v11H8.3z" fill="currentColor"/></svg>
    {/if}
  </button>
  <span class="ptime" id="p-time">{fmtTime(shown)} / {fmtTime(d)}</span>
  <input type="range" id="seek" min="0" max="1000" step="1" aria-label="Playback position" disabled={!player.url && !wait}
    value={seeking ?? (d ? Math.round(t / d * 1000) : 0)}
    oninput={e => (seeking = +(e.currentTarget as HTMLInputElement).value)}
    onchange={e => { player.seek(+(e.currentTarget as HTMLInputElement).value / 1000 * d); seeking = null; }}>
  <label class="vol" for="volume">Volume <input type="range" id="volume" min="0" max="1" step="0.01" value={player.volume} oninput={e => player.setVolume(+(e.currentTarget as HTMLInputElement).value)}></label>
  <span class="readout" id="spec-readout" title="Space plays or pauses · ← → skip 5 s">{readout}</span>
  {#if player.message && !wait}<span class="p-msg" id="p-msg">{player.message}</span>{/if}
  {#if wait && player.url}
    <span class="other" id="other-playing">
      <button type="button" aria-label={player.paused ? 'Resume' : 'Pause'} onclick={() => player.toggle(false)}>{player.paused ? '▶' : '❚❚'}</button>
      {player.paused ? 'Paused' : 'Still playing'}: {#if nowPlaying.track}<a href={'#/track/' + nowPlaying.track.id}>{nowPlaying.track.title || nowPlaying.track.fileName}</a>{:else}another track{/if}
      <small>· ▶ here plays this one</small>
    </span>
  {/if}
</div>

<style>
  .other { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--ink-2); background: var(--surface); border: 1px solid var(--line-2); border-radius: 14px; padding: 2px 10px 2px 3px; max-width: 100%; min-width: 0; }
  .other button { width: 22px; height: 22px; border-radius: 50%; border: 0; background: var(--accent); color: var(--accent-ink); font-size: 9px; cursor: pointer; flex: none; }
  .other a { color: var(--accent); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
  .other small { color: var(--muted); white-space: nowrap; }
</style>
