<script lang="ts">
  import { lib } from '../../lib/library.svelte';
  import { dupes, type DupGroup } from '../../lib/dupes.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { player } from '../../lib/player.svelte';
  import { router } from '../../lib/route.svelte';
  import { app } from '../../lib/app.svelte';
  import { keyLabel } from '../../core/audio/keys';
  import { fmtTime } from '../../core/format';
  import type { Track } from '../../store/types';

  const pending = $derived.by(() => { void lib.version; return lib.pendingCount(); });
  const same = $derived(dupes.groups.filter(g => g.kind === 'same'));
  const probable = $derived(dupes.groups.filter(g => g.kind === 'probable'));

  function where(t: Track) {
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
    if (nowPlaying.trackId === id && player.url) player.toggle(); else void nowPlaying.play(id, g.ids);
  }
  function keep(g: DupGroup, id: string) {
    const n = dupes.useCopy(g, id), t = lib.store?.tracks.get(id);
    lib.notice = n ? 'Playlists now use ' + (t?.title || t?.fileName) + ' (' + n + ' playlist' + (n === 1 ? '' : 's') + ' updated).' : 'No playlist uses the other copies.';
  }
  /** Similarity 1 − 2·(bit error rate): unrelated audio is ~0, identical ~1; matches start at 0.4. */
  const strength = (sim: number) => sim >= 0.8 ? 'Near-identical audio' : sim >= 0.6 ? 'Strong match by sound' : 'Matched by sound';
  const listsOf = (id: string) => { void lib.version; return lib.listsContaining(id).filter(l => l.kind === 'playlist'); };
</script>

{#snippet group(g: DupGroup)}
  <section class="grp" data-kind={g.kind}>
    <header>
      {#if g.kind === 'same'}
        <span class="kind">Same recording</span><span class="sim">{strength(g.similarity ?? 0)}</span>
      {:else}
        <span class="kind probable">Probable</span><span class="sim">same artist and title, similar length; not confirmed by sound</span>
      {/if}
      <button type="button" class="mini" onclick={() => dupes.ignore(g)} title="Hide this group from now on">Not duplicates</button>
    </header>
    <ul>
      {#each [g.best, ...g.ids.filter(x => x !== g.best)] as id (id)}
        {@const t = lib.store?.tracks.get(id)}
        {@const a = lib.store?.analysis.get(id)}
        {#if t}
          <li class:best={g.best === id}>
            <button type="button" class="pbtn" aria-label={nowPlaying.trackId === id && !player.paused ? 'Pause' : 'Play'} disabled={t.status !== 'linked'} onclick={() => play(id, g)}>
              {#if nowPlaying.trackId === id && !player.paused}<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 1.5h3.2v11H2.5zM8.3 1.5h3.2v11H8.3z" fill="currentColor"/></svg>
              {:else}<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>{/if}
            </button>
            <div class="who">
              <a href={'#/track/' + id} onclick={e => { e.preventDefault(); router.go('#/track/' + id); }}>{t.title || t.fileName}</a>
              <span>{t.artist}</span>
              <small title={where(t)}>{where(t)}</small>
            </div>
            <span class="mono fmt">{fmt(t)}</span>
            <span class="mono">{t.duration ? fmtTime(t.duration) : ''}</span>
            <span class="mono">{a?.bpm ? Math.round(a.bpm) : ''} {a?.key ? keyLabel(a.key, app.keyNotation) : ''}</span>
            <span>{#if a && !a.error}<span class="q" data-grade={a.grade}>{a.label}</span>{/if}</span>
            <span class="lists">{listsOf(id).length ? 'in ' + listsOf(id).length + ' playlist' + (listsOf(id).length === 1 ? '' : 's') : 'in no playlist'}</span>
            <span class="act">
              {#if g.best === id}<span class="bestb" title="Best quality of the group">Best copy</span>{/if}
              <button type="button" class="mini" title="Replace the other copies with this one in every playlist" onclick={() => keep(g, id)}>Use in playlists</button>
            </span>
          </li>
        {/if}
      {/each}
    </ul>
  </section>
{/snippet}

<div class="dv" id="dupes">
  <div class="intro">
    <p>
      GLUE compares how tracks <b>sound</b>, so the same recording is found under any name, tag or format: a WAV and its MP3,
      two rips, a re-download. Nothing is deleted; “Use in playlists” points your playlists at the copy you keep.
    </p>
    <span class="scan">
      {#if dupes.running}Comparing…{:else if dupes.at}Checked {new Date(dupes.at).toLocaleTimeString()}{/if}
      <button type="button" class="mini" id="dupes-rescan" disabled={dupes.running} onclick={() => dupes.scan()}>Check again</button>
    </span>
  </div>
  {#if pending}<p class="note">{pending} track{pending === 1 ? '' : 's'} still being analysed; duplicates among them appear when they’re done.</p>{/if}
  {#each same as g (g.key)}{@render group(g)}{/each}
  {#if probable.length}
    <h3 class="label">Check these</h3>
    {#each probable as g (g.key)}{@render group(g)}{/each}
  {/if}
  {#if !dupes.groups.length && !dupes.running}<p class="empty">No duplicates found.</p>{/if}
</div>

<style>
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
  li { display: grid; grid-template-columns: 28px minmax(200px, 1fr) 130px 50px 70px 150px 110px 210px; gap: 10px; align-items: center; padding: 6px 12px; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); font-size: 13px; }
  li:last-child { border-bottom: 0; }
  li.best { background: color-mix(in srgb, var(--ok) 7%, transparent); }
  .who { display: grid; min-width: 0; line-height: 1.35; }
  .who a { color: var(--ink); font-weight: 600; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who a:hover { text-decoration: underline; }
  .who span { color: var(--ink-2); font-size: 12.5px; }
  .who small { color: var(--muted); font-family: var(--font-mono); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mono { font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); }
  .fmt { white-space: nowrap; }
  .lists { color: var(--muted); font-size: 12px; }
  .act { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
  .bestb { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ok); border: 1px solid currentColor; border-radius: 3px; padding: 1px 6px; }
  .q { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; padding: 1px 6px; border-radius: 3px; border: 1px solid currentColor; white-space: nowrap; }
  .q[data-grade="ok"] { color: var(--ok); } .q[data-grade="warn"] { color: var(--warn); } .q[data-grade="bad"] { color: var(--bad); } .q[data-grade="info"] { color: var(--muted); }
  .pbtn { width: 24px; height: 24px; border-radius: 50%; border: 0; background: var(--raised); color: var(--ink-2); cursor: pointer; display: grid; place-items: center; padding: 0; }
  .pbtn:hover:not(:disabled) { background: var(--accent); color: var(--accent-ink); }
  .pbtn:disabled { opacity: .3; cursor: default; }
  .pbtn svg { width: 10px; height: 10px; }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 3px 9px; cursor: pointer; white-space: nowrap; }
  .mini:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  h3 { margin-top: 8px; }
  @media (max-width: 1200px) { li { grid-template-columns: 28px minmax(160px, 1fr) 120px 140px 210px; } li > :nth-child(4), li > :nth-child(5), li > :nth-child(7) { display: none; } }
</style>
