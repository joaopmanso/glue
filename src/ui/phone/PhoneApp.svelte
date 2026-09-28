<script lang="ts">
  /* GLUE's library on a phone (the user's list, 2026-09-28; ADR 0078): a library explorer and player.
     Tabs at the bottom: Library (the collection's lists), Browse (artists, albums, genres, labels,
     years), Playlists, Search, More. Each tab keeps its own stack of screens. */
  import { lib } from '../../lib/library.svelte';
  import { view, viewTitle, type ViewSel } from '../../lib/view.svelte';
  import { phone, type PhoneTab } from '../../lib/phone.svelte';
  import { router } from '../../lib/route.svelte';
  import { themes } from '../../lib/themes.svelte';
  import { account } from '../../lib/account.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { auto } from '../../lib/auto.svelte';
  import { SEP, tidy, type MenuEntry } from '../../lib/menu.svelte';
  import { allTags } from '../../lib/tags.svelte';
  import { tracksFor } from '../../lib/view.svelte';
  import { TO_BE_SORTED } from '../../lib/incoming.svelte';
  import { FACETS, facetInfo } from '../../core/library/browse';
  import type { List } from '../../store/types';
  import { canKeepFiles, canPickFolders, pickAudioFiles } from '../../platform';
  import type { Snippet } from 'svelte';
  import PhoneSongs from './PhoneSongs.svelte';
  import PhonePlayer from './PhonePlayer.svelte';
  import BrowseView from '../library/BrowseView.svelte';
  import DevicesSection from '../library/DevicesSection.svelte';
  import AccountButton from '../AccountButton.svelte';

  /** children: another page shown in the shell instead of the tab's screens. */
  let { children }: { children?: Snippet } = $props();
  const TABS: [PhoneTab, string, string][] = [
    ['library', 'Library', 'M3 3.5h3v9H3zM7.5 3.5h3v9h-3zM12 4l2.6-.7 2 8.7-2.6.6z'],
    ['browse', 'Browse', 'M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z'],
    ['playlists', 'Playlists', 'M2.5 4h8M2.5 7.5h8M2.5 11h5M12 9v4.5a1.5 1.5 0 1 1-1.5-1.5H12'],
    ['search', 'Search', 'M7 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM10 10l3.5 3.5'],
    ['more', 'More', 'M3.5 8h.01M8 8h.01M12.5 8h.01'],
  ];
  const top = $derived(phone.top);
  const title = $derived.by(() => {
    void lib.version;
    const t = top;
    if (t?.kind === 'songs') return viewTitle(t.sel);
    if (t?.kind === 'values') return facetInfo(t.by).name;
    if (t?.kind === 'folder') return lib.store?.lists.get(t.id)?.name ?? 'Folder';
    return TABS.find(x => x[0] === phone.tab)![1];
  });

  // The Library tab: the collection's lists.
  const counts = $derived.by(() => {
    void lib.version;
    const n = (sel: ViewSel) => tracksFor(sel).length;
    return { all: lib.store?.tracks.size ?? 0, attention: n({ kind: 'attention' }), pending: n({ kind: 'pending' }), unlinked: n({ kind: 'unlinked' }) };
  });
  const tags = $derived.by(() => { void lib.version; return allTags().filter(t => t.tracks > 0); });
  const roots = $derived(lib.roots.filter(r => !r.root.hidden));
  const sorting = $derived.by(() => { void lib.version; return lib.store?.lists.get(TO_BE_SORTED) ?? null; });

  // The Playlists tab: the tree, a level at a time.
  const levelOf = (parent: string | null) => { void lib.version; return lib.childLists(parent).filter(l => l.id !== TO_BE_SORTED); };
  function openList(l: List) { if (l.kind === 'folder') phone.push({ kind: 'folder', id: l.id }); else phone.songs({ kind: 'list', id: l.id }); }
  function listMenu(l: List): MenuEntry[] {
    const ids = tracksFor({ kind: 'list', id: l.id }).filter(t => lib.playsHere(t)).map(t => t.id);
    return tidy([
      ids.length > 0 && { label: 'Play', hint: String(ids.length), attrs: { 'data-m': 'play' }, run: () => void nowPlaying.play(ids[0], ids, 0, l.name) },
      ids.length > 0 && { label: 'Add to queue', attrs: { 'data-m': 'queue' }, run: () => nowPlaying.enqueue(ids, 'end') },
      { label: 'Stats…', attrs: { 'data-m': 'stats' }, run: () => (view.statsFor = { title: l.name, sel: { kind: 'list', id: l.id } }) },
      SEP,
      !lib.readOnly && { label: 'Rename…', attrs: { 'data-m': 'rename' }, run: () => { const n = prompt('Rename “' + l.name + '”', l.name)?.trim(); if (n && n !== l.name) lib.updateList(l.id, { name: n }); } },
      !lib.readOnly && { label: 'Delete…', danger: true, attrs: { 'data-m': 'delete' }, run: () => { if (confirm('Delete “' + l.name + '”? The songs stay in your collection.')) lib.deleteList(l.id); } },
    ]);
  }
  function newPlaylist(parent: string | null) { const n = prompt('Name of the new playlist')?.trim(); if (n) lib.createList('playlist', n, parent); }

  let songInput = $state<HTMLInputElement>();
  async function addSongs() {
    if (!canKeepFiles()) { songInput?.click(); return; }
    try { await lib.addFiles(await pickAudioFiles()); }
    catch (e) { if ((e as DOMException).name !== 'AbortError') lib.notice = (e as Error).message; }
  }
  let searchBox = $state<HTMLInputElement>();
  $effect(() => { if (phone.tab === 'search' && !phone.top) searchBox?.focus(); });

  // Another page in the shell (a song's page, the calendar, an event): the tabs and the player stay.
  const route = $derived(router.current);
  const PAGES: Record<string, string> = { track: 'Song', events: 'Calendar', event: 'Event' };
  function leavePage() { router.go(route.name === 'event' ? '#/events' : '#/'); }
  function tap(k: PhoneTab) {
    if (!children) { phone.go(k); return; }
    router.go('#/');
    phone.show(k);
  }
  let screen = $state<HTMLElement>();
  // A new page starts at its top.
  $effect(() => { void route; screen?.scrollTo(0, 0); });
