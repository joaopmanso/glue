<script lang="ts">
  import { auto } from '../../lib/auto.svelte';
  import { lib } from '../../lib/library.svelte';
  import { app } from '../../lib/app.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { player } from '../../lib/player.svelte';
  import { keyLabel } from '../../core/audio/keys';
  import { fmtTime } from '../../core/format';
  import type { Track } from '../../store/types';
  import WaveCell from './WaveCell.svelte';
  import PlaylistInsights from './PlaylistInsights.svelte';
  import { allTags, tagColorOf } from '../../lib/tags.svelte';

  const f = $derived(auto.form);
  const seed = $derived.by(() => { void lib.version; return f.seedId ? lib.store?.tracks.get(f.seedId) ?? null : null; });
  const eligible = $derived.by(() => { void lib.version; void f.avoidLists.length; void f.unanalysed; return auto.candidates().length; });
  const playlists = $derived.by(() => { void lib.version; return [...(lib.store?.lists.values() ?? [])].filter(l => l.kind === 'playlist').sort((a, b) => lib.listPath(a).localeCompare(lib.listPath(b))); });

  // Search the collection for the seed or must-include tracks.
  let q = $state(''), pickFor = $state<'seed' | 'include'>('include');
  const results = $derived.by(() => {
    void lib.version;
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const out: Track[] = [];
    for (const t of lib.store?.tracks.values() ?? []) {
      const hay = (t.title + ' ' + t.artist + ' ' + t.fileName).toLowerCase();
      if (words.every(w => hay.includes(w))) out.push(t);
      if (out.length >= 8) break;
    }
    return out;
  });
  function pick(t: Track) {
    if (pickFor === 'seed') { const keep = { include: f.include, avoidLists: f.avoidLists, count: f.count, useTags: f.useTags, tags: f.tags, tagMode: f.tagMode, avoidTags: f.avoidTags }; auto.form = { ...auto.defaults(t.id), ...keep }; }
    else if (!f.include.includes(t.id) && t.id !== f.seedId) auto.form.include = [...f.include, t.id];
    q = '';
  }
  // Tags: the wanted ones (chosen, or the starting and included tracks' own) and the ones to avoid.
  const tagList = $derived.by(() => { void lib.version; return allTags(); });
  const wanted = $derived.by(() => { void lib.version; void f.seedId; void f.include; void f.tags; void f.useTags; return auto.wantedTags(); });
  function addWanted(e: Event) { const el = e.currentTarget as HTMLSelectElement, v = el.value; el.value = ''; if (v && !wanted.includes(v)) auto.form.tags = [...wanted, v]; }
  function dropWanted(t: string) { auto.form.tags = wanted.filter(x => x !== t); }
  function addAvoid(e: Event) { const el = e.currentTarget as HTMLSelectElement, v = el.value; el.value = ''; if (v && !f.avoidTags.includes(v)) auto.form.avoidTags = [...f.avoidTags, v]; }
  const slotIds = $derived(auto.slots.map(s => s.id));
  let insightsOpen = $state(true);
  const tr = (id: string) => lib.store?.tracks.get(id);
  const an = (id: string) => lib.store?.analysis.get(id);
  const fitCls = (k: number | null) => k == null ? 'unk' : k >= 0.85 ? 'good' : k >= 0.5 ? 'ok' : 'clash';
  const fitTitle = (k: number | null) => k == null ? 'Key unknown' : k === 1 ? 'Same key' : k >= 0.85 ? 'Harmonic: next to it on the wheel' : k >= 0.5 ? 'Energy boost (+2)' : 'Key clash';
  const total = $derived(auto.slots.reduce((n, s) => n + (tr(s.id)?.duration ?? 0), 0));
  // Focus without scrolling: a focus scrolls even overflow-hidden boxes and would hide the dialog's top.
  const focus = (el: HTMLElement) => el.focus({ preventScroll: true });
