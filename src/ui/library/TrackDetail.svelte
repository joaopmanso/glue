<script lang="ts">
  import { untrack } from 'svelte';
  import { lib } from '../../lib/library.svelte';
  import { app, analyzeFile, showResult } from '../../lib/app.svelte';
  import { player } from '../../lib/player.svelte';
  import { router } from '../../lib/route.svelte';
  import { view } from '../../lib/view.svelte';
  import { summarize } from '../../core/library/summary';
  import { formatOf } from '../../core/library/tags';
  import { fmtBytes, fmtTime } from '../../core/format';
  import { keyLabel } from '../../core/audio/keys';
  import Results from '../Results.svelte';
  import Sidebar from '../Sidebar.svelte';
  import Evidence from '../Evidence.svelte';
  import { fmtKHz } from '../../core/format';
  import type { MusicResult } from '../../core/types';
  import { nowPlaying, playable } from '../../lib/nowPlaying.svelte';
  import Stars from './Stars.svelte';
  import { auto } from '../../lib/auto.svelte';
  import { tagsOf } from '../../core/library/tagging';
  import { tagColorOf } from '../../lib/tags.svelte';

  let { id }: { id: string } = $props();
  const APP_NAMES: Record<string, string> = { rekordbox: 'rekordbox', engine: 'Engine DJ', serato: 'Serato', traktor: 'Traktor', apple: 'Apple Music', m3u: 'M3U' };

  const track = $derived.by(() => { void lib.version; return lib.store?.tracks.get(id) ?? null; });
  const summary = $derived.by(() => { void lib.version; return lib.store?.analysis.get(id) ?? null; });
  const lists = $derived.by(() => { void lib.version; return lib.listsContaining(id); });
  const imported = $derived.by(() => {
    void lib.version;
    const out = [];
    for (const s of lib.store?.sources.values() ?? []) { const st = s.tracks.find(x => x.trackId === id); if (st) out.push({ app: APP_NAMES[s.app] ?? s.app, st }); }
    return out;
  });
  const root = $derived(track ? lib.rootState(track.rootId) : null);
  const location = $derived(track?.fileKey ? track.fileName + (track.fileKey.startsWith('copy:') ? ' (a copy kept in GLUE)' : ' (added on its own)') : track?.relPath ? (root?.root.absPath ? root.root.absPath + (root.root.absPath.includes('\\') ? '\\' + track.relPath.replace(/\//g, '\\') : '/' + track.relPath) : (root?.root.name ?? '') + '/' + track.relPath) : track?.importPath ?? '');

  // Neighbours in the current library view, for previous / next.
  const order = $derived(view.rows(app.keyNotation).map(r => r.t.id));
  const pos = $derived(order.indexOf(id));

  let phase = $state<'loading' | 'ready' | 'need-access' | 'no-file' | 'remote' | 'error'>('loading');
  // Another device's track (a merged collection or a cloud view): its file isn't on this computer.
  const elsewhere = $derived(track?.remote?.name ?? (lib.cloud ? track?.onDevices?.join(' and ') || lib.cloud.title : null));
  let message = $state('');
  let stored = $state(false);        // showing the analysis kept from an earlier visit
  let canPlay = $state(true);        // false: a stored analysis is shown but the file isn't readable yet
  let loaded = '';

  /** Show the stored analysis if there is one; otherwise (or with `fresh`) analyse the file and store it. */
  async function load(ask: boolean, fresh = false) {
    const t = untrack(() => track);
    if (!t) return;
    const key = 'track:' + t.id;
    loaded = t.id;
    // Nothing to ask for: streaming from another computer comes with GLUE Home (not available yet).
    if (t.remote || lib.cloud) { phase = 'remote'; return; }
    if (!fresh) {
      const kept = await lib.trackDetails(t);
      if (id !== t.id) return;
      if (kept) {
        app.playKey = key;
        const playing = player.sourceKey === key && !!player.url;
        let blob: Blob | null = null;
        if (!playing && lib.canRead(t)) { try { blob = await playable(await lib.fileFor(t)); } catch { blob = null; } }
        if (id !== t.id) return;
        showResult(kept.info, kept.res, blob);
        canPlay = playing || !!blob;
        stored = true; phase = 'ready';
        return;
      }
    }
    if (t.status !== 'linked') { phase = 'no-file'; return; }
    if (!lib.canRead(t) && !ask) { phase = 'need-access'; return; }
    phase = 'loading';
    try {
      const file = await lib.fileFor(t);
      if (id !== t.id) return;
      await analyzeFile(file, key);
      if (app.error) { phase = 'error'; message = app.error.message; return; }
      stored = false; canPlay = true; phase = 'ready';
      if (app.info && app.res) void lib.saveTrackDetails(lib.store?.tracks.get(t.id) ?? t, app.info, app.res);
    } catch (e) { phase = 'error'; message = (e as Error).message || String(e); }
  }
  /** A stored analysis is on screen but the file needs permission before it can play. */
  async function allowPlay() {
    const t = track;
    if (!t) return;
    try {
      app.playBlob = await playable(await lib.fileFor(t));
canPlay = true;
    } catch (e) { message = (e as Error).message || String(e); }
  }

  // A fresh analysis on the detail page also refreshes the stored summary.
  $effect(() => {
    const res = app.res, info = app.info, v = app.verdict;
    if (!res || !info || !v || phase !== 'ready' || loaded !== id) return;
    untrack(() => {
      const t = lib.store?.tracks.get(id);
      if (!t || !info.fileSize) return;
      const s = summarize(info, res, v, { size: info.fileSize, mtime: t.mtime ?? 0 });
      const prev = lib.store?.analysis.get(id);
      if (!prev || prev.v !== s.v || prev.label !== s.label || prev.bpm !== s.bpm || prev.fileSize !== s.fileSize || prev.error) lib.store?.putAnalysis(id, { ...s, fileMtime: t.mtime ?? 0 });
      if (!t.format) lib.store?.putTrack({ ...t, format: formatOf(info), duration: t.duration ?? info.duration });
    });
  });

  $effect(() => {
    void id;
    untrack(() => { app.phase = 'start'; app.res = null; app.info = null; app.verdict = null; app.error = null; app.busy = null; });
    lib.prioritize(id);
    void load(false);
    return () => player.defer(null);   // a waiting source belongs to this page only
  });

  /** Another device's track: the verdict, tempo and key widgets built from its stored summary. */
  const remoteView = $derived.by(() => {
    const a = summary, t = track;
    if (phase !== 'remote' || !a || a.error || !t) return null;
    const f = t.format;
    const declared = f ? (f.lossless ? (f.bits ? f.bits + '-bit / ' : '') + +(f.sampleRate / 1000).toFixed(1) + ' kHz' : (f.bitrate ? f.bitrate + ' kbps ' : '') + f.codec) : t.fileName.split('.').pop()?.toUpperCase() || '—';
    const music: MusicResult | null = a.bpm || a.key ? { bpm: a.bpm, bpmConf: 1, key: a.key ? { ...a.key, runnerUp: null } as unknown as MusicResult['key'] : null } : null;
    return {
      grade: a.grade, label: a.label, headline: a.headline,
      sub: 'Measured on ' + elsewhere + (a.at ? ', ' + new Date(a.at).toLocaleDateString() : '') + '.',
      cells: [
        { k: 'Declared', val: declared, sub: f?.container ?? t.fileName.split('.').pop()?.toUpperCase() ?? '', tone: '' },
        { k: 'Measured bandwidth', val: a.fc ? fmtKHz(a.fc) : '—', sub: a.wall ? 'sharp wall' : a.full ? 'reaches the top' : 'gradual fade', tone: a.grade === 'bad' ? 'bad' : a.grade === 'warn' ? 'warn' : 'ok' },
        { k: 'Effective depth', val: a.effBits ? a.effBits + '-bit' : '—', sub: a.effBits ? 'of ' + a.declaredBits + ' declared' : f?.lossless === false ? 'not meaningful for lossy' : 'not measured', tone: a.effBits && a.effBits < a.declaredBits ? 'warn' : '' },
        { k: 'Likely origin', val: a.origin || '—', sub: 'from spectrum and tags', tone: '' },
      ],
      music, findings: a.findings,
    };
  });

  function stars(n: number | null) { return n == null ? '—' : '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n)); }
</script>

<div class="detail">
  <nav class="crumbs">
    <a href="#/">← Library</a>
    <span class="nav">
      {#if phase === 'ready'}
        <span class="src">{stored ? 'Stored analysis' : 'Just analysed'}</span>
        <button type="button" class="mini" id="auto-from-page" onclick={() => auto.show(id)}>Build playlist from this</button>
        <button type="button" class="mini" id="reanalyse" title="Analyse the file again and replace the stored result" onclick={() => load(true, true)}>Re-analyse</button>
      {/if}
      <button type="button" class="mini" disabled={pos <= 0} onclick={() => router.go('#/track/' + order[pos - 1])}>‹ Previous</button>
      <button type="button" class="mini" disabled={pos < 0 || pos >= order.length - 1} onclick={() => router.go('#/track/' + order[pos + 1])}>Next ›</button>
    </span>
  </nav>

  {#if !track}
    <p class="muted">This track isn’t in the open collection.</p>
  {:else}
    <header class="th">
      <div>
        <h2>{track.title || track.fileName}</h2>
        <p class="who">{[track.artist, track.album, track.year].filter(Boolean).join(' · ')}</p>
        <div class="rate"><Stars value={track.rating ?? imported.find(x => x.st.rating)?.st.rating ?? null} dim={track.rating == null && imported.some(x => x.st.rating)} size={18} onset={v => lib.rateTracks([id], v)} />
          <span>{track.rating != null ? track.rating + ' / 5' : imported.some(x => x.st.rating) ? 'rating from your DJ library' : 'not rated'}</span></div>
      </div>
      {#if summary && !summary.error}<span class="q" data-grade={summary.grade}>{summary.label}</span>{/if}
    </header>

    <section class="info">
      <dl>
        <div><dt class="label">File</dt><dd class="mono" title={location}>{location || '—'}</dd></div>
        <div><dt class="label">Size</dt><dd>{track.size ? fmtBytes(track.size) : '—'}</dd></div>
        <div><dt class="label">Length</dt><dd>{track.duration ? fmtTime(track.duration) : '—'}</dd></div>
        <div><dt class="label">Genre</dt><dd>{track.genre || '—'}</dd></div>
        <div><dt class="label">Label</dt><dd>{track.label || '—'}</dd></div>
        <div><dt class="label">Added</dt><dd>{new Date(track.addedAt).toLocaleDateString()}</dd></div>
        <div class="wide"><dt class="label">In playlists</dt><dd>
          {#each lists as l, i (l.id)}<a href="#/" onclick={() => view.select({ kind: 'list', id: l.id })}>{lib.listPath(l)}</a>{i < lists.length - 1 ? ', ' : ''}{:else}none{/each}
        </dd></div>
        <div class="wide"><dt class="label">Tags</dt><dd class="tagsdd">
          {#each tagsOf(track) as g (g)}<span class="tg" style:--c={tagColorOf(g)}>{g}</span>{/each}
          <button type="button" class="tedit" id="track-tags" data-tags-open onclick={e => view.editTags(e.currentTarget, { ids: [id] })}>{tagsOf(track).length ? 'Edit' : '+ Add tags'}</button>
        </dd></div>
        {#if track.comment}<div class="wide"><dt class="label">Comment</dt><dd>{track.comment}</dd></div>{/if}
        <div class="wide"><dt class="label"><label for="track-notes">Your notes</label></dt><dd class="notes">
          <textarea id="track-notes" rows="2" placeholder="Cue ideas, mix-in points, where it works in a set…" value={track.notes ?? ''}
            onchange={e => lib.setTrackNotes(id, e.currentTarget.value.trim() ? e.currentTarget.value : '')}></textarea>
        </dd></div>
      </dl>
      {#if imported.length}
        <table class="dj">
          <thead><tr><th>In</th><th>BPM</th><th>Key</th><th>Rating</th><th>Plays</th><th>Cues</th><th>Added</th></tr></thead>
          <tbody>
            {#each imported as { app: name, st } (name + st.externalId)}
              <tr><td>{name}</td><td class="mono">{st.bpm ? +st.bpm.toFixed(2) : '—'}</td><td class="mono">{st.key ?? '—'}</td><td class="stars">{stars(st.rating)}</td><td class="mono">{st.playCount ?? '—'}</td><td class="mono">{st.cues || '—'}</td><td>{st.dateAdded ?? '—'}</td></tr>
            {/each}
            {#if summary?.bpm || summary?.key}
              <tr class="mco"><td>GLUE analysis</td><td class="mono">{summary.bpm ?? '—'}</td><td class="mono">{summary.key ? keyLabel(summary.key, app.keyNotation) : '—'}</td><td colspan="4"></td></tr>
            {/if}
          </tbody>
        </table>
      {/if}
    </section>

    {#if phase === 'ready' && !canPlay && track.status === 'linked'}
      <div class="notice">This is the analysis stored earlier. To play the track, GLUE needs your permission to read it again. <button type="button" class="btn" onclick={allowPlay}>Allow and play</button></div>
    {/if}
    {#if phase === 'remote'}
      <div class="notice" id="track-elsewhere">
        <span>This track’s file is on <b>{elsewhere}</b>. Its details and analysis come from there. Playing and analysing it on this computer comes with GLUE Home streaming, which isn’t available yet.</span>
      </div>
      {#if remoteView}
        <div class="remote-res" id="remote-analysis">
          <Sidebar summary={remoteView} />
          <div class="remote-col">
            <Evidence findings={remoteView.findings} elsewhere={elsewhere ?? ''} />
            <p class="fine">The spectrogram and spectrum need the audio file, so they show when the track plays on this computer.</p>
          </div>
        </div>
      {/if}
    {:else if phase === 'need-access'}
      <div class="notice">GLUE needs your permission to read “{track.fileKey ? track.fileName : root?.root.name}” again. <button type="button" class="btn" onclick={() => load(true)}>Allow and analyse</button></div>
    {:else if phase === 'no-file'}
      <div class="notice">{track.status === 'missing' ? 'The file wasn’t found where it was last seen. Scan its music folder again, or add the folder it moved to.' : 'This track came from an imported library and isn’t linked to a file yet. Add the music folder it lives in (sidebar › Music folders) and GLUE links it automatically.'}</div>
    {:else if phase === 'error'}
      <div class="error"><b>Couldn’t analyse this track.</b> {message}</div>
    {/if}

    {#if app.busy}
      <div class="status">
        <div class="row"><span>{app.busy.text}</span><span class="mono">{app.busy.p != null ? Math.round(app.busy.p * 100) + '%' : ''}</span></div>
        <div class="bar"><span style:width={(app.busy.p ?? 0) * 100 + '%'}></span></div>
      </div>
    {/if}
    {#if app.phase === 'result' && phase === 'ready'}<Results />{/if}
  {/if}
</div>

<style>
  .detail { display: grid; gap: 16px; }
  .crumbs { display: flex; justify-content: space-between; align-items: center; }
  .crumbs a { color: var(--accent); text-decoration: none; font-size: 13.5px; }
  .nav { display: flex; gap: 6px; align-items: center; }
  .src { color: var(--muted); font-size: 12px; margin-right: 4px; }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 3px 9px; cursor: pointer; }
  .mini:disabled { opacity: .4; cursor: default; }
  .th { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
  h2 { font-size: 26px; font-stretch: 112%; }
  .who { color: var(--ink-2); }
  .rate { display: flex; align-items: center; gap: 10px; margin-top: 6px; color: var(--muted); font-size: 12.5px; }
  .muted { color: var(--muted); }
  .q { font-family: var(--font-mono); font-size: 12px; letter-spacing: .1em; text-transform: uppercase; padding: 5px 11px; border-radius: 4px; border: 1px solid currentColor; white-space: nowrap; }
  .q[data-grade="ok"] { color: var(--ok); } .q[data-grade="warn"] { color: var(--warn); } .q[data-grade="bad"] { color: var(--bad); } .q[data-grade="info"] { color: var(--muted); }
  .info { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 16px 28px; border: 1px solid var(--line); background: var(--surface); border-radius: var(--radius); padding: 14px 16px; }
  dl { margin: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 18px; }
  dl .wide { grid-column: 1 / -1; }
  dl div:first-child { grid-column: 1 / -1; }
  dt { display: block; }
  dd { margin: 0; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  dd.mono { font-size: 12px; }
  dd.notes { white-space: normal; overflow: visible; }
  dd.notes textarea { width: 100%; resize: vertical; background: var(--ground); border: 1px solid var(--line-2); border-radius: 5px; padding: 6px 8px; font: 13px/1.45 var(--font-sans); color: var(--ink); }
  dd.notes textarea:focus { outline: none; border-color: var(--accent); }
  dd a { color: var(--accent); text-decoration: none; }
  .tagsdd { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; white-space: normal; overflow: visible; }
  .tg { font-size: 12px; line-height: 18px; padding: 0 8px; border-radius: 9px; background: color-mix(in srgb, var(--c) 20%, transparent); border: 1px solid color-mix(in srgb, var(--c) 50%, transparent); }
  .tedit { background: none; border: 1px dashed var(--line-2); border-radius: 9px; color: var(--ink-2); font-size: 12px; padding: 0 8px; line-height: 18px; cursor: pointer; }
  .tedit:hover { border-color: var(--accent); color: var(--accent); }
  .dj { border-collapse: collapse; font-size: 12.5px; align-self: start; width: 100%; }
  .dj th { text-align: left; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; padding: 0 8px 6px 0; }
  .dj td { padding: 4px 8px 4px 0; border-top: 1px solid var(--line); color: var(--ink-2); }
  .dj .mco td { color: var(--accent); }
  .stars { color: var(--warn); letter-spacing: 1px; }
  .remote-res { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); gap: 16px; align-items: start; }
  .remote-col { display: grid; gap: 10px; }
  .fine { color: var(--muted); font-size: 12.5px; }
  @media (max-width: 900px) { .remote-res { grid-template-columns: 1fr; } }
  .notice { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; background: color-mix(in srgb, var(--accent) 8%, var(--surface)); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); border-radius: var(--radius); padding: 10px 14px; font-size: 13.5px; }
  @media (max-width: 1000px) { .info { grid-template-columns: 1fr; } }
</style>
