<script lang="ts">
  /* The library's player bar (ADR 0068): shuffle, previous, play, next, repeat; the song; the seek bar;
     volume and the sound output; ▲ opens the player (the queue and the visualiser). Songs or playlists
     dropped on it are queued. */
  import { asShown } from '../../core/library/summary';
  import { onMount } from 'svelte';
  import { router, trackHref } from '../../lib/route.svelte';
  import { view } from '../../lib/view.svelte';
  import { bpmShown, fmtBpm } from '../../lib/bpm';
  import { remoteFiles } from '../../lib/remoteFiles.svelte';
  import { player } from '../../lib/player.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { lib } from '../../lib/library.svelte';
  import { app } from '../../lib/app.svelte';
  import { drag } from '../../lib/drag.svelte';
  import { dock } from '../../lib/dock.svelte';
  import { output } from '../../lib/output.svelte';
  import { fmtTime } from '../../core/format';
  import { keyLabel } from '../../core/audio/keys';
  import { menu, SEP, tidy, type MenuEntry } from '../../lib/menu.svelte';
  import { trackMenu } from '../../lib/trackMenu';
  import PlayerPanel from './PlayerPanel.svelte';

  const t = $derived(nowPlaying.track);
  const a = $derived.by(() => { void lib.version; return t ? asShown(t, lib.store?.analysis.get(t.id)) : null; });
  let seeking = $state<number | null>(null);
  const d = $derived(player.duration || t?.duration || 0);
  const pos = $derived(seeking != null ? seeking / 1000 * d : Math.min(player.time, d || Infinity));
  const queued = $derived(nowPlaying.q.upNext.length);
  const hot = $derived(drag.active && drag.target?.type === 'queue' && drag.target.index == null && !nowPlaying.expanded);

  // Songs and playlists dropped on the player join its queue (each collection's queue is restored by
  // lib/nowPlaying as the collection opens).
  drag.onQueue = (p, index, which) => {
    const ids = p.kind === 'tracks' ? p.ids : p.kind === 'list' ? dock.tracksOf(p.id).map(x => x.id) : [];
    if (which === 'later' && index != null) nowPlaying.placeLater(ids, index); else nowPlaying.enqueue(ids, index ?? 'end');
  };
  onMount(() => void output.start());

  let muted = 0;
  function mute() { if (player.volume > 0) { muted = player.volume; player.setVolume(0); } else player.setVolume(muted || 0.8); }
  function outputMenu(): MenuEntry[] {
    if (!output.supported) return [{ head: 'Sound output' }, { label: 'This browser can’t choose the output (Edge and Chrome can)', disabled: true }];
    return tidy([
      { head: 'Sound output' },
      { label: 'Default output', checked: !output.id, run: () => void output.choose('') },
      ...output.devices.map(o => ({ label: o.label, checked: output.id === o.id, attrs: { 'data-out': o.id }, run: () => void output.choose(o.id) })),
      !output.named && SEP,
      !output.named && { label: 'List the sound cards…', attrs: { id: 'list-outputs' }, title: 'The browser lists every sound card once the page may use the microphone (it asks you). GLUE never records anything.', run: () => void output.askNames() },
      SEP,
      { label: 'ASIO and WASAPI drivers: with GLUE Home, coming', disabled: true, title: 'A web page plays through the system’s shared audio. Choosing a driver needs GLUE Home to play the music itself; that’s the next step.' },
    ]);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="lplayer" class:hot class:open={nowPlaying.expanded} id="lib-player" aria-label="Player" data-drop="queue">
  <div class="ctl">
    <button type="button" class="tog" class:on={nowPlaying.shuffle} id="player-shuffle" aria-pressed={nowPlaying.shuffle} title={nowPlaying.shuffle ? 'Shuffle is on' : 'Shuffle'} onclick={() => nowPlaying.setShuffle(!nowPlaying.shuffle)}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5h2.2l5.6 7H13M2 11.5h2.2l1.9-2.4M9.9 6.9l1.9-2.4H13M11.3 3 13 4.5l-1.7 1.5M11.3 10 13 11.5l-1.7 1.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <button type="button" class="skip" aria-label="Previous" disabled={!t} onclick={() => nowPlaying.prev()}>
      <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2h2v10H2zM12 2v10L4.5 7z" fill="currentColor"/></svg>
    </button>
    <button type="button" class="play" id="lib-play" aria-label={player.paused ? 'Play' : 'Pause'} disabled={(!t && !nowPlaying.hasNext) || nowPlaying.loading} onclick={() => nowPlaying.toggle()}>
      {#if player.paused}
        <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>
      {:else}
        <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 1.5h3.2v11H2.5zM8.3 1.5h3.2v11H8.3z" fill="currentColor"/></svg>
      {/if}
    </button>
    <button type="button" class="skip" aria-label="Next" id="player-next" disabled={!nowPlaying.hasNext} onclick={() => nowPlaying.next()}>
      <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M10 2h2v10h-2zM2 2v10l7.5-5z" fill="currentColor"/></svg>
    </button>
    <button type="button" class="tog" class:on={nowPlaying.repeat !== 'off'} id="player-repeat" aria-label={'Repeat: ' + nowPlaying.repeat} title={nowPlaying.repeat === 'off' ? 'Repeat' : nowPlaying.repeat === 'all' ? 'Repeating the list' : 'Repeating this song'} onclick={() => nowPlaying.cycleRepeat()}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7.5V6a2 2 0 0 1 2-2h7.5M10.8 2.3 12.5 4l-1.7 1.7M13 8.5V10a2 2 0 0 1-2 2H3.5M5.2 13.7 3.5 12l1.7-1.7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>{#if nowPlaying.repeat === 'one'}<text x="8" y="9.6" font-size="5.5" font-weight="800" text-anchor="middle" fill="currentColor">1</text>{/if}</svg>
    </button>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="now" oncontextmenu={e => { if (t) menu.context(e, () => trackMenu([t.id]), 'Song'); }}>
    {#if t}
      <span class="line"><a class="title" href={trackHref(t.id)} title="Open the track page" id="lib-now">{t.title || t.fileName}</a>
      <button type="button" class="locate" id="lib-locate" title="Show it in the list" aria-label="Show the playing track in the list" onclick={() => { view.reveal = t.id; if (router.current.name !== 'library') router.go('#/'); }}>⌖</button></span>
      <span class="who">{t.artist}{#if remoteFiles.loading}<span> · getting it from {remoteFiles.loading.device}… {remoteFiles.loading.size ? Math.round(remoteFiles.loading.got / remoteFiles.loading.size * 100) + '%' : ''}</span>{:else if nowPlaying.error}<span class="err"> · {nowPlaying.error}</span>{:else if player.message}<span class="err"> · {player.message}</span>{/if}</span>
    {:else if hot}
      <span class="who drop">Drop to queue them</span>
    {:else if queued}
      <span class="who">{queued} song{queued === 1 ? '' : 's'} queued: press play to start.</span>
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
  <div class="vol">
    <button type="button" class="ico" aria-label={player.volume ? 'Mute' : 'Unmute'} title={player.volume ? 'Mute' : 'Unmute'} onclick={mute}>
      <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 5h2.5l3.5-3v10L4 9H1.5z" fill="currentColor"/>{#if player.volume}<path d="M9.5 4.5a3.5 3.5 0 0 1 0 5M11 3a5.5 5.5 0 0 1 0 8" fill="none" stroke="currentColor" stroke-width="1.2"/>{:else}<path d="M9.5 5l3.5 4M13 5l-3.5 4" stroke="currentColor" stroke-width="1.2"/>{/if}</svg>
    </button>
    <input type="range" min="0" max="1" step="0.01" aria-label="Volume" value={player.volume} oninput={e => player.setVolume(+e.currentTarget.value)}>
    <button type="button" class="ico" class:on={!!output.id} id="player-output" aria-haspopup="menu" title={'Sound output: ' + output.label} aria-label="Sound output" onclick={e => menu.from(e.currentTarget, outputMenu, 'Sound output')}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="1.5" width="10" height="13" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="9.6" r="2.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="4.6" r="1" fill="currentColor"/></svg>
    </button>
  </div>
  <button type="button" class="expand" id="player-expand" aria-expanded={nowPlaying.expanded} title={nowPlaying.expanded ? 'Close the player' : 'Open the player: the queue and the visualiser'} onclick={() => (nowPlaying.expanded = !nowPlaying.expanded)}>
    <svg viewBox="0 0 14 14" aria-hidden="true"><path d={nowPlaying.expanded ? 'M3 5l4 4 4-4' : 'M3 9l4-4 4 4'} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    {#if queued}<b class="badge" title={queued + ' queued'}>{queued}</b>{/if}
  </button>
</div>
{#if nowPlaying.expanded}<PlayerPanel />{/if}

<style>
  .lplayer { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; height: 64px; display: grid; grid-template-columns: auto minmax(160px, 1.2fr) minmax(200px, 2fr) auto auto auto; gap: 18px; align-items: center;
    padding: 0 clamp(12px, 2vw, 24px) 0 clamp(16px, 3vw, 32px); background: color-mix(in srgb, var(--surface) 94%, transparent); backdrop-filter: blur(8px); border-top: 1px solid var(--line); }
  .lplayer.hot { background: color-mix(in srgb, var(--accent) 16%, var(--surface)); box-shadow: inset 0 2px 0 var(--accent); }
  .lplayer.open { background: var(--surface); }
  .ctl { display: flex; align-items: center; gap: 4px; }
  button { background: none; border: 0; color: var(--ink-2); cursor: pointer; display: grid; place-items: center; }
  button:disabled { opacity: .35; cursor: default; }
  .skip, .tog { width: 30px; height: 30px; border-radius: 50%; }
  .skip:not(:disabled):hover, .tog:hover { color: var(--ink); background: var(--raised); }
  .skip svg { width: 13px; height: 13px; }
  .tog svg { width: 16px; height: 16px; }
  .tog { color: var(--muted); }
  .tog.on { color: var(--accent); }
  .play { width: 38px; height: 38px; border-radius: 50%; background: var(--accent); color: var(--accent-ink); margin: 0 2px; }
  .play svg { width: 14px; height: 14px; }
  .now { display: grid; min-width: 0; line-height: 1.3; }
  .line { display: flex; align-items: center; gap: 2px; min-width: 0; }
  .line .title { min-width: 0; }
  .title { color: var(--ink); font-weight: 650; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .title:hover { text-decoration: underline; }
  .who { color: var(--muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who.drop { color: var(--accent); font-weight: 600; }
  .err { color: var(--warn); }
  .seek { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--muted); }
  .seek input { flex: 1; min-width: 0; accent-color: var(--accent); }
  .meta { display: flex; gap: 10px; align-items: center; font-size: 12px; color: var(--ink-2); white-space: nowrap; }
  .q { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; padding: 1px 6px; border-radius: 3px; border: 1px solid currentColor; }
  .q[data-grade="ok"] { color: var(--ok); } .q[data-grade="warn"] { color: var(--warn); } .q[data-grade="bad"] { color: var(--bad); } .q[data-grade="info"] { color: var(--muted); }
  .vol { display: flex; align-items: center; gap: 6px; color: var(--muted); }
  .ico { width: 26px; height: 26px; border-radius: 5px; color: var(--muted); }
  .ico:hover { color: var(--ink); background: var(--raised); }
  .ico.on { color: var(--accent); }
  .ico svg { width: 15px; height: 15px; }
  .vol input { width: 90px; accent-color: var(--accent); }
  .expand { position: relative; width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--line-2); color: var(--ink-2); }
  .expand:hover, .expand[aria-expanded="true"] { color: var(--accent); border-color: var(--accent); }
  .expand svg { width: 14px; height: 14px; }
  .badge { position: absolute; top: -7px; right: -7px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 9px; background: var(--accent); color: var(--accent-ink); font-size: 10.5px; line-height: 17px; text-align: center; }
  @media (max-width: 900px) { .lplayer { grid-template-columns: auto 1fr auto auto; gap: 10px; } .seek, .meta { display: none; } .vol input { width: 60px; } .tog { display: none; } }
  .locate { background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 14px; padding: 0 4px; line-height: 1; }
  .locate:hover { color: var(--accent); }
</style>