</script>

<svelte:window onkeydown={e => { if (e.key === 'Escape') auto.close(); }} />

<div class="scrim" role="presentation" onpointerdown={e => { if (e.target === e.currentTarget) auto.close(); }}>
  <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="auto-h" id="auto-dialog">
    <header>
      <h2 id="auto-h">Build a playlist</h2>
      <p>MCO picks tracks from your collection that fit the tempo, mix harmonically and are rated highest, with a little chance so every run is different.</p>
      <button type="button" class="x" aria-label="Close" onclick={() => auto.close()}>×</button>
    </header>

    <div class="ap-cols">
      <form class="opts" onsubmit={e => { e.preventDefault(); auto.run(); }}>
        <fieldset>
          <legend>Start from</legend>
          {#if seed}
            <div class="tchip seed"><b>{seed.title || seed.fileName}</b><span>{seed.artist}</span>
              <span class="mono">{an(seed.id)?.bpm ? Math.round(an(seed.id)!.bpm!) + ' BPM' : ''} {an(seed.id)?.key ? keyLabel(an(seed.id)!.key!, app.keyNotation) : ''}</span>
              <button type="button" aria-label="No starting track" onclick={() => (auto.form.seedId = null)}>×</button></div>
          {:else}<p class="hint">No starting track: MCO chooses the first one too.</p>{/if}
        </fieldset>

        <fieldset>
          <legend>Tracks to include</legend>
          {#each f.include as id (id)}
            <div class="tchip"><b>{tr(id)?.title || tr(id)?.fileName}</b><span>{tr(id)?.artist}</span>
              <button type="button" aria-label="Don’t force this track" onclick={() => (auto.form.include = f.include.filter(x => x !== id))}>×</button></div>
          {/each}
          <div class="search">
            <input id="auto-search" placeholder={pickFor === 'seed' ? 'Search for the starting track…' : 'Search to add a track that must be in it…'} bind:value={q} autocomplete="off">
            <button type="button" class="linkish" onclick={() => (pickFor = pickFor === 'seed' ? 'include' : 'seed')}>{pickFor === 'seed' ? 'add to “include” instead' : 'or pick the starting track'}</button>
            {#if results.length}
              <ul class="results">
                {#each results as t (t.id)}<li><button type="button" onclick={() => pick(t)}><b>{t.title || t.fileName}</b> <span>{t.artist}</span></button></li>{/each}
              </ul>
            {/if}
          </div>
        </fieldset>

        <fieldset class="grid2">
          <legend>Shape</legend>
          <label>Tracks <input type="number" id="auto-count" min="1" max="500" bind:value={auto.form.count}><small>{eligible} available</small></label>
          <label>Start BPM <input type="number" id="auto-start" min="40" max="220" step="1" bind:value={auto.form.startBpm} placeholder="any"></label>
          <label>End BPM <input type="number" id="auto-end" min="40" max="220" step="1" bind:value={auto.form.endBpm} placeholder="same"></label>
          <label>Tempo range
            <select bind:value={auto.form.tolerancePct}>{#each [2, 4, 6, 8, 12] as p (p)}<option value={p}>±{p}%</option>{/each}</select></label>
          <label class="check"><input type="checkbox" bind:checked={auto.form.halfDouble}> Half / double time counts</label>
        </fieldset>

        <fieldset>
          <legend>Harmonic mixing</legend>
          <span class="seg three" role="radiogroup" aria-label="Harmonic mixing">
            {#each [['off', 'Off'], ['prefer', 'Prefer'], ['strict', 'Strict']] as [v, label] (v)}
              <button type="button" role="radio" id={'harm-' + v} aria-checked={f.harmonic === v} onclick={() => (auto.form.harmonic = v as typeof f.harmonic)}>{label}</button>
            {/each}
          </span>
          <p class="hint">{f.harmonic === 'strict' ? 'Only same key, one step round the Camelot wheel, the relative key or +2.' : f.harmonic === 'prefer' ? 'Compatible keys score higher; a clash is possible when nothing else fits.' : 'Keys are ignored.'}</p>
        </fieldset>

        <fieldset class="tagset">
          <legend>Tags</legend>
          <label class="check"><input type="checkbox" id="auto-tags" bind:checked={auto.form.useTags}> Look at tags</label>
          {#if f.useTags}
            <div class="tagrow" id="auto-tag-list">
              {#each wanted as t (t)}<span class="tg" style:--c={tagColorOf(t)}>{t}<button type="button" aria-label={'Don’t use ' + t} onclick={() => dropWanted(t)}>×</button></span>{/each}
              {#if tagList.length}
                <select class="tsel" aria-label="Add a tag to look for" onchange={addWanted}>
                  <option value="">+ tag</option>
                  {#each tagList.filter(t => !wanted.includes(t.name)) as t (t.name)}<option value={t.name}>{t.name} ({t.tracks})</option>{/each}
                </select>
              {/if}
            </div>
            <p class="hint">{!wanted.length ? (tagList.length ? 'The chosen tracks have no tags: add tags to look for.' : 'No tags in the collection yet.') : f.tags ? 'Tracks with these tags score higher.' : 'From the starting and included tracks: tracks sharing them score higher.'}{#if f.tags} <button type="button" class="linkish" onclick={() => (auto.form.tags = null)}>use the chosen tracks’ tags</button>{/if}</p>
            {#if wanted.length}
              <span class="seg two" role="radiogroup" aria-label="How to use the tags">
                <button type="button" role="radio" id="tags-prefer" aria-checked={f.tagMode === 'prefer'} onclick={() => (auto.form.tagMode = 'prefer')}>Prefer these</button>
                <button type="button" role="radio" id="tags-only" aria-checked={f.tagMode === 'only'} onclick={() => (auto.form.tagMode = 'only')}>Only these</button>
              </span>
            {/if}
            <div class="tagrow">
              <span class="hint">Avoid:</span>
              {#each f.avoidTags as t (t)}<span class="tg avoid" style:--c={tagColorOf(t)}>{t}<button type="button" aria-label={'Stop avoiding ' + t} onclick={() => (auto.form.avoidTags = f.avoidTags.filter(x => x !== t))}>×</button></span>{/each}
              {#if tagList.length}
                <select class="tsel" aria-label="Avoid tracks with a tag" onchange={addAvoid}>
                  <option value="">+ tag</option>
                  {#each tagList.filter(t => !f.avoidTags.includes(t.name) && !wanted.includes(t.name)) as t (t.name)}<option value={t.name}>{t.name} ({t.tracks})</option>{/each}
                </select>
              {:else}<span class="hint">—</span>{/if}
            </div>
          {/if}
        </fieldset>

        <fieldset class="grid2">
          <legend>Choosing</legend>
          <label class="check"><input type="checkbox" id="auto-ratings" bind:checked={auto.form.useRatings}> Prefer the highest rated</label>
          <label>At least <select bind:value={auto.form.minRating}>{#each [0, 1, 2, 3, 4, 5] as n (n)}<option value={n}>{n ? n + '★' : 'any rating'}</option>{/each}</select></label>
          {#if seed?.genre}<label class="check"><input type="checkbox" bind:checked={auto.form.sameGenre}> Only {seed.genre}</label>{/if}
          <label class="check"><input type="checkbox" bind:checked={auto.form.unanalysed}> Allow tracks not analysed yet</label>
          <label class="wide">Surprise me <input type="range" min="0" max="1" step="0.05" bind:value={auto.form.randomness}><small>{f.randomness < 0.2 ? 'best fits' : f.randomness < 0.6 ? 'some variety' : 'adventurous'}</small></label>
        </fieldset>

        <fieldset>
          <legend>Avoid songs already in</legend>
          {#if playlists.length}
            <div class="avoid">
              {#each playlists as l (l.id)}
                <label class="check"><input type="checkbox" checked={f.avoidLists.includes(l.id)} onchange={e => (auto.form.avoidLists = e.currentTarget.checked ? [...f.avoidLists, l.id] : f.avoidLists.filter(x => x !== l.id))}> {lib.listPath(l)}</label>
              {/each}
            </div>
          {:else}<p class="hint">No playlists yet.</p>{/if}
          <p class="hint">Coming with shows and sessions: avoid what you played recently.</p>
        </fieldset>

        <button type="submit" class="btn" id="auto-go" use:focus>{auto.slots.length ? 'Generate again with these settings' : 'Generate playlist'}</button>
      </form>

      <section class="res" aria-label="Generated playlist">
        {#if auto.slots.length}
          <div class="res-head">
            <input id="auto-name" bind:value={auto.name} aria-label="Playlist name">
            <button type="button" class="btn-ghost" id="auto-again" onclick={() => auto.again()} title="Same settings, different choices">↻ Another</button>
            <button type="button" class="btn" id="auto-save" onclick={() => auto.save()}>Save playlist</button>
          </div>
          <p class="meta">{auto.slots.length} tracks · {fmtTime(total)}{#if auto.relaxed.length} · <span class="warnt">relaxed: {auto.relaxed.join(', ')}</span>{/if}
            <button type="button" class="linkish" id="auto-insights-toggle" aria-expanded={insightsOpen} onclick={() => (insightsOpen = !insightsOpen)}>{insightsOpen ? 'Hide insights' : 'Show insights'}</button></p>
          {#if insightsOpen}<PlaylistInsights ids={slotIds} compact />{/if}
          <ol class="list" id="auto-list">
            {#each auto.slots as s, i (s.id)}
              {@const t = tr(s.id)}
              {@const a = an(s.id)}
              {#if t}
                <li class:fixed={s.fixed}>
                  <span class="n mono">{i + 1}</span>
                  <button type="button" class="pbtn" aria-label="Play" onclick={() => { if (nowPlaying.trackId === s.id && player.url) player.toggle(); else void nowPlaying.play(s.id, auto.slots.map(x => x.id)); }}>
                    {#if nowPlaying.trackId === s.id && !player.paused}<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 1.5h3.2v11H2.5zM8.3 1.5h3.2v11H8.3z" fill="currentColor"/></svg>{:else}<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>{/if}
                  </button>
                  <span class="who"><b>{t.title || t.fileName}</b><small>{t.artist}{#if s.fixed} · <i>{s.id === f.seedId ? 'start' : 'included'}</i>{/if}</small></span>
                  <span class="wv"><WaveCell {t} order={slotIds} /></span>
                  <span class="mono bpm" title={s.bpmTarget ? 'Target ' + Math.round(s.bpmTarget) + ' BPM' : ''}>{a?.bpm ? Math.round(a.bpm) : '—'}</span>
                  <span class="mono key">{#if i > 0}<i class={'fit ' + fitCls(s.keyFit)} title={fitTitle(s.keyFit)}></i>{/if}{a?.key ? keyLabel(a.key, app.keyNotation) : '—'}</span>
                  <span class="stars" aria-label={(t.rating ?? 0) + ' stars'}>{'★'.repeat(Math.round(t.rating ?? 0))}</span>
                  <span class="acts">
                    <button type="button" title="Another track here" aria-label="Replace" onclick={() => auto.reroll(i)} disabled={s.fixed}>↻</button>
                    <button type="button" title="Remove" aria-label="Remove" onclick={() => auto.remove(i)}>×</button>
                  </span>
                </li>
              {/if}
            {/each}
          </ol>
        {:else}
          <div class="ap-empty" id="auto-empty">
            {#if auto.empty}<p class="warnt">{auto.empty}</p>{:else}<p>Set the shape on the left and press <b>Generate</b>.</p>{/if}
            <p class="hint">Tracks need BPM and key from the analysis to follow a tempo ramp and mix harmonically. Ratings: your stars first, then your DJ app’s.</p>
          </div>
        {/if}
      </section>
    </div>
  </div>
</div>

<style>
  /* The scrim scrolls when the dialog is taller than the window; auto margins centre it when it fits
     (a plain centred grid would push the top out of view). */
  .scrim { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--ground) 70%, transparent); backdrop-filter: blur(3px); display: grid; justify-items: center; align-items: start; overflow-y: auto; padding: 16px; }
  .dlg { margin-block: auto; width: min(1180px, 100%); height: min(860px, calc(100dvh - 32px)); display: grid; grid-template-rows: auto minmax(0, 1fr); background: var(--surface); border: 1px solid var(--line-2); border-radius: 12px; box-shadow: 0 24px 60px rgb(0 0 0 / .5); overflow: clip; }
  header { position: relative; padding: 18px 56px 12px 22px; border-bottom: 1px solid var(--line); display: grid; gap: 4px; }
  header h2 { font-size: 22px; }
  header p { color: var(--ink-2); font-size: 13.5px; }
  .x { position: absolute; right: 14px; top: 12px; background: none; border: 0; color: var(--muted); font-size: 24px; cursor: pointer; line-height: 1; }
  /* Flex, not grid: each column is held to the dialog's height and scrolls on its own.
     (Class names are prefixed: the global .cols of the analysis page set align-items: start.) */
  .ap-cols { display: flex; min-height: 0; overflow: hidden; }
  .opts { flex: 0 0 400px; min-height: 0; overflow-y: auto; padding: 14px 18px 18px 22px; display: grid; gap: 12px; align-content: start; border-right: 1px solid var(--line); }
  fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 6px; }
  legend { font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin-bottom: 4px; font-family: var(--font-sans); }
  .grid2 { grid-template-columns: 1fr 1fr; gap: 8px 12px; align-items: start; }
  .grid2 legend { grid-column: 1 / -1; }
  label { display: grid; gap: 3px; font-size: 12.5px; color: var(--ink-2); }
  label small { color: var(--muted); font-size: 11px; }
  label.check { display: flex; align-items: center; gap: 7px; }
  label.wide { grid-column: 1 / -1; }
  input:not([type="checkbox"]):not([type="range"]), select { background: var(--ground); border: 1px solid var(--line-2); border-radius: 5px; padding: 5px 8px; font-size: 13px; min-width: 0; }
  input[type="range"] { accent-color: var(--accent); }
  .hint { color: var(--muted); font-size: 12px; }
  .tchip { display: grid; grid-template-columns: 1fr auto; gap: 0 8px; background: var(--raised); border-radius: 6px; padding: 6px 8px; font-size: 13px; }
  .tchip b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tchip span { grid-column: 1; color: var(--muted); font-size: 12px; }
  .tchip button { grid-row: 1 / span 3; grid-column: 2; background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 16px; align-self: center; }
  .tchip.seed { border-left: 3px solid var(--accent); }
  .search { position: relative; display: grid; gap: 4px; }
  .linkish { justify-self: start; background: none; border: 0; padding: 0; color: var(--accent); font-size: 12px; cursor: pointer; text-decoration: underline; }
  .results { position: absolute; top: 34px; left: 0; right: 0; z-index: 2; list-style: none; margin: 0; padding: 4px; background: var(--raised); border: 1px solid var(--line-2); border-radius: 6px; box-shadow: 0 10px 24px rgb(0 0 0 / .35); }
  .results button { width: 100%; text-align: left; background: none; border: 0; padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 13px; }
  .results button:hover { background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .results span { color: var(--muted); }
  .seg.three { grid-template-columns: repeat(3, 1fr); }
  .seg.two { grid-template-columns: 1fr 1fr; }
  .tagrow { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .tg { display: inline-flex; align-items: center; gap: 2px; font-size: 12px; padding: 1px 2px 1px 8px; border-radius: 10px; background: color-mix(in srgb, var(--c) 22%, transparent); border: 1px solid color-mix(in srgb, var(--c) 55%, transparent); }
  .tg.avoid { background: none; text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--ink) 50%, transparent); }
  .tg button { background: none; border: 0; color: var(--ink-2); cursor: pointer; font-size: 13px; padding: 0 5px; }
  .tsel { font-size: 12px !important; padding: 2px 6px !important; border-radius: 10px !important; }
  .wv { min-width: 0; }
  .meta .linkish { margin-left: 8px; }
  .avoid { display: grid; gap: 3px; max-height: 110px; overflow-y: auto; }
  .opts > .btn { justify-self: stretch; justify-content: center; margin-top: 4px; }
  .res { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; min-height: 0; overflow: hidden; padding: 14px 22px 18px 18px; gap: 8px; }
  .res-head { display: flex; gap: 8px; align-items: center; }
  .res-head input { flex: 1; font-size: 15px; font-weight: 600; padding: 7px 10px; }
  .meta { color: var(--muted); font-size: 12.5px; }
  .warnt { color: var(--warn); }
  .list { flex: 1; list-style: none; margin: 0; padding: 0; overflow-y: auto; min-height: 0; display: grid; align-content: start; }
  .list li { display: grid; grid-template-columns: 26px 26px minmax(0, 1fr) minmax(90px, 170px) 42px 64px 64px 56px; gap: 8px; align-items: center; padding: 4px 6px; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); font-size: 13px; }
  .list li.fixed { background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .n, .bpm { color: var(--muted); font-size: 12px; }
  .mono { font-family: var(--font-mono); }
  .who { display: grid; min-width: 0; line-height: 1.3; }
  .who b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .who small { color: var(--muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who i { color: var(--accent); font-style: normal; }
  .key { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-2); }
  .fit { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .fit.good { background: var(--ok); } .fit.ok { background: var(--warn); } .fit.clash { background: var(--bad); } .fit.unk { background: var(--line-2); }
  .stars { color: var(--warn); font-size: 11px; letter-spacing: 1px; white-space: nowrap; overflow: hidden; }
  .acts { display: flex; gap: 4px; justify-content: flex-end; }
  .acts button { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); width: 24px; height: 22px; cursor: pointer; padding: 0; }
  .acts button:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
  .acts button:disabled { opacity: .3; cursor: default; }
  .pbtn { width: 24px; height: 24px; border-radius: 50%; border: 0; background: var(--raised); color: var(--ink-2); cursor: pointer; display: grid; place-items: center; padding: 0; }
  .pbtn:hover { background: var(--accent); color: var(--accent-ink); }
  .pbtn svg { width: 9px; height: 9px; }
  .ap-empty { display: grid; gap: 8px; place-content: center; text-align: center; color: var(--ink-2); padding: 40px 20px; }
  /* Narrow or short windows: one column, and the whole dialog scrolls with the page. */
  @media (max-width: 900px), (max-height: 600px) {
    .dlg { height: auto; }
    .ap-cols { flex-direction: column; overflow: visible; }
    .opts { flex: none; overflow: visible; border-right: 0; border-bottom: 1px solid var(--line); }
    .res, .list { overflow: visible; }
  }
  /* Phones: fewer columns per track, and the name / buttons wrap. */
  @media (max-width: 640px) {
    .res-head { flex-wrap: wrap; }
    .res-head input { flex: 1 1 100%; }
    .res { padding: 12px; }
    .list li { grid-template-columns: 20px 24px minmax(0, 1fr) 56px 46px 52px; gap: 6px; padding: 4px 2px; }
    .list li .bpm, .list li .stars { display: none; }
  }
</style>
