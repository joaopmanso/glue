<script lang="ts">
  import { lib } from '../../lib/library.svelte';
  import { view, type SortKey } from '../../lib/view.svelte';
  import { app } from '../../lib/app.svelte';
  import { router } from '../../lib/route.svelte';
  import { keyLabel } from '../../core/audio/keys';
  import { fmtTime } from '../../core/format';
  import type { TrackFormat } from '../../store/types';

  const ROW = 30, OVERSCAN = 12;
  const COLS: { key: SortKey; label: string; cls: string }[] = [
    { key: 'order', label: '#', cls: 'c-n' }, { key: 'title', label: 'Title', cls: 'c-title' }, { key: 'artist', label: 'Artist', cls: 'c-artist' },
    { key: 'album', label: 'Album', cls: 'c-album' }, { key: 'genre', label: 'Genre', cls: 'c-genre' }, { key: 'bpm', label: 'BPM', cls: 'c-bpm' },
    { key: 'key', label: 'Key', cls: 'c-key' }, { key: 'duration', label: 'Time', cls: 'c-time' }, { key: 'format', label: 'Format', cls: 'c-fmt' },
    { key: 'quality', label: 'Quality', cls: 'c-q' },
  ];

  const rows = $derived(view.rows(app.keyNotation));
  const order = $derived(rows.map(r => r.t.id));
  const list = $derived.by(() => { void lib.version; const s = view.sel; return s.kind === 'list' ? lib.store?.lists.get(s.id) ?? null : null; });
  const isPlaylist = $derived(list?.kind === 'playlist');

  let scroller: HTMLDivElement;
  let scrollTop = $state(0), height = $state(600);
  const first = $derived(Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN));
  const last = $derived(Math.min(rows.length, Math.ceil((scrollTop + height) / ROW) + OVERSCAN));
  const visible = $derived(rows.slice(first, last));
  let dropAt = $state<number | null>(null);

  function fmt(f: TrackFormat | null) {
    if (!f) return '';
    const codec = f.codec === 'Unknown' ? f.container : f.codec.replace(/^PCM.*/, f.container.replace(/ .*/, ''));
    if (f.lossless) return codec + ' ' + (f.bits ? f.bits + '/' : '') + (f.sampleRate ? +(f.sampleRate / 1000).toFixed(1) : '');
    return codec + (f.bitrate ? ' ' + f.bitrate : '');
  }
  const showBpm = (b: number) => Math.abs(b - Math.round(b)) < 0.05 ? String(Math.round(b)) : b.toFixed(1);

  function open(id: string) { router.go('#/track/' + id); }
  function onKey(e: KeyboardEvent) {
    const ids = [...view.selected];
    if (e.key === 'Enter' && ids.length === 1) { e.preventDefault(); open(ids[0]); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && isPlaylist && ids.length && list) { e.preventDefault(); lib.removeFromList(list.id, ids); view.selected = new Set(); }
    else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); view.selected = new Set(order); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const cur = view.anchor ? order.indexOf(view.anchor) : -1;
      const next = order[Math.max(0, Math.min(order.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) {
        view.selected = new Set([next]); view.anchor = next;
        const y = order.indexOf(next) * ROW;
        if (y < scroller.scrollTop) scroller.scrollTop = y; else if (y + ROW > scroller.scrollTop + height) scroller.scrollTop = y + ROW - height;
      }
    }
  }
  function dragStart(e: DragEvent, id: string) {
    if (!view.selected.has(id)) { view.selected = new Set([id]); view.anchor = id; }
    const ids = order.filter(x => view.selected.has(x));
    e.dataTransfer!.setData('application/x-mco-tracks', JSON.stringify(ids));
    e.dataTransfer!.effectAllowed = 'copyMove';
    const n = ids.length, ghost = document.createElement('div');
    ghost.className = 'drag-ghost'; ghost.textContent = n === 1 ? (lib.store?.tracks.get(ids[0])?.title || '1 track') : n + ' tracks';
    document.body.appendChild(ghost); e.dataTransfer!.setDragImage(ghost, 10, 10); setTimeout(() => ghost.remove());
  }
  // Reorder inside a playlist (only when it's shown in playlist order, without a search filter).
  const canReorder = $derived(isPlaylist && view.sort.key === 'order' && view.sort.dir === 1 && !view.search.trim());
  function rowDragOver(e: DragEvent, i: number) {
    if (!canReorder || ![...(e.dataTransfer?.types ?? [])].includes('application/x-mco-tracks')) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dropAt = e.clientY - r.top < r.height / 2 ? i : i + 1;
  }
  function rowDrop(e: DragEvent) {
    const ids = e.dataTransfer?.getData('application/x-mco-tracks');
    if (!canReorder || !ids || dropAt == null || !list) return;
    e.preventDefault();
    const moving: string[] = JSON.parse(ids);
    if (moving.every(id => list.items.includes(id))) lib.moveInList(list.id, moving, dropAt);
    else lib.addToList(list.id, moving, dropAt);
    dropAt = null;
  }
