<script lang="ts">
  /* A playlist at a glance: length, tempo flow, keys and mixes, quality, and a Venn diagram of how
     its tags overlap (pick up to three). Used under a playlist's header and in the playlist builder. */
  import { lib } from '../../lib/library.svelte';
  import { app } from '../../lib/app.svelte';
  import { view } from '../../lib/view.svelte';
  import { tagColorOf } from '../../lib/tags.svelte';
  import { insights, tagOverlap, type InsightTrack } from '../../core/library/insights';
  import { tagsOf } from '../../core/library/tagging';
  import { keyLabel } from '../../core/audio/keys';
  import { fmtTime } from '../../core/format';

  let { ids, listId = null, compact = false }: { ids: string[]; listId?: string | null; compact?: boolean } = $props();

  const facts = $derived.by((): InsightTrack[] => {
    void lib.version;
    const s = lib.store;
    if (!s) return [];
    const djBpm = new Map<string, number>();
    for (const src of s.sources.values()) for (const st of src.tracks) if (st.bpm && !djBpm.has(st.trackId)) djBpm.set(st.trackId, st.bpm);
    return ids.map(id => s.tracks.get(id)).filter(t => !!t).map(t => {
      const a = s.analysis.get(t.id), ok = a && !a.error;
      return { duration: t.duration, bpm: t.prep?.bpm || (ok && a.bpm) || djBpm.get(t.id) || null, key: ok && a.key ? { tonic: a.key.tonic, mode: a.key.mode } : null, tags: tagsOf(t), grade: ok ? a.grade : null };
    });
  });
  const ins = $derived(insights(facts, k => keyLabel(k, app.keyNotation)));
  const list = $derived.by(() => { void lib.version; return listId ? lib.store?.lists.get(listId) ?? null : null; });

  // The Venn's tags: chosen by clicking, else the three most used.
  let picked = $state<string[]>([]);
  const available = $derived(ins.tags.map(([t]) => t));
  const sets = $derived.by(() => {
    const keep = picked.filter(p => available.some(a => a.toLowerCase() === p.toLowerCase()));
    return (keep.length ? keep : available.slice(0, 3)).slice(0, 3);
  });
  const ov = $derived(tagOverlap(facts, sets));
  function pick(t: string) {
    const cur = picked.length ? picked : sets;
    picked = cur.some(x => x.toLowerCase() === t.toLowerCase()) ? cur.filter(x => x.toLowerCase() !== t.toLowerCase()) : [...cur, t].slice(-3);
    if (!picked.length) picked = [];
  }

  // Tempo flow: BPM by position.
  const FW = 260;
  const FH = $derived(compact ? 44 : 56);
  const flow = $derived.by(() => {
    const b = ins.bpm, pts = ins.flow;
    if (!b || pts.length < 2) return null;
    const lo = Math.floor(b.min - 2), hi = Math.ceil(b.max + 2), x = (i: number) => 4 + i * (FW - 8) / (pts.length - 1), y = (v: number) => FH - 4 - (v - lo) / (hi - lo) * (FH - 8);
    const segs: string[] = [];
    let cur: string[] = [];
    pts.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur.join(' ')); cur = []; } else cur.push(x(i).toFixed(1) + ',' + y(v).toFixed(1)); });
    if (cur.length) segs.push(cur.join(' '));
    return { segs, dots: pts.map((v, i) => v == null ? null : { x: x(i), y: y(v), v }).filter(d => !!d) };
  });

  // Venn layouts for one, two or three tags (equal circles; the numbers are the counts).
  const V3 = { c: [[82, 62], [122, 62], [102, 97]], r: 44, lab: { 1: [62, 52], 2: [142, 52], 4: [102, 124], 3: [102, 46], 5: [80, 88], 6: [124, 88], 7: [102, 74] } as Record<number, number[]> };
  const V2 = { c: [[80, 76], [124, 76]], r: 48, lab: { 1: [60, 78], 2: [144, 78], 3: [102, 78] } as Record<number, number[]> };
  const V1 = { c: [[102, 76]], r: 50, lab: { 1: [102, 80] } as Record<number, number[]> };
  const layout = $derived(sets.length === 3 ? V3 : sets.length === 2 ? V2 : V1);
  const gradeBar = $derived([['ok', 'Genuine'], ['info', 'Other'], ['warn', 'Caution'], ['bad', 'Lossy / fake'], ['none', 'Not analysed']] as const);
