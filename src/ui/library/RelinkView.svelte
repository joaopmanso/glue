<script lang="ts">
  /* "No file linked" (ADR 0124): each song with no file, and the song in the library it most likely is, with how
     sure GLUE is. Linked one at a time, or every ticked one at once (the user, 2026-10-01: an Engine DJ import's
     playlists named duplicates removed since; most are in the library). */
  import { lib } from '../../lib/library.svelte';
  import { relink, type Orphan } from '../../lib/relink.svelte';
  import { fmtTime } from '../../core/format';
  import { router, trackHref } from '../../lib/route.svelte';
  import { APP_NAMES } from '../../lib/view.svelte';
  import type { Track } from '../../store/types';
  import type { RelinkMatch } from '../../core/library/relink';

  const all = $derived.by(() => { void lib.version; return relink.orphans(); });
  let atLeast = $state(0);
  /** The match each song is linked to: the one chosen, else its best. */
  let choice = $state<Record<string, string>>({});
  const matchOf = (o: Orphan): RelinkMatch | undefined => o.matches.find(m => m.id === choice[o.t.id]) ?? o.matches[0];
  const matched = $derived(all.filter(o => (matchOf(o)?.sure ?? -1) >= atLeast && o.matches.length));
  const unmatched = $derived(all.filter(o => !o.matches.length));
  const countAt = (v: number) => all.filter(o => o.matches.length && (matchOf(o)?.sure ?? 0) >= v).length;
  /** A match that may be wrong: left out of a bulk link unless included. */
  const doubtful = (m: RelinkMatch | undefined) => !!m && m.why.some(w => /another (version|artist|song)/.test(w));

  let picked = $state<Set<string>>(new Set());
  const pickedShown = $derived(matched.filter(o => picked.has(o.t.id)));
  function pick(id: string, on: boolean) { const n = new Set(picked); if (on) n.add(id); else n.delete(id); picked = n; }

  let ask = $state<Orphan[] | null>(null), includeDoubtful = $state(false);
  const askDoubtful = $derived(ask ? ask.filter(o => doubtful(matchOf(o))) : []);
  const askPlan = $derived(ask ? (includeDoubtful || ask.length === 1 ? ask : ask.filter(o => !doubtful(matchOf(o)))) : []);
  function linkNow(os: Orphan[]) {
    const pairs = os.map(o => [o.t.id, matchOf(o)!.id] as [string, string]);
    const n = relink.link(pairs);
    picked = new Set([...picked].filter(id => !pairs.some(p => p[0] === id)));
    ask = null; includeDoubtful = false;
    lib.notice = 'Linked ' + n + ' song' + (n === 1 ? '' : 's') + ' to the songs in your library: their playlists, ratings, notes and cues are there now.';
  }

  function from(t: Track) {
    const apps = [...new Set(t.sources.map(id => lib.store?.sources.get(id)?.app).filter(Boolean).map(a => APP_NAMES[a!] ?? a))];
    return (apps.length ? apps.join(', ') + ': ' : '') + (t.importPath ?? t.fileName);
  }
  function where(t: Track) {
    const r = lib.rootState(t.rootId);
    return t.relPath ? (r?.root.name ?? '') + '/' + t.relPath : t.fileName;
  }
  const lists = (id: string) => { void lib.version; return lib.listsContaining(id).filter(l => l.kind === 'playlist').length; };

  // Drawn a part at a time (thousands of songs), more as the end comes near.
  let limit = $state(60), more = $state<HTMLElement>();
  const shown = $derived(matched.slice(0, limit));
  $effect(() => {
    const el = more;
    void limit;
    if (!el) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) limit += 80; }, { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  });
</script>