</script>

<div class="table" role="grid" aria-rowcount={rows.length} aria-multiselectable="true">
  <div class="thead" role="row">
    {#each COLS as c (c.key)}
      {#if c.key !== 'order' || isPlaylist}
        <button type="button" role="columnheader" class={c.cls} class:on={view.sort.key === c.key} onclick={() => view.sortBy(c.key)}
          aria-sort={view.sort.key === c.key ? (view.sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
          {c.label}{#if view.sort.key === c.key}<span class="arrow">{view.sort.dir === 1 ? '▲' : '▼'}</span>{/if}
        </button>
      {/if}
    {/each}
  </div>
  <!-- The body takes keyboard focus for the whole grid (arrows, Enter, Delete, Ctrl+A). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="body" bind:this={scroller} bind:clientHeight={height} onscroll={() => (scrollTop = scroller.scrollTop)} tabindex="0" role="rowgroup" onkeydown={onKey}
    ondragleave={() => (dropAt = null)} ondrop={rowDrop} ondragover={e => { if (canReorder) e.preventDefault(); }}>
    <div class="spacer" style:height={rows.length * ROW + 'px'}>
      {#each visible as r, j (r.t.id)}
        {@const i = first + j}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="tr" role="row" aria-selected={view.selected.has(r.t.id)} class:sel={view.selected.has(r.t.id)} class:dim={r.t.status !== 'linked'}
          class:drop-before={dropAt === i} class:drop-after={dropAt === i + 1 && i === rows.length - 1}
          style:transform={'translateY(' + i * ROW + 'px)'} draggable="true" tabindex="-1"
          onclick={e => view.click(r.t.id, e, order)} ondblclick={() => open(r.t.id)} ondragstart={e => dragStart(e, r.t.id)} ondragover={e => rowDragOver(e, i)}>
          {#if isPlaylist}<span class="c-n mono">{r.n + 1}</span>{/if}
          <span class="c-title" title={r.t.fileName}>{r.t.title || r.t.fileName}</span>
          <span class="c-artist">{r.t.artist}</span>
          <span class="c-album">{r.t.album}</span>
          <span class="c-genre">{r.t.genre}</span>
          {#if r.a?.bpm}<span class="c-bpm mono">{showBpm(r.a.bpm)}</span>
          {:else if r.dj?.bpm}<span class="c-bpm mono from-dj" title="From your imported DJ library">{showBpm(r.dj.bpm)}</span>
          {:else}<span class="c-bpm"></span>{/if}
          {#if r.a?.key}<span class="c-key mono">{keyLabel(r.a.key, app.keyNotation)}</span>
          {:else if r.dj?.key}<span class="c-key mono from-dj" title="From your imported DJ library">{r.dj.key}</span>
          {:else}<span class="c-key"></span>{/if}
          <span class="c-time mono">{r.t.duration ? fmtTime(r.t.duration) : ''}</span>
          <span class="c-fmt mono">{fmt(r.t.format)}</span>
          <span class="c-q">
            {#if r.t.status === 'unlinked'}<span class="q muted" title="No file linked: add the folder it lives in">no file</span>
            {:else if r.t.status === 'missing'}<span class="q bad" title="The file wasn’t found at its last location">missing</span>
            {:else if r.a}<span class="q" data-grade={r.a.grade} title={r.a.headline}>{r.a.label}</span>
            {:else}<span class="q muted">…</span>{/if}
          </span>
        </div>
      {/each}
    </div>
    {#if !rows.length}
      <div class="empty">
        {#if view.search.trim()}No tracks match “{view.search}”.
        {:else if view.sel.kind === 'list'}{isPlaylist ? 'Empty playlist. Drag tracks here, or onto the playlist in the sidebar.' : 'Nothing in this folder yet.'}
        {:else if view.sel.kind === 'all'}No tracks yet. Add a music folder or import a DJ library from the sidebar.
        {:else}Nothing here.{/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .table { display: grid; grid-template-rows: auto 1fr; min-height: 0; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); font-size: 13px; }
  .thead, .tr { display: grid; grid-template-columns: var(--cols); align-items: center; column-gap: 10px; padding: 0 10px; }
  .table { --cols: minmax(160px, 3fr) minmax(110px, 2fr) minmax(90px, 1.4fr) minmax(70px, 1fr) 52px 44px 50px 96px 150px; }
  .table:has(.thead .c-n) { --cols: 36px minmax(160px, 3fr) minmax(110px, 2fr) minmax(90px, 1.4fr) minmax(70px, 1fr) 52px 44px 50px 96px 150px; }
  .thead { border-bottom: 1px solid var(--line); height: 32px; }
  .thead button { background: none; border: 0; padding: 0; text-align: left; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; cursor: pointer; white-space: nowrap; overflow: hidden; }
  .thead button.on { color: var(--ink); }
  .arrow { font-size: 8px; margin-left: 4px; }
  .body { overflow-y: auto; position: relative; min-height: 0; outline: none; }
  .spacer { position: relative; }
  .tr { position: absolute; left: 0; right: 0; top: 0; height: 30px; cursor: default; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); user-select: none; }
  .tr > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tr:hover { background: var(--raised); }
  .tr.sel { background: color-mix(in srgb, var(--accent) 18%, transparent); }
  .tr.dim .c-title, .tr.dim .c-artist { color: var(--muted); }
  .tr.drop-before { box-shadow: inset 0 2px 0 var(--accent); }
  .tr.drop-after { box-shadow: inset 0 -2px 0 var(--accent); }
  .c-title { color: var(--ink); font-weight: 550; }
  .c-artist, .c-album, .c-genre { color: var(--ink-2); }
  .c-n, .c-bpm, .c-key, .c-time, .c-fmt { color: var(--ink-2); font-size: 12px; }
  .from-dj { color: var(--muted); font-style: italic; }
  .q { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; padding: 1px 6px; border-radius: 3px; border: 1px solid currentColor; }
  .q[data-grade="ok"] { color: var(--ok); }
  .q[data-grade="warn"] { color: var(--warn); }
  .q[data-grade="bad"], .q.bad { color: var(--bad); }
  .q[data-grade="info"], .q.muted { color: var(--muted); border-color: transparent; }
  .empty { position: absolute; inset: 40px 0 auto; text-align: center; color: var(--muted); padding: 0 20px; }
  @media (max-width: 1100px) { .table, .table:has(.thead .c-n) { --cols: minmax(140px, 3fr) minmax(100px, 2fr) 52px 44px 50px 130px; } .c-album, .c-genre, .c-fmt, .c-n { display: none; } }
  :global(.drag-ghost) { position: fixed; top: -100px; left: 0; background: var(--accent); color: var(--accent-ink); font: 600 13px var(--font-sans); padding: 4px 10px; border-radius: 4px; }
</style>
