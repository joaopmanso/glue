<script lang="ts">
  /* A row's mini spectrogram (ADR 0031): drawn once from its 3 KB thumbnail; the playhead and the
     played part are a light overlay, so only the playing row changes while music plays.
     Click (or drag) to play from that spot, or to scrub the playing track. */
  import { thumbs } from '../../lib/thumbs.svelte';
  import { time } from '../../core/perf';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { player } from '../../lib/player.svelte';
  import { app } from '../../lib/app.svelte';
  import { lib } from '../../lib/library.svelte';
  import { THUMB_H, THUMB_W } from '../../core/library/thumb';
  import type { Track } from '../../store/types';
  import type { CuePoint } from '../../core/interop/types';
  import { cuesFor } from '../../lib/cues';

  let { t, order }: { t: Track; order: string[] } = $props();
  let cv = $state<HTMLCanvasElement>();
  const data = $derived.by(() => { void thumbs.version; return thumbs.get(t.id); });
  const here = $derived(t.status === 'linked' && (!t.remote || lib.canRead(t)));
  $effect(() => { if (data === undefined && t.status === 'linked' && (!t.remote || here)) thumbs.request(t.id); });

  // Draw through the spectrogram palette (the same one as the track page).
  $effect(() => {
    const d = data, lut = app.lut, c = cv;
    if (!c || !d) return;
    time('draw:thumb', () => {
      const ctx = c.getContext('2d')!, img = ctx.createImageData(THUMB_W, THUMB_H), px = img.data;
      for (let i = 0; i < d.length; i++) { const li = d[i] * 3, p = i * 4; px[p] = lut[li]; px[p + 1] = lut[li + 1]; px[p + 2] = lut[li + 2]; px[p + 3] = 255; }
      ctx.putImageData(img, 0, 0);
    });
  });

  const dur = $derived(t.duration || (nowPlaying.trackId === t.id ? player.duration : 0) || 0);
  const playing = $derived(nowPlaying.trackId === t.id && !!player.url);
  const at = $derived(playing && dur ? Math.min(1, player.time / dur) : 0);
  const cues = $derived.by((): CuePoint[] => { void lib.version; return cuesFor(t.id); });

  let scrubbing = false;
  function frac(e: PointerEvent) { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); }
  function down(e: PointerEvent) {
    e.stopPropagation();   // not a row drag or selection
    if (e.button !== 0 || !here) return;
    const f = frac(e);
    if (playing) { player.seek(f * (player.duration || dur)); scrubbing = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
    else void nowPlaying.play(t.id, order, f * dur);
  }
  function move(e: PointerEvent) { if (scrubbing && playing) player.seek(frac(e) * (player.duration || dur)); }
</script>

<!-- Pointer-only extra: keyboard users have the row’s play button and the player bar. -->
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="wave" class:empty={!data} class:playing title={here ? 'Click to play from here' : t.remote ? 'On ' + t.remote.name + ': plays there' : ''}
  onpointerdown={down} onpointermove={move} onpointerup={() => (scrubbing = false)} onclick={e => e.stopPropagation()} ondblclick={e => e.stopPropagation()}>
  {#if data}<canvas bind:this={cv} width={THUMB_W} height={THUMB_H} aria-hidden="true"></canvas>{/if}
  {#if playing}
    <span class="played" style:width={at * 100 + '%'}></span>
    <span class="head" style:left={at * 100 + '%'}></span>
  {/if}
  {#if dur}
    {#each cues as c, i (i)}
      <span class="cue" class:loop={c.kind === 'loop'} class:hot={c.num != null} style:left={(c.t / dur) * 100 + '%'} style:background={c.color ?? null}
        title={(c.num != null ? String.fromCharCode(65 + c.num) + ' · ' : '') + (c.kind === 'loop' ? 'Loop' : 'Cue') + (c.name ? ': ' + c.name : '')}></span>
    {/each}
  {/if}
</div>

<style>
  .wave { position: relative; width: 100%; height: 22px; border-radius: 3px; overflow: hidden; background: #000; cursor: pointer; touch-action: none; }
  .wave.empty { background: repeating-linear-gradient(90deg, var(--raised) 0 3px, transparent 3px 6px); opacity: .6; }
  canvas { display: block; width: 100%; height: 100%; image-rendering: auto; }
  .played { position: absolute; left: 0; top: 0; bottom: 0; background: color-mix(in srgb, var(--ground) 45%, transparent); pointer-events: none; }
  .head { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #fff; box-shadow: 0 0 0 1px rgb(0 0 0 / .5); pointer-events: none; }
  .cue { position: absolute; top: 0; width: 2px; height: 6px; margin-left: -1px; background: var(--accent); pointer-events: none; }
  .cue.hot { height: 22px; opacity: .8; width: 1.5px; }
  .cue.loop { background: var(--ok); }
  .wave.playing { box-shadow: inset 0 0 0 1px var(--accent); }
</style>
