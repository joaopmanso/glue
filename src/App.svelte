<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { app, analyzeFile } from './lib/app.svelte';
  import { player } from './lib/player.svelte';
  import { lib } from './lib/library.svelte';
  import { router } from './lib/route.svelte';
  import { importFiles } from './lib/importActions';
  import { AUDIO_EXT } from './core/library/tags';
  import { canKeepFiles } from './platform';
  import Start from './ui/Start.svelte';
  import Results from './ui/Results.svelte';
  import Reference from './ui/Reference.svelte';
  import Welcome from './ui/library/Welcome.svelte';
  import LibraryView from './ui/library/LibraryView.svelte';
  import TrackDetail from './ui/library/TrackDetail.svelte';
  import LibPlayer from './ui/library/LibPlayer.svelte';
  import DragTag from './ui/library/DragTag.svelte';
  import { nowPlaying } from './lib/nowPlaying.svelte';

  onMount(() => { void lib.boot(); });

  const route = $derived(router.current);
  const inLibrary = $derived(lib.phase === 'library');
  let dragDepth = 0;
  const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types || [])].includes('Files');

  function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    if (f) { if (route.name !== 'analyze') router.go('#/analyze'); void analyzeFile(f); }
    input.value = '';
  }
  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (route.name === 'library') {
      if (e.code === 'Space' && inLibrary && nowPlaying.trackId) { e.preventDefault(); nowPlaying.toggle(); }
      return;
    }
    if (app.phase !== 'result') return;
    if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); player.seek(player.time + 5); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); player.seek(player.time - 5); }
  }

  /** Library view: dropped folders become music folders, DJ-library files are imported. */
  async function dropIntoLibrary(dt: DataTransfer) {
    const items = [...dt.items].filter(i => i.kind === 'file');
    type WithHandle = DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };
    // Everything must be taken from the DataTransfer before the first await: it's emptied after the event.
    const files = [...dt.files];
    const handles = await Promise.all(items.map(i => (i as WithHandle).getAsFileSystemHandle?.() ?? Promise.resolve(null)));
    const dirs = handles.filter((h): h is FileSystemDirectoryHandle => h?.kind === 'directory');
    for (const d of dirs) await lib.addFolder(d);
    const libFiles = files.filter(f => !AUDIO_EXT.test(f.name) && f.size > 0);
    if (libFiles.length && !dirs.length) await importFiles(libFiles);
    // Songs: kept by handle where the browser allows it, otherwise copied into MCO's storage.
    const songHandles = handles.filter((h): h is FileSystemFileHandle => h?.kind === 'file' && AUDIO_EXT.test(h.name));
    const songs = files.filter(f => AUDIO_EXT.test(f.name));
    if (songHandles.length && canKeepFiles()) await lib.addFiles(songHandles);
    else if (songs.length) await lib.addFileCopies(songs);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault(); dragDepth = 0; app.dragging = false;
    const dt = e.dataTransfer;
    if (!dt || !hasFiles(e)) return;
    if (route.name === 'analyze' || !inLibrary) { const f = dt.files?.[0]; if (f) { router.go('#/analyze'); void analyzeFile(f); } }
    else void dropIntoLibrary(dt);
  }

  // A file from "Analyze a file" isn't a library track: stop it when going to the library, and stop
  // library playback when going to "Analyze a file".
  $effect(() => {
    const name = route.name;
    untrack(() => {
      if (name === 'library' && !nowPlaying.trackId && !player.paused) player.toggle();
      if (name === 'analyze' && nowPlaying.trackId) { if (!player.paused) player.toggle(); nowPlaying.clear(); player.setSource(null); }
    });
  });
  $effect(() => { document.body.classList.toggle('dragging', app.dragging); });
  $effect(() => { document.body.classList.toggle('live-on', app.liveOn && app.phase === 'result' && route.name !== 'library'); });
</script>

