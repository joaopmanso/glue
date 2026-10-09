<script lang="ts">
  /* The player on a phone (ADR 0078): a bar above the tabs (the song, play and next, a thin progress
     line); a tap opens the full player: the cover, the seek bar, the controls, and the queue. */
  import { lib } from '../../lib/library.svelte';
  import { phone } from '../../lib/phone.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { player } from '../../lib/player.svelte';
  import { describeStart, remoteFiles } from '../../lib/remoteFiles.svelte';
  import { router, trackHref } from '../../lib/route.svelte';
  import { trackMenu } from '../../lib/trackMenu';
  import { fmtTime } from '../../core/format';
  import type { Track } from '../../store/types';
  import CoverArt from '../library/CoverArt.svelte';

  const t = $derived(nowPlaying.track);
  let seeking = $state<number | null>(null);
  const d = $derived(player.duration || t?.duration || 0);
  const pos = $derived(seeking != null ? seeking / 1000 * d : Math.min(player.time, d || Infinity));
  const song = (id: string): Track | null => { void lib.version; return lib.store?.tracks.get(id) ?? null; };
  const upNext = $derived(nowPlaying.q.upNext);
  const later = $derived(nowPlaying.q.later.slice(0, 50));
  const status = $derived(remoteFiles.loading ? 'Getting it from ' + remoteFiles.loading.device + '…' : nowPlaying.error || player.message || '');
</script>

