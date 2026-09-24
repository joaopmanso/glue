<script lang="ts">
  import { auto } from '../../lib/auto.svelte';
  import { lib } from '../../lib/library.svelte';
  import { app } from '../../lib/app.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { player } from '../../lib/player.svelte';
  import { keyLabel } from '../../core/audio/keys';
  import { fmtTime } from '../../core/format';
  import type { Track } from '../../store/types';

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
    if (pickFor === 'seed') { const keep = { include: f.include, avoidLists: f.avoidLists, count: f.count }; auto.form = { ...auto.defaults(t.id), ...keep }; }
    else if (!f.include.includes(t.id) && t.id !== f.seedId) auto.form.include = [...f.include, t.id];
    q = '';
  }
  const tr = (id: string) => lib.store?.tracks.get(id);
  const an = (id: string) => lib.store?.analysis.get(id);
  const fitCls = (k: number | null) => k == null ? 'unk' : k >= 0.85 ? 'good' : k >= 0.5 ? 'ok' : 'clash';
  const fitTitle = (k: number | null) => k == null ? 'Key unknown' : k === 1 ? 'Same key' : k >= 0.85 ? 'Harmonic: next to it on the wheel' : k >= 0.5 ? 'Energy boost (+2)' : 'Key clash';
  const total = $derived(auto.slots.reduce((n, s) => n + (tr(s.id)?.duration ?? 0), 0));
  const focus = (el: HTMLElement) => el.focus();
</script>

<svelte:window onkeydown={e => { if (e.key === 'Escape') auto.close(); }} />

<div class="scrim" role="presentation" onpointerdown={e => { if (e.target === e.currentTarget) auto.close(); }}>
  <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="auto-h" id="auto-dialog">
    <header>
      <h2 id="auto-h">Build a playlist</h2>
      <p>MCO picks tracks from your collection that fit the tempo, mix harmonically and are rated highest, with a little chance so every run is different.</p>
      <button type="button" class="x" aria-label="Close" onclick={() => auto.close()}>×</button>
    </header>

    <div class="cols">
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
          <p class="meta">{auto.slots.length} tracks · {fmtTime(total)}{#if auto.relaxed.length} · <span class="warnt">relaxed: {auto.relaxed.join(', ')}</span>{/if}</p>
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
          <div class="empty">
            <p>Set the shape on the left and press <b>Generate</b>.</p>
            <p class="hint">Tracks need BPM and key from the analysis to follow a tempo ramp and mix harmonically. Ratings: your stars first, then your DJ app’s.</p>
          </div>
        {/if}
      </section>
    </div>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--ground) 70%, transparent); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; }
  .dlg { width: min(1180px, 100%); max-height: calc(100vh - 32px); display: grid; grid-template-rows: auto 1fr; background: var(--surface); border: 1px solid var(--line-2); border-radius: 12px; box-shadow: 0 24px 60px rgb(0 0 0 / .5); overflow: hidden; }
  header { position: relative; padding: 18px 56px 12px 22px; border-bottom: 1px solid var(--line); display: grid; gap: 4px; }
  header h2 { font-size: 22px; }
  header p { color: var(--ink-2); font-size: 13.5px; }
  .x { position: absolute; right: 14px; top: 12px; background: none; border: 0; color: var(--muted); font-size: 24px; cursor: pointer; line-height: 1; }
  .cols { display: grid; grid-template-columns: 400px 1fr; min-height: 0; }
  .opts { overflow-y: auto; padding: 14px 18px 18px 22px; display: grid; gap: 12px; align-content: start; border-right: 1px solid var(--line); }
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
  .avoid { display: grid; gap: 3px; max-height: 110px; overflow-y: auto; }
  .opts > .btn { justify-self: stretch; justify-content: center; margin-top: 4px; }
  .res { display: grid; grid-template-rows: auto auto 1fr; min-height: 0; padding: 14px 22px 18px 18px; gap: 8px; }
  .res-head { display: flex; gap: 8px; align-items: center; }
  .res-head input { flex: 1; font-size: 15px; font-weight: 600; padding: 7px 10px; }
  .meta { color: var(--muted); font-size: 12.5px; }
  .warnt { color: var(--warn); }
  .list { list-style: none; margin: 0; padding: 0; overflow-y: auto; min-height: 0; display: grid; align-content: start; }
  .list li { display: grid; grid-template-columns: 26px 26px minmax(0, 1fr) 42px 64px 64px 56px; gap: 8px; align-items: center; padding: 4px 6px; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); font-size: 13px; }
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
  .empty { display: grid; gap: 8px; place-content: center; text-align: center; color: var(--ink-2); padding: 40px 20px; }
  @media (max-width: 900px) { .cols { grid-template-columns: 1fr; overflow-y: auto; } .opts { border-right: 0; border-bottom: 1px solid var(--line); } }
</style>
