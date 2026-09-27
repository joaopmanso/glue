<script lang="ts">
  /* A collection, a playlist, a tag, a folder… or the selected songs at a glance (the user's list,
     2026-09-27): core/library/stats over the songs, drawn as tiles and plain bars. */
  import { lib } from '../../lib/library.svelte';
  import { view, tracksFor, formatOf } from '../../lib/view.svelte';
  import { app } from '../../lib/app.svelte';
  import { bpmShown, fmtBpm } from '../../lib/bpm';
  import { stats, type StatTrack } from '../../core/library/stats';
  import { tagsOf } from '../../core/library/tagging';
  import { keyLabel } from '../../core/audio/keys';
  import { fmtBytes } from '../../core/format';
  import type { Track } from '../../store/types';

  const want = view.statsFor!;
  const s = lib.store;
  const tracks: Track[] = !s ? [] : want.ids ? want.ids.map(id => s.tracks.get(id)).filter((t): t is Track => !!t) : tracksFor(want.sel ?? { kind: 'all' });
  const dj = lib.djIndex();
  const facts: StatTrack[] = tracks.map(t => {
    const a0 = s?.analysis.get(t.id) ?? null, a = a0 && !a0.error ? a0 : null, d = dj.get(t.id) ?? null;
    return {
      duration: t.duration, size: t.size, artist: t.artist, album: t.album, label: t.label, genre: t.genre, year: t.year,
      format: formatOf(t), lossless: t.format?.lossless ?? null, grade: a?.grade ?? null,
      bpm: bpmShown(t, a, d?.bpm ?? null), key: a?.key ? keyLabel(a.key, app.keyNotation) : d?.key ?? null,
      addedAt: t.addedAt, rating: t.rating ?? d?.rating ?? null, tags: tagsOf(t), linked: t.status === 'linked',
    };
  });
  const st = stats(facts);
  const whole = !want.ids && (!want.sel || want.sel.kind === 'all');
  const lists = s ? [...s.lists.values()].filter(l => !l.origin) : [];

  const pct = (n: number) => st.count ? Math.round(n / st.count * 100) + '%' : '—';
  function playtime(sec: number) {
    const m = Math.round(sec / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    return d >= 2 ? d + ' d ' + (h % 24) + ' h' : h ? h + ' h ' + (m % 60) + ' min' : m ? m + ' min' : Math.round(sec) + ' s';
  }
  const GRADES = [['ok', 'Good'], ['info', 'Info'], ['warn', 'Caution'], ['bad', 'Suspect'], ['none', 'Not analysed']] as const;
  const maxOf = (xs: [string, number][]) => Math.max(1, ...xs.map(x => x[1]));
  const bpmMax = Math.max(1, ...st.bpmSteps.map(b => b.n));
  const addedMax = maxOf(st.added), yearsMax = maxOf(st.years);

  function close() { view.statsFor = null; }
  const focus = (el: HTMLElement) => { el.focus({ preventScroll: true }); };
</script>

{#snippet bars(title: string, xs: [string, number][], id: string)}
  <div class="blist" id={id}>
    <h4>{title}</h4>
    {#each xs as [name, n] (name)}
      {@const m = maxOf(xs)}
      <div class="brow" title={name + ': ' + n}><span class="bname">{name}</span><span class="bar"><i style:width={n / m * 100 + '%'}></i></span><span class="bn">{n}</span></div>
    {:else}<p class="none">None yet</p>{/each}
  </div>
{/snippet}

<div class="scrim" role="presentation" onpointerdown={e => { if (e.target === e.currentTarget) close(); }}>
  <div class="dlg" id="stats-dialog" role="dialog" aria-modal="true" aria-labelledby="stats-h" tabindex="-1" use:focus
    onkeydown={e => { if (e.key === 'Escape') { e.preventDefault(); close(); } }}>
    <header>
      <h2 id="stats-h">Stats <span>· {want.title}</span></h2>
      <button type="button" class="x" aria-label="Close" onclick={close}>×</button>
    </header>

    <div class="tiles">
      <div class="tile" id="stat-songs"><b>{st.count.toLocaleString()}</b><span>song{st.count === 1 ? '' : 's'}</span></div>
      <div class="tile"><b>{playtime(st.total)}</b><span>playtime{st.unknownLength ? ' (' + st.unknownLength + ' unknown)' : ''}</span></div>
      <div class="tile"><b>{fmtBytes(st.size)}</b><span>on disk</span></div>
      <div class="tile"><b>{st.artists.toLocaleString()}</b><span>artists</span></div>
      <div class="tile"><b>{st.albums.toLocaleString()}</b><span>albums</span></div>
      <div class="tile"><b>{st.labels.toLocaleString()}</b><span>labels</span></div>
      <div class="tile"><b>{st.genres.toLocaleString()}</b><span>genres</span></div>
      {#if whole}<div class="tile"><b>{lists.filter(l => l.kind === 'playlist').length}</b><span>playlists in {lists.filter(l => l.kind === 'folder').length} folders</span></div>{/if}
    </div>

    <section>
      <h3>Quality</h3>
      <div class="stack" id="stat-grades" role="img" aria-label={GRADES.map(([k, n]) => n + ' ' + st.grades[k]).join(', ')}>
        {#each GRADES as [k] (k)}{#if st.grades[k]}<i data-grade={k} style:flex-grow={st.grades[k]}></i>{/if}{/each}
      </div>
      <div class="legend">
        {#each GRADES as [k, name] (k)}<span data-grade={k}><i></i>{name} {st.grades[k]}</span>{/each}
        <span class="sep">Lossless {pct(st.lossless)}</span>
      </div>
      <div class="cols">{@render bars('Formats', st.formats, 'stat-formats')}</div>
    </section>

    <section class="two">
      <div>
        <h3>Tempo</h3>
        {#if st.bpm}
          <div class="hist" id="stat-bpm">
            {#each st.bpmSteps as b (b.from)}<span class="hb" title={b.from + '–' + (b.from + 5) + ' BPM: ' + b.n}><i style:height={b.n / bpmMax * 100 + '%'}></i></span>{/each}
          </div>
          <p class="axis"><span>{st.bpmSteps[0].from}</span><span>{st.bpmSteps[st.bpmSteps.length - 1].from + 5} BPM</span></p>
          <p class="fine">From {fmtBpm(st.bpm.min)} to {fmtBpm(st.bpm.max)}; half of them under {fmtBpm(st.bpm.median)}.</p>
        {:else}<p class="none">No tempo yet: songs get one when they're analysed.</p>{/if}
      </div>
      <div>{@render bars('Keys', st.keys.slice(0, 12), 'stat-keys')}</div>
    </section>

    <section class="three">
      {@render bars('Genres', st.topGenres, 'stat-genres')}
      {@render bars('Artists', st.topArtists, 'stat-artists')}
      {@render bars('Labels', st.topLabels, 'stat-labels')}
    </section>

    <section class="two">
      <div>
        <h3>Released</h3>
        {#if st.years.length}
          <div class="hist">{#each st.years as [y, n] (y)}<span class="hb" title={y + ': ' + n}><i style:height={n / yearsMax * 100 + '%'}></i></span>{/each}</div>
          <p class="axis"><span>{st.years[0][0]}</span><span>{st.years[st.years.length - 1][0]}</span></p>
          <p class="fine">{st.decades.map(([d, n]) => d + ' ' + n).join(' · ')}</p>
        {:else}<p class="none">No years in these songs' info.</p>{/if}
      </div>
      <div>
        <h3>Added to GLUE</h3>
        {#if st.added.length}
          <div class="hist" id="stat-added">{#each st.added as [m, n] (m)}<span class="hb" title={m + ': ' + n}><i style:height={n / addedMax * 100 + '%'}></i></span>{/each}</div>
          <p class="axis"><span>{st.added[0][0]}</span><span>{st.added[st.added.length - 1][0]}</span></p>
        {/if}
      </div>
    </section>

    <p class="foot" id="stat-foot">Rated {st.rated} ({pct(st.rated)}) · tagged {st.tagged} ({pct(st.tagged)}){st.noFile ? ' · ' + st.noFile + ' without a file here' : ''}</p>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--ground) 70%, transparent); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; }
  .dlg:focus { outline: none; }
  .dlg { width: min(880px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; background: var(--surface); border: 1px solid var(--line-2); border-radius: 12px; padding: 18px 22px 20px; display: grid; gap: 16px; box-shadow: 0 24px 60px rgb(0 0 0 / .5); }
  header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  h2 { font-size: 20px; margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  h2 span { color: var(--ink-2); font-weight: 500; }
  .x { background: none; border: 0; color: var(--muted); font-size: 22px; cursor: pointer; line-height: 1; }
  h3 { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0 0 8px; }
  h4 { font-size: 12px; color: var(--ink-2); margin: 0 0 6px; font-weight: 600; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
  .tile { background: var(--raised); border: 1px solid var(--line); border-radius: 8px; padding: 9px 11px; display: grid; gap: 1px; }
  .tile b { font-size: 18px; font-variant-numeric: tabular-nums; }
  .tile span { font-size: 11.5px; color: var(--muted); }
  section { display: grid; gap: 8px; }
  .two { grid-template-columns: 1fr 1fr; gap: 20px; }
  .three { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
  .stack { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--raised); }
  .stack i { display: block; min-width: 3px; }
  [data-grade="ok"] { --g: var(--ok); } [data-grade="warn"] { --g: var(--warn); } [data-grade="bad"] { --g: var(--bad); }
  [data-grade="info"] { --g: var(--accent); } [data-grade="none"] { --g: var(--line-2); }
  .stack i { background: var(--g); }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--ink-2); }
  .legend span { display: inline-flex; align-items: center; gap: 5px; }
  .legend i { width: 9px; height: 9px; border-radius: 2px; background: var(--g); }
  .legend .sep { margin-left: auto; color: var(--ink); }
  .cols { display: grid; grid-template-columns: minmax(0, 1fr); max-width: 420px; }
  .blist { display: grid; gap: 3px; min-width: 0; align-content: start; }
  .brow { display: grid; grid-template-columns: minmax(60px, 1.1fr) 1fr 36px; gap: 8px; align-items: center; font-size: 12.5px; }
  .bname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-2); }
  .bar { height: 8px; background: var(--raised); border-radius: 4px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); border-radius: 4px; }
  .bn { text-align: right; font: 12px var(--font-mono); color: var(--muted); }
  .hist { display: flex; align-items: flex-end; gap: 2px; height: 76px; border-bottom: 1px solid var(--line-2); }
  .hb { flex: 1 1 0; max-width: 28px; height: 100%; display: flex; align-items: flex-end; min-width: 2px; }
  .hb i { display: block; width: 100%; background: var(--accent); border-radius: 2px 2px 0 0; min-height: 1px; }
  .hb:hover i { background: var(--ink); }
  .axis { display: flex; justify-content: space-between; margin: 3px 0 0; font: 11px var(--font-mono); color: var(--muted); }
  .fine, .none { font-size: 12.5px; color: var(--muted); margin: 4px 0 0; }
  .foot { margin: 0; padding-top: 10px; border-top: 1px solid var(--line); font-size: 12.5px; color: var(--ink-2); }
  @media (max-width: 720px) { .two, .three { grid-template-columns: minmax(0, 1fr); } }
</style>