{#if (t || upNext.length) && !phone.selecting}
  <div class="mini" id="phone-mini" role="button" tabindex="0" onclick={() => (phone.full = true)} onkeydown={e => { if (e.key === 'Enter') phone.full = true; }}>
    <span class="prog" style:width={(d ? Math.min(1, pos / d) * 100 : 0) + '%'}></span>
    {#if t}<CoverArt {t} px={40} />{/if}
    <span class="txt"><b id="phone-now">{t ? t.title || t.fileName : upNext.length + ' queued'}</b><small>{status || t?.artist || ''}</small></span>
    <button type="button" class="pp" id="phone-play" aria-label={player.paused ? 'Play' : 'Pause'} disabled={nowPlaying.loading} onclick={e => { e.stopPropagation(); nowPlaying.toggle(); }}>
      {#if player.paused}<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>
      {:else}<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 1.5h3.2v11H2.5zM8.3 1.5h3.2v11H8.3z" fill="currentColor"/></svg>{/if}
    </button>
    <button type="button" class="nx" aria-label="Next" disabled={!nowPlaying.hasNext} onclick={e => { e.stopPropagation(); nowPlaying.next(); }}>
      <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 1.5v11l7.5-5.5zM10 1.5h2.2v11H10z" fill="currentColor"/></svg>
    </button>
  </div>
{/if}

{#if phone.full}
  <div class="full" id="phone-player" role="dialog" aria-modal="true" aria-label="Player">
    <header>
      <button type="button" class="down" aria-label="Close the player" onclick={() => (phone.full = false)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <span>{nowPlaying.q.from ? 'Playing from ' + nowPlaying.q.from : 'Now playing'}</span>
      {#if t}<button type="button" class="down" aria-label="More" onclick={() => phone.menu(t.title || t.fileName, () => trackMenu([t.id]))}>⋯</button>{:else}<span></span>{/if}
    </header>
    <div class="body">
      <div class="art">{#if t}<CoverArt {t} size={320} px={260} />{/if}</div>
      {#if t}
        <div class="who">
          <a href={trackHref(t.id)} onclick={() => (phone.full = false)}><b>{t.title || t.fileName}</b></a>
          <span>{t.artist}</span>
          {#if status}<small>{status}</small>{/if}
          <!-- Where another computer's song's start went (ADR 0174): a new connection, the first music, the route. -->
          {#if remoteFiles.lastStart?.trackId === t.id}<small class="start" id="phone-start">{describeStart(remoteFiles.lastStart)}</small>{/if}
        </div>
      {/if}
      <div class="seek">
        <input type="range" min="0" max="1000" step="1" aria-label="Playback position" disabled={!player.url}
          value={seeking ?? (d ? Math.round(Math.min(player.time, d) / d * 1000) : 0)}
          oninput={e => (seeking = +e.currentTarget.value)} onchange={e => { player.seek(+e.currentTarget.value / 1000 * d); seeking = null; }}>
        <div class="times"><span>{fmtTime(pos)}</span><span>{fmtTime(d)}</span></div>
      </div>
      <div class="ctl">
        <button type="button" class="tog" class:on={nowPlaying.shuffle} aria-label="Shuffle" aria-pressed={nowPlaying.shuffle} onclick={() => nowPlaying.setShuffle(!nowPlaying.shuffle)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5h2.2l5.6 7H13M2 11.5h2.2l1.9-2.4M9.9 6.9l1.9-2.4H13M11.3 3 13 4.5l-1.7 1.5M11.3 10 13 11.5l-1.7 1.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="sk" aria-label="Previous" disabled={!t} onclick={() => nowPlaying.prev()}><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M12 1.5v11L4.5 7zM1.8 1.5H4v11H1.8z" fill="currentColor"/></svg></button>
        <button type="button" class="big" id="phone-big-play" aria-label={player.paused ? 'Play' : 'Pause'} disabled={nowPlaying.loading} onclick={() => nowPlaying.toggle()}>
          {#if player.paused}<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>
          {:else}<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 1.5h3.2v11H2.5zM8.3 1.5h3.2v11H8.3z" fill="currentColor"/></svg>{/if}
        </button>
        <button type="button" class="sk" aria-label="Next" disabled={!nowPlaying.hasNext} onclick={() => nowPlaying.next()}><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 1.5v11l7.5-5.5zM10 1.5h2.2v11H10z" fill="currentColor"/></svg></button>
        <button type="button" class="tog" class:on={nowPlaying.repeat !== 'off'} aria-label={'Repeat: ' + nowPlaying.repeat} onclick={() => nowPlaying.cycleRepeat()}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7V6a2 2 0 0 1 2-2h7.5M11 2.5 12.5 4 11 5.5M13 9v1a2 2 0 0 1-2 2H3.5M5 13.5 3.5 12 5 10.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          {#if nowPlaying.repeat === 'one'}<i>1</i>{/if}
        </button>
      </div>
      <section class="queue" id="phone-queue">
        {#if upNext.length}
          <h3>Next up</h3>
          {#each upNext as id, i (id + i)}{@const s = song(id)}{#if s}<div class="q"><button type="button" class="qt" onclick={() => nowPlaying.jumpTo('upNext', i)}><b>{s.title || s.fileName}</b><small>{s.artist}</small></button><button type="button" class="rm" aria-label="Remove from the queue" onclick={() => nowPlaying.dequeue('upNext', i)}>×</button></div>{/if}{/each}
        {/if}
        {#if later.length}
          <h3>Next from {nowPlaying.q.from || 'the list'}</h3>
          {#each later as id, i (id + i)}{@const s = song(id)}{#if s}<div class="q"><button type="button" class="qt" onclick={() => nowPlaying.jumpTo('later', i)}><b>{s.title || s.fileName}</b><small>{s.artist}</small></button></div>{/if}{/each}
        {/if}
        {#if !upNext.length && !later.length}<p class="none">Nothing after this song.</p>{/if}
      </section>
    </div>
  </div>
{/if}

<style>
  .mini { position: fixed; left: 8px; right: 8px; bottom: calc(60px + env(safe-area-inset-bottom, 0px) + 6px); z-index: 30; height: 56px; display: flex; align-items: center; gap: 10px; padding: 0 6px 0 8px; background: var(--raised); border: 1px solid var(--line-2); border-radius: 12px; box-shadow: 0 6px 24px rgb(0 0 0 / .35); overflow: hidden; cursor: pointer; }
  .prog { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--accent); }
  .mini :global(.cov) { border-radius: 6px; }
  .txt { flex: 1; min-width: 0; display: grid; }
  .txt b { font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .txt small { color: var(--muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { background: none; border: 0; color: var(--ink); cursor: pointer; display: grid; place-items: center; }
  button:disabled { opacity: .35; }
  .pp, .nx { width: 44px; height: 44px; }
  .pp svg { width: 18px; height: 18px; }
  .nx svg { width: 16px; height: 16px; }
  .full { position: fixed; inset: 0; z-index: 60; background: var(--ground); display: flex; flex-direction: column; padding: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px); }
  .full header { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; color: var(--ink-2); font-size: 13px; flex: none; }
  .full header span { flex: 1; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .down { width: 48px; height: 44px; font-size: 24px; color: var(--ink-2); }
  .down svg { width: 22px; height: 22px; }
  /* No cover: a note in its place. */
  .mini :global(.cov:not(.has)), .art :global(.cov:not(.has)) { display: grid; place-items: center; background: var(--raised); color: var(--muted); }
  .mini :global(.cov:not(.has)::before) { content: '♪'; font-size: 18px; }
  .art :global(.cov:not(.has)::before) { content: '♪'; font-size: 96px; opacity: .5; }
  .body { flex: 1; overflow-y: auto; padding: 8px 22px 30px; display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 640px; margin: 0 auto; box-sizing: border-box; }
  .art { display: grid; place-items: center; min-height: 200px; }
  .art :global(.cov) { border-radius: 12px; box-shadow: 0 12px 40px rgb(0 0 0 / .45); background: var(--raised); max-width: min(72vw, 420px); max-height: min(72vw, 420px); }
  .who { display: grid; gap: 2px; }
  .who a { color: var(--ink); text-decoration: none; }
  .who b { font-size: 21px; }
  .who span { color: var(--ink-2); font-size: 15px; }
  .who small { color: var(--muted); font-size: 13px; }
  .seek input { width: 100%; accent-color: var(--accent); }
  .times { display: flex; justify-content: space-between; color: var(--muted); font: 12px var(--font-mono); }
  .ctl { display: flex; align-items: center; justify-content: space-between; }
  .tog { width: 44px; height: 44px; color: var(--muted); position: relative; }
  .tog.on { color: var(--accent); }
  .tog svg { width: 22px; height: 22px; }
  .tog i { position: absolute; right: 6px; top: 6px; font: 700 9px var(--font-mono); font-style: normal; }
  .sk { width: 54px; height: 54px; }
  .sk svg { width: 22px; height: 22px; }
  .big { width: 72px; height: 72px; border-radius: 50%; background: var(--accent); color: var(--accent-ink); }
  .big svg { width: 26px; height: 26px; }
  .queue { display: grid; gap: 2px; }
  .queue h3 { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 12px 0 4px; }
  .q { display: flex; align-items: center; border-bottom: 1px solid var(--line); }
  .qt { flex: 1; min-width: 0; display: grid; justify-items: start; text-align: left; padding: 8px 0; }
  .qt b { font-size: 14.5px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qt small { color: var(--muted); font-size: 12.5px; }
  .rm { width: 40px; height: 40px; color: var(--muted); font-size: 20px; }
  .none { color: var(--muted); }
</style>
