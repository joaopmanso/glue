<script lang="ts">
  /* The user's Discogs collection and wantlist (ADR 0187), read by GLUE Home: each record with its cover, label,
     catalogue number, year and formats, and the songs of it GLUE has ("In GLUE: 7 songs", a click opens its album), or
     "Not in GLUE". Only the rows on screen are drawn. */
  import { discogs } from '../../lib/discogs.svelte';
  import { view } from '../../lib/view.svelte';
  import { lib } from '../../lib/library.svelte';
  import { menu, SEP, tidy, type MenuEntry } from '../../lib/menu.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { readPref, writePref } from '../../lib/prefs';
  import { facetKey } from '../../core/library/browse';
  import type { DiscogsRecord } from '../../core/library/discogsMatch';

  const ROW = 58;
  $effect(() => discogs.watch());
  type Tab = 'records' | 'wants';
  type Sort = 'added' | 'artist' | 'title' | 'label' | 'year';
  type Show = 'all' | 'in' | 'out';
  let tab = $state<Tab>(readPref('discogsTab', 'records') === 'wants' ? 'wants' : 'records');
  let sort = $state<Sort>((['added', 'artist', 'title', 'label', 'year'] as const).find(s => s === readPref('discogsSort', 'added')) ?? 'added');
  let show = $state<Show>('all');
  let q = $state('');
  $effect(() => { writePref('discogsTab', tab); writePref('discogsSort', sort); });

  const st = $derived(discogs.state);
  const kept = $derived(st?.kept ?? null);
  const reading = $derived(st?.now?.reading ?? null);
  const all = $derived(kept ? kept[tab] : []);
  /** Discogs tells two artists of one name apart with "(2)": shown without it. */
  const artistOf = (r: DiscogsRecord) => r.artists.map(a => a.replace(/\s+\(\d+\)$/, '')).join(', ');
  const labelOf = (r: DiscogsRecord) => r.labels[0] ? r.labels[0].name + (r.labels[0].catno && r.labels[0].catno !== 'none' ? ' · ' + r.labels[0].catno : '') : '';
  const items = $derived.by(() => {
    void lib.version;
    const w = q.trim().toLowerCase();
    let list = w ? all.filter(r => (r.title + ' ' + artistOf(r) + ' ' + r.labels.map(l => l.name + ' ' + l.catno).join(' ') + ' ' + r.styles.join(' ')).toLowerCase().includes(w)) : all;
    if (show !== 'all') list = list.filter(r => (discogs.songsOf(r).length > 0) === (show === 'in'));
    const by: Record<Sort, (a: DiscogsRecord, b: DiscogsRecord) => number> = {
      added: (a, b) => b.added.localeCompare(a.added),
      artist: (a, b) => artistOf(a).localeCompare(artistOf(b)) || a.title.localeCompare(b.title),
      title: (a, b) => a.title.localeCompare(b.title),
      label: (a, b) => labelOf(a).localeCompare(labelOf(b)),
      year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
    };
    return [...list].sort(by[sort]);
  });
  const inGlue = $derived.by(() => { void lib.version; return all.filter(r => discogs.songsOf(r).length > 0).length; });

  let box = $state<HTMLDivElement>(), top = $state(0), height = $state(600);
  const first = $derived(Math.max(0, Math.floor(top / ROW) - 8));
  const shown = $derived(items.slice(first, first + Math.ceil(height / ROW) + 16));

  /** Its songs: their album (or the first song's), as Browse opens it. */
  function openSongs(r: DiscogsRecord) {
    const ids = discogs.songsOf(r), t = ids.map(id => lib.store?.tracks.get(id)).find(Boolean);
    if (!t) return;
    if (t.album) view.select({ kind: 'facet', by: 'album', key: facetKey(t.album), value: t.album });
    else view.select({ kind: 'facet', by: 'artist', key: facetKey(t.artist), value: t.artist });
  }
  const page = (r: DiscogsRecord) => 'https://www.discogs.com/release/' + r.id;
  function recordMenu(r: DiscogsRecord): MenuEntry[] {
    const ids = discogs.songsOf(r), playable = ids.filter(id => nowPlaying.canPlay(id));
    return tidy([
      ids.length > 0 && { label: 'Show its songs', attrs: { 'data-m': 'songs' }, run: () => openSongs(r) },
      playable.length > 0 && { label: 'Play', hint: String(playable.length), attrs: { 'data-m': 'play' }, run: () => void nowPlaying.play(playable[0], playable, 0, r.title) },
      ids.length > 0 && SEP,
      { label: 'Open on Discogs', attrs: { 'data-m': 'discogs' }, run: () => { window.open(page(r), '_blank', 'noopener'); } },
    ]);
  }
  function when(ms: number) { return new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }
