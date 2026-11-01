<script lang="ts">
  /* The Discogs playlist builder (ADR 0190): from the records or tracks picked, a playlist of tracks like them (style,
     genre, label, years, artists), within the rules asked: how many, tracks per record, compilations, artists, styles,
     labels, formats, years, vinyl or digital. Each track can be swapped (↻) or taken out (×); Save makes a Discogs
     playlist to arrange by hand. Like the library's builder (AutoPlaylist.svelte). */
  import { discogsBuild as b } from '../../lib/discogsBuild.svelte';
  import { discogs } from '../../lib/discogs.svelte';
  import { lib } from '../../lib/library.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { fmtTime } from '../../core/format';
  import { plainName, ruleValues } from '../../core/library/discogsLists';

  type Multi = 'artists' | 'styles' | 'labels' | 'formats';
  const MULTI: { k: Multi; name: string; only?: 'artistsOnly' | 'stylesOnly' }[] = [
    { k: 'styles', name: 'Styles', only: 'stylesOnly' }, { k: 'artists', name: 'Artists', only: 'artistsOnly' }, { k: 'labels', name: 'Labels' }, { k: 'formats', name: 'Formats' },
  ];
  const values = $derived.by(() => { void discogs.state; return ruleValues(discogs.state?.kept?.records ?? []); });
  let adding = $state<Multi | null>(null), find = $state('');
  const offered = $derived.by(() => {
    if (!adding) return [];
    const w = find.trim().toLowerCase(), have = new Set(b.form[adding]);
    return values[adding].filter(v => !have.has(v) && (!w || v.toLowerCase().includes(w))).slice(0, 40);
  });

  // Starting points: a search over the collection's records and tracks.
  let sq = $state('');
  const seedHits = $derived.by(() => {
    const w = sq.trim().toLowerCase();
    if (w.length < 2) return [];
    const out: { item: string; label: string }[] = [];
    for (const r of discogs.state?.kept?.records ?? []) {
      const rn = (r.title + ' ' + r.artists.join(' ') + ' ' + r.labels.map(l => l.name + ' ' + l.catno).join(' ')).toLowerCase();
      if (rn.includes(w)) out.push({ item: 'rec:' + r.id, label: '💿 ' + r.artists.map(plainName).join(', ') + ' – ' + r.title });
      const m = discogs.matchOf(r);
      r.tracks?.forEach((t, i) => { if (t.title.toLowerCase().includes(w)) out.push({ item: m.byTrack[i] ?? 'dg:' + r.id + ':' + (t.p || String(i + 1)), label: (t.p ? t.p + ' ' : '') + t.title + ' · ' + r.title }); });
      if (out.length > 30) break;
    }
    return out.slice(0, 30);
  });
  function addSeed(item: string) {
    const items = item.startsWith('rec:') ? (() => { const r = discogs.byId.get(Number(item.slice(4))); return r ? discogs.recordItems(r) : []; })() : [item];
    b.seeds = [...new Set([...b.seeds, ...items])]; sq = '';
  }
  const year = (v: string) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 1800 && n < 2200 ? n : null; };
  const total = $derived(b.ids.reduce((s, id) => s + (b.describe(id)?.duration ?? 0), 0));
  const songs = $derived(b.ids.filter(id => !id.startsWith('dg:') && nowPlaying.canPlay(id)));
</script>

<svelte:window onkeydown={e => { if (e.key === 'Escape') b.close(); }} />