<div class="rv" id="relink">
  <div class="intro">
    <p>
      These songs are in a DJ library you imported, but their files aren’t in your music folders (moved, renamed, or removed as duplicates).
      GLUE looks for each one in your library by <b>title, artist, length and file name</b>. Linking one moves its playlist places, rating, notes and cues
      to the song in your library, and the DJ library’s record stays with that song from then on.
    </p>
    <button type="button" class="mini" id="relink-list" onclick={() => (relink.asList = true)}>Show them as a list</button>
  </div>
  {#if all.length}
    <div class="bulk" id="relink-bulk">
      <span>{matched.length.toLocaleString()} with a match{unmatched.length ? ' · ' + unmatched.length.toLocaleString() + ' without' : ''}{pickedShown.length ? ' · ' + pickedShown.length + ' ticked' : ''}</span>
      <label class="atleast">Certainty at least
        <select id="relink-sure" value={String(atLeast)} onchange={e => (atLeast = Number(e.currentTarget.value))}>
          {#each [0, 80, 90, 95, 99] as v (v)}<option value={String(v)}>{v ? v + '% (' + countAt(v) + ')' : 'any'}</option>{/each}
        </select>
      </label>
      {#if matched.length}<button type="button" class="mini" id="relink-tick-all" onclick={() => (picked = new Set(matched.map(o => o.t.id)))}>Tick all {matched.length.toLocaleString()} shown</button>{/if}
      {#if pickedShown.length}
        <button type="button" class="mini" onclick={() => (picked = new Set())}>Untick</button>
        <button type="button" class="mini primary" id="relink-bulk-link" disabled={lib.readOnly} onclick={() => (ask = pickedShown)}>Link {pickedShown.length.toLocaleString()}…</button>
      {/if}
    </div>
  {/if}
  <ul>
    {#each shown as o (o.t.id)}
      {@const m = matchOf(o)}
      {@const t = m ? lib.store?.tracks.get(m.id) : null}
      {#if m && t}
        <li data-orphan={o.t.id}>
          <input type="checkbox" class="pick" aria-label="Choose this song" checked={picked.has(o.t.id)} onchange={e => pick(o.t.id, e.currentTarget.checked)}>
          <div class="who">
            <b>{o.t.title || o.t.fileName}</b><span>{o.t.artist}</span>
            <small title={from(o.t)}>{from(o.t)}{lists(o.t.id) ? ' · in ' + lists(o.t.id) + ' playlist' + (lists(o.t.id) === 1 ? '' : 's') : ''}</small>
          </div>
          <span class="mono">{o.t.duration ? fmtTime(o.t.duration) : ''}</span>
          <span class="arrow" aria-hidden="true">→</span>
          <div class="who">
            <a href={trackHref(t.id)} onclick={e => { e.preventDefault(); router.go(trackHref(t.id)); }}>{t.title || t.fileName}</a><span>{t.artist}</span>
            <small title={where(t)}>{where(t)}</small>
            {#if o.matches.length > 1}
              <select class="alt" data-choose={o.t.id} aria-label="Other matches" value={m.id} onchange={e => (choice = { ...choice, [o.t.id]: e.currentTarget.value })}>
                {#each o.matches as x (x.id)}{@const xt = lib.store?.tracks.get(x.id)}<option value={x.id}>{x.sure}% · {xt?.artist ? xt.artist + ' – ' : ''}{xt?.title || xt?.fileName}</option>{/each}
              </select>
            {/if}
          </div>
          <span class="mono">{t.duration ? fmtTime(t.duration) : ''}</span>
          <span class="sure" data-sure={m.sure} class:doubt={doubtful(m)} title={m.why.join(', ')}>{m.sure}%</span>
          <span class="act">
            <button type="button" class="mini" data-link={o.t.id} disabled={lib.readOnly} onclick={() => linkNow([o])}>Link</button>
            <button type="button" class="mini" data-not={o.t.id} disabled={lib.readOnly} title="It isn't this song: not offered again" onclick={() => relink.notThis(o.t.id, m.id)}>Not this one</button>
          </span>
          <small class="why">{m.why.join(' · ')}</small>
        </li>
      {/if}
    {/each}
  </ul>
  {#if matched.length > limit}<p class="note" bind:this={more}>{(matched.length - limit).toLocaleString()} more…</p>{/if}
  {#if unmatched.length && matched.length <= limit}
    <h3 class="label">No match found ({unmatched.length.toLocaleString()})</h3>
    <ul class="none" id="relink-none">
      {#each unmatched.slice(0, 300) as o (o.t.id)}<li><b>{o.t.artist ? o.t.artist + ' – ' : ''}{o.t.title || o.t.fileName}</b><small title={from(o.t)}>{from(o.t)}</small></li>{/each}
      {#if unmatched.length > 300}<li class="note">…and {(unmatched.length - 300).toLocaleString()} more (see them as a list)</li>{/if}
    </ul>
  {/if}
  {#if !all.length}<p class="empty">Every song has its file.</p>{/if}
</div>

{#if ask}
  <div class="scrim" role="presentation" onpointerdown={e => { if (e.target === e.currentTarget) ask = null; }}>
    <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="relink-h" id="relink-dialog">
      <h2 id="relink-h">Link {askPlan.length.toLocaleString()} song{askPlan.length === 1 ? '' : 's'}?</h2>
      <p>Each one’s playlist places, rating, notes and cues go to its match in your library, and the song with no file leaves the library.
        The DJ library’s record stays with the match, so it doesn’t come back.</p>
      {#if ask.length > 1 && askDoubtful.length}
        <div class="doubtbox" id="relink-doubtful">
          <p><b>{askDoubtful.length} match{askDoubtful.length === 1 ? '' : 'es'} may be wrong</b> (another version, another artist, or another song matches as well), {includeDoubtful ? 'included' : 'left out'}.</p>
          <label><input type="checkbox" id="relink-include-doubtful" bind:checked={includeDoubtful}> Include them too</label>
        </div>
      {/if}
      <div class="acts">
        <button type="button" class="btn-ghost" onclick={() => { ask = null; includeDoubtful = false; }}>Cancel</button>
        <button type="button" class="btn" id="relink-go" disabled={!askPlan.length} onclick={() => linkNow(askPlan)}>Link {askPlan.length.toLocaleString()}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .rv { display: grid; gap: 12px; align-content: start; overflow-y: auto; min-height: 0; padding-right: 4px; }
  .intro { display: flex; gap: 16px; justify-content: space-between; align-items: flex-start; color: var(--ink-2); font-size: 13px; }
  .intro p { max-width: 900px; margin: 0; }
  .note, .empty { color: var(--muted); font-size: 13px; }
  .empty { text-align: center; padding: 40px 0; }
  ul { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  ul:empty { display: none; }
  li { display: grid; grid-template-columns: 22px minmax(180px, 1fr) 46px 18px minmax(180px, 1fr) 46px 52px 200px; gap: 10px; align-items: center; padding: 7px 12px; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); font-size: 13px; }
  li:last-child { border-bottom: 0; }
  .who { display: grid; min-width: 0; line-height: 1.35; }
  .who b, .who a { color: var(--ink); font-weight: 600; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who a:hover { text-decoration: underline; }
  .who span { color: var(--ink-2); font-size: 12.5px; }
  .who small, .why { color: var(--muted); font-family: var(--font-mono); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .why { grid-column: 2 / -1; font-family: inherit; }
  .alt { max-width: 100%; font-size: 11.5px; margin-top: 2px; }
  .arrow { color: var(--muted); text-align: center; }
  .mono { font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); }
  .sure { font-family: var(--font-mono); font-size: 11px; color: var(--ink-2); border: 1px solid var(--line-2); border-radius: 3px; padding: 1px 5px; text-align: center; }
  .sure[data-sure="100"] { color: var(--ok); border-color: currentColor; }
  .sure.doubt { color: var(--warn); border-color: currentColor; }
  .act { display: flex; gap: 6px; justify-content: flex-end; }
  .pick { margin: 0; accent-color: var(--accent); }
  .none li { display: flex; justify-content: space-between; gap: 12px; padding: 4px 12px; }
  .none li small { color: var(--muted); font-family: var(--font-mono); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%; }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 3px 9px; cursor: pointer; white-space: nowrap; }
  .mini:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .mini.primary { border-color: var(--accent); color: var(--accent); }
  .bulk { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 6px 10px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); font-size: 12.5px; color: var(--ink-2); }
  .bulk > span { flex: 1; }
  .atleast { color: var(--muted); display: flex; gap: 6px; align-items: center; }
  .scrim { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--ground) 70%, transparent); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; }
  .dlg { width: min(560px, 100%); background: var(--surface); border: 1px solid var(--line-2); border-radius: 12px; padding: 20px 22px; display: grid; gap: 12px; box-shadow: 0 24px 60px rgb(0 0 0 / .5); }
  .dlg h2 { font-size: 20px; margin: 0; }
  .dlg p { color: var(--ink-2); font-size: 13.5px; margin: 0; }
  .doubtbox { border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--line)); border-radius: 8px; padding: 8px 10px; display: grid; gap: 6px; font-size: 13px; }
  .acts { display: flex; justify-content: flex-end; gap: 8px; }
  @media (max-width: 900px) {
    li { grid-template-columns: 22px 1fr 46px; }
    li .arrow { display: none; }
    li > :nth-child(5), li > :nth-child(6), li > .sure, li > .act, li > .why { grid-column: 2 / -1; }
  }
</style>