</script>

<div class="dg" id="discogs" data-guide="discogs">
  {#if !discogs.here}
    <div class="empty" id="discogs-nohome"><b>Your Discogs collection comes through GLUE Home.</b>
      <p>On the computer with GLUE Home, open GLUE there (or with GLUE Home running) and add your Discogs token in GLUE Home’s settings.</p></div>
  {:else if st && !st.token}
    <div class="empty" id="discogs-notoken"><b>Connect Discogs in GLUE Home’s settings.</b>
      <p>Open GLUE Home’s window, and under <b>Covers from Discogs</b> paste a personal access token (discogs.com › Settings › Developers). GLUE Home then reads your collection and wantlist here, with their covers, and finds which records you also have in GLUE.</p></div>
  {:else}
    <div class="tools">
      <span class="seg" role="tablist" aria-label="List">
        <button type="button" role="tab" id="discogs-records" aria-selected={tab === 'records'} onclick={() => (tab = 'records')}>Collection <small>{kept?.records.length ?? 0}</small></button>
        <button type="button" role="tab" id="discogs-wants" aria-selected={tab === 'wants'} onclick={() => (tab = 'wants')}>Wantlist <small>{kept?.wants.length ?? 0}</small></button>
      </span>
      <input type="search" id="discogs-find" placeholder="Find a record, artist, label, catalogue number…" bind:value={q} autocomplete="off" spellcheck="false" />
      <span class="seg" role="radiogroup" aria-label="Show">
        <button type="button" role="radio" data-show="all" aria-checked={show === 'all'} onclick={() => (show = 'all')}>All</button>
        <button type="button" role="radio" data-show="in" aria-checked={show === 'in'} onclick={() => (show = 'in')}>In GLUE <small>{inGlue}</small></button>
        <button type="button" role="radio" data-show="out" aria-checked={show === 'out'} onclick={() => (show = 'out')}>Not in GLUE</button>
      </span>
      <select id="discogs-sort" aria-label="Order" bind:value={sort}>
        <option value="added">Added</option><option value="artist">Artist</option><option value="title">Title</option><option value="label">Label</option><option value="year">Year</option>
      </select>
      <button type="button" class="mini" id="discogs-refresh" disabled={!!reading} onclick={() => void discogs.load(true)}>Refresh</button>
    </div>
    <p class="status" id="discogs-status" role="status">
      {#if reading}Reading your Discogs {reading.what === 'covers' ? 'covers' : reading.what}… {reading.of ? reading.done + ' of ' + reading.of + (reading.what === 'covers' ? '' : ' pages') : ''}
      {:else if st?.now?.error}<span class="bad">Couldn’t read Discogs: {st.now.error}</span>
      {:else if st?.tokenError}<span class="bad">{st.tokenError}</span>
      {:else if kept}{kept.user} on Discogs · read {when(kept.readAt)} · {items.length.toLocaleString()} shown
      {:else}Waiting for GLUE Home…{/if}
    </p>
    <div class="list" bind:this={box} bind:clientHeight={height} onscroll={() => (top = box!.scrollTop)}>
      <div class="spacer" style:height={items.length * ROW + 'px'}>
        {#each shown as r, j (r.id + ':' + (r.instance ?? j))}
          {@const ids = discogs.songsOf(r)}
          {@const src = (void discogs.version, discogs.art(r.art))}
          <div class="rec" role="listitem" data-record={r.id} style:transform={'translateY(' + (first + j) * ROW + 'px)'} oncontextmenu={e => menu.context(e, () => recordMenu(r), r.title)}>
            <span class="cov">{#if src}<img src={src} alt="" loading="lazy">{/if}</span>
            <span class="nm"><b title={r.title}>{r.title}</b><small>{artistOf(r)}</small></span>
            <span class="lab"><span>{labelOf(r)}</span><small>{r.year ?? ''}{r.styles.length ? (r.year ? ' · ' : '') + r.styles.slice(0, 3).join(', ') : ''}</small></span>
            <span class="fmt">{r.formats.slice(0, 3).join(' · ')}</span>
            {#if ids.length}<button type="button" class="in" data-in={ids.length} title="Show its songs" onclick={() => openSongs(r)}>In GLUE: {ids.length} song{ids.length === 1 ? '' : 's'}</button>
            {:else}<span class="out">Not in GLUE</span>{/if}
          </div>
        {/each}
      </div>
      {#if kept && !items.length}<p class="none">{q ? 'Nothing matches “' + q + '”.' : tab === 'wants' ? 'Your wantlist is empty.' : 'No records here.'}</p>{/if}
    </div>
  {/if}
</div>

<style>
  .dg { display: flex; flex-direction: column; gap: 8px; min-height: 0; flex: 1; }
  .tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  #discogs-find { flex: 1; min-width: 180px; max-width: 360px; background: var(--surface); border: 1px solid var(--line-2); border-radius: 6px; padding: 6px 10px; font-size: 13.5px; color: var(--ink); }
  #discogs-find:focus { outline: none; border-color: var(--accent); }
  .seg { display: inline-flex; border: 1px solid var(--line-2); border-radius: 6px; overflow: hidden; }
  .seg button { background: none; border: 0; color: var(--ink-2); font-size: 12.5px; padding: 4px 10px; cursor: pointer; }
  .seg button[aria-checked="true"], .seg button[aria-selected="true"] { background: var(--raised); color: var(--ink); }
  .seg small { color: var(--muted); font-family: var(--font-mono); margin-left: 3px; }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 4px 10px; cursor: pointer; white-space: nowrap; }
  .mini:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
  .mini:disabled { opacity: .45; cursor: default; }
  select { background: var(--surface); border: 1px solid var(--line-2); border-radius: 6px; color: var(--ink); font-size: 12.5px; padding: 4px 6px; }
  .status { margin: 0; color: var(--muted); font-size: 12.5px; }
  .bad { color: var(--warn); }
  .list { position: relative; flex: 1; min-height: 0; overflow-y: auto; border: 1px solid var(--line); border-radius: var(--radius); }
  .spacer { position: relative; }
  .rec { position: absolute; left: 0; right: 0; height: 58px; display: grid; grid-template-columns: 44px minmax(0, 1.4fr) minmax(0, 1fr) 140px 130px; gap: 12px; align-items: center; padding: 0 12px; border-bottom: 1px solid var(--line); }
  .rec:hover { background: var(--raised); }
  .cov { width: 44px; height: 44px; border-radius: 3px; background: var(--surface); overflow: hidden; }
  .cov img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .nm, .lab { display: grid; min-width: 0; }
  .nm b { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm small, .lab small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lab span { font-size: 12.5px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fmt { color: var(--ink-2); font: 11.5px var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .in { background: none; border: 1px solid var(--accent); color: var(--accent); border-radius: 12px; font-size: 12px; padding: 2px 9px; cursor: pointer; justify-self: start; }
  .out { color: var(--muted); font-size: 12px; }
  .empty { max-width: 640px; color: var(--ink-2); font-size: 13.5px; padding: 16px; }
  .empty p { color: var(--muted); }
  .none { color: var(--muted); padding: 20px; text-align: center; }
  @media (max-width: 760px) { .rec { grid-template-columns: 44px minmax(0, 1fr) auto; } .lab, .fmt { display: none; } }
</style>
