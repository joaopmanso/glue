<script lang="ts">
  import { lib } from '../../lib/library.svelte';
  import { view } from '../../lib/view.svelte';
  import { router } from '../../lib/route.svelte';
  import LibSidebar from './LibSidebar.svelte';
  import TrackTable from './TrackTable.svelte';
  import NoteEditor from './NoteEditor.svelte';
  import { app } from '../../lib/app.svelte';
  import { LOOSE } from '../../store/merge';

  const APP_NAMES: Record<string, string> = { rekordbox: 'rekordbox', engine: 'Engine DJ', serato: 'Serato', traktor: 'Traktor', apple: 'Apple Music', m3u: 'M3U' };
  const title = $derived.by(() => {
    void lib.version;
    const s = view.sel, st = lib.store;
    switch (s.kind) {
      case 'all': return 'All tracks';
      case 'recent': return 'Recently added';
      case 'pending': return 'Not analysed yet';
      case 'attention': return 'Needs attention';
      case 'unlinked': return 'No file linked';
      case 'list': { const l = st?.lists.get(s.id); return l ? lib.listPath(l) : 'Playlist'; }
      case 'source': { const x = st?.sources.get(s.id); return x ? (APP_NAMES[x.app] ?? x.app) + ' import' : 'Import'; }
      case 'root': return s.id === LOOSE ? 'Added songs' : lib.rootState(s.id)?.root.name ?? 'Folder';
    }
  });
  const count = $derived.by(() => { void lib.version; void view.search; return view.rows('camelot').length; });
  const pending = $derived.by(() => { void lib.version; return lib.pendingCount(); });
  const playlists = $derived.by(() => { void lib.version; return [...(lib.store?.lists.values() ?? [])].filter(l => l.kind === 'playlist').sort((a, b) => lib.listPath(a).localeCompare(lib.listPath(b))); });
  const current = $derived.by(() => { void lib.version; const s = view.sel; return s.kind === 'list' ? lib.store?.lists.get(s.id) ?? null : null; });
  const sel = $derived([...view.selected]);
  // A playlist shown sorted by another column can adopt that order as its own.
  const sortedPlaylist = $derived(current?.kind === 'playlist' && view.sort.key !== 'order' && !view.search.trim());
  function keepOrder() {
    if (!current) return;
    lib.setListOrder(current.id, view.rows(app.keyNotation).map(r => r.t.id));
    view.sortBy('order');
    lib.notice = 'Saved this order as the order of ' + current.name + '.';
  }

  function addTo(e: Event) {
    const el = e.currentTarget as HTMLSelectElement, v = el.value;
    el.value = '';
    if (!v) return;
    let id = v;
    if (v === '__new') { const name = prompt('Name of the new playlist'); if (!name) return; id = lib.createList('playlist', name)?.id ?? ''; }
    const n = lib.addToList(id, sel), l = lib.store?.lists.get(id);
    lib.notice = n ? 'Added ' + n + ' track' + (n === 1 ? '' : 's') + ' to ' + (l?.name ?? 'the playlist') + '.' : 'Already in ' + (l?.name ?? 'the playlist') + '.';
  }
  function newCollection() { const n = prompt('Name of the new collection'); if (n) void lib.createCollection(n); }
  function renameCollection() { const n = prompt('Rename collection', lib.store?.meta.name); if (n) void lib.renameCollection(n); }
  function deleteCollection() {
    const s = lib.store;
    if (s && confirm('Delete the collection “' + s.meta.name + '”? Its playlists and analysis are removed from your MCO folder. Your music files aren’t touched.')) void lib.deleteCollection(s.meta.id);
  }
</script>