</script>

<div class="phone" id="phone" data-page={children ? route.name : undefined}>
  <header class="ptop">
    {#if children}<button type="button" class="back" id="phone-back" aria-label="Back" onclick={leavePage}>‹</button>
    {:else if top}<button type="button" class="back" id="phone-back" aria-label="Back" onclick={() => phone.back()}>‹</button>{:else}<span class="logo" aria-hidden="true">G</span>{/if}
    <h1 id="phone-title">{children ? PAGES[route.name] ?? '' : title}</h1>
    {#if lib.cloud}<span class="cloud" title={lib.cloud.subtitle}>☁ {lib.cloud.title}</span>{/if}
  </header>

  <main class="screen" class:page={!!children} bind:this={screen}>
    {#if children}
      {@render children()}
    {:else if top?.kind === 'songs'}
      <PhoneSongs />
    {:else if top?.kind === 'values'}
      <div class="pad"><BrowseView by={top.by} onopen={sel => phone.songs(sel)} /></div>
    {:else if top?.kind === 'folder'}
      {@const f = top.id}
      <ul class="menu">
        <li><button type="button" class="ent strong" onclick={() => phone.songs({ kind: 'list', id: f })}>All its songs<span class="n">{tracksFor({ kind: 'list', id: f }).length}</span></button></li>
        {#each levelOf(f) as l (l.id)}
          <li class="lrow"><button type="button" class="ent" data-list={l.id} onclick={() => openList(l)}><i class="ic" style:background={l.color ?? undefined}>{l.kind === 'folder' ? '▸' : '♪'}</i>{l.name}<span class="n">{l.kind === 'folder' ? '' : l.items.length}</span></button><button type="button" class="dots" aria-label="More" onclick={() => phone.menu(l.name, () => listMenu(l))}>⋯</button></li>
        {/each}
      </ul>
    {:else if phone.tab === 'library'}
      <ul class="menu" id="phone-library">
        <li><button type="button" class="ent strong" data-view="all" onclick={() => phone.songs({ kind: 'all' })}>All tracks<span class="n">{counts.all.toLocaleString()}</span></button></li>
        <li><button type="button" class="ent" data-view="recent" onclick={() => phone.songs({ kind: 'recent' })}>Recently added</button></li>
        {#if sorting}<li><button type="button" class="ent" onclick={() => phone.songs({ kind: 'list', id: TO_BE_SORTED })}>TO BE SORTED<span class="n">{sorting.items.length}</span></button></li>{/if}
        {#if counts.attention}<li><button type="button" class="ent" data-view="attention" onclick={() => phone.songs({ kind: 'attention' })}>Needs attention<span class="n">{counts.attention}</span></button></li>{/if}
        {#if counts.pending && !lib.cloud}<li><button type="button" class="ent" onclick={() => phone.songs({ kind: 'pending' })}>Not analysed yet<span class="n">{counts.pending}</span></button></li>{/if}
        {#if counts.unlinked && !lib.cloud}<li><button type="button" class="ent" onclick={() => phone.songs({ kind: 'unlinked' })}>No file linked<span class="n">{counts.unlinked}</span></button></li>{/if}
        {#if tags.length}
          <li class="sec">Tags</li>
          {#each tags as t (t.name)}<li><button type="button" class="ent" onclick={() => phone.songs({ kind: 'tag', name: t.name })}>{t.name}<span class="n">{t.tracks}</span></button></li>{/each}
        {/if}
        {#if !lib.cloud}
          <li class="sec">Music</li>
          {#each roots as r (r.root.id)}<li><button type="button" class="ent" onclick={() => phone.songs({ kind: 'root', id: r.root.id })}>{r.root.name}</button></li>{/each}
          {#if canPickFolders() && !lib.readOnly}<li><button type="button" class="ent add" id="phone-add-folder" onclick={() => void lib.addFolder()}>+ Add a music folder</button></li>{/if}
          {#if !lib.readOnly}<li><button type="button" class="ent add" id="phone-add-songs" onclick={addSongs}>+ Add songs</button></li>{/if}
          <input type="file" multiple accept="audio/*,.flac,.wav,.aif,.aiff,.m4a,.mp3,.aac,.ogg,.opus" hidden bind:this={songInput} onchange={e => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; if (f.length) void lib.addFileCopies(f); }} />
        {/if}
      </ul>
    {:else if phone.tab === 'browse'}
      <ul class="menu" id="phone-browse">
        {#each FACETS as f (f.by)}<li><button type="button" class="ent strong" data-browse={f.by} onclick={() => phone.push({ kind: 'values', by: f.by })}>{f.name}<span class="n">›</span></button></li>{/each}
      </ul>
    {:else if phone.tab === 'playlists'}
      <ul class="menu" id="phone-playlists">
        {#each levelOf(null) as l (l.id)}
          <li class="lrow"><button type="button" class="ent" data-list={l.id} onclick={() => openList(l)}><i class="ic" style:background={l.color ?? undefined}>{l.kind === 'folder' ? '▸' : '♪'}</i>{l.name}<span class="n">{l.kind === 'folder' ? '' : l.items.length}</span></button><button type="button" class="dots" aria-label="More" onclick={() => phone.menu(l.name, () => listMenu(l))}>⋯</button></li>
        {:else}<li class="empty">No playlists yet.</li>{/each}
        {#if !lib.readOnly}<li><button type="button" class="ent add" id="phone-new-playlist" onclick={() => newPlaylist(null)}>+ New playlist</button></li>
        <li><button type="button" class="ent add" id="phone-new-auto" onclick={() => auto.show(null)}>+ Build a playlist…</button></li>{/if}
      </ul>
    {:else if phone.tab === 'search'}
      <div class="search">
        <input type="search" id="phone-search" bind:this={searchBox} placeholder="Title, artist, album, tag…" bind:value={view.search} autocomplete="off" spellcheck="false" />
      </div>
      {#if view.search.trim()}<PhoneSongs empty="Nothing matches." />{:else}<p class="hint">Find songs by title, artist, album, genre, label or tag.</p>{/if}
    {:else if phone.tab === 'more'}
      <ul class="menu" id="phone-more">
        <li><button type="button" class="ent" onclick={() => router.go('#/events')}>Calendar</button></li>
        <li><button type="button" class="ent" onclick={() => (view.statsFor = { title: lib.cloud?.title ?? 'This collection', sel: { kind: 'all' } })}>Stats</button></li>
        <li><button type="button" class="ent" onclick={() => router.go('#/analyze')}>Analyze a file</button></li>
        <li><button type="button" class="ent" id="phone-theme" onclick={() => themes.toggleMode()}>{themes.resolved === 'dark' ? 'Light mode' : 'Dark mode'}</button></li>
        {#if lib.cloud}<li><button type="button" class="ent" id="phone-leave" onclick={() => void lib.leaveCloudView()}>Close this library</button></li>
        {:else if lib.profile}<li><button type="button" class="ent" onclick={() => lib.switchProfile()}>Switch profile · {lib.profile.name}</button></li>{/if}
        <li class="sec">Account</li>
        <li class="acct"><AccountButton /></li>
      </ul>
      {#if account.signedIn}<div class="pad devices"><DevicesSection /></div>{/if}
    {/if}
  </main>

  {#if lib.notice}<div class="toast" role="status"><span>{lib.notice}</span><button type="button" aria-label="Dismiss" onclick={() => (lib.notice = '')}>×</button></div>{/if}
  <PhonePlayer />
  <nav class="tabs" aria-label="Sections">
    {#each TABS as [k, label, d] (k)}
      <button type="button" class:on={phone.tab === k} data-tab={k} aria-current={phone.tab === k ? 'page' : undefined} onclick={() => tap(k)}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path {d} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>{label}</span>
      </button>
    {/each}
  </nav>
</div>

<style>
  .phone { position: fixed; inset: 0; display: flex; flex-direction: column; background: var(--ground); padding-top: env(safe-area-inset-top, 0px); }
  .ptop { display: flex; align-items: center; gap: 8px; height: 50px; padding: 0 12px; border-bottom: 1px solid var(--line); flex: none; }
  .ptop h1 { flex: 1; min-width: 0; font-size: 19px; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .back { width: 40px; height: 44px; background: none; border: 0; color: var(--accent); font-size: 34px; line-height: 1; cursor: pointer; margin-left: -6px; }
  .logo { width: 30px; height: 30px; border-radius: 8px; background: var(--accent); color: var(--accent-ink); display: grid; place-items: center; font-weight: 800; }
  .cloud { color: var(--muted); font-size: 12px; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .screen { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; padding-bottom: calc(60px + 70px + env(safe-area-inset-bottom, 0px)); -webkit-overflow-scrolling: touch; }
  .screen:has(:global(#phone-songs)) { overflow: hidden; padding-bottom: calc(60px + 64px + env(safe-area-inset-bottom, 0px)); }
  .screen.page { display: block; padding: 12px 14px calc(60px + 70px + env(safe-area-inset-bottom, 0px)); overflow-x: hidden; }
  .pad { padding: 10px 12px; display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .menu { list-style: none; margin: 0; padding: 6px 0; }
  .ent { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 0 18px; background: none; border: 0; border-bottom: 1px solid var(--line); color: var(--ink); font-size: 16.5px; text-align: left; cursor: pointer; }
  .ent:active { background: var(--raised); }
  .ent.strong { font-weight: 650; }
  .ent.add { color: var(--accent); font-weight: 600; }
  .n { margin-left: auto; color: var(--muted); font: 13px var(--font-mono); }
  .sec { margin: 18px 18px 4px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .lrow { display: flex; align-items: center; border-bottom: 1px solid var(--line); }
  .lrow .ent { border-bottom: 0; flex: 1; min-width: 0; }
  .ic { width: 26px; height: 26px; border-radius: 6px; display: grid; place-items: center; font-style: normal; font-size: 12px; background: var(--raised); color: var(--ink-2); flex: none; }
  .dots { width: 48px; height: 48px; background: none; border: 0; color: var(--muted); font-size: 22px; cursor: pointer; flex: none; }
  .empty, .hint { color: var(--muted); padding: 24px 18px; list-style: none; }
  .search { padding: 10px 12px; flex: none; }
  .search input { width: 100%; box-sizing: border-box; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 16px; }
  .acct { padding: 8px 18px; list-style: none; }
  .devices { flex: none; }
  .toast { position: fixed; left: 10px; right: 10px; bottom: calc(60px + 70px + env(safe-area-inset-bottom, 0px)); z-index: 40; display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--accent) 14%, var(--raised)); border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line-2)); font-size: 14px; box-shadow: 0 8px 24px rgb(0 0 0 / .4); }
  .toast span { flex: 1; }
  .toast button { background: none; border: 0; color: var(--muted); font-size: 20px; }
  .tabs { position: fixed; left: 0; right: 0; bottom: 0; z-index: 31; height: calc(60px + env(safe-area-inset-bottom, 0px)); padding-bottom: env(safe-area-inset-bottom, 0px); display: grid; grid-template-columns: repeat(5, 1fr); background: color-mix(in srgb, var(--surface) 96%, transparent); backdrop-filter: blur(10px); border-top: 1px solid var(--line); }
  .tabs button { background: none; border: 0; color: var(--muted); display: grid; place-items: center; align-content: center; gap: 3px; font-size: 11px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .tabs button.on { color: var(--accent); }
  .tabs svg { width: 22px; height: 22px; }
</style>