</script>

<section class="ins" class:compact aria-label="Playlist insights" id={compact ? 'auto-insights' : 'playlist-insights'}>
  <div class="blk sum">
    <span class="label">Length</span>
    <b class="big">{fmtTime(ins.total)}</b>
    <small>{ins.count} track{ins.count === 1 ? '' : 's'}{#if ins.count && ins.total} · avg {fmtTime(ins.total / Math.max(1, ins.count - ins.unknownLength))}{/if}</small>
    {#if ins.shortest != null && ins.longest != null && ins.count > 1}<small>{fmtTime(ins.shortest)} – {fmtTime(ins.longest)}</small>{/if}
    {#if list}
      <div class="ltags">
        {#each list.tags ?? [] as t (t)}<span class="tg" style:--c={tagColorOf(t)}>{t}</span>{/each}
        <button type="button" class="tedit" data-tags-open id="list-tags" onclick={e => view.editTags(e.currentTarget, { listId: list.id })}>{list.tags?.length ? 'Edit tags' : '+ Playlist tags'}</button>
      </div>
    {/if}
  </div>

  <div class="blk">
    <span class="label">Tempo {#if ins.bpm}<small>{Math.round(ins.bpm.min)}–{Math.round(ins.bpm.max)} BPM · avg {Math.round(ins.bpm.avg)}</small>{/if}</span>
    {#if flow}
      <svg class="flow" viewBox={'0 0 ' + FW + ' ' + FH} preserveAspectRatio="none" role="img" aria-label="BPM through the playlist">
        {#each flow.segs as p, i (i)}<polyline points={p} />{/each}
        {#each flow.dots as d, i (i)}<circle cx={d.x} cy={d.y} r="2"><title>{Math.round(d.v)} BPM</title></circle>{/each}
      </svg>
    {:else}<small class="none">{ins.bpm ? Math.round(ins.bpm.avg) + ' BPM' : 'No tempo yet'}</small>{/if}
  </div>

  <div class="blk">
    <span class="label">Keys {#if ins.count > 1}<small>{ins.mixes.good + ins.mixes.ok} of {ins.count - 1} mixes harmonic</small>{/if}</span>
    <div class="keys">
      {#each ins.keys.slice(0, compact ? 6 : 8) as [k, n] (k)}<span class="kc">{k}<i>{n}</i></span>{:else}<small class="none">No keys yet</small>{/each}
    </div>
    {#if ins.count > 1}
      <div class="bar" title={'Harmonic: ' + ins.mixes.good + ' · close: ' + ins.mixes.ok + ' · clash: ' + ins.mixes.clash + ' · unknown: ' + ins.mixes.unknown}>
        {#each [['good', ins.mixes.good], ['ok', ins.mixes.ok], ['clash', ins.mixes.clash], ['unk', ins.mixes.unknown]] as [c, n] (c)}{#if n}<span class={'m-' + c} style:flex={n}></span>{/if}{/each}
      </div>
    {/if}
  </div>

  {#if !compact}
    <div class="blk">
      <span class="label">Quality</span>
      <div class="bar tall">
        {#each gradeBar as [g, name] (g)}{#if ins.grades[g]}<span class={'g-' + g} style:flex={ins.grades[g]} title={name + ': ' + ins.grades[g]}></span>{/if}{/each}
      </div>
      <small>{ins.grades.ok} genuine{#if ins.grades.warn} · {ins.grades.warn} caution{/if}{#if ins.grades.bad} · {ins.grades.bad} lossy or fake{/if}{#if ins.grades.none} · {ins.grades.none} not analysed{/if}</small>
    </div>
  {/if}

  <div class="blk venn-blk">
    <span class="label">Tags {#if ins.tags.length}<small>{ins.untagged ? ins.untagged + ' untagged' : 'all tagged'}</small>{/if}</span>
    {#if sets.length}
      <div class="venn-wrap">
        <svg class="venn" viewBox="0 0 204 150" role="img" aria-label={'How the tags ' + sets.join(', ') + ' overlap'}>
          {#each sets as t, i (t)}
            <circle cx={layout.c[i][0]} cy={layout.c[i][1]} r={layout.r} style:--c={tagColorOf(t)} />
          {/each}
          {#each Object.entries(layout.lab) as [m, [x, y]] (m)}
            <text {x} {y} class:zero={!ov.regions[+m]} data-region={m}>{ov.regions[+m]}</text>
          {/each}
        </svg>
        <div class="vlegend">
          {#each ins.tags.slice(0, compact ? 6 : 10) as [t, n] (t)}
            {@const on = sets.some(s => s.toLowerCase() === t.toLowerCase())}
            <button type="button" class="vt" class:on style:--c={tagColorOf(t)} title={on ? 'Remove from the diagram' : 'Show in the diagram (up to three)'} onclick={() => pick(t)}>{t}<i>{n}</i></button>
          {/each}
        </div>
      </div>
    {:else}<small class="none">No tags on these tracks yet.</small>{/if}
  </div>
</section>

<style>
  .ins { display: flex; gap: 10px; flex-wrap: wrap; border: 1px solid var(--line); background: var(--surface); border-radius: var(--radius); padding: 10px 12px; }
  .blk { display: grid; gap: 4px; align-content: start; min-width: 150px; flex: 1 1 150px; }
  .blk + .blk { border-left: 1px solid var(--line); padding-left: 12px; }
  .label { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .label small { text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--ink-2); font-size: 11.5px; }
  .big { font-family: var(--font-mono); font-size: 20px; font-variant-numeric: tabular-nums; }
  small { color: var(--muted); font-size: 11.5px; }
  .none { color: var(--muted); }
  .flow { width: 100%; height: 56px; }
  .compact .flow { height: 44px; }
  .flow polyline { fill: none; stroke: var(--accent); stroke-width: 1.6; vector-effect: non-scaling-stroke; }
  .flow circle { fill: var(--accent); }
  .keys { display: flex; flex-wrap: wrap; gap: 4px; }
  .kc { font-family: var(--font-mono); font-size: 11.5px; background: var(--raised); border-radius: 3px; padding: 1px 5px; color: var(--ink); }
  .kc i { font-style: normal; color: var(--muted); margin-left: 4px; }
  .bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: var(--line); gap: 1px; }
  .bar.tall { height: 10px; }
  .m-good, .g-ok { background: var(--ok); } .m-ok, .g-warn { background: var(--warn); } .m-clash, .g-bad { background: var(--bad); } .m-unk, .g-none { background: var(--line-2); } .g-info { background: var(--muted); }
  .venn-blk { flex: 2 1 300px; }
  .venn-wrap { display: flex; gap: 10px; align-items: center; }
  .venn { width: 150px; height: 110px; flex: none; }
  .compact .venn { width: 124px; height: 92px; }
  .venn circle { fill: color-mix(in srgb, var(--c) 28%, transparent); stroke: var(--c); stroke-width: 1.5; mix-blend-mode: screen; }
  :global([data-mode="light"]) .venn circle { mix-blend-mode: multiply; }
  .venn text { font: 600 12px var(--font-mono); fill: var(--ink); text-anchor: middle; dominant-baseline: middle; }
  .venn text.zero { fill: var(--muted); font-weight: 400; }
  .vlegend { display: flex; flex-wrap: wrap; gap: 4px; align-content: flex-start; min-width: 0; }
  .vt { font-size: 11.5px; border-radius: 9px; padding: 1px 7px; background: none; border: 1px solid color-mix(in srgb, var(--c) 45%, transparent); color: var(--ink-2); cursor: pointer; }
  .vt.on { background: color-mix(in srgb, var(--c) 28%, transparent); color: var(--ink); border-color: var(--c); }
  .vt i { font-style: normal; color: var(--muted); margin-left: 4px; font-family: var(--font-mono); font-size: 10.5px; }
  .ltags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; align-items: center; }
  .tg { font-size: 11px; line-height: 16px; padding: 0 6px; border-radius: 8px; background: color-mix(in srgb, var(--c) 20%, transparent); border: 1px solid color-mix(in srgb, var(--c) 50%, transparent); }
  .tedit { background: none; border: 1px dashed var(--line-2); border-radius: 8px; color: var(--ink-2); font-size: 11px; padding: 0 7px; line-height: 16px; cursor: pointer; }
  .tedit:hover { border-color: var(--accent); color: var(--accent); }
  @media (max-width: 700px) { .blk + .blk { border-left: 0; padding-left: 0; } }
</style>
