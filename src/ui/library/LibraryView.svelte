<script lang="ts">
  import { lib } from '../../lib/library.svelte';
  import NeedsMusic from '../events/NeedsMusic.svelte';
  import BrowseView from './BrowseView.svelte';
  import { facetInfo } from '../../core/library/browse';
  import { removeNote, view, viewTitle, withCopies, FILTER_GROUPS } from '../../lib/view.svelte';
  import { router, trackHref, trackTab } from '../../lib/route.svelte';
  import LibSidebar from './LibSidebar.svelte';
  import TrackTable from './TrackTable.svelte';
  import DuplicatesView from './DuplicatesView.svelte';
  import FilterMenu from './FilterMenu.svelte';
  import PlaylistInsights from './PlaylistInsights.svelte';
  import { readPref, writePref } from '../../lib/prefs';
  import { describeRemoval, orphans, removalImpact } from '../../core/library/removal';
  import { auto } from '../../lib/auto.svelte';
  import { app } from '../../lib/app.svelte';
  import { sendTracks } from '../../lib/sendToHome.svelte';
  import { menu } from '../../lib/menu.svelte';
  import { trackMenu } from '../../lib/trackMenu';
  import { filterMenu } from '../../lib/filterMenu';
  import AppIcon from '../AppIcon.svelte';
  import { drag } from '../../lib/drag.svelte';
  import { listTree } from '../../core/library/listTree';
  import { incoming, TO_BE_SORTED } from '../../lib/incoming.svelte';
  import { dock } from '../../lib/dock.svelte';
  // The sidebar's width, dragged on the handle between it and the songs (remembered).
  let resizing = $state(false);
  let sideW = $state(Math.min(560, Math.max(200, +readPref('sideWidth', '270') || 270)));
  // The sidebar folds away, for more columns (the user's list, 2026-09-27); remembered. Ctrl+B.
  let folded = $state(readPref('sideFolded', '0') === '1');
  function fold(on = !folded) { folded = on; writePref('sideFolded', on ? '1' : '0'); }
  function foldKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'b' && !(e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); fold(); }
  }
  function startResize(e: PointerEvent) {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement, x0 = e.clientX, w0 = sideW;
    el.setPointerCapture(e.pointerId); resizing = true;
    const move = (m: PointerEvent) => { sideW = Math.min(560, Math.max(200, w0 + m.clientX - x0)); };
    const up = () => { resizing = false; el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); writePref('sideWidth', String(sideW)); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  }

  import { remoteFiles } from '../../lib/remoteFiles.svelte';
  import { account } from '../../lib/account.svelte';
  import { askDeleteShared, shared } from '../../lib/shared.svelte';
  import { homeAnalysis } from '../../lib/homeAnalysis.svelte';
  import { engineClient } from '../../lib/engine.svelte';
  import type { HomeFolder } from '../../core/transfer';

  const title = $derived.by(() => { void lib.version; return viewTitle(view.sel); });
  // A DJ library's view shows its app's badge.
  const djApp = $derived.by(() => { void lib.version; const s = view.sel; return s.kind === 'source' ? lib.store?.sources.get(s.id)?.app : s.kind === 'dj' ? lib.store?.sources.get(s.sourceId)?.app : undefined; });
  const count = $derived.by(() => { void lib.version; void view.search; return view.rows('camelot').length; });
  // Where GLUE Home analyses (ADR 0104), its own queue: what it has left, and what it's on now (it said "0 left" while
  // GLUE Home worked through 300 songs, 2026-09-30).
  const pending = $derived.by(() => { void lib.version; const st = engineClient.active ? engineClient.state?.analysis : null; return st ? Math.max(lib.pendingCount(), st.left + st.running) : lib.pendingCount(); });
  // Where songs can be added: the playlists as the sidebar shows them (ADR 0062), the user's own first,
  // then each import's (replaced when it's imported again). Folders are playlists too (ADR 0049).
  const targets = $derived.by(() => { void lib.version; return listTree(lib.store?.lists.values() ?? [], l => l.id === TO_BE_SORTED); });
  const NBSP = String.fromCharCode(160);   // an option keeps no-break spaces (ordinary ones collapse)
  const pad = (depth: number, folder: boolean) => NBSP.repeat(3 * depth) + (folder ? '📁' + NBSP : '');
  const current = $derived.by(() => { void lib.version; const s = view.sel; return s.kind === 'list' ? lib.store?.lists.get(s.id) ?? null : null; });
  const sel = $derived([...view.selected]);
  // Playlist insights (length, tempo, keys, tags): shown under a playlist's header; hideable.
  let showInsights = $state(readPref('insights', '1') === '1');
  function toggleInsights() { showInsights = !showInsights; writePref('insights', showInsights ? '1' : '0'); }
  const insightIds = $derived.by(() => { void lib.version; void view.filters; void view.search; void view.sort; return current ? view.rows(app.keyNotation).map(r => r.t.id) : []; });
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
  // Tracks dragged from the table onto a computer with GLUE Home (Devices): send their files there
  // (ADR 0044). Sending the selection is in its menu (⋯, or right-click), for other computers only.
  drag.onHome = (home, ids) => void sendTracks(home, ids);
  /** ⋯ in the selection bar: the songs' menu, as on right-click (ADR 0067). */
  function selMenu(el: Element) {
    const order = view.rows(app.keyNotation).map(r => r.t.id), at = new Map(order.map((id, i) => [id, i]));
    const ids = [...view.selected].sort((a, b) => (at.get(a) ?? Infinity) - (at.get(b) ?? Infinity));
    menu.from(el, () => trackMenu(ids, { order }), 'Songs');
  }
  // TO BE SORTED: move the selected songs into a music folder on their computer.
  const sorting = $derived(current?.id === TO_BE_SORTED);
  let folders = $state<{ home: string; list: HomeFolder[] } | null>(null);
  $effect(() => {
    const src = (id: string) => incoming.sourceOf(id)?.home;
    const home = sorting ? src(sel[0]) : undefined;
    if (!home || !sel.every(id => src(id) === home)) { folders = null; return; }
    if (folders?.home === home) return;
    void incoming.folders(home).then(list => (folders = { home, list })).catch(() => (folders = null));
  });
  async function moveTo(e: Event) {
    const el = e.currentTarget as HTMLSelectElement, folder = el.value;
    el.value = '';
    if (!folder) return;
    try {
      const { moved: n, elsewhere } = await incoming.move(sel, folder);
      view.selected = new Set();
      lib.notice = 'Moved ' + n + ' song' + (n === 1 ? '' : 's') + '.' + (elsewhere ? ' GLUE on that computer adds ' + (elsewhere === 1 ? 'it' : 'them') + ' to the library on its next scan of the folder.' : '');
    }
    catch (err) { lib.notice = (err as Error).message; }
  }
  function newCollection() { const n = prompt('Name of the new collection'); if (n) void lib.createCollection(n, true); }
  // The account's collection (ADR 0112): renamed and deleted for every device.
  const accounts = () => !!lib.store?.shared && account.signedIn && shared.list.some(c => c.id === lib.store?.meta.id);
  function renameCollection() {
    const s = lib.store, n = prompt('Rename collection', s?.meta.name);
    if (!s || !n?.trim()) return;
    if (accounts()) void shared.rename(s.meta.id, n).catch(e => (lib.notice = 'Couldn’t rename it: ' + (e as Error).message)); else void lib.renameCollection(n);
  }
  function deleteCollection() {
    const s = lib.store;
    if (!s) return;
    if (accounts()) { void askDeleteShared(s.meta.id, s.meta.name); return; }
    if (confirm('Delete the collection “' + s.meta.name + '”? Its playlists and analysis are removed from your GLUE folder. Your music files aren’t touched.')) void lib.deleteCollection(s.meta.id);
  }

  // Songs left without a file for good by a folder removed before 0.35 (ADR 0111): asked once per collection.
  const orphanList = $derived.by(() => { void lib.version; return lib.store && !lib.readOnly ? orphans(lib.store.tracks.values()) : []; });
  let askedFor = $state('');
  const orphansAsked = $derived.by(() => { const cid = lib.store?.meta.id ?? ''; return askedFor === cid || readPref('orphans.asked.' + cid, '') === '1'; });
  let removingOrphans = $state(false);
  function keepOrphans() { const cid = lib.store?.meta.id ?? ''; writePref('orphans.asked.' + cid, '1'); askedFor = cid; }
  async function removeOrphans() {
    removingOrphans = true;
    try {
      await lib.backupBefore('orphans');
      const n = orphanList.length;
      await lib.removeTracks(orphanList.map(t => t.id));
      keepOrphans();
      lib.notice = 'Removed ' + n.toLocaleString() + ' song' + (n === 1 ? '' : 's') + ' with no file (a backup is in your GLUE folder’s backups).';
    } catch (e) { lib.notice = 'Couldn’t remove them: ' + (e as Error).message; }
    finally { removingOrphans = false; }
  }
