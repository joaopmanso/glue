<script lang="ts">
  import { lib } from '../../lib/library.svelte';
  import { view, type Row } from '../../lib/view.svelte';
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
  import { dupes } from '../../lib/dupes.svelte';

  const ROW = 30, OVERSCAN = 12;

  const rows = $derived(view.rows(app.keyNotation));
  const order = $derived(rows.map(r => r.t.id));
  const list = $derived.by(() => { void lib.version; const s = view.sel; return s.kind === 'list' ? lib.store?.lists.get(s.id) ?? null : null; });
  const isPlaylist = $derived(list?.kind === 'playlist');
  const cols = $derived(columns.visible);
  // play button, "#" (playlists only), the chosen columns, the column menu button
  const template = $derived(['26px', ...(isPlaylist ? ['36px'] : []), ...cols.map(k => COLUMNS[k].width), '28px'].join(' '));

  let scroller: HTMLDivElement;
  let scrollTop = $state(0), height = $state(600);
  const first = $derived(Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN));
  const last = $derived(Math.min(rows.length, Math.ceil((scrollTop + height) / ROW) + OVERSCAN));
  const visible = $derived(rows.slice(first, last));
  let colMenu = $state(false);

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
    if ((e.target as HTMLElement).closest('button, input, .stars')) return;
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
  {#if k === 'title'}
    {@const g = dupes.groupOf.get(r.t.id)}
    <span class="c-title" title={r.t.fileName}>{r.t.title || r.t.fileName}</span>
    {#if g?.kind === 'same'}<button type="button" class="dup" title={'Same recording as ' + (g.ids.length - 1) + ' other track' + (g.ids.length > 2 ? 's' : '') + ': show duplicates'}
      onclick={e => { e.stopPropagation(); view.select({ kind: 'dupes' }); }}>{g.ids.length}×</button>{/if}
  {:else if k === 'artist'}<span class="c-artist">{r.t.artist}</span>
  {:else if k === 'album'}<span class="c-soft">{r.t.album}</span>
  {:else if k === 'genre'}<span class="c-soft">{r.t.genre}</span>
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
      {:else if r.a}<span class="q" data-grade={r.a.grade} title={r.a.headline}>{r.a.label}</span>
      {:else}<span class="q muted">…</span>{/if}
    </span>
  {/if}
{/snippet}

<div class="table" role="grid" aria-rowcount={rows.length} aria-multiselectable="true" style:--cols={template}>
  <div class="thead" role="row">
    <span aria-hidden="true"></span>
    {#if isPlaylist}
      <button type="button" role="columnheader" class:on={view.sort.key === 'order'} title="Playlist order: drag rows to rearrange" onclick={() => view.sortBy('order')}
        aria-sort={view.sort.key === 'order' ? 'ascending' : 'none'}>#{#if view.sort.key === 'order'}<span class="arrow">▲</span>{/if}</button>
    {/if}
    {#each cols as k (k)}
      {@const c = COLUMNS[k]}
      <button type="button" role="columnheader" class:on={view.sort.key === c.sort} data-drop="col" data-col={k}
        class:col-before={colDrop?.key === k && colDrop.at === 'before'} class:col-after={colDrop?.key === k && colDrop.at === 'after'}
        class:lifted={drag.active && drag.payload?.kind === 'column' && drag.payload.key === k}
        title={c.sort ? 'Sort by ' + c.label.toLowerCase() + ' · drag to move the column' : 'Drag to move the column'}
        onpointerdown={e => drag.begin(e, { kind: 'column', key: k, label: c.label })}
        onclick={() => { if (!drag.suppressClick && c.sort) view.sortBy(c.sort); }}
        aria-sort={view.sort.key === c.sort ? (view.sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        {c.label}{#if view.sort.key === c.sort}<span class="arrow">{view.sort.dir === 1 ? '▲' : '▼'}</span>{/if}
      </button>
    {/each}
    <span class="cm">
      <button type="button" class="cmbtn" id="columns-btn" title="Choose columns" aria-haspopup="menu" aria-expanded={colMenu} onclick={() => (colMenu = !colMenu)}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12M2 8h12M2 13h12" stroke="currentColor" stroke-width="1.4"/><circle cx="5" cy="3" r="1.6" fill="currentColor"/><circle cx="11" cy="8" r="1.6" fill="currentColor"/><circle cx="7" cy="13" r="1.6" fill="currentColor"/></svg>
      </button>
      {#if colMenu}
        <div class="colmenu" role="menu" id="columns-menu">
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
  <!-- The body takes keyboard focus for the whole grid (arrows, Enter, Delete, Ctrl+A). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="body" bind:this={scroller} bind:clientHeight={height} onscroll={() => (scrollTop = scroller.scrollTop)} tabindex="0" role="rowgroup" onkeydown={onKey}>
    <div class="spacer" style:height={rows.length * ROW + 'px'}>
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
            {#if r.t.status === 'linked'}
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
        {#if view.search.trim()}No tracks match “{view.search}”.
        {:else if view.sel.kind === 'list'}{isPlaylist ? 'Empty playlist. Drag tracks onto it in the sidebar.' : 'Nothing in this folder yet.'}
        {:else if view.sel.kind === 'all'}No tracks yet. Drop songs or a music folder here, or use the sidebar to add them or import a DJ library.
        {:else}Nothing here.{/if}
      </div>
    {/if}
  </div>
</div>

<svelte:window onpointerdown={e => { if (colMenu && !(e.target as HTMLElement).closest('.cm')) colMenu = false; }} onkeydown={e => { if (e.key === 'Escape') colMenu = false; }} />

<style>
  .table { display: grid; grid-template-rows: auto 1fr; min-height: 0; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); font-size: 13px; }
  .thead, .tr { display: grid; grid-template-columns: var(--cols); align-items: center; column-gap: 10px; padding: 0 6px 0 10px; }
  .thead { border-bottom: 1px solid var(--line); height: 32px; position: relative; z-index: 2; }
  .thead button[role="columnheader"] { background: none; border: 0; padding: 0; text-align: left; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; cursor: pointer; white-space: nowrap; overflow: hidden; height: 100%; }
  .thead button[role="columnheader"].on { color: var(--ink); }
  .thead button.lifted { opacity: .35; }
  .thead button.col-before { box-shadow: inset 2px 0 0 var(--accent); }
  .thead button.col-after { box-shadow: inset -2px 0 0 var(--accent); }
  .arrow { font-size: 8px; margin-left: 4px; }
  .cm { position: relative; display: flex; justify-content: flex-end; }
  .cmbtn { background: none; border: 0; color: var(--muted); cursor: pointer; width: 24px; height: 24px; border-radius: 4px; display: grid; place-items: center; padding: 0; }
  .cmbtn:hover, .cmbtn[aria-expanded="true"] { color: var(--ink); background: var(--raised); }
  .cmbtn svg { width: 14px; height: 14px; }
  .colmenu { position: absolute; right: 0; top: 30px; width: 230px; background: var(--raised); border: 1px solid var(--line-2); border-radius: 6px; padding: 8px; box-shadow: 0 10px 28px rgb(0 0 0 / .45); display: grid; gap: 2px; }
  .colmenu .label { margin: 0 4px 4px; }
  .crow { display: flex; align-items: center; gap: 4px; padding: 2px 4px; border-radius: 4px; }
  .crow:hover { background: var(--surface); }
  .crow label { flex: 1; display: flex; gap: 8px; align-items: center; color: var(--ink); font-size: 13px; cursor: pointer; }
  .crow button { background: none; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); font-size: 11px; width: 22px; height: 20px; cursor: pointer; padding: 0; }
  .crow button:disabled { opacity: .3; cursor: default; }
  .reset { margin-top: 6px; background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 4px; cursor: pointer; }
  .hint { color: var(--muted); font-size: 11.5px; margin: 4px 4px 0; }
  .body { overflow-y: auto; position: relative; min-height: 0; outline: none; }
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
  .dup { flex: none; margin-left: 6px; background: none; border: 1px solid color-mix(in srgb, var(--warn) 60%, transparent); color: var(--warn); border-radius: 3px; font: 600 10.5px var(--font-mono); padding: 0 4px; cursor: pointer; }
  .dup:hover { background: color-mix(in srgb, var(--warn) 15%, transparent); }
  .c-artist, .c-soft { color: var(--ink-2); }
  .c-n, .c-num { color: var(--ink-2); font-size: 12px; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .c-n.grip { cursor: grab; }
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
  .q[data-grade="ok"] { color: var(--ok); }
  .q[data-grade="warn"] { color: var(--warn); }
  .q[data-grade="bad"], .q.bad { color: var(--bad); }
  .q[data-grade="info"], .q.muted { color: var(--muted); border-color: transparent; }
  .empty { position: absolute; inset: 40px 0 auto; text-align: center; color: var(--muted); padding: 0 20px; }
</style>
