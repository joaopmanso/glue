<script lang="ts">
  /* Browsing (the user's list, 2026-09-28): a field's values (artists, albums, genres, labels, years),
     each with its songs and length. A click opens its songs; right-click plays, queues, or shows stats.
     Only the rows on screen are drawn (a library can have thousands of artists). */
  import { lib } from '../../lib/library.svelte';
  import { view } from '../../lib/view.svelte';
  import { menu, SEP, tidy, type MenuEntry } from '../../lib/menu.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { readPref, writePref } from '../../lib/prefs';
  import { facetInfo, facetItems, inFacet, sortFacet, type Facet, type FacetItem } from '../../core/library/browse';

  let { by }: { by: Facet } = $props();
  const ROW = 44;
  let q = $state('');
  let order = $state<'name' | 'tracks'>(readPref('browseOrder', 'name') === 'tracks' ? 'tracks' : 'name');
  $effect(() => { writePref('browseOrder', order); });
  const info = $derived(facetInfo(by));
  const all = $derived.by(() => { void lib.version; return facetItems([...lib.store?.tracks.values() ?? []], by); });
  const items = $derived.by(() => {
    const w = q.trim().toLowerCase();
    const list = w ? all.filter(i => i.value.toLowerCase().includes(w) || (i.sub ?? '').toLowerCase().includes(w)) : all;
    return sortFacet(list, by, order);
  });

  let box = $state<HTMLDivElement>(), top = $state(0), height = $state(600);
  const first = $derived(Math.max(0, Math.floor(top / ROW) - 8));
  const shown = $derived(items.slice(first, first + Math.ceil(height / ROW) + 16));

  const open = (i: FacetItem) => view.select({ kind: 'facet', by, key: i.key, value: i.value });
  const idsOf = (i: FacetItem) => [...lib.store?.tracks.values() ?? []].filter(t => inFacet(t, by, i.key)).map(t => t.id);
  function time(s: number) { const m = Math.round(s / 60); return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min'; }
  function itemMenu(i: FacetItem): MenuEntry[] {
    const ids = idsOf(i), playable = ids.filter(id => nowPlaying.canPlay(id)), name = i.value || info.none;
    return tidy([
      { label: 'Open', run: () => open(i) },
      playable.length > 0 && { label: 'Play', hint: String(playable.length), attrs: { 'data-m': 'play' }, run: () => void nowPlaying.play(playable[0], playable, 0, name) },
      playable.length > 0 && { label: 'Add to queue', attrs: { 'data-m': 'queue' }, run: () => nowPlaying.enqueue(playable, 'end') },
      SEP,
      { label: 'Stats…', attrs: { 'data-m': 'stats' }, run: () => (view.statsFor = { title: name, ids }) },
    ]);
  }
</script>

<div class="browse" id="browse" data-by={by}>
  <div class="bar">
    <input type="search" id="browse-find" placeholder={'Find ' + info.name.toLowerCase() + '…'} bind:value={q} autocomplete="off" spellcheck="false" />
    <span class="seg" role="radiogroup" aria-label="Order">
      <button type="button" role="radio" aria-checked={order === 'name'} onclick={() => (order = 'name')}>{by === 'year' ? 'Newest' : 'A–Z'}</button>
      <button type="button" role="radio" aria-checked={order === 'tracks'} onclick={() => (order = 'tracks')}>Most songs</button>
    </span>
    <span class="count">{items.length.toLocaleString()} {items.length === 1 ? info.one.toLowerCase() : info.name.toLowerCase()}</span>
  </div>
  <div class="list" bind:this={box} bind:clientHeight={height} onscroll={() => (top = box!.scrollTop)}>
    <div class="spacer" style:height={items.length * ROW + 'px'}>
      {#each shown as i, j (i.key)}
        <button type="button" class="it" data-key={i.key} style:transform={'translateY(' + (first + j) * ROW + 'px)'}
          onclick={() => open(i)} oncontextmenu={e => menu.context(e, () => itemMenu(i), i.value || info.none)}>
          <span class="nm"><b class:none={!i.key}>{i.value || info.none}</b>{#if i.sub}<small>{i.sub}</small>{/if}</span>
          <span class="n">{i.tracks.toLocaleString()} song{i.tracks === 1 ? '' : 's'}</span>
          <span class="t">{time(i.seconds)}</span>
        </button>
      {/each}
    </div>
    {#if !items.length}<p class="empty">{q ? 'Nothing matches “' + q + '”.' : 'No songs here yet.'}</p>{/if}
  </div>
</div>

<style>
  .browse { display: flex; flex-direction: column; gap: 10px; min-height: 0; flex: 1; }
  .bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  #browse-find { flex: 1; min-width: 160px; max-width: 360px; background: var(--surface); border: 1px solid var(--line-2); border-radius: 6px; padding: 6px 10px; font-size: 13.5px; color: var(--ink); }
  #browse-find:focus { outline: none; border-color: var(--accent); }
  .seg { display: inline-flex; border: 1px solid var(--line-2); border-radius: 6px; overflow: hidden; }
  .seg button { background: none; border: 0; color: var(--ink-2); font-size: 12.5px; padding: 4px 10px; cursor: pointer; }
  .seg button[aria-checked="true"] { background: var(--raised); color: var(--ink); }
  .count { color: var(--muted); font-size: 12.5px; margin-left: auto; }
  .list { position: relative; flex: 1; min-height: 0; overflow-y: auto; border: 1px solid var(--line); border-radius: var(--radius); }
  .spacer { position: relative; }
  .it { position: absolute; left: 0; right: 0; height: 44px; display: grid; grid-template-columns: minmax(0, 1fr) 110px 80px; gap: 12px; align-items: center; padding: 0 14px; background: none; border: 0; border-bottom: 1px solid var(--line); color: var(--ink); text-align: left; cursor: pointer; }
  .it:hover { background: var(--raised); }
  .nm { display: grid; min-width: 0; }
  .nm b { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm b.none { color: var(--muted); font-style: italic; font-weight: 500; }
  .nm small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .n, .t { color: var(--ink-2); font: 12px var(--font-mono); text-align: right; }
  .empty { color: var(--muted); padding: 20px; text-align: center; }
  @media (max-width: 640px) { .it { grid-template-columns: minmax(0, 1fr) auto; } .t { display: none; } }
</style>
