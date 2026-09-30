<script lang="ts">
  import { asShown } from '../../core/library/summary';
  import { lib } from '../../lib/library.svelte';
  import { dupes, type DupGroup } from '../../lib/dupes.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { player } from '../../lib/player.svelte';
  import { router, trackHref } from '../../lib/route.svelte';
  import { app } from '../../lib/app.svelte';
  import { keyLabel } from '../../core/audio/keys';
  import { fmtTime } from '../../core/format';
  import type { Track } from '../../store/types';
  import { copyScore } from '../../lib/dupes.svelte';
  import { deviceColor } from '../../lib/devices';
  import { view } from '../../lib/view.svelte';
  import { tick } from 'svelte';
  import { menu } from '../../lib/menu.svelte';
  import { trackMenu } from '../../lib/trackMenu';
  import { bpmShown, fmtBpm } from '../../lib/bpm';
  import { cleanUp, cleanUpPlan } from '../../lib/dupes.svelte';
  import { homeMode } from '../../platform';
  import { APP_NAMES } from '../../lib/view.svelte';
  import { fmtBytes } from '../../core/format';

  const pending = $derived.by(() => { void lib.version; return lib.pendingCount(); });
  // Which groups show (the user, 2026-09-30: 4,000 duplicates can't be gone through one by one): by how they were found,
  // and how sure GLUE is. Remembered for the visit.
  const HOW: [DupGroup['how'] | 'all', string][] = [['all', 'All'], ['sound', 'Same recording'], ['hand', 'Marked by you'], ['confirmed', 'Confirmed by you'], ['name', 'Probable']];
  let how = $state<DupGroup['how'] | 'all'>('all'), atLeast = $state(0);
  const shown = (g: DupGroup) => (how === 'all' || g.how === how) && g.sure >= atLeast;
  const same = $derived(dupes.groups.filter(g => g.kind === 'same' && shown(g)));
  const probable = $derived(dupes.groups.filter(g => g.kind === 'probable' && shown(g)));
  const countOf = (h: DupGroup['how'] | 'all') => dupes.groups.filter(g => (h === 'all' || g.how === h) && g.sure >= atLeast).length;

  function where(t: Track) {
    // Another computer's copy (a shared collection): that computer, and where the file is there.
    if (t.remote) return t.remote.name + ' · ' + (t.remote.where ?? t.fileName);
    if (t.fileKey) return t.fileName;
    const r = lib.rootState(t.rootId);
    return t.relPath ? (r?.root.name ?? '') + '/' + t.relPath : t.importPath ?? t.fileName;
  }
  function fmt(t: Track) {
    const f = t.format;
    if (!f) return t.fileName.split('.').pop()?.toUpperCase() ?? '';
    return f.lossless ? f.codec.replace(/^PCM.*/, f.container.replace(/ .*/, '')) + ' ' + (f.bits || '') + '/' + +(f.sampleRate / 1000).toFixed(1) : f.codec + ' ' + (f.bitrate || '') + ' kbps';
  }
  function play(id: string, g: DupGroup) {
    if (nowPlaying.trackId === id && player.url) nowPlaying.resumeFrom(id, g.ids); else void nowPlaying.play(id, g.ids);
  }
  function keep(g: DupGroup, id: string) {
    const n = dupes.useCopy(g, id), t = lib.store?.tracks.get(id);
    lib.notice = 'The best copy is ' + (t?.title || t?.fileName) + ' now' + (n ? ': ' + n + ' playlist' + (n === 1 ? '' : 's') + ' use it.' : '.');
  }
  // ─── Cleaning up (ADR 0070): with GLUE Home, each group keeps its best copy; the others are put aside
  // in GLUE Home's duplicates folder, or recycled. One group, or several ticked at once. ───
  const canClean = $derived.by(() => { void lib.version; return homeMode(); });
  let picked = $state<Set<string>>(new Set());
  const pickedGroups = $derived(same.filter(g => picked.has(g.key)));
  function pick(g: DupGroup, on: boolean) { const n = new Set(picked); if (on) n.add(g.key); else n.delete(g.key); picked = n; }
  let ask = $state<{ mode: 'move' | 'trash'; groups: DupGroup[] } | null>(null);
  /** Groups whose copies differ in a version word, length or artist: left out of a bulk removal unless included. */
  let includeDoubtful = $state(false);
  const doubtful = $derived(ask ? ask.groups.filter(g => g.concerns.length) : []);
  const planGroups = $derived(ask ? (includeDoubtful || ask.groups.length === 1 ? ask.groups : ask.groups.filter(g => !g.concerns.length)) : []);
  const plan = $derived.by(() => { void lib.version; return ask ? cleanUpPlan(planGroups) : []; });
  const planBytes = $derived(plan.reduce((a, x) => a + (x.t.size ?? 0), 0));
  /** DJ libraries that still list a copy that goes (they'll show it missing there). */
  const planDj = $derived.by(() => {
    const s = lib.store, apps = new Set<string>();
    for (const x of plan) for (const id of x.t.sources) { const a = s?.sources.get(id)?.app; if (a) apps.add(APP_NAMES[a] ?? a); }
    return [...apps];
  });
  let cleaning = $state(false);
  async function doClean() {
    if (!ask) return;
    const mode = ask.mode, gs = planGroups;
    cleaning = true;
    try {
      const r = await cleanUp(gs, mode);
      const what = r.done + ' file' + (r.done === 1 ? '' : 's') + ' (' + fmtBytes(r.bytes) + ')';
      lib.notice = (mode === 'move' ? 'Moved ' + what + ' to GLUE Home’s duplicates folder.' : 'Moved ' + what + ' to the Recycle Bin.') +
        (r.failed.length ? ' ' + r.failed.length + ' couldn’t go: ' + r.failed.slice(0, 3).map(f => f.name + ' (' + f.error + ')').join('; ') + (r.failed.length > 3 ? '…' : '') : '');
      picked = new Set([...picked].filter(k => dupes.groups.some(g => g.key === k)));
      ask = null;
    } catch (e) { lib.notice = (e as Error).message; }
    finally { cleaning = false; }
  }

  /** Similarity 1 − 2·(bit error rate): unrelated audio is ~0, identical ~1; matches start at 0.4. */
  const strength = (sim: number) => sim >= 0.8 ? 'Near-identical audio' : sim >= 0.6 ? 'Strong match by sound' : 'Matched by sound';
  const listsOf = (id: string) => { void lib.version; return lib.listsContaining(id).filter(l => l.kind === 'playlist'); };

  // Drawn a part at a time (a big collection has hundreds of groups, and drawing them all at once
  // held the page for half a second): the first ones, then more as the end comes near.
  const STEP = 60;
  let limit = $state(40), more = $state<HTMLElement>();
  const sameShown = $derived(same.slice(0, limit));
  const probableShown = $derived(probable.slice(0, Math.max(0, limit - same.length)));
  const hidden = $derived(same.length + probable.length - limit);
  $effect(() => {
    const el = more;
    void limit;   // observed again after each step: still in view means more at once
    if (!el) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) limit += STEP; }, { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  });

  // Opened from a track's "2×": its group in the middle of the view, the track highlighted a moment.
  let focused = $state<string | null>(null), box: HTMLElement;
  $effect(() => {
    const id = view.focusDupe;
    if (!id) return;
    view.focusDupe = null;
    focused = id;
    // Its group drawn first, if it's further down than what's shown.
    const at = [...same, ...probable].findIndex(g => g.ids.includes(id));
    if (at >= limit) limit = at + 10;
    void tick().then(() => box?.querySelector(`[data-track="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' }));
    const t = setTimeout(() => { if (focused === id) focused = null; }, 2500);
    return () => clearTimeout(t);
  });
</script>

{#snippet group(g: DupGroup)}
  <section class="grp" data-kind={g.kind}>
    <header>
      {#if g.kind === 'same'}
        {#if canClean}<input type="checkbox" class="gpick" aria-label="Choose this group" checked={picked.has(g.key)} onchange={e => pick(g, e.currentTarget.checked)}>{/if}
        <span class="kind">Same recording</span><span class="sure" data-sure={g.sure} title="How sure GLUE is that these are one recording">{g.sure}%</span><span class="sim">{g.byHand ? 'you marked them as duplicates' : g.confirmed ? 'same artist and title; you said it’s the same' : strength(g.similarity ?? 0)}{#if g.concerns.length}<span class="concern" title="Look before removing: these copies may be different versions"> · {g.concerns.join(' · ')}</span>{/if}</span>
        {#if canClean}
          <button type="button" class="mini" data-clean="move" title="Keep the best copy; put the others in GLUE Home's duplicates folder (out of the library, not deleted)" onclick={() => (ask = { mode: 'move', groups: [g] })}>Move the others…</button>
          <button type="button" class="mini danger" data-clean="trash" title="Keep the best copy; move the others' files to the Recycle Bin" onclick={() => (ask = { mode: 'trash', groups: [g] })}>Delete the others…</button>
        {/if}
      {:else}
        <span class="kind probable">Probable</span><span class="sure" data-sure={g.sure}>{g.sure}%</span><span class="sim">same artist and title, similar length; not confirmed by sound{#if g.concerns.length}<span class="concern"> · {g.concerns.join(' · ')}</span>{/if}</span>
        <button type="button" class="mini" data-confirm title="They are the same recording: clean them up like one (keep the best copy, move or delete the others)" disabled={lib.readOnly} onclick={() => dupes.confirm(g)}>Same recording</button>
      {/if}
      <button type="button" class="mini" onclick={() => dupes.ignore(g)} title="Hide this group from now on">Not duplicates</button>
    </header>
    <ul>
      {#each [g.best, ...g.ids.filter(x => x !== g.best)] as id (id)}
        {@const t = lib.store?.tracks.get(id)}
        {@const a = asShown(lib.store?.tracks.get(id), lib.store?.analysis.get(id))}
        {#if t}
          <li class:best={g.best === id} class:focus={focused === id} data-track={id} oncontextmenu={e => menu.context(e, () => trackMenu([id]), 'Song')}>
            <button type="button" class="pbtn" aria-label={nowPlaying.trackId === id && !player.paused ? 'Pause' : 'Play'} disabled={t.status !== 'linked'} onclick={() => play(id, g)}>
              {#if nowPlaying.trackId === id && !player.paused}<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 1.5h3.2v11H2.5zM8.3 1.5h3.2v11H8.3z" fill="currentColor"/></svg>
              {:else}<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>{/if}
            </button>
            <div class="who">
              <a href={trackHref(id)} onclick={e => { e.preventDefault(); router.go(trackHref(id)); }}>{t.title || t.fileName}</a>
              <span>{t.artist}</span>
              <small title={where(t)}>{where(t)}</small>
            </div>
            <span class="mono fmt">{fmt(t)}</span>
            <span class="mono">{t.duration ? fmtTime(t.duration) : ''}</span>
            <span class="mono">{bpmShown(t, a) ? fmtBpm(bpmShown(t, a)!) : ''} {a?.key ? keyLabel(a.key, app.keyNotation) : ''}</span>
            <span>{#if a && !a.error}<span class="q" data-grade={a.grade}>{a.label}</span>{/if}</span>
            <span class="lists">{listsOf(id).length ? 'in ' + listsOf(id).length + ' playlist' + (listsOf(id).length === 1 ? '' : 's') : 'in no playlist'}</span>
            <span class="act">
              {#if g.best === id}<span class="bestb" title="The copy that stays: every playlist uses it, and the library shows it">Best copy</span>
              {:else}<button type="button" class="mini" data-best={id} title="Make this the copy that stays: every playlist uses it, and the library shows it" onclick={() => keep(g, id)}>Make it the best</button>{/if}
              <button type="button" class="mini" data-apart={id} disabled={lib.readOnly} title="Not a duplicate of the others (another version: an instrumental, a live take, a longer mix…). It leaves this group for good; clean up the rest." onclick={() => dupes.apart(g, id)}>Keep · not a duplicate</button>
            </span>
          </li>
        {/if}
      {/each}
    </ul>
  </section>
{/snippet}

<div class="dv" id="dupes" bind:this={box}>
  <div class="intro">
    <p>
      GLUE compares how tracks <b>sound</b>, so the same recording is found under any name, tag or format: a WAV and its MP3,
      two rips, a re-download. Each song shows as its best copy everywhere else, and your playlists use it; “Make it the best” picks another copy.
      {#if canClean}Then the others can be moved to GLUE Home’s duplicates folder or to the Recycle Bin: one group, or several ticked.{:else}Moving or deleting the other copies needs GLUE Home on this computer.{/if}
    </p>
    <span class="scan">
      {#if dupes.running}Comparing…{:else if dupes.at}Checked {new Date(dupes.at).toLocaleTimeString()}{/if}
      <button type="button" class="mini" id="dupes-rescan" disabled={dupes.running} onclick={() => dupes.scan(true)}>Check again</button>
    </span>
  </div>
  {#if dupes.missing}
    <p class="note" id="dupes-missing">{dupes.missing.toLocaleString()} analysed song{dupes.missing === 1 ? ' has' : 's have'} no fingerprint in this browser (analysed in another browser or on another computer). {dupes.filling ? 'Making them now: ' + dupes.filled.toLocaleString() + ' done…' : 'They’re made in the background as the files can be read.'} Duplicates among them show as they're done.</p>
  {/if}
  {#if pending}<p class="note">{pending} track{pending === 1 ? '' : 's'} still being analysed; duplicates among them appear when they’re done.</p>{/if}
  {#if dupes.groups.length}
    <div class="filters" id="dupes-filters">
      {#each HOW as [h, label] (h)}<button type="button" class="chip" class:on={how === h} data-how={h} onclick={() => (how = h)}>{label} <small>{countOf(h)}</small></button>{/each}
      <label class="atleast">Certainty at least
        <select id="dupes-sure" value={String(atLeast)} onchange={e => (atLeast = Number(e.currentTarget.value))}>
          {#each [0, 80, 90, 95, 99] as v (v)}<option value={String(v)}>{v ? v + '%' : 'any'}</option>{/each}
        </select>
      </label>
    </div>
  {/if}
  {#if canClean && same.length}
    <div class="bulk" id="dupes-bulk">
      <span>{pickedGroups.length ? pickedGroups.length + ' group' + (pickedGroups.length === 1 ? '' : 's') + ' ticked' : 'Tick groups to clean several up at once'}</span>
      <button type="button" class="mini" id="tick-all" onclick={() => (picked = new Set(same.map(g => g.key)))}>Tick all {same.length} shown</button>
      {#if pickedGroups.length}
        <button type="button" class="mini" onclick={() => (picked = new Set())}>Untick</button>
        <button type="button" class="mini" id="bulk-move" onclick={() => (ask = { mode: 'move', groups: pickedGroups })}>Move the others…</button>
        <button type="button" class="mini danger" id="bulk-trash" onclick={() => (ask = { mode: 'trash', groups: pickedGroups })}>Delete the others…</button>
      {/if}
    </div>
  {/if}
  {#each sameShown as g (g.key)}{@render group(g)}{/each}
  {#if probableShown.length}
    <h3 class="label">Check these</h3>
    {#each probableShown as g (g.key)}{@render group(g)}{/each}
  {/if}
  {#if hidden > 0}<p class="more" bind:this={more}>{hidden.toLocaleString()} more…</p>{/if}
  {#if !dupes.groups.length && !dupes.running}<p class="empty">No duplicates found.</p>{/if}
</div>

{#if ask}
  <div class="scrim" role="presentation" onpointerdown={e => { if (e.target === e.currentTarget && !cleaning) ask = null; }}>
    <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="clean-h" id="clean-dialog">
      <h2 id="clean-h">{ask.mode === 'move' ? 'Move' : 'Delete'} {plan.length} duplicate file{plan.length === 1 ? '' : 's'}?</h2>
      <p>{ask.mode === 'move'
        ? 'They go to GLUE Home’s duplicates folder, in their music folder’s name and path, and leave your library. Nothing is deleted.'
        : 'They go to the Recycle Bin (you can still restore them from there) and leave your library.'}
        Each group keeps its best copy, which takes over their playlists, rating, notes, tags and Prepare.</p>
      {#if ask.groups.length > 1 && doubtful.length}
        <div class="doubt" id="clean-doubtful">
          <p><b>{doubtful.length} group{doubtful.length === 1 ? '' : 's'} may be different versions</b>, {includeDoubtful ? 'included' : 'left out'}:</p>
          <ul>{#each doubtful.slice(0, 12) as g (g.key)}{@const t = lib.store?.tracks.get(g.best)}<li>{t?.artist ? t.artist + ' – ' : ''}{t?.title || t?.fileName}<small>{g.concerns.join(' · ')}</small></li>{/each}{#if doubtful.length > 12}<li class="more">…and {doubtful.length - 12} more</li>{/if}</ul>
          <label><input type="checkbox" id="clean-include-doubtful" bind:checked={includeDoubtful}> Include them too</label>
        </div>
      {/if}
      <ul class="plan">
        {#each plan.slice(0, 60) as x (x.t.id)}<li><span title={where(x.t)}>{where(x.t)}</span><small>{x.t.size ? fmtBytes(x.t.size) : ''}</small></li>{/each}
        {#if plan.length > 60}<li class="more">…and {plan.length - 60} more</li>{/if}
      </ul>
      <p class="fine">{fmtBytes(planBytes)} in all.{planDj.length ? ' ' + planDj.join(' and ') + ' still list' + (planDj.length === 1 ? 's' : '') + ' some of these files: ' + (planDj.length === 1 ? 'it shows' : 'they show') + ' them as missing until you point ' + (planDj.length === 1 ? 'it' : 'them') + ' at the copy that stays.' : ''}</p>
      <div class="acts">
        <button type="button" class="btn-ghost" disabled={cleaning} onclick={() => { ask = null; includeDoubtful = false; }}>Cancel</button>
        <button type="button" class="btn" class:dangerbtn={ask.mode === 'trash'} id="clean-go" disabled={cleaning || !plan.length} onclick={doClean}>{cleaning ? 'Working…' : (ask.mode === 'move' ? 'Move ' : 'Delete ') + plan.length + ' file' + (plan.length === 1 ? '' : 's')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .more { color: var(--muted); font-size: 12.5px; padding: 8px 2px; }
  .dv { display: grid; gap: 12px; align-content: start; overflow-y: auto; min-height: 0; padding-right: 4px; }
  .intro { display: flex; gap: 16px; justify-content: space-between; align-items: flex-start; color: var(--ink-2); font-size: 13px; }
  .intro p { max-width: 900px; }
  .scan { display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: 12px; white-space: nowrap; }
  .note, .empty { color: var(--muted); font-size: 13px; }
  .empty { text-align: center; padding: 40px 0; }
  .grp { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  .grp header { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--line); }
  .kind { font-family: var(--font-mono); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
  .kind.probable { color: var(--warn); }
  .sim { color: var(--muted); font-size: 12.5px; flex: 1; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: grid; grid-template-columns: minmax(28px, auto) minmax(200px, 1fr) 130px 50px 70px 150px 110px 310px; gap: 10px; align-items: center; padding: 6px 12px; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); font-size: 13px; }
  li:last-child { border-bottom: 0; }
  li.best { background: color-mix(in srgb, var(--ok) 7%, transparent); outline: 1px solid color-mix(in srgb, var(--ok) 55%, transparent); outline-offset: -1px; }
  li.focus { outline: 2px solid var(--accent); outline-offset: -2px; background: color-mix(in srgb, var(--accent) 12%, transparent); transition: background .4s; }
  .who { display: grid; min-width: 0; line-height: 1.35; }
  .who a { color: var(--ink); font-weight: 600; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who a:hover { text-decoration: underline; }
  .who span { color: var(--ink-2); font-size: 12.5px; }
  .who small { color: var(--muted); font-family: var(--font-mono); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mono { font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); }
  .fmt { white-space: nowrap; }
  .lists { color: var(--muted); font-size: 12px; }
  /* Two fixed slots on every row, so the columns line up (2026-09-30): the best copy's label, or "Make it the best";
     then "Keep · not a duplicate". */
  .act { display: grid; grid-template-columns: 140px 160px; gap: 8px; align-items: center; justify-items: stretch; }
  .act > * { text-align: center; }
  .bestb { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ok); border: 1px solid currentColor; border-radius: 4px; padding: 4px 6px; }
  .sure { font-family: var(--font-mono); font-size: 11px; color: var(--ink-2); border: 1px solid var(--line-2); border-radius: 3px; padding: 0 5px; }
  .sure[data-sure="100"] { color: var(--ok); border-color: currentColor; }
  .concern { color: var(--warn); }
  .filters { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12.5px; }
  .chip { background: none; border: 1px solid var(--line-2); border-radius: 999px; color: var(--ink-2); padding: 3px 10px; cursor: pointer; font-size: 12.5px; }
  .chip.on { border-color: var(--accent); color: var(--accent); }
  .chip small { color: var(--muted); }
  .atleast { margin-left: auto; color: var(--muted); display: flex; gap: 6px; align-items: center; }
  .doubt { border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--line)); border-radius: 8px; padding: 8px 10px; display: grid; gap: 6px; font-size: 13px; }
  .doubt ul { display: grid; gap: 2px; max-height: 20vh; overflow-y: auto; }
  .doubt li { display: flex; justify-content: space-between; gap: 12px; padding: 0; border: 0; grid-template-columns: none; font-size: 12.5px; }
  .doubt li small { color: var(--warn); white-space: nowrap; }
  .q { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; padding: 1px 6px; border-radius: 3px; border: 1px solid currentColor; white-space: nowrap; }
  .q[data-grade="ok"] { color: var(--ok); } .q[data-grade="warn"] { color: var(--warn); } .q[data-grade="bad"] { color: var(--bad); } .q[data-grade="info"] { color: var(--muted); }
  .pbtn { width: 24px; height: 24px; border-radius: 50%; border: 0; background: var(--raised); color: var(--ink-2); cursor: pointer; display: grid; place-items: center; padding: 0; }
  .pbtn:hover:not(:disabled) { background: var(--accent); color: var(--accent-ink); }
  .pbtn:disabled { opacity: .3; cursor: default; }
  .pbtn svg { width: 10px; height: 10px; }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 3px 9px; cursor: pointer; white-space: nowrap; }
  .mini:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  h3 { margin-top: 8px; }
  .gpick { margin: 0 2px 0 0; accent-color: var(--accent); }
  .mini.danger { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 45%, var(--line-2)); }
  .mini.danger:hover:not(:disabled) { color: var(--bad); border-color: var(--bad); }
  .bulk { position: sticky; top: 0; z-index: 2; display: flex; gap: 8px; align-items: center; padding: 6px 10px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); font-size: 12.5px; color: var(--ink-2); }
  .bulk span { flex: 1; }
  .scrim { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--ground) 70%, transparent); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; }
  .dlg { width: min(620px, 100%); max-height: calc(100vh - 32px); background: var(--surface); border: 1px solid var(--line-2); border-radius: 12px; padding: 20px 22px; display: grid; gap: 12px; box-shadow: 0 24px 60px rgb(0 0 0 / .5); min-height: 0; }
  .dlg h2 { font-size: 20px; margin: 0; }
  .dlg p { color: var(--ink-2); font-size: 13.5px; margin: 0; }
  .dlg .fine { color: var(--muted); font-size: 12.5px; }
  .plan { max-height: 40vh; overflow-y: auto; border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; display: grid; gap: 2px; }
  .plan li { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; border: 0; font: 12px var(--font-mono); grid-template-columns: none; }
  .plan li span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-2); }
  .plan li small { color: var(--muted); white-space: nowrap; }
  .plan .more { color: var(--muted); }
  .acts { display: flex; gap: 8px; justify-content: flex-end; }
  .dangerbtn { background: var(--bad); border-color: var(--bad); color: #fff; }
  @media (max-width: 1200px) { li { grid-template-columns: 28px minmax(160px, 1fr) 120px 140px 310px; } li > :nth-child(4), li > :nth-child(5), li > :nth-child(7) { display: none; } }
</style>
