<script lang="ts">
  import { bpmShown, fmtBpm } from '../../lib/bpm';
  import { remoteFiles } from '../../lib/remoteFiles.svelte';
  import { player } from '../../lib/player.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { lib } from '../../lib/library.svelte';
  import { app } from '../../lib/app.svelte';
  import { fmtTime } from '../../core/format';
  import { keyLabel } from '../../core/audio/keys';

  const t = $derived(nowPlaying.track);
  const a = $derived.by(() => { void lib.version; return t ? lib.store?.analysis.get(t.id) ?? null : null; });
  let seeking = $state<number | null>(null);
  const d = $derived(player.duration || t?.duration || 0);
  const pos = $derived(seeking != null ? seeking / 1000 * d : Math.min(player.time, d || Infinity));
</script>

<div class="lplayer" id="lib-player" aria-label="Player">
  <div class="ctl">
    <button type="button" class="skip" aria-label="Previous" disabled={!t} onclick={() => nowPlaying.prev()}>
      <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2h2v10H2zM12 2v10L4.5 7z" fill="currentColor"/></svg>
    </button>
    <button type="button" class="play" id="lib-play" aria-label={player.paused ? 'Play' : 'Pause'} disabled={!t || nowPlaying.loading} onclick={() => nowPlaying.toggle(t?.id)}>
      {#if player.paused}
        <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>
      {:else}
        <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 1.5h3.2v11H2.5zM8.3 1.5h3.2v11H8.3z" fill="currentColor"/></svg>
      {/if}
    </button>
    <button type="button" class="skip" aria-label="Next" disabled={!nowPlaying.hasNext} onclick={() => nowPlaying.next()}>
      <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M10 2h2v10h-2zM2 2v10l7.5-5z" fill="currentColor"/></svg>
    </button>
  </div>
  <div class="now">
    {#if t}
      <a class="title" href={'#/track/' + t.id} title="Open the track page" id="lib-now">{t.title || t.fileName}</a>
      <span class="who">{t.artist}{#if remoteFiles.loading}<span> · getting it from {remoteFiles.loading.device}… {remoteFiles.loading.size ? Math.round(remoteFiles.loading.got / remoteFiles.loading.size * 100) + '%' : ''}</span>{:else if nowPlaying.error}<span class="err"> · {nowPlaying.error}</span>{:else if player.message}<span class="err"> · {player.message}</span>{/if}</span>
    {:else}
      <span class="who">Nothing playing. Click ▶ on a track, or select one and press Space.</span>
    {/if}
  </div>
  <div class="seek">
    <span class="mono">{fmtTime(pos)}</span>
    <input type="range" min="0" max="1000" step="1" aria-label="Playback position" disabled={!player.url}
      value={seeking ?? (d ? Math.round(Math.min(player.time, d) / d * 1000) : 0)}
      oninput={e => (seeking = +e.currentTarget.value)}
      onchange={e => { player.seek(+e.currentTarget.value / 1000 * d); seeking = null; }}>
    <span class="mono">{fmtTime(d)}</span>
  </div>
  <div class="meta mono">
    {#if bpmShown(t, a)}<span>{fmtBpm(bpmShown(t, a)!)} BPM</span>{/if}
    {#if a?.key}<span>{keyLabel(a.key, app.keyNotation)}</span>{/if}
    {#if a && !a.error}<span class="q" data-grade={a.grade}>{a.label}</span>{/if}
  </div>
  <label class="vol">
    <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 5h2.5l3.5-3v10L4 9H1.5z" fill="currentColor"/><path d="M9.5 4.5a3.5 3.5 0 0 1 0 5M11 3a5.5 5.5 0 0 1 0 8" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
    <input type="range" min="0" max="1" step="0.01" aria-label="Volume" value={player.volume} oninput={e => player.setVolume(+e.currentTarget.value)}>
  </label>
</div>

<style>
  .lplayer { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; height: 64px; display: grid; grid-template-columns: auto minmax(160px, 1.2fr) minmax(200px, 2fr) auto auto; gap: 20px; align-items: center;
    padding: 0 clamp(16px, 3vw, 32px); background: color-mix(in srgb, var(--surface) 94%, transparent); backdrop-filter: blur(8px); border-top: 1px solid var(--line); }
  .ctl { display: flex; align-items: center; gap: 6px; }
  button { background: none; border: 0; color: var(--ink-2); cursor: pointer; display: grid; place-items: center; }
  button:disabled { opacity: .35; cursor: default; }
  .skip { width: 30px; height: 30px; border-radius: 50%; }
  .skip:not(:disabled):hover { color: var(--ink); background: var(--raised); }
  .skip svg { width: 13px; height: 13px; }
  .play { width: 38px; height: 38px; border-radius: 50%; background: var(--accent); color: var(--accent-ink); }
  .play svg { width: 14px; height: 14px; }
  .now { display: grid; min-width: 0; line-height: 1.3; }
  .title { color: var(--ink); font-weight: 650; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .title:hover { text-decoration: underline; }
  .who { color: var(--muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .err { color: var(--warn); }
  .seek { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--muted); }
  .seek input { flex: 1; min-width: 0; accent-color: var(--accent); }
  .meta { display: flex; gap: 10px; align-items: center; font-size: 12px; color: var(--ink-2); white-space: nowrap; }
  .q { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; padding: 1px 6px; border-radius: 3px; border: 1px solid currentColor; }
  .q[data-grade="ok"] { color: var(--ok); } .q[data-grade="warn"] { color: var(--warn); } .q[data-grade="bad"] { color: var(--bad); } .q[data-grade="info"] { color: var(--muted); }
  .vol { display: flex; align-items: center; gap: 6px; color: var(--muted); }
  .vol svg { width: 14px; height: 14px; }
  .vol input { width: 90px; accent-color: var(--accent); }
  @media (max-width: 900px) { .lplayer { grid-template-columns: auto 1fr auto; } .seek, .meta { display: none; } .vol input { width: 60px; } }
</style>