<div class="lib">
  <div class="colbar">
    <select aria-label="Collection" value={lib.store?.meta.id} onchange={e => { const v = e.currentTarget.value; if (v === '__new') { e.currentTarget.value = lib.store?.meta.id ?? ''; newCollection(); } else void lib.openCollection(v); }}>
      {#each lib.profile?.collections ?? [] as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      <option value="__new">+ New collection…</option>
    </select>
    <button type="button" class="mini" title="Rename collection" onclick={renameCollection}>✎</button>
    <button type="button" class="mini" title="Delete collection" onclick={deleteCollection}>×</button>
  </div>
  <div class="headbar">
    <h2>{title}<small>{count} track{count === 1 ? '' : 's'}</small></h2>
    <input type="search" placeholder="Search title, artist, album…" bind:value={view.search} aria-label="Search tracks">
    <div class="an" title="Tracks are analysed in the background, several at a time">
      {#if lib.analysis.running || pending}
        <span class="spin" class:paused={lib.analysis.paused}></span>
        {lib.analysis.paused ? 'Analysis paused' : 'Analysing'} · {pending} left
        <button type="button" class="mini" onclick={() => lib.pauseAnalysis(!lib.analysis.paused)}>{lib.analysis.paused ? 'Resume' : 'Pause'}</button>
      {:else if lib.store?.tracks.size}
        <span class="ok">✓</span> All analysed
      {/if}
    </div>
  </div>

  {#if lib.job}
    <div class="status">
      <div class="row"><span>{lib.job.text}</span><span class="mono">{lib.job.total ? lib.job.done + ' / ' + lib.job.total : lib.job.done || ''}</span></div>
      <div class="bar-line"><span style:width={lib.job.total ? (lib.job.done / lib.job.total) * 100 + '%' : '30%'} class:indet={!lib.job.total}></span></div>
    </div>
  {/if}
  {#if lib.notice}
    <div class="notice toast" role="status"><span>{lib.notice}</span><button type="button" aria-label="Dismiss" onclick={() => (lib.notice = '')}>×</button></div>
  {/if}
  {#if lib.readOnly}
    <div class="notice warn">MCO is open in another tab, so this one is read-only. Close the other tab and reload to make changes here.</div>
  {/if}

  <div class="main">
    <LibSidebar />
    <div class="right">
      <!-- Always laid out: a layout shift during dragstart makes Chromium cancel the drag. -->
      <div class="selbar">
        {#if sel.length}
          <span>{sel.length} selected</span>
          {#if sel.length === 1}<button type="button" class="mini" onclick={() => router.go('#/track/' + sel[0])}>Open details</button>{/if}
          <select aria-label="Add to playlist" onchange={addTo}>
            <option value="">Add to playlist…</option>
            {#each playlists as p (p.id)}<option value={p.id}>{lib.listPath(p)}</option>{/each}
            <option value="__new">+ New playlist…</option>
          </select>
          {#if current?.kind === 'playlist'}<button type="button" class="mini" onclick={() => { lib.removeFromList(current.id, sel); view.selected = new Set(); }}>Remove from playlist</button>{/if}
          <button type="button" class="mini" id="remove-tracks" onclick={() => { if (confirm('Remove ' + (sel.length === 1 ? 'this track' : 'these ' + sel.length + ' tracks') + ' from the collection and all its playlists? Files on disk aren’t touched; tracks in a music folder come back on the next scan.')) { void lib.removeTracks(sel); view.selected = new Set(); } }}>Remove from collection</button>
          <button type="button" class="mini" onclick={() => (view.selected = new Set())}>Clear</button>
        {:else if sortedPlaylist}
          <span class="hint">Sorted by {view.sort.key}. Drag to rearrange works in playlist order.</span>
          <button type="button" class="mini" id="keep-order" onclick={keepOrder}>Keep this order</button>
          <button type="button" class="mini" onclick={() => view.sortBy('order')}>Back to playlist order</button>
        {:else}
          <span class="hint">Double-click a track for its full analysis. Drag tracks onto a playlist to add them. Drop songs or folders anywhere to add them to the collection.</span>
        {/if}
      </div>
      <TrackTable />
      <NoteEditor />
    </div>
  </div>
</div>

<style>
  .lib { display: grid; grid-template-rows: auto auto auto auto 1fr; gap: 10px; height: calc(100vh - 110px - 64px); min-height: 440px; }
  /* Floats above the player bar: an in-flow banner would shift the table (and cancel a drag). */
  .toast { position: fixed; right: clamp(16px, 3vw, 32px); bottom: 76px; z-index: 25; max-width: min(560px, calc(100vw - 32px)); box-shadow: 0 8px 28px rgb(0 0 0 / .45); background: color-mix(in srgb, var(--accent) 12%, var(--raised)); }
  .colbar { display: flex; gap: 6px; align-items: center; }
  .colbar select, .selbar select { background: var(--surface); border: 1px solid var(--line-2); border-radius: 4px; padding: 4px 8px; font-size: 13px; }
  .colbar select { font-weight: 700; }
  .headbar { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  h2 { font-size: 20px; flex: 1; min-width: 200px; display: flex; gap: 10px; align-items: baseline; }
  h2 small { font-size: 12.5px; font-weight: 500; color: var(--muted); }
  input[type="search"] { width: min(340px, 100%); background: var(--surface); border: 1px solid var(--line-2); border-radius: var(--radius); padding: 7px 12px; }
  .an { display: flex; gap: 8px; align-items: center; color: var(--ink-2); font-size: 12.5px; }
  .ok { color: var(--ok); }
  .spin { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--accent); border-right-color: transparent; animation: spin .9s linear infinite; }
  .spin.paused { animation: none; border-color: var(--muted); }
  @keyframes spin { to { transform: rotate(360deg); } }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 3px 9px; cursor: pointer; }
  .mini:hover { border-color: var(--accent); color: var(--accent); }
  .status { display: grid; gap: 4px; font-size: 12.5px; color: var(--ink-2); }
  .status .row { display: flex; justify-content: space-between; }
  .bar-line { height: 3px; background: var(--line); border-radius: 2px; overflow: hidden; }
  .bar-line span { display: block; height: 100%; background: var(--accent); }
  .bar-line span.indet { animation: indet 1.2s ease-in-out infinite; }
  @keyframes indet { from { transform: translateX(-100%); } to { transform: translateX(350%); } }
  .notice { display: flex; justify-content: space-between; gap: 12px; align-items: center; background: color-mix(in srgb, var(--accent) 9%, var(--surface)); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); border-radius: var(--radius); padding: 7px 12px; font-size: 13px; }
  .notice.warn { background: color-mix(in srgb, var(--warn) 9%, var(--surface)); border-color: color-mix(in srgb, var(--warn) 40%, transparent); }
  .notice button { background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 16px; }
  .main { display: grid; grid-template-columns: 270px 1fr; gap: 16px; min-height: 0; }
  .right { display: grid; grid-template-rows: auto 1fr; gap: 8px; min-height: 0; }
  .selbar { min-height: 28px; display: flex; gap: 10px; align-items: center; font-size: 13px; color: var(--ink-2); flex-wrap: wrap; }
  .hint { color: var(--muted); font-size: 12.5px; }
  @media (max-width: 800px) { .main { grid-template-columns: 1fr; } .lib { height: auto; } }
</style>
