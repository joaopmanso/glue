<script lang="ts">
  import { lib } from '../../lib/library.svelte';
  import { view, qualityOf, devicesOf, manyDevices, type Row, type FilterGroup, type SortKey } from '../../lib/view.svelte';
  import { deviceColor } from '../../lib/devices';
  import { tagsOf } from '../../core/library/tagging';
  import { tagColorOf } from '../../lib/tags.svelte';
  import FilterList from './FilterList.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { player } from '../../lib/player.svelte';
  import { app } from '../../lib/app.svelte';
  import { router } from '../../lib/route.svelte';
  import { drag } from '../../lib/drag.svelte';
  import { columns, COLUMNS, type ColKey } from '../../lib/columns.svelte';
  import { keyLabel } from '../../core/audio/keys';
  import { fmtTime } from '../../core/format';
  import type { TrackFormat } from '../../store/types';
  import Stars from './Stars.svelte';
  import WaveCell from './WaveCell.svelte';
  import { dupes } from '../../lib/dupes.svelte';
  import { canDragOut, prepareTrack, startTrackDrag } from '../../lib/dragout';
  const dragOut = canDragOut();

  const ROW = 30, OVERSCAN = 12;

  const rows = $derived(view.rows(app.keyNotation));
  const order = $derived(rows.map(r => r.t.id));
  const list = $derived.by(() => { void lib.version; const s = view.sel; return s.kind === 'list' ? lib.store?.lists.get(s.id) ?? null : null; });
  const isPlaylist = $derived(list?.kind === 'playlist');
  // The Device column only while more than one device's songs are on screen.
  const cols = $derived(manyDevices() ? columns.visible : columns.visible.filter(k => k !== 'device'));
  // Plays here: this computer's file, or another computer's through its GLUE Home.
  const here = (r: Row) => r.t.status === 'linked' && !lib.cloud && (!r.t.remote || lib.canRead(r.t));
  // play button, "#" (playlists only), the chosen columns, the column menu button
  const widths = $derived([dragOut ? '42px' : '26px', ...(isPlaylist ? ['36px'] : []), ...cols.map(k => COLUMNS[k].width), '28px']);
  const template = $derived(widths.join(' '));
  // The narrowest the columns can go (minimum widths, gaps, padding): below that the table scrolls sideways.
  const minWidth = $derived(widths.reduce((a, w) => a + (Number(/(\d+)px/.exec(w)?.[1]) || 0), 0) + 10 * (widths.length - 1) + 16);

  let scroller: HTMLDivElement;
  // Only the rows scroll (both ways), so their vertical scroll bar stays in view on narrow windows;
  // the header follows them sideways.
  let headWrap = $state<HTMLDivElement>();
  let colMenuAt = $state({ right: 8, top: 40 });
  let scrollTop = $state(0), height = $state(600);
  const first = $derived(Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN));
  const last = $derived(Math.min(rows.length, Math.ceil((scrollTop + height) / ROW) + OVERSCAN));
  const visible = $derived(rows.slice(first, last));
  let colMenu = $state(false);
  /** A column's value filter, opened from ▾ in its header. */
  let headFilter = $state<{ group: FilterGroup; key: ColKey; sort: SortKey | null; x: number; y: number } | null>(null);
  function openHeadFilter(e: MouseEvent, k: ColKey) {
    const c = COLUMNS[k];
    if (!c.filter) return;
    if (headFilter?.key === k) { headFilter = null; return; }
    const r = (e.currentTarget as HTMLElement).closest('[role="columnheader"]')!.getBoundingClientRect();
    headFilter = { group: c.filter, key: k, sort: c.sort, x: Math.max(8, Math.min(window.innerWidth - 268, r.left)), y: r.bottom + 4 };
  }
  const tagIds = (id: string) => view.selected.has(id) ? [...view.selected] : [id];

  function fmt(f: TrackFormat | null) {
    if (!f) return '';
    const codec = f.codec === 'Unknown' ? f.container : f.codec.replace(/^PCM.*/, f.container.replace(/ .*/, ''));
    if (f.lossless) return codec + ' ' + (f.bits ? f.bits + '/' : '') + (f.sampleRate ? +(f.sampleRate / 1000).toFixed(1) : '');
    return codec + (f.bitrate ? ' ' + f.bitrate : '');
  }
  const showBpm = (b: number) => Math.abs(b - Math.round(b)) < 0.05 ? String(Math.round(b)) : b.toFixed(1);

  function open(id: string) { router.go('#/track/' + id); }
  function play(id: string) {
    if (nowPlaying.trackId === id && player.url) player.toggle();
    else void nowPlaying.play(id, order);
  }
  function onKey(e: KeyboardEvent) {
    const ids = [...view.selected];
    if (e.key === 'Enter' && ids.length === 1) { e.preventDefault(); open(ids[0]); }
    else if (e.code === 'Space') {   // plays the selected track, or pauses / resumes the current one
      e.preventDefault();
      if (ids.length === 1 && ids[0] !== nowPlaying.trackId) play(ids[0]); else nowPlaying.toggle(ids[0], order);
    }
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
  /** Press on a row: a drag of the selection (or of this row) once the pointer moves. */
  function press(e: PointerEvent, id: string) {
    if ((e.target as HTMLElement).closest('button, input, .stars, .grip')) return;
    const ids = view.selected.has(id) ? order.filter(x => view.selected.has(x)) : [id];
    const t = lib.store?.tracks.get(ids[0]);
    drag.begin(e, { kind: 'tracks', ids, label: ids.length === 1 ? (t?.title || t?.fileName || '1 track') : ids.length + ' tracks' });
  }
  // Reordering a playlist by dragging works in its own order ("#"), without a search filter.
  const canReorder = $derived(isPlaylist && view.sort.key === 'order' && !view.search.trim());
  const dropAt = $derived(drag.target?.type === 'row' ? drag.target.index : null);
  const dragging = $derived(drag.active && drag.payload?.kind === 'tracks' ? new Set(drag.payload.ids) : null);
  const colDrop = $derived(drag.active && drag.target?.type === 'col' ? drag.target : null);
  function openNote(e: MouseEvent, id: string) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    view.noteFor = view.noteFor?.id === id ? null : { id, x: r.right, y: r.bottom };
  }