</script>

<svelte:window onkeydown={foldKey} />

<div class="lib">
  <NeedsMusic />
  <div class="colbar">
    <select aria-label="Collection" id="collection-pick" value={lib.store?.meta.id} onchange={e => { const v = e.currentTarget.value; if (v === '__new') { e.currentTarget.value = lib.store?.meta.id ?? ''; newCollection(); } else if (v.startsWith('__join:')) { e.currentTarget.value = lib.store?.meta.id ?? ''; void shared.join(v.slice(7)); } else void lib.openCollection(v); }}>
      {#each lib.profile?.collections ?? [] as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      <!-- The account's collections this computer doesn't have yet (ADR 0101). -->
      {#each shared.missing() as c (c.id)}<option value={'__join:' + c.id}>Add “{c.name}” (your account{c.stats?.tracks ? ', ' + c.stats.tracks.toLocaleString() + ' songs' : ''})</option>{/each}
      <option value="__new">+ New collection…</option>
    </select>
    {#if lib.store?.shared}<span class="shared" id="shared-chip" class:busy={shared.status.busy} title={shared.status.error ? 'Not synced: ' + shared.status.error : shared.status.at ? 'The same on all your devices · synced ' + new Date(shared.status.at).toLocaleTimeString() : 'The same on all your devices'}>{shared.status.busy ? 'Syncing…' : shared.status.error ? 'Not synced' : 'Synced'}</span>
{/if}
    <button type="button" class="mini" title="Rename collection" onclick={renameCollection}>✎</button>
    <button type="button" class="mini" id="stats-btn" title="Stats of this collection" aria-label="Stats of this collection" onclick={() => (view.statsFor = { title: lib.profile?.collections.find(c => c.id === lib.store?.meta.id)?.name ?? 'This collection', sel: { kind: 'all' } })}><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 12.5V7.5M5.3 12.5V3M8.7 12.5V5.5M12 12.5V1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
    <button type="button" class="mini" title="Delete collection" onclick={deleteCollection}>×</button>
  </div>
  <div class="headbar">
    <button type="button" class="sidetog" id="side-toggle" aria-pressed={folded} title={folded ? 'Show the sidebar (Ctrl+B)' : 'Hide the sidebar, for more columns (Ctrl+B)'} aria-label={folded ? 'Show the sidebar' : 'Hide the sidebar'} onclick={() => fold()}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6 2.5v11" stroke="currentColor" stroke-width="1.3"/>{#if !folded}<path d="M2.8 5h1.9M2.8 7h1.9M2.8 9h1.9" stroke="currentColor" stroke-width="1.1"/>{/if}</svg>
    </button>
    <h2>{#if view.sel.kind === 'facet'}{@const by = view.sel.by}<button type="button" class="crumb" id="browse-back" title="Back to the list" onclick={() => view.select({ kind: 'browse', by })}>{facetInfo(by).name} ›</button>{/if}{#if djApp}<AppIcon app={djApp} size={20} />{/if}{title}{#if view.sel.kind !== 'browse'}<small>{count} track{count === 1 ? '' : 's'}</small>{/if}</h2>
    {#if view.sel.kind !== 'browse'}
    <input type="search" placeholder="Search title, artist, album…" bind:value={view.search} aria-label="Search tracks">
    <FilterMenu />
    {/if}
    {#if incoming.busy}<span class="cloudload" id="incoming-loading" role="status"><span class="spin"></span>{incoming.busy}</span>{/if}
    {#if current}<button type="button" class="ibtn" class:on={showInsights} id="insights-btn" aria-pressed={showInsights} title="Length, tempo, keys and tags of this playlist" onclick={toggleInsights}>Insights</button>{/if}
    <div class="an" title="Tracks are analysed in the background, several at a time">
      {#if lib.analysis.running}
        <span class="spin"></span> Analysing · {pending} left
      {:else if pending && lib.analysis.paused}
        <span class="spin paused"></span> {pending} not analysed
      {:else if pending}
        <span class="spin"></span> Analysing · {pending} left
      {:else if lib.store?.tracks.size}
        <span class="ok">✓</span> All analysed
      {/if}
      <!-- Stop now: what's being analysed stops, and background analysis is off until it's on again (ADR 0103). -->
      {#if lib.analysis.running || (pending && !lib.analysis.paused)}<button type="button" class="mini stopan" id="stop-analysis" title="Stop analysing now (turn Background analysis on again to carry on)" onclick={() => lib.stopAnalysisNow()}>Stop</button>{/if}
      {#if engineClient.active}<span class="by" id="analysis-by" title="This computer’s GLUE Home analyses its songs, also while GLUE isn’t open">by GLUE Home</span>{/if}
      <label class="switch" title="Analyse new and changed tracks in the background. Turn off for big imports; analyse chosen tracks with “Analyse” instead.">
        <input type="checkbox" id="auto-analyse" checked={!lib.analysis.paused} onchange={e => lib.pauseAnalysis(!e.currentTarget.checked)}><span class="knob" aria-hidden="true"></span> Background analysis
      </label>
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
  {#if lib.homeLost === 'needs-access'}
    <div class="notice warn" id="home-lost">GLUE Home stopped. To carry on in the browser meanwhile, GLUE needs your permission to use its folder again. <button type="button" class="btn" onclick={() => lib.allowBrowserFolder()}>Allow</button></div>
  {:else if lib.homeLost === 'no-folder'}
    <div class="notice warn" id="home-lost">GLUE Home stopped. This browser has only used your GLUE folder through GLUE Home, so changes wait until GLUE Home is running again.</div>
  {/if}
  {#if orphanList.length && !orphansAsked}
    <!-- Songs whose music folder was removed before removing a folder took its songs (ADR 0111): asked once. -->
    <div class="notice warn" id="orphans"><span>{orphanList.length.toLocaleString()} song{orphanList.length === 1 ? '' : 's'} here {orphanList.length === 1 ? 'has' : 'have'} no file: {orphanList.length === 1 ? 'its' : 'their'} music folder was removed from this collection ({describeRemoval(removalImpact(orphanList, lib.store?.lists.values() ?? []))}). Remove {orphanList.length === 1 ? 'it' : 'them'} too? A backup is made first.</span>
      <span class="acts"><button type="button" class="btn" id="orphans-remove" disabled={removingOrphans} onclick={removeOrphans}>{removingOrphans ? 'Removing…' : 'Remove them'}</button><button type="button" class="mini" id="orphans-keep" onclick={keepOrphans}>Keep</button></span></div>
  {/if}
  {#if lib.readOnly}
    <div class="notice warn">GLUE is open in another tab, so this one is read-only. Close the other tab and reload to make changes here.</div>
  {/if}

  <div class="main" class:folded style:--sidew={sideW + 'px'}>
    {#if folded}
      <button type="button" class="sidestrip" id="side-show" title="Show the sidebar (Ctrl+B)" aria-label="Show the sidebar" onclick={() => fold(false)}>»</button>
    {:else}
      <LibSidebar />
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="splitter" class:on={resizing} role="separator" aria-orientation="vertical" aria-label="Sidebar width" title="Drag to make the sidebar wider or narrower (double-click: back to normal)"
        onpointerdown={startResize} ondblclick={() => { sideW = 270; writePref('sideWidth', '270'); }}></div>
    {/if}
    <div class="right">
      <!-- One fixed-height row, always laid out: selecting songs never moves the table (a double-click
           once opened the wrong song as the rows jumped, 2026-09-27), and a layout shift during
           dragstart makes Chromium cancel the drag. The actions are always there, disabled until songs
           are selected; what doesn't fit is in ⋯ (and on right-click). -->
      {#if view.sel.kind !== 'browse'}
      <div class="selbar" class:has={sel.length > 0}>
        <div class="selinfo">
          {#if sel.length}
            <span class="count">{sel.length} selected</span>
            <button type="button" class="mini" onclick={() => (view.selected = new Set())}>Clear</button>
          {:else if view.filtering}
            <span class="hint">Showing only</span>
            {#each FILTER_GROUPS as { g } (g)}{#each view.filters[g] as v (v)}
              <button type="button" class="chip" data-chip={g} title="Click to stop filtering by this; right-click for more" onclick={() => view.toggleFilter(g, v)}
                oncontextmenu={e => menu.context(e, () => filterMenu(g, v), 'Filter')}>{v}<span aria-hidden="true">×</span></button>
            {/each}{/each}
            <button type="button" class="mini" id="clear-filters" onclick={() => view.clearFilters()}>Clear filters</button>
          {:else if sortedPlaylist}
            <span class="hint">Sorted by {view.sort.key}.</span>
            <button type="button" class="mini" id="keep-order" onclick={keepOrder}>Keep this order</button>
            <button type="button" class="mini" onclick={() => view.sortBy('order')}>Back to playlist order</button>
          {:else}
            <span class="hint" title="Double-click a track for its full analysis. Drag tracks onto a playlist to add them. Drop songs or folders anywhere to add them to the collection.">Double-click a track for its page · drag tracks onto a playlist · right-click for more</span>
          {/if}
        </div>
        <div class="selacts" title={sel.length ? '' : 'Select songs to use these'}>
          <button type="button" class="mini opt2" id="open-details" disabled={sel.length !== 1} onclick={() => router.go(trackHref(sel[0]))}>{trackTab.last === 'prepare' ? 'Open Prepare' : 'Open details'}</button>
          <button type="button" class="mini opt" id="tag-selected" data-tags-open disabled={!sel.length} onclick={e => view.editTags(e.currentTarget, { ids: sel })}>Tags…</button>
          <button type="button" class="mini accent opt" id="auto-from" disabled={!sel.length} title={sel.length === 1 ? 'Generate a playlist that starts from this track' : 'Generate a playlist that includes all the selected tracks'} onclick={() => { const ordered = view.rows(app.keyNotation).map(r => r.t.id).filter(id => view.selected.has(id)); auto.show(ordered[0], ordered.slice(1)); }}>{sel.length > 1 ? 'Build playlist with these ' + sel.length : 'Build playlist from this'}</button>
          <select aria-label="Add to playlist" disabled={!sel.length} onchange={addTo}>
            <option value="">Add to playlist…</option>
            <option value="__new">+ New playlist…</option>
            {#if targets.own.length}<optgroup label="Your playlists">{#each targets.own as e (e.list.id)}<option value={e.list.id}>{pad(e.depth, e.list.kind === 'folder')}{e.list.name}</option>{/each}</optgroup>{/if}
            {#each targets.imports as g (g.top.id)}
              <optgroup label={g.top.name + ' ↓ · replaced when you import it again'}>{#each g.entries as e (e.list.id)}<option value={e.list.id}>{pad(e.depth, e.list.kind === 'folder')}{e.list.name}</option>{/each}</optgroup>
            {/each}
          </select>
          {#if current}<button type="button" class="mini" disabled={!sel.some(id => current.items.includes(id))} onclick={() => { lib.removeFromList(current.id, sel); view.selected = new Set(); }}>Remove from {current.kind === 'folder' ? 'folder' : 'playlist'}</button>{/if}
          {#if dock.available}
            <button type="button" class="mini opt" id="dock-add" disabled={!sel.length} title="Add the selected songs to GLUE Home's drag dock, to drag them into Engine DJ, Rekordbox or a folder" onclick={() => { const s = lib.store; if (s) void dock.add(sel.map(id => s.tracks.get(id)).filter(t => !!t)); }}>+ Dock{sel.length ? ' (' + sel.length + ')' : ''}</button>
          {/if}
          <button type="button" class="mini opt" id="analyse-selected" disabled={!sel.length} title="Analyse the selected tracks now (again, if they were): another computer's by its GLUE Home" onclick={() => { const n = lib.analyseNow(sel) + homeAnalysis.remoteNow(sel); lib.notice = n ? 'Analysing ' + n + ' track' + (n === 1 ? '' : 's') + '.' : 'None of these has a file GLUE can read now (another computer’s need its GLUE Home running).'; }}>Analyse now</button>
          {#if sorting}
            <select id="move-to" aria-label="Move to a music folder" disabled={!folders} onchange={moveTo}>
              <option value="">Move to music folder…</option>
              {#each folders?.list ?? [] as f (f.id)}<option value={f.id}>{f.name} ({f.collection})</option>{/each}
            </select>
          {/if}
          <button type="button" class="mini opt2" id="remove-tracks" disabled={!sel.length} onclick={() => { if (confirm('Remove ' + (sel.length === 1 ? 'this track' : 'these ' + sel.length + ' tracks') + ' from the collection and all its playlists? Files on disk aren’t touched; tracks in a music folder come back on the next scan.' + removeNote())) { void lib.removeTracks(withCopies(sel)); view.selected = new Set(); } }}>Remove from collection</button>
          <button type="button" class="mini more" id="sel-more" disabled={!sel.length} title="Everything you can do with the selected songs (also on right-click)" aria-haspopup="menu" onclick={e => selMenu(e.currentTarget)}>⋯</button>
        </div>
        {#if dock.available}<button type="button" class="mini dockbtn" id="drag-dock" data-drop="dock" class:hot={drag.active && drag.target?.type === 'dock'} title="Show GLUE Home's drag dock. Songs and playlists go in by dragging them onto it (or onto this button), or with “+ Dock”; then drag them from it into Engine DJ, Rekordbox or a folder" onclick={() => dock.show()}>Drag dock</button>{/if}
      </div>
      {/if}
      {#if current && showInsights}<PlaylistInsights ids={insightIds} listId={current.kind === 'playlist' ? current.id : null} />{/if}
      {#if view.sel.kind === 'dupes'}<DuplicatesView />{:else if view.sel.kind === 'browse'}<BrowseView by={view.sel.by} />{:else}<TrackTable />{/if}
    </div>
  </div>
</div>

<style>
  .stopan { padding: 2px 8px; font-size: 12px; }
  .an .by { font-size: 11.5px; color: var(--muted); }
  .lib { display: flex; flex-direction: column; gap: 10px; height: calc(100vh - 110px - 64px); min-height: 440px; }
  .lib > .main { flex: 1; }
  /* Floats above the player bar: an in-flow banner would shift the table (and cancel a drag). */
  .toast { position: fixed; right: clamp(16px, 3vw, 32px); bottom: 76px; z-index: 25; max-width: min(560px, calc(100vw - 32px)); box-shadow: 0 8px 28px rgb(0 0 0 / .45); background: color-mix(in srgb, var(--accent) 12%, var(--raised)); }
  .colbar { display: flex; gap: 6px; align-items: center; }
  .colbar select, .selbar select { background: var(--surface); border: 1px solid var(--line-2); border-radius: 4px; padding: 4px 8px; font-size: 13px; }
  .colbar select { font-weight: 700; }
  .crumb { background: none; border: 0; padding: 0 8px 0 0; color: var(--accent); font: inherit; font-size: .75em; font-weight: 600; cursor: pointer; }
  .headbar { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  h2 { font-size: 20px; flex: 1; min-width: 200px; display: flex; gap: 10px; align-items: baseline; }
  h2 small { font-size: 12.5px; font-weight: 500; color: var(--muted); }
  input[type="search"] { width: min(340px, 100%); background: var(--surface); border: 1px solid var(--line-2); border-radius: var(--radius); padding: 7px 12px; }
  .an { display: flex; gap: 8px; align-items: center; color: var(--ink-2); font-size: 12.5px; }
  .ok { color: var(--ok); }
  .cloudload { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink-2); background: color-mix(in srgb, var(--accent) 10%, var(--surface)); border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line)); border-radius: 999px; padding: 4px 12px 4px 10px; }
  .spin { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--accent); border-right-color: transparent; animation: spin .9s linear infinite; }
  .spin.paused { animation: none; border-color: var(--muted); }
  .switch { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; margin-left: 6px; }
  .switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .knob { width: 30px; height: 17px; border-radius: 9px; background: var(--line-2); position: relative; transition: background .15s; flex: none; }
  .knob::after { content: ''; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: var(--ink); transition: transform .15s; }
  .switch input:checked + .knob { background: var(--accent); }
  .switch input:checked + .knob::after { transform: translateX(13px); background: var(--accent-ink); }
  .switch input:focus-visible + .knob { outline: 2px solid var(--accent); outline-offset: 2px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 3px 9px; cursor: pointer; }
  .mini:hover { border-color: var(--accent); color: var(--accent); }
  #stats-btn { display: inline-grid; place-items: center; align-self: stretch; }
  #stats-btn svg { width: 12px; height: 12px; }
  .mini.accent { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 50%, var(--line-2)); }
  .status { display: grid; gap: 4px; font-size: 12.5px; color: var(--ink-2); }
  .status .row { display: flex; justify-content: space-between; }
  .bar-line { height: 3px; background: var(--line); border-radius: 2px; overflow: hidden; }
  .bar-line span { display: block; height: 100%; background: var(--accent); }
  .bar-line span.indet { animation: indet 1.2s ease-in-out infinite; }
  @keyframes indet { from { transform: translateX(-100%); } to { transform: translateX(350%); } }
  .notice { display: flex; justify-content: space-between; gap: 12px; align-items: center; background: color-mix(in srgb, var(--accent) 9%, var(--surface)); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); border-radius: var(--radius); padding: 7px 12px; font-size: 13px; }
  .notice .acts { display: flex; gap: 8px; flex: none; }
  .notice .acts .btn { color: var(--accent-ink); font-size: 13px; }
  .notice.warn { background: color-mix(in srgb, var(--warn) 9%, var(--surface)); border-color: color-mix(in srgb, var(--warn) 40%, transparent); }
  .notice button { background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 16px; }
  .main { display: grid; grid-template-columns: var(--sidew, 270px) 10px minmax(0, 1fr); gap: 6px; min-height: 0; }
  .main.folded { grid-template-columns: 22px minmax(0, 1fr); }
  .sidestrip { background: none; border: 1px solid var(--line); border-radius: var(--radius); color: var(--muted); cursor: pointer; font-size: 13px; padding: 0; display: grid; place-items: start center; padding-top: 8px; }
  .sidestrip:hover { color: var(--accent); border-color: var(--accent); }
  .sidetog { background: none; border: 1px solid var(--line-2); border-radius: 6px; width: 30px; height: 30px; display: grid; place-items: center; color: var(--muted); cursor: pointer; padding: 0; flex: none; }
  .sidetog:hover, .sidetog[aria-pressed="true"] { color: var(--accent); border-color: var(--accent); }
  .sidetog svg { width: 16px; height: 16px; }
  .splitter { cursor: col-resize; position: relative; touch-action: none; }
  .splitter::after { content: ''; position: absolute; top: 0; bottom: 0; left: 4px; width: 2px; border-radius: 1px; background: var(--line); transition: background .12s; }
  .splitter:hover::after, .splitter.on::after { background: var(--accent); }
  .dockbtn { margin-left: auto; }
  .dockbtn.hot { color: var(--accent-ink); border-color: var(--accent); background: var(--accent); }
  .right { display: flex; flex-direction: column; gap: 8px; min-height: 0; min-width: 0; }
  .right > :global(.table), .right > :global(.dv) { flex: 1; }
  .ibtn { background: var(--surface); border: 1px solid var(--line-2); border-radius: var(--radius); padding: 7px 12px; cursor: pointer; font-size: 13px; color: var(--ink-2); }
  .ibtn:hover, .ibtn.on { border-color: var(--accent); color: var(--accent); }
  .selbar { height: 30px; flex: none; display: flex; gap: 12px; align-items: center; font-size: 13px; color: var(--ink-2); flex-wrap: nowrap; overflow: hidden; container-type: inline-size; }
  .selinfo { flex: 1; min-width: 0; display: flex; gap: 8px; align-items: center; overflow: hidden; white-space: nowrap; }
  .selinfo .hint { overflow: hidden; text-overflow: ellipsis; }
  .count { color: var(--ink); font-weight: 600; }
  .selacts { flex: none; display: flex; gap: 6px; align-items: center; }
  .selacts :disabled { opacity: .4; cursor: default; }
  .selacts .mini:disabled:hover { border-color: var(--line-2); color: var(--ink-2); }
  /* Narrower: the less used actions go (they're in ⋯ and on right-click). */
  @container (max-width: 1100px) { .opt { display: none; } }
  @container (max-width: 760px) { .opt2 { display: none; } }
  .hint { color: var(--muted); font-size: 12.5px; }
  .more { font-size: 13px; line-height: 1; padding: 1px 8px 4px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); border-radius: 12px; color: var(--ink); font-size: 12px; padding: 1px 8px 1px 10px; cursor: pointer; }
  .chip span { color: var(--muted); }
  .chip:hover span { color: var(--accent); }
  /* Narrow windows: the sidebar on top (at most a third of the height, scrolling), the songs below. The page
     keeps its height, so the table always has one and draws only the rows on screen (it froze drawing
     every row once, 2026-09-27). */
  @media (max-width: 800px) {
    .main, .main.folded { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    .sidestrip { height: 24px; place-items: center; padding-top: 0; }
    .main > :global(.lside) { max-height: 33vh; }
    .splitter { display: none; }
  }
  .shared { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--accent) 50%, var(--line)); color: var(--accent); white-space: nowrap; }
  .shared.busy { opacity: .7; }
</style>