<svelte:window
  onkeydown={onKey}
  ondragenter={e => { if (hasFiles(e)) { dragDepth++; app.dragging = true; } }}
  ondragleave={() => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) app.dragging = false; }}
  ondragover={e => e.preventDefault()}
  ondrop={onDrop}
/>

<div class="wrap">
  <header class="top">
    <div class="brand">
      <h1><a href="#/">M<span>CO</span></a></h1>
      <nav class="tabs" aria-label="Sections">
        <a href="#/" class:on={route.name !== 'analyze'}>Library</a>
        <a href="#/analyze" class:on={route.name === 'analyze'}>Analyze a file</a>
      </nav>
    </div>
    <div class="open">
      {#if route.name === 'analyze'}
        <small>or drop a file anywhere · nothing leaves your computer</small>
        <button type="button" class="btn" onclick={() => document.getElementById('file-input')?.click()}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 5v7h12V5M8 1.5v8M5 4.5l3-3 3 3"/></svg>
          Open audio file
        </button>
      {:else if lib.profile}
        <small id="saving" class:hidden={!(lib.saving || lib.unsaved)} aria-hidden={!(lib.saving || lib.unsaved)}>Saving…</small>
        <small title={'Your library is stored in ' + lib.homeName}>📂 {lib.homeName}</small>
        <button type="button" class="who" title="Switch profile" onclick={() => lib.switchProfile()}>
          <span class="dot" style:background={lib.profile.color}>{lib.profile.name.slice(0, 1).toUpperCase()}</span>{lib.profile.name}
        </button>
      {/if}
      <input type="file" id="file-input" accept="audio/*,.flac,.wav,.aif,.aiff,.aifc,.m4a,.mp4,.alac,.mp3,.aac,.ogg,.oga,.opus,.webm,.mka" onchange={pick}>
    </div>
  </header>

  {#if route.name === 'analyze'}
    {#if app.busy}
      <div id="status" class="status">
        <div class="row"><span id="status-text">{app.busy.text}</span><span id="status-pct" class="mono">{app.busy.p != null ? Math.round(app.busy.p * 100) + '%' : ''}</span></div>
        <div class="bar"><span id="status-bar" style:width={(app.busy.p ?? 0) * 100 + '%'}></span></div>
      </div>
    {/if}
    {#if app.error}
      <div id="error" class="error"><b>Couldn’t analyze {app.error.name}.</b> {app.error.message}</div>
    {/if}
    {#if app.phase === 'start'}<Start />{:else}<Results />{/if}
    <Reference />
    <footer>Decoding uses your browser’s audio engine (WAV and AIFF are read directly). Chrome and Firefox can’t decode ALAC or DSD; Safari handles ALAC.</footer>
  {:else if !inLibrary || lib.onboarding === 'music'}
    <Welcome />
  {:else if route.name === 'track'}
    {#key route.id}<TrackDetail id={route.id} />{/key}
  {:else}
    <LibraryView />
  {/if}
</div>
{#if inLibrary && route.name === 'library' && lib.onboarding !== 'music'}<LibPlayer />{/if}
<DragTag />

{#if app.dragging && (route.name === 'analyze' ? app.phase === 'result' : inLibrary)}
  <div class="drop-overlay" id="drop"><div>{route.name === 'analyze' ? 'Drop the audio file to analyze it' : 'Drop songs or a music folder to add them, or a DJ library file to import it'}</div></div>
{/if}

<style>
  .hidden { visibility: hidden; }
  .brand h1 a { color: inherit; text-decoration: none; }
  .tabs { display: flex; gap: 4px; }
  .tabs a { color: var(--muted); text-decoration: none; font-size: 13.5px; font-weight: 600; padding: 4px 10px; border-radius: 4px; }
  .tabs a:hover { color: var(--ink); }
  .tabs a.on { color: var(--ink); background: var(--raised); }
  .who { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 3px 12px 3px 3px; cursor: pointer; font-weight: 600; font-size: 13px; }
  .who:hover { border-color: var(--accent); }
  .dot { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; color: #06121d; font-weight: 800; font-size: 12px; }
</style>