</script>

{#snippet cell(k: ColKey, r: Row)}
  {#if k === 'wave'}<WaveCell t={r.t} {order} />
  {:else if k === 'title'}
    {@const g = dupes.groupOf.get(r.t.id)}
    <span class="c-title" title={r.t.fileName}>{r.t.title || r.t.fileName}</span>
    {#if g?.kind === 'same'}<button type="button" class="dup" title={'Same recording as ' + (g.ids.length - 1) + ' other track' + (g.ids.length > 2 ? 's' : '') + ': show duplicates'}
      onclick={e => { e.stopPropagation(); view.select({ kind: 'dupes' }); }}>{g.ids.length}×</button>{/if}
  {:else if k === 'artist'}<span class="c-artist">{r.t.artist}</span>
  {:else if k === 'album'}<span class="c-soft">{r.t.album}</span>
  {:else if k === 'genre'}<span class="c-soft">{r.t.genre}</span>
  {:else if k === 'tags'}
    {@const tg = tagsOf(r.t)}
    <button type="button" class="c-tags" data-tags-open title={tg.length ? tg.join(', ') + ' · click to edit' : 'Add tags'} aria-label={tg.length ? 'Tags: ' + tg.join(', ') : 'Add tags'}
      onclick={e => { e.stopPropagation(); view.editTags(e.currentTarget, { ids: tagIds(r.t.id) }); }} ondblclick={e => e.stopPropagation()}>
      {#each tg as g (g)}<span class="tg" style:--c={tagColorOf(g)}>{g}</span>{:else}<span class="tadd">+ tag</span>{/each}
    </button>
  {:else if k === 'device'}
    <span class="c-dev">
      {#each devicesOf(r.t) as d (d)}<button type="button" class="dv" style:--c={deviceColor(d)} title={'On ' + d + ' · click to show only this device'}
        onclick={e => { e.stopPropagation(); view.toggleFilter('device', d); }} ondblclick={e => e.stopPropagation()}>{d}</button>{/each}
    </span>
  {:else if k === 'label'}<span class="c-soft">{r.t.label}</span>
  {:else if k === 'year'}<span class="c-num">{r.t.year}</span>
  {:else if k === 'bpm'}
    {#if r.a?.bpm}<span class="c-num">{showBpm(r.a.bpm)}</span>
    {:else if r.dj?.bpm}<span class="c-num from-dj" title="From your imported DJ library">{showBpm(r.dj.bpm)}</span>
    {:else}<span></span>{/if}
  {:else if k === 'key'}
    {#if r.a?.key}<span class="c-num">{keyLabel(r.a.key, app.keyNotation)}</span>
    {:else if r.dj?.key}<span class="c-num from-dj" title="From your imported DJ library">{r.dj.key}</span>
    {:else}<span></span>{/if}
  {:else if k === 'duration'}<span class="c-num">{r.t.duration ? fmtTime(r.t.duration) : ''}</span>
  {:else if k === 'rating'}
    <span class="c-rate"><Stars value={r.t.rating ?? r.dj?.rating ?? null} dim={r.t.rating == null && !!r.dj?.rating} size={12}
      onset={v => lib.rateTracks(view.selected.has(r.t.id) ? [...view.selected] : [r.t.id], v)} /></span>
  {:else if k === 'notes'}
    <span class="c-note">
      <button type="button" class="note" class:has={!!r.t.notes} title={r.t.notes ? r.t.notes.slice(0, 200) : 'Add a note'} aria-label={r.t.notes ? 'Edit note' : 'Add a note'}
        onclick={e => { e.stopPropagation(); openNote(e, r.t.id); }} ondblclick={e => e.stopPropagation()}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5h7l3 3v10H3z" fill="none" stroke="currentColor" stroke-width="1.3"/>{#if r.t.notes}<path d="M5.5 7h5M5.5 9.5h5M5.5 12h3" stroke="currentColor" stroke-width="1.3"/>{/if}</svg>
      </button>
    </span>
  {:else if k === 'format'}<span class="c-num">{fmt(r.t.format)}</span>
  {:else if k === 'added'}<span class="c-num">{r.t.addedAt.slice(0, 10)}</span>
  {:else if k === 'quality'}
    <span class="c-q">
      {#if r.t.status === 'unlinked'}<span class="q muted" title="No file linked: add the folder it lives in">no file</span>
      {:else if r.t.status === 'missing'}<span class="q bad" title="The file wasn’t found at its last location">missing</span>
      {:else if r.a}<button type="button" class="q qbtn" data-grade={r.a.grade} title={r.a.headline + ' · click to show only these'} onclick={e => { e.stopPropagation(); view.toggleFilter('quality', qualityOf(r)); }} ondblclick={e => e.stopPropagation()}>{r.a.label}</button>
      {:else}<span class="q muted">…</span>{/if}
    </span>
  {/if}
{/snippet}

<div class="table" role="grid" aria-rowcount={rows.length} aria-multiselectable="true" style:--cols={template}>
  <div class="hwrap" bind:this={headWrap}>
  <div class="thead" role="row" style:min-width={minWidth + 'px'}>
    <span aria-hidden="true"></span>
    {#if isPlaylist}
      <button type="button" role="columnheader" class:on={view.sort.key === 'order'} title="Playlist order: drag rows to rearrange" onclick={() => view.sortBy('order')}
        aria-sort={view.sort.key === 'order' ? 'ascending' : 'none'}>#{#if view.sort.key === 'order'}<span class="arrow">▲</span>{/if}</button>
    {/if}
    {#each cols as k (k)}
      {@const c = COLUMNS[k]}
      {@const filtered = c.filter ? view.filters[c.filter].length : 0}
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div role="columnheader" class="th" class:on={view.sort.key === c.sort} data-drop="col" data-col={k}
        class:col-before={colDrop?.key === k && colDrop.at === 'before'} class:col-after={colDrop?.key === k && colDrop.at === 'after'}
        class:lifted={drag.active && drag.payload?.kind === 'column' && drag.payload.key === k}
        onpointerdown={e => { if (!(e.target as HTMLElement).closest('.hf')) drag.begin(e, { kind: 'column', key: k, label: c.label }); }}
        aria-sort={view.sort.key === c.sort ? (view.sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" class="sortb" title={c.sort ? 'Sort by ' + c.label.toLowerCase() + ' · drag to move the column' : 'Drag to move the column'}
          onclick={() => { if (!drag.suppressClick && c.sort) view.sortBy(c.sort); }}>
          {c.label}{#if view.sort.key === c.sort}<span class="arrow">{view.sort.dir === 1 ? '▲' : '▼'}</span>{/if}
        </button>
        {#if c.filter}
          <button type="button" class="hf" class:active={filtered > 0} class:open={headFilter?.key === k} data-hf={k} aria-haspopup="dialog" aria-expanded={headFilter?.key === k}
            aria-label={'Filter by ' + c.label.toLowerCase()} title={filtered ? 'Filtered: ' + view.filters[c.filter].join(', ') : 'Show only some ' + c.label.toLowerCase() + ' values'}
            onclick={e => openHeadFilter(e, k)}>
            <svg viewBox="0 0 10 10" aria-hidden="true">{#if filtered}<path d="M1 2h8L6 5.5V9L4 8V5.5z" fill="currentColor"/>{:else}<path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.4"/>{/if}</svg>
          </button>
        {/if}
      </div>
    {/each}
    <span class="cm">
      <button type="button" class="cmbtn" id="columns-btn" title="Choose columns" aria-haspopup="menu" aria-expanded={colMenu} onclick={e => { const r = e.currentTarget.getBoundingClientRect(); colMenuAt = { right: Math.max(8, innerWidth - r.right), top: r.bottom + 4 }; colMenu = !colMenu; }}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12M2 8h12M2 13h12" stroke="currentColor" stroke-width="1.4"/><circle cx="5" cy="3" r="1.6" fill="currentColor"/><circle cx="11" cy="8" r="1.6" fill="currentColor"/><circle cx="7" cy="13" r="1.6" fill="currentColor"/></svg>
      </button>
      {#if colMenu}
        <div class="colmenu" role="menu" id="columns-menu" style:right={colMenuAt.right + 'px'} style:top={colMenuAt.top + 'px'}>
          <p class="label">Columns</p>
          {#each columns.order as k, i (k)}
            <div class="crow">
              <label><input type="checkbox" checked={!columns.hidden.includes(k)} disabled={COLUMNS[k].fixed} onchange={() => columns.toggle(k)}> {COLUMNS[k].label}</label>
              <button type="button" aria-label={'Move ' + COLUMNS[k].label + ' left'} disabled={i === 0} onclick={() => columns.nudge(k, -1)}>↑</button>
              <button type="button" aria-label={'Move ' + COLUMNS[k].label + ' right'} disabled={i === columns.order.length - 1} onclick={() => columns.nudge(k, 1)}>↓</button>
            </div>
          {/each}
          <button type="button" class="reset" onclick={() => columns.reset()}>Reset to default</button>
          <p class="hint">Tip: drag a column header to move it.</p>
        </div>
      {/if}
    </span>
  </div>
  </div>
  <!-- The body takes keyboard focus for the whole grid (arrows, Enter, Delete, Ctrl+A). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="body" bind:this={scroller} bind:clientHeight={height} onscroll={() => { scrollTop = scroller.scrollTop; if (headWrap) headWrap.scrollLeft = scroller.scrollLeft; }} tabindex="0" role="rowgroup" onkeydown={onKey}>
    <div class="spacer" style:height={rows.length * ROW + 'px'} style:min-width={minWidth + 'px'}>
      {#each visible as r, j (r.t.id)}
        {@const i = first + j}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="tr" role="row" aria-selected={view.selected.has(r.t.id)} class:sel={view.selected.has(r.t.id)} class:dim={r.t.status !== 'linked'}
          class:drop-before={dropAt === i} class:drop-after={dropAt === i + 1 && i === rows.length - 1}
          style:transform={'translateY(' + i * ROW + 'px)'} tabindex="-1"
          class:playing={nowPlaying.trackId === r.t.id} class:lifted={dragging?.has(r.t.id)}
          data-drop={canReorder ? 'row' : undefined} data-list={canReorder ? list?.id : undefined} data-index={i}
          onpointerdown={e => press(e, r.t.id)}
          onclick={e => { if (!drag.suppressClick) view.click(r.t.id, e, order); }} ondblclick={() => open(r.t.id)}>
          <span class="c-play">
            {#if dragOut && here(r) && !r.t.remote}
              <span class="grip" draggable="true" role="button" tabindex="-1" aria-label="Drag out a copy of the file"
                title="Drag to Explorer, the desktop or a USB stick to copy this file"
                onpointerenter={() => void prepareTrack(r.t)}
                ondragstart={e => { if (!startTrackDrag(e, r.t)) lib.notice = lib.canRead(r.t) ? 'Getting the file ready: drag again.' : 'GLUE needs permission to read this file first: play it or open its page.'; }}>
                <svg viewBox="0 0 6 14" aria-hidden="true"><circle cx="1.5" cy="2" r="1.1"/><circle cx="4.5" cy="2" r="1.1"/><circle cx="1.5" cy="7" r="1.1"/><circle cx="4.5" cy="7" r="1.1"/><circle cx="1.5" cy="12" r="1.1"/><circle cx="4.5" cy="12" r="1.1"/></svg>
              </span>
            {/if}
            {#if here(r)}
              <button type="button" class="pbtn" aria-label={nowPlaying.trackId === r.t.id && !player.paused ? 'Pause' : 'Play'}
                onclick={e => { e.stopPropagation(); play(r.t.id); }} ondblclick={e => e.stopPropagation()}>
                {#if nowPlaying.trackId === r.t.id && !player.paused}
                  <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 1.5h3.2v11H2.5zM8.3 1.5h3.2v11H8.3z" fill="currentColor"/></svg>
                {:else}
                  <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>
                {/if}
              </button>
            {/if}
          </span>
          {#if isPlaylist}<span class="c-n" class:grip={canReorder} title={canReorder ? 'Drag to rearrange' : ''}>{r.n + 1}</span>{/if}
          {#each cols as k (k)}<span class="cell" data-c={k}>{@render cell(k, r)}</span>{/each}
          <span></span>
        </div>
      {/each}
    </div>
    {#if !rows.length}
      <div class="empty">
        {#if view.search.trim()}No tracks match “{view.search}”{view.filtering ? ' with these filters' : ''}.
        {:else if view.filtering}No tracks match the filters. <button type="button" class="linkish" onclick={() => view.clearFilters()}>Clear filters</button>
        {:else if view.sel.kind === 'list'}{isPlaylist ? 'Empty playlist. Drag tracks onto it in the sidebar.' : 'Nothing in this folder yet.'}
        {:else if view.sel.kind === 'all'}No tracks yet. Drop songs or a music folder here, or use the sidebar to add them or import a DJ library.
        {:else}Nothing here.{/if}
      </div>
    {/if}
  </div>
</div>

{#if headFilter}
  {@const hf = headFilter}
  <div class="hfpop" id="head-filter" role="dialog" aria-label={'Filter by ' + COLUMNS[hf.key].label} style:left={hf.x + 'px'} style:top={hf.y + 'px'}>
    {#if hf.sort}
      {@const s = hf.sort}
      <div class="hsort">
        <button type="button" class:on={view.sort.key === s && view.sort.dir === 1} onclick={() => (view.sort = { key: s, dir: 1 })}>▲ Sort ascending</button>
        <button type="button" class:on={view.sort.key === s && view.sort.dir === -1} onclick={() => (view.sort = { key: s, dir: -1 })}>▼ Sort descending</button>
      </div>
    {/if}
    <FilterList group={hf.group} title={'Show only · ' + COLUMNS[hf.key].label} search />
  </div>
{/if}

<svelte:window onpointerdown={e => { const el = e.target as HTMLElement; if (colMenu && !el.closest('.cm')) colMenu = false; if (headFilter && !el.closest('.hfpop, .hf')) headFilter = null; }}
  onkeydown={e => { if (e.key === 'Escape') { colMenu = false; headFilter = null; } }} />

<style>
  .table { display: grid; grid-template-rows: auto 1fr; min-height: 0; min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); font-size: 13px; }
  .hwrap { overflow: hidden; min-width: 0; }
  .thead, .tr { display: grid; grid-template-columns: var(--cols); align-items: center; column-gap: 10px; padding: 0 6px 0 10px; }
  .thead { border-bottom: 1px solid var(--line); height: 32px; position: relative; z-index: 2; }
  .th { display: flex; align-items: center; min-width: 0; height: 100%; gap: 2px; }
  .th .sortb { flex: 1; min-width: 0; background: none; border: 0; padding: 0; text-align: left; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; height: 100%; }
  .th.on .sortb { color: var(--ink); }
  .hf { flex: none; width: 18px; height: 18px; display: grid; place-items: center; border: 0; border-radius: 3px; background: none; color: var(--muted); cursor: pointer; padding: 0; opacity: .55; }
  .hf svg { width: 10px; height: 10px; }
  .th:hover .hf, .hf.open, .hf:focus-visible { opacity: 1; }
  .hf:hover, .hf.open { background: var(--raised); color: var(--ink); }
  .hf.active { opacity: 1; color: var(--accent); }
  .thead .th.lifted { opacity: .35; }
  .thead .th.col-before { box-shadow: inset 2px 0 0 var(--accent); }
  .thead .th.col-after { box-shadow: inset -2px 0 0 var(--accent); }
  .hfpop { position: fixed; z-index: 45; width: 260px; background: var(--raised); border: 1px solid var(--line-2); border-radius: 8px; padding: 10px; box-shadow: 0 12px 32px rgb(0 0 0 / .45); display: grid; gap: 8px; }
  .hsort { display: grid; gap: 2px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
  .hsort button { text-align: left; background: none; border: 0; border-radius: 4px; padding: 4px 6px; font-size: 12.5px; color: var(--ink-2); cursor: pointer; }
  .hsort button:hover { background: var(--surface); }
  .hsort button.on { color: var(--accent); }
  .c-tags { display: flex; gap: 3px; align-items: center; min-width: 0; width: 100%; height: 22px; overflow: hidden; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
  .tg { flex: none; font-size: 11px; line-height: 16px; padding: 0 6px; border-radius: 8px; background: color-mix(in srgb, var(--c) 20%, transparent); border: 1px solid color-mix(in srgb, var(--c) 50%, transparent); color: var(--ink); white-space: nowrap; }
  .tadd { font-size: 11px; color: var(--muted); opacity: 0; }
  .tr:hover .tadd { opacity: 1; }
  .thead button[role="columnheader"] { background: none; border: 0; padding: 0; text-align: left; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; cursor: pointer; white-space: nowrap; overflow: hidden; height: 100%; }
  .thead button[role="columnheader"].on { color: var(--ink); }
  .arrow { font-size: 8px; margin-left: 4px; }
  .cm { position: relative; display: flex; justify-content: flex-end; }
  .cmbtn { background: none; border: 0; color: var(--muted); cursor: pointer; width: 24px; height: 24px; border-radius: 4px; display: grid; place-items: center; padding: 0; }
  .cmbtn:hover, .cmbtn[aria-expanded="true"] { color: var(--ink); background: var(--raised); }
  .cmbtn svg { width: 14px; height: 14px; }
  .colmenu { position: fixed; z-index: 45; width: 230px; max-height: calc(100vh - 120px); overflow-y: auto; background: var(--raised); border: 1px solid var(--line-2); border-radius: 6px; padding: 8px; box-shadow: 0 10px 28px rgb(0 0 0 / .45); display: grid; gap: 2px; }
  .colmenu .label { margin: 0 4px 4px; }
  .crow { display: flex; align-items: center; gap: 4px; padding: 2px 4px; border-radius: 4px; }
  .crow:hover { background: var(--surface); }
  .crow label { flex: 1; display: flex; gap: 8px; align-items: center; color: var(--ink); font-size: 13px; cursor: pointer; }
  .crow button { background: none; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); font-size: 11px; width: 22px; height: 20px; cursor: pointer; padding: 0; }
  .crow button:disabled { opacity: .3; cursor: default; }
  .reset { margin-top: 6px; background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 4px; cursor: pointer; }
  .hint { color: var(--muted); font-size: 11.5px; margin: 4px 4px 0; }
  .body { overflow: auto; position: relative; min-height: 0; min-width: 0; outline: none; }
  .spacer { position: relative; }
  .tr { position: absolute; left: 0; right: 0; top: 0; height: 30px; cursor: default; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); user-select: none; }
  .tr > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cell { display: flex; align-items: center; min-width: 0; }
  .cell > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .tr:hover { background: var(--raised); }
  .tr.sel { background: color-mix(in srgb, var(--accent) 18%, transparent); }
  .tr.dim .c-title, .tr.dim .c-artist { color: var(--muted); }
  .tr.lifted { opacity: .45; }
  .tr.drop-before { box-shadow: inset 0 2px 0 var(--accent); }
  .tr.drop-after { box-shadow: inset 0 -2px 0 var(--accent); }
  .c-title { color: var(--ink); font-weight: 550; overflow: hidden; text-overflow: ellipsis; }
  .c-dev { display: flex; gap: 3px; min-width: 0; overflow: hidden; }
  .dv { flex: none; font-size: 11px; line-height: 16px; padding: 0 6px 0 5px; border-radius: 3px; background: color-mix(in srgb, var(--c) 14%, transparent); border: 0; border-left: 3px solid var(--c); color: var(--ink-2); white-space: nowrap; cursor: pointer; }
  .dv:hover { background: color-mix(in srgb, var(--c) 26%, transparent); color: var(--ink); }
  .dup { flex: none; margin-left: 6px; background: none; border: 1px solid color-mix(in srgb, var(--warn) 60%, transparent); color: var(--warn); border-radius: 3px; font: 600 10.5px var(--font-mono); padding: 0 4px; cursor: pointer; }
  .dup:hover { background: color-mix(in srgb, var(--warn) 15%, transparent); }
  .c-artist, .c-soft { color: var(--ink-2); }
  .c-n, .c-num { color: var(--ink-2); font-size: 12px; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .c-n.grip { cursor: grab; }
  .c-play { display: flex; align-items: center; gap: 2px; }
  .grip { width: 14px; height: 22px; display: grid; place-items: center; color: var(--muted); cursor: grab; opacity: 0; border-radius: 3px; }
  .grip svg { width: 6px; height: 14px; fill: currentColor; }
  .tr:hover .grip { opacity: .8; }
  .grip:hover { opacity: 1; color: var(--ink); background: var(--surface); }
  .pbtn { width: 22px; height: 22px; border-radius: 50%; border: 0; background: none; color: var(--muted); cursor: pointer; display: grid; place-items: center; padding: 0; opacity: 0; }
  .pbtn svg { width: 10px; height: 10px; }
  .tr:hover .pbtn, .tr.playing .pbtn, .pbtn:focus-visible { opacity: 1; }
  .pbtn:hover { background: var(--accent); color: var(--accent-ink); }
  .tr.playing .c-title, .tr.playing .pbtn { color: var(--accent); }
  .tr.playing .pbtn:hover { color: var(--accent-ink); }
  .note { background: none; border: 0; padding: 0; width: 22px; height: 22px; display: grid; place-items: center; color: var(--line-2); cursor: pointer; border-radius: 4px; }
  .note svg { width: 14px; height: 14px; }
  .tr:hover .note { color: var(--muted); }
  .note.has, .tr:hover .note.has { color: var(--accent); }
  .note:hover { background: var(--surface); color: var(--ink) !important; }
  .from-dj { color: var(--muted); font-style: italic; }
  .q { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; padding: 1px 6px; border-radius: 3px; border: 1px solid currentColor; }
  .qbtn { background: none; cursor: pointer; }
  .qbtn:hover { background: color-mix(in srgb, currentColor 14%, transparent); }
  .q[data-grade="ok"] { color: var(--ok); }
  .q[data-grade="warn"] { color: var(--warn); }
  .q[data-grade="bad"], .q.bad { color: var(--bad); }
  .q[data-grade="info"], .q.muted { color: var(--muted); border-color: transparent; }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); text-decoration: underline; cursor: pointer; font: inherit; }
  .empty { position: absolute; inset: 40px 0 auto; text-align: center; color: var(--muted); padding: 0 20px; }
</style>
