<script lang="ts">
  import { themes } from '../lib/themes.svelte';
  import { app } from '../lib/app.svelte';
  import { harmonicNeighbours, keyLabel, type KeyNotation } from '../core/audio/keys';
  import { wheelSvg } from './render/wheel';
  import { theme } from './render/canvas';

  const NOTATIONS: [KeyNotation, string][] = [['camelot', 'Camelot'], ['open', 'Open Key'], ['musical', 'Musical']];
  const music = $derived(app.res?.music ?? null);
  const key = $derived(music?.key ?? null);
  const n = $derived(app.keyNotation);
  const bpm = $derived.by(() => {
    const b = music?.bpm;
    if (!b) return null;
    return { show: Math.abs(b - Math.round(b)) < 0.05 ? Math.round(b).toFixed(0) : b.toFixed(1), half: (b / 2).toFixed(1), double: (b * 2).toFixed(1) };
  });
  const wheel = $derived.by(() => { void themes.version; return wheelSvg(key, n, theme()); });
</script>

{#if music}
  <section class="music" id="music" aria-label="Tempo and key">
    <div class="music-top">
      <div>
        <span class="label">Tempo</span>
        {#if bpm}
          <span class="big" id="m-bpm">{bpm.show}<small>&nbsp;BPM</small></span>
          <span class="sub" id="m-bpm-sub">½× {bpm.half} · 2× {bpm.double}</span>
        {:else}
          <span class="big" id="m-bpm">—</span><span class="sub" id="m-bpm-sub">no steady beat found</span>
        {/if}
      </div>
      <div>
        <span class="label">Key</span>
        {#if key}
          <span class="big" id="m-key">{keyLabel(key, n)}</span>
          <span class="sub" id="m-key-sub">{NOTATIONS.filter(([x]) => x !== n).map(([x]) => keyLabel(key, x)).join(' · ')}</span>
        {:else}
          <span class="big" id="m-key">—</span><span class="sub" id="m-key-sub">not enough tonal content</span>
        {/if}
      </div>
    </div>
    <div class="seg" role="radiogroup" aria-label="Key notation">
      {#each NOTATIONS as [id, label] (id)}
        <button type="button" role="radio" aria-checked={n === id} id={'kn-' + id} onclick={() => app.setNotation(id)}>{label}</button>
      {/each}
    </div>
    <div class="wheel-row">
      <svg id="wheel" viewBox="0 0 200 200" role="img" aria-label={key ? 'Circle of fifths with ' + keyLabel(key, 'musical') + ' highlighted' : 'Circle of fifths'}>{@html wheel}</svg>
      <p class="mix-note" id="m-mix" title={key ? 'Harmonic mixing: one step either way round the wheel, or across to the relative ' + (key.mode === 'major' ? 'minor' : 'major') + '.' : ''}>
        {#if key}
          Mixes with {#each harmonicNeighbours(key) as k, i (i)}<b>{keyLabel(k, n)}</b>{i < 2 ? ' ' : ''}{/each}
          {#if key.margin <= 0.05}<br>Close call: could be <b>{keyLabel(key.runnerUp, n)}</b>{/if}
          {#if Math.abs(key.tuning) >= 10}<br>Tuned {key.tuning > 0 ? '+' : '−'}{Math.abs(Math.round(key.tuning))} ¢ from A440{/if}
        {/if}
      </p>
    </div>
  </section>
{/if}