<div class="scrim" role="presentation" onpointerdown={e => { if (e.target === e.currentTarget) b.close(); }}>
  <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dgb-h" id="dgb-dialog">
    <header><h2 id="dgb-h">Build a playlist from your records</h2><button type="button" class="x" aria-label="Close" onclick={() => b.close()}>×</button></header>
    <div class="cols">
      <form class="opts" onsubmit={e => { e.preventDefault(); b.run(); }}>
        <h3>Start from</h3>
        {#each b.seeds as s (s)}<div class="tchip seed"><b>{b.label(s)}</b><span>{b.describe(s)?.record?.title ?? ''}</span><button type="button" aria-label="Remove" onclick={() => (b.seeds = b.seeds.filter(x => x !== s))}>×</button></div>
        {:else}<p class="fine" id="dgb-noseed">Nothing picked: the rules below choose. Add records or tracks here, or tick them in Discogs.</p>{/each}
        <input type="search" id="dgb-search" placeholder="Add a record or track…" bind:value={sq} autocomplete="off">
        {#if seedHits.length}<div class="hits">{#each seedHits as h (h.item)}<button type="button" onclick={() => addSeed(h.item)}>{h.label}</button>{/each}</div>{/if}

        <h3>Shape</h3>
        <label class="row">Tracks <input type="number" id="dgb-count" min="1" max="200" bind:value={b.form.count}></label>
        <span class="row">Per record
          <span class="seg" role="radiogroup" aria-label="Tracks per record">{#each [[1, '1'], [2, '2'], [0, 'Any']] as [v, n] (v)}<button type="button" role="radio" data-per={v} aria-checked={b.form.perRecord === v} onclick={() => (b.form.perRecord = v as number)}>{n}</button>{/each}</span>
        </span>
        <span class="row">Have
          <span class="seg" role="radiogroup" aria-label="Vinyl or digital">{#each [['both', 'Both'], ['vinyl', 'Vinyl only'], ['digital', 'Digital only']] as [v, n] (v)}<button type="button" role="radio" data-have={v} aria-checked={b.form.have === v} onclick={() => (b.form.have = v as 'both')}>{n}</button>{/each}</span>
        </span>
        <label class="check"><input type="checkbox" id="dgb-comps" bind:checked={b.form.compilations}> Include compilations</label>
        <label class="check"><input type="checkbox" id="dgb-library" bind:checked={b.form.library}> Also songs from your library (not on a record)</label>
        <label class="check"><input type="checkbox" id="dgb-avoid" bind:checked={b.form.avoidMine}> Avoid tracks already in my Discogs playlists</label>

        <h3>Refine</h3>
        {#each MULTI as m (m.k)}
          <div class="rule" data-rule={m.k}><b>{m.name}</b>
            {#each b.form[m.k] as v (v)}<button type="button" class="chip" title="Remove" onclick={() => (b.form[m.k] = b.form[m.k].filter(x => x !== v))}>{plainName(v)} ×</button>{/each}
            <button type="button" class="add" data-add={m.k} onclick={() => { adding = adding === m.k ? null : m.k; find = ''; }}>+</button>
            {#if m.only && b.form[m.k].length}
              <span class="seg small">{#each [[false, 'Prefer'], [true, 'Only these']] as [v, n] (String(v))}<button type="button" role="radio" data-only={m.k + ':' + v} aria-checked={b.form[m.only!] === v} onclick={() => (b.form[m.only!] = v as boolean)}>{n}</button>{/each}</span>
            {/if}
          </div>
          {#if adding === m.k}
            <div class="pick"><input type="search" placeholder={'Find ' + m.name.toLowerCase() + '…'} bind:value={find} autocomplete="off">
              <div class="opts2">{#each offered as v (v)}<button type="button" data-value={v} onclick={() => { b.form[m.k] = [...b.form[m.k], v]; find = ''; }}>{plainName(v)}</button>{:else}<span class="fine">Nothing to add.</span>{/each}</div></div>
          {/if}
        {/each}
        <span class="row">Years <input type="number" class="yr" id="dgb-from" placeholder="from" value={b.form.years?.[0] ?? ''} onchange={e => (b.form.years = [year(e.currentTarget.value), b.form.years?.[1] ?? null])}>
          <input type="number" class="yr" id="dgb-to" placeholder="to" value={b.form.years?.[1] ?? ''} onchange={e => (b.form.years = [b.form.years?.[0] ?? null, year(e.currentTarget.value)])}></span>
        <label class="row">Surprise me <input type="range" min="0" max="1" step="0.05" bind:value={b.form.randomness}></label>
        <button type="submit" class="btn" id="dgb-go">Build</button>
      </form>

      <section class="res">
        <div class="res-head">
          <input id="dgb-name" bind:value={b.name} aria-label="Playlist name">
          <button type="button" class="mini" id="dgb-again" disabled={!b.ids.length} onclick={() => b.again()}>↻ Another</button>
          <button type="button" class="btn" id="dgb-save" disabled={!b.ids.length || lib.readOnly} onclick={() => b.save()}>Save</button>
        </div>
        {#if b.ids.length}
          <p class="meta" id="dgb-meta">{b.ids.length} tracks{total ? ' · ' + Math.round(total / 60) + ' min' : ''} · {b.ids.filter(id => id.startsWith('dg:')).length} on vinyl{b.relaxed.length ? ' · ' + b.relaxed.join(', ') : ''}</p>
          <ol class="list" id="dgb-list">
            {#each b.ids as id, i (id)}
              {@const d = b.describe(id)}
              {@const src = d?.record ? (void discogs.version, discogs.art(d.record.art)) : null}
              <li data-item={id} class:seed={b.seeds.includes(id)}>
                <span class="n">{i + 1}</span>
                <span class="cov">{#if src}<img src={src} alt="">{/if}</span>
                <span class="who"><b>{d?.title ?? id}</b><small>{d?.artist ?? ''}{d?.record ? ' · ' + d.record.title : ''}</small></span>
                <span class="len">{d?.duration ? fmtTime(d.duration) : ''}</span>
                {#if d?.digital}<button type="button" class="play" aria-label="Play" disabled={!nowPlaying.canPlay(id)} onclick={() => void nowPlaying.play(id, songs, 0, b.name)}>▶</button>{:else}<span class="vin">On vinyl</span>{/if}
                <span class="acts">
                  <button type="button" class="ic" title="Another track here" aria-label="Another track here" data-reroll={i} disabled={b.seeds.includes(id)} onclick={() => b.reroll(i)}>↻</button>
                  <button type="button" class="ic" title="Take it out" aria-label="Take it out" data-remove={i} onclick={() => b.remove(i)}>×</button>
                </span>
              </li>
            {/each}
          </ol>
        {:else}<p class="empty" id="dgb-empty">Set what you want, then <b>Build</b>.{#if b.relaxed.length} {b.relaxed.join(', ')}.{/if}</p>{/if}
      </section>
    </div>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--ground) 70%, transparent); backdrop-filter: blur(3px); display: grid; justify-items: center; align-items: start; overflow-y: auto; padding: 16px; }
  .dlg { margin-block: auto; width: min(1180px, 100%); height: min(860px, calc(100dvh - 32px)); display: grid; grid-template-rows: auto minmax(0, 1fr); background: var(--surface); border: 1px solid var(--line-2); border-radius: 12px; box-shadow: 0 24px 60px rgb(0 0 0 / .5); overflow: clip; }
  header { position: relative; padding: 14px 22px; border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-size: 17px; }
  .x { position: absolute; right: 14px; top: 12px; background: none; border: 0; color: var(--muted); font-size: 24px; cursor: pointer; line-height: 1; }
  .cols { display: flex; min-height: 0; overflow: hidden; }
  .opts { flex: 0 0 400px; min-height: 0; overflow-y: auto; padding: 14px 18px 18px 22px; display: grid; gap: 10px; align-content: start; border-right: 1px solid var(--line); }
  h3 { margin: 6px 0 0; font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }
  .fine { color: var(--muted); font-size: 12.5px; margin: 0; }
  .tchip { display: grid; grid-template-columns: 1fr auto; gap: 0 8px; background: var(--raised); border-radius: 6px; padding: 6px 8px; font-size: 13px; border-left: 3px solid var(--accent); }
  .tchip b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tchip span { grid-column: 1; color: var(--muted); font-size: 12px; }
  .tchip button { grid-row: 1 / span 2; grid-column: 2; background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 16px; align-self: center; }
  input[type=search], input[type=number], #dgb-name { background: var(--ground); border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink); padding: 5px 8px; font-size: 13px; }
  .hits { display: grid; gap: 2px; max-height: 180px; overflow-y: auto; }
  .hits button { text-align: left; background: none; border: 0; color: var(--ink-2); font-size: 12.5px; padding: 3px 6px; border-radius: 4px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hits button:hover { background: var(--raised); color: var(--ink); }
  .row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-2); }
  .row input[type=number] { width: 80px; }
  .yr { width: 72px !important; }
  .check { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .seg { display: inline-flex; border: 1px solid var(--line-2); border-radius: 6px; overflow: hidden; }
  .seg button { background: none; border: 0; color: var(--ink-2); font-size: 12px; padding: 3px 9px; cursor: pointer; }
  .seg button[aria-checked="true"] { background: var(--raised); color: var(--ink); }
  .seg.small button { font-size: 11px; padding: 2px 7px; }
  .rule { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 12.5px; }
  .rule b { color: var(--muted); font-weight: 600; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; margin-right: 4px; }
  .chip { background: color-mix(in srgb, var(--accent) 14%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); border-radius: 12px; color: var(--ink); font-size: 12px; padding: 1px 8px; cursor: pointer; }
  .add { background: none; border: 1px dashed var(--line-2); border-radius: 12px; color: var(--ink-2); font-size: 12px; padding: 0 8px; cursor: pointer; }
  .pick { display: grid; gap: 4px; }
  .opts2 { display: flex; flex-wrap: wrap; gap: 4px; max-height: 120px; overflow-y: auto; }
  .opts2 button { background: none; border: 1px solid var(--line-2); border-radius: 12px; color: var(--ink-2); font-size: 12px; padding: 1px 8px; cursor: pointer; }
  .btn { background: var(--accent); color: var(--accent-ink); border: 0; border-radius: 6px; padding: 7px 16px; font-weight: 600; cursor: pointer; }
  .btn:disabled { opacity: .45; cursor: default; }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 4px 10px; cursor: pointer; }
  .mini:disabled { opacity: .45; cursor: default; }
  .res { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; min-height: 0; overflow: hidden; padding: 14px 22px 18px 18px; gap: 8px; }
  .res-head { display: flex; gap: 8px; align-items: center; }
  .res-head input { flex: 1; font-size: 15px; font-weight: 600; padding: 7px 10px; }
  .meta { margin: 0; color: var(--muted); font-size: 12.5px; }
  .list { list-style: none; margin: 0; padding: 0; overflow-y: auto; display: grid; gap: 2px; align-content: start; }
  .list li { display: grid; grid-template-columns: 24px 36px minmax(0, 1fr) 48px 70px auto; gap: 10px; align-items: center; padding: 4px 6px; border-radius: 6px; }
  .list li:hover { background: var(--raised); }
  .list li.seed { box-shadow: inset 3px 0 0 var(--accent); }
  .n { color: var(--muted); font: 11.5px var(--font-mono); text-align: right; }
  .cov { width: 36px; height: 36px; border-radius: 3px; background: var(--raised); overflow: hidden; }
  .cov img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .who { display: grid; min-width: 0; }
  .who b { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .len { color: var(--ink-2); font: 12px var(--font-mono); text-align: right; }
  .play { background: none; border: 1px solid var(--line-2); border-radius: 50%; width: 24px; height: 24px; color: var(--accent); cursor: pointer; font-size: 10px; justify-self: start; }
  .vin { color: var(--warn, #e0a030); border: 1px solid currentColor; border-radius: 10px; font-size: 11px; padding: 1px 7px; justify-self: start; }
  .acts { display: flex; gap: 2px; }
  .ic { background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 15px; padding: 2px 6px; border-radius: 4px; }
  .ic:hover:not(:disabled) { color: var(--accent); background: var(--surface); }
  .ic:disabled { opacity: .3; cursor: default; }
  .empty { color: var(--muted); font-size: 13.5px; }
  @media (max-width: 860px) { .cols { flex-direction: column; overflow-y: auto; } .opts { flex: none; border-right: 0; border-bottom: 1px solid var(--line); } .res { overflow: visible; } }
</style>
