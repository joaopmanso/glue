<script lang="ts">
  /* A Discogs playlist (ADR 0189): the library's songs and vinyl tracks of the user's Discogs records together. A song
     plays; a vinyl track says which record to pull (cover, position, label and catalogue number). An auto one shows its
     rules at the top and its tracks follow them; "Save as a playlist" freezes it. Only the rows on screen are drawn. */
  import { discogs } from '../../lib/discogs.svelte';
  import { lib } from '../../lib/library.svelte';
  import { view } from '../../lib/view.svelte';
  import { menu, SEP, tidy, type MenuEntry } from '../../lib/menu.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { router, trackHref } from '../../lib/route.svelte';
  import { fmtTime } from '../../core/format';
  import { isVinyl, NO_RULES, plainName, ruleValues, vinylTrack, type DiscogsRules } from '../../core/library/discogsLists';
  import CoverArt from './CoverArt.svelte';

  let { id }: { id: string } = $props();
  const ROW = 52;
  $effect(() => discogs.watch());

  const list = $derived.by(() => { void lib.version; return lib.store?.lists.get(id) ?? null; });
  const rules = $derived(list?.discogs?.rules ?? null);
  const byId = $derived.by(() => { void discogs.state; return discogs.byId; });
  const items = $derived.by(() => { void lib.version; void discogs.state; return list ? discogs.itemsOf(list) : []; });
  type Item = { key: string; i: number } & ({ vinyl: false; t: NonNullable<ReturnType<typeof songOf>> } | { vinyl: true; v: NonNullable<ReturnType<typeof vinylTrack>> } | { vinyl: null });
  const songOf = (x: string) => lib.store?.tracks.get(x);
  const rows = $derived<Item[]>(items.map((x, i) => {
    if (isVinyl(x)) { const v = vinylTrack(x, byId); return v ? { key: x, i, vinyl: true, v } : { key: x, i, vinyl: null }; }
    const t = songOf(x);
    return t ? { key: x, i, vinyl: false, t } : { key: x, i, vinyl: null };
  }));
  const counts = $derived.by(() => {
    let vinyl = 0, digital = 0, secs = 0;
    for (const r of rows) {
      if (r.vinyl === true) { vinyl++; secs += r.v.track.d ?? 0; }
      else if (r.vinyl === false) { digital++; secs += r.t.duration ?? 0; }
    }
    return { vinyl, digital, secs };
  });
  const songs = $derived(rows.flatMap(r => (r.vinyl === false && nowPlaying.canPlay(r.t.id) ? [r.t.id] : [])));

  let box = $state<HTMLDivElement>(), top = $state(0), height = $state(600);
  const first = $derived(Math.max(0, Math.floor(top / ROW) - 8));
  const shown = $derived(rows.slice(first, first + Math.ceil(height / ROW) + 16));

  // ---- a list arranged by hand: move, remove, drag ----
  const editable = $derived(!!list && !rules && !lib.readOnly);
  function setItems(next: string[]) { if (list) lib.updateList(list.id, { items: next }); }
  function move(i: number, to: number) {
    if (!list || to < 0 || to >= list.items.length || to === i) return;
    const next = [...list.items]; const [x] = next.splice(i, 1); next.splice(to, 0, x); setItems(next);
  }
  let dragging = $state<number | null>(null), over = $state<number | null>(null);
  function rowMenu(r: Item): MenuEntry[] {
    const name = r.vinyl === true ? r.v.track.title : r.vinyl === false ? r.t.title || r.t.fileName : r.key;
    return tidy([
      r.vinyl === false && nowPlaying.canPlay(r.t.id) && { label: 'Play from here', attrs: { 'data-m': 'play' }, run: () => void nowPlaying.play(r.t.id, songs.slice(songs.indexOf(r.t.id)), 0, list?.name) },
      r.vinyl === false && { label: 'Open its page', run: () => router.go(trackHref(r.t.id)) },
      r.vinyl === true && { label: 'Open on Discogs', attrs: { 'data-m': 'discogs' }, run: () => { window.open('https://www.discogs.com/release/' + r.v.record.id, '_blank', 'noopener'); } },
      editable && SEP,
      editable && r.i > 0 && { label: 'Move up', attrs: { 'data-m': 'up' }, run: () => move(r.i, r.i - 1) },
      editable && r.i < rows.length - 1 && { label: 'Move down', attrs: { 'data-m': 'down' }, run: () => move(r.i, r.i + 1) },
      editable && { label: 'Remove from this playlist', attrs: { 'data-m': 'remove' }, run: () => setItems(list!.items.filter((_, k) => k !== r.i)) },
    ]);
    void name;
  }

  // ---- an auto one's rules ----
  const values = $derived.by(() => ruleValues(discogs.state?.kept?.records ?? []));
  function setRules(patch: Partial<DiscogsRules>) { if (list && rules) lib.updateList(list.id, { discogs: { rules: { ...NO_RULES, ...rules, ...patch } } }); }
  type Multi = 'genres' | 'styles' | 'artists' | 'labels' | 'formats';
  const MULTI: { k: Multi; name: string }[] = [{ k: 'styles', name: 'Style' }, { k: 'genres', name: 'Genre' }, { k: 'artists', name: 'Artist' }, { k: 'labels', name: 'Label' }, { k: 'formats', name: 'Format' }];
  let adding = $state<Multi | null>(null), find = $state('');
  const offered = $derived.by(() => {
    if (!adding || !rules) return [];
    const w = find.trim().toLowerCase(), have = new Set(rules[adding]);
    return values[adding].filter(v => !have.has(v) && (!w || v.toLowerCase().includes(w))).slice(0, 40);
  });
  const year = (v: string) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 1800 && n < 2200 ? n : null; };
  function freeze() {
    if (!list) return;
    const name = prompt('Name of the new playlist', list.name + ' (fixed)');
    if (!name) return;
    const l = lib.createDiscogsList(name, undefined, items);
    if (l) view.select({ kind: 'discogsList', id: l.id });
  }
  function rename() { if (!list) return; const n = prompt('Rename the playlist', list.name); if (n?.trim()) lib.updateList(list.id, { name: n.trim() }); }
  function remove() { if (!list || !confirm('Delete “' + list.name + '”? (It goes to Recently deleted.)')) return; lib.store?.deleteList(list.id); view.select({ kind: 'discogs' }); }
  const len = (s: number) => { const m = Math.round(s / 60); return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min'; };
</script>

<div class="dl" id="discogs-list" data-list={id}>
  {#if !list}<p class="none">This playlist isn’t here any more.</p>
  {:else}
    <div class="head">
      <span class="sum" id="discogs-list-sum">{rows.length} track{rows.length === 1 ? '' : 's'}: {counts.vinyl} on vinyl, {counts.digital} digital{counts.secs ? ' · ' + len(counts.secs) : ''}</span>
      <button type="button" class="mini" id="discogs-list-play" disabled={!songs.length} onclick={() => void nowPlaying.play(songs[0], songs, 0, list.name)}>Play the digital ones</button>
      {#if rules}<button type="button" class="mini" id="discogs-freeze" disabled={!items.length || lib.readOnly} onclick={freeze}>Save as a playlist</button>{/if}
      <button type="button" class="mini" onclick={rename} disabled={lib.readOnly}>Rename</button>
      <button type="button" class="mini" onclick={remove} disabled={lib.readOnly}>Delete</button>
    </div>
    {#if rules}
      <div class="rules" id="discogs-rules">
        {#each MULTI as m (m.k)}
          <span class="rule" data-rule={m.k}><b>{m.name}</b>
            {#each rules[m.k] as v (v)}<button type="button" class="chip" title="Remove" onclick={() => setRules({ [m.k]: rules[m.k].filter(x => x !== v) })}>{plainName(v)} ×</button>{/each}
            <button type="button" class="add" data-add={m.k} onclick={() => { adding = adding === m.k ? null : m.k; find = ''; }}>+</button>
          </span>
        {/each}
        <span class="rule"><b>Years</b>
          <input type="number" class="yr" id="discogs-from" placeholder="from" value={rules.years?.[0] ?? ''} onchange={e => setRules({ years: [year(e.currentTarget.value), rules.years?.[1] ?? null] })}>
          <input type="number" class="yr" id="discogs-to" placeholder="to" value={rules.years?.[1] ?? ''} onchange={e => setRules({ years: [rules.years?.[0] ?? null, year(e.currentTarget.value)] })}>
        </span>
        <span class="seg" role="radiogroup" aria-label="Vinyl or digital">
          {#each [['both', 'Both'], ['vinyl', 'Vinyl only'], ['digital', 'Digital only']] as [k, n] (k)}<button type="button" role="radio" data-have={k} aria-checked={rules.have === k} onclick={() => setRules({ have: k as DiscogsRules['have'] })}>{n}</button>{/each}
        </span>
        <select aria-label="Order" id="discogs-order" value={rules.order} onchange={e => setRules({ order: e.currentTarget.value as DiscogsRules['order'] })}>
          <option value="added">Newest records first</option><option value="artist">By artist</option><option value="year">Newest years first</option><option value="label">By label</option>
        </select>
        {#if adding}
          <div class="pick" id="discogs-pick">
            <input type="search" placeholder={'Find a ' + MULTI.find(m => m.k === adding)!.name.toLowerCase() + '…'} bind:value={find} autocomplete="off">
            <div class="opts">{#each offered as v (v)}<button type="button" data-value={v} onclick={() => { setRules({ [adding!]: [...rules[adding!], v] }); find = ''; }}>{plainName(v)}</button>{:else}<span class="fine">Nothing left to add.</span>{/each}</div>
          </div>
        {/if}
      </div>
    {/if}
    <div class="list" bind:this={box} bind:clientHeight={height} onscroll={() => (top = box!.scrollTop)}>
      <div class="spacer" style:height={rows.length * ROW + 'px'}>
        {#each shown as r, j (r.key + ':' + r.i)}
          <div class="it" role="listitem" class:vinyl={r.vinyl === true} class:over={over === r.i} data-item={r.key} style:transform={'translateY(' + (first + j) * ROW + 'px)'}
            draggable={editable} ondragstart={e => { dragging = r.i; e.dataTransfer?.setData('text/plain', r.key); }} ondragover={e => { if (dragging != null) { e.preventDefault(); over = r.i; } }}
            ondragleave={() => { if (over === r.i) over = null; }} ondrop={e => { e.preventDefault(); if (dragging != null) move(dragging, r.i); dragging = null; over = null; }} ondragend={() => { dragging = null; over = null; }}
            oncontextmenu={e => menu.context(e, () => rowMenu(r), r.vinyl === true ? r.v.track.title : r.vinyl === false ? r.t.title : '')}
            ondblclick={() => { if (r.vinyl === false) router.go(trackHref(r.t.id)); }}>
            {#if r.vinyl === false}
              <span class="cov"><CoverArt t={r.t} px={40} /></span>
              <span class="nm"><b>{r.t.title || r.t.fileName}</b><small>{r.t.artist}</small></span>
              <span class="from"><span>{r.t.album}</span></span>
              <span class="len">{r.t.duration ? fmtTime(r.t.duration) : ''}</span>
              <span class="kind">{#if nowPlaying.canPlay(r.t.id)}<button type="button" class="play" title="Play" aria-label="Play" onclick={() => void nowPlaying.play(r.t.id, songs.slice(songs.indexOf(r.t.id)), 0, list.name)}>▶</button>{/if}<span class="dig">Digital</span></span>
            {:else if r.vinyl === true}
              {@const src = (void discogs.version, discogs.art(r.v.record.art))}
              <span class="cov">{#if src}<img src={src} alt="">{/if}</span>
              <span class="nm"><b>{r.v.track.title}</b><small>{(r.v.track.artists.length ? r.v.track.artists : r.v.record.artists).map(plainName).join(', ')}</small></span>
              <span class="from"><span>{r.v.track.p ? r.v.track.p + ' · ' : ''}{r.v.record.title}</span><small>{r.v.record.labels[0] ? r.v.record.labels[0].name + (r.v.record.labels[0].catno ? ' · ' + r.v.record.labels[0].catno : '') : ''}</small></span>
              <span class="len">{r.v.track.d ? fmtTime(r.v.track.d) : ''}</span>
              <span class="kind"><span class="vin" title="On vinyl: this record">On vinyl</span></span>
            {:else}
              <span class="cov"></span><span class="nm"><b class="gone">{discogs.state?.kept ? 'Not here any more' : 'Loading…'}</b><small>{discogs.state?.kept ? r.key : ''}</small></span><span></span><span></span><span class="kind"></span>
            {/if}
          </div>
        {/each}
      </div>
      {#if !rows.length}<p class="none" id="discogs-list-empty">{rules ? 'No track of your Discogs collection fits these rules yet.' : 'Empty. Add records from Discogs (right-click a record › Add to Discogs playlist), or songs from your library (right-click › Add to Discogs playlist).'}</p>{/if}
    </div>
  {/if}
</div>

<style>
  .dl { display: flex; flex-direction: column; gap: 8px; min-height: 0; flex: 1; }
  .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .sum { color: var(--ink-2); font-size: 13px; margin-right: auto; }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 4px 10px; cursor: pointer; white-space: nowrap; }
  .mini:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
  .mini:disabled { opacity: .45; cursor: default; }
  .rules { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); position: relative; }
  .rule { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; font-size: 12.5px; }
  .rule b { color: var(--muted); font-weight: 600; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; margin-right: 2px; }
  .chip { background: color-mix(in srgb, var(--accent) 14%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); border-radius: 12px; color: var(--ink); font-size: 12px; padding: 1px 8px; cursor: pointer; }
  .add { background: none; border: 1px dashed var(--line-2); border-radius: 12px; color: var(--ink-2); font-size: 12px; padding: 0 8px; cursor: pointer; }
  .yr { width: 70px; background: var(--ground); border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink); font-size: 12px; padding: 2px 6px; }
  .seg { display: inline-flex; border: 1px solid var(--line-2); border-radius: 6px; overflow: hidden; }
  .seg button { background: none; border: 0; color: var(--ink-2); font-size: 12px; padding: 3px 9px; cursor: pointer; }
  .seg button[aria-checked="true"] { background: var(--raised); color: var(--ink); }
  select { background: var(--surface); border: 1px solid var(--line-2); border-radius: 6px; color: var(--ink); font-size: 12px; padding: 3px 6px; }
  .pick { flex-basis: 100%; display: grid; gap: 6px; }
  .pick input { background: var(--ground); border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink); padding: 4px 8px; font-size: 12.5px; max-width: 320px; }
  .opts { display: flex; flex-wrap: wrap; gap: 4px; max-height: 120px; overflow-y: auto; }
  .opts button { background: none; border: 1px solid var(--line-2); border-radius: 12px; color: var(--ink-2); font-size: 12px; padding: 1px 8px; cursor: pointer; }
  .opts button:hover { color: var(--accent); border-color: var(--accent); }
  .fine { color: var(--muted); font-size: 12px; }
  .list { position: relative; flex: 1; min-height: 0; overflow-y: auto; border: 1px solid var(--line); border-radius: var(--radius); }
  .spacer { position: relative; }
  .it { position: absolute; left: 0; right: 0; height: 52px; display: grid; grid-template-columns: 40px minmax(0, 1.3fr) minmax(0, 1fr) 56px 120px; gap: 12px; align-items: center; padding: 0 12px; border-bottom: 1px solid var(--line); }
  .it:hover { background: var(--raised); }
  .it.over { box-shadow: inset 0 2px 0 var(--accent); }
  .cov { width: 40px; height: 40px; border-radius: 3px; overflow: hidden; background: var(--surface); display: grid; place-items: center; }
  .cov img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .nm, .from { display: grid; min-width: 0; }
  .nm b { font-weight: 600; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm b.gone { color: var(--muted); font-style: italic; font-weight: 500; }
  .nm small, .from small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .from span { color: var(--ink-2); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .len { color: var(--ink-2); font: 12px var(--font-mono); text-align: right; }
  .kind { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
  .play { background: none; border: 1px solid var(--line-2); border-radius: 50%; width: 24px; height: 24px; color: var(--accent); cursor: pointer; font-size: 10px; line-height: 1; }
  .dig { color: var(--muted); font-size: 11.5px; }
  .vin { color: var(--warn, #e0a030); border: 1px solid currentColor; border-radius: 10px; font-size: 11px; padding: 1px 7px; }
  .none { color: var(--muted); padding: 20px; text-align: center; }
  @media (max-width: 760px) { .it { grid-template-columns: 40px minmax(0, 1fr) auto; } .from, .len { display: none; } }
</style>
