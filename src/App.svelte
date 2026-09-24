<script lang="ts">
  import { app, analyzeFile } from './lib/app.svelte';
  import { player } from './lib/player.svelte';
  import Start from './ui/Start.svelte';
  import Results from './ui/Results.svelte';
  import Reference from './ui/Reference.svelte';

  let dragDepth = 0;
  const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types || [])].includes('Files');

  function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    if (f) void analyzeFile(f);
    input.value = '';
  }
  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (app.phase !== 'result') return;
    if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); player.seek(player.time + 5); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); player.seek(player.time - 5); }
  }

  // Page-level classes the stylesheet keys off.
  $effect(() => { document.body.classList.toggle('dragging', app.dragging); });
  $effect(() => { document.body.classList.toggle('live-on', app.liveOn && app.phase === 'result'); });
</script>

<svelte:window
  onkeydown={onKey}
  ondragenter={e => { if (hasFiles(e)) { dragDepth++; app.dragging = true; } }}
  ondragleave={() => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) app.dragging = false; }}
  ondragover={e => e.preventDefault()}
  ondrop={e => { e.preventDefault(); dragDepth = 0; app.dragging = false; const f = e.dataTransfer?.files?.[0]; if (f) void analyzeFile(f); }}
/>

<div class="wrap">
  <header class="top">
    <div class="brand">
      <h1>M<span>CO</span></h1>
      <p>Music Collection Organizer · analyze a file</p>
    </div>
    <div class="open">
      <small>or drop a file anywhere · nothing leaves your computer</small>
      <button type="button" class="btn" onclick={() => document.getElementById('file-input')?.click()}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 5v7h12V5M8 1.5v8M5 4.5l3-3 3 3"/></svg>
        Open audio file
      </button>
      <input type="file" id="file-input" accept="audio/*,.flac,.wav,.aif,.aiff,.aifc,.m4a,.mp4,.alac,.mp3,.aac,.ogg,.oga,.opus,.webm,.mka" onchange={pick}>
    </div>
  </header>

  {#if app.busy}
    <div id="status" class="status">
      <div class="row"><span id="status-text">{app.busy.text}</span><span id="status-pct" class="mono">{app.busy.p != null ? Math.round(app.busy.p * 100) + '%' : ''}</span></div>
      <div class="bar"><span id="status-bar" style:width={(app.busy.p ?? 0) * 100 + '%'}></span></div>
    </div>
  {/if}
  {#if app.error}
    <div id="error" class="error"><b>Couldn’t analyze {app.error.name}.</b> {app.error.message}</div>
  {/if}

  {#if app.phase === 'start'}
    <Start />
  {:else}
    <Results />
  {/if}

  <Reference />
  <footer>Decoding uses your browser’s audio engine (WAV and AIFF are read directly). Chrome and Firefox can’t decode ALAC or DSD; Safari handles ALAC.</footer>
</div>

{#if app.dragging && app.phase === 'result'}
  <div class="drop" id="drop"><div>Drop the audio file to analyze it</div></div>
{/if}
