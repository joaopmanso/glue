<script lang="ts">
  /* An event's page (ADR 0074): when and where, the flyer, the lineup, and its playlists (the versions
     made for it in its folder, and those assigned to it), each timed against the set. */
  import { lib } from '../../lib/library.svelte';
  import { events, fmtWhen } from '../../lib/events.svelte';
  import { view } from '../../lib/view.svelte';
  import { router } from '../../lib/route.svelte';
  import { menu } from '../../lib/menu.svelte';
  import { listPicker } from '../../lib/trackMenu';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { tracksFor } from '../../lib/view.svelte';
  import { daysUntil, isPast, needsMusic, setSeconds } from '../../core/library/events';
  import type { List } from '../../store/types';
  import EventEditor from './EventEditor.svelte';

  let { id }: { id: string } = $props();
  const e = $derived(events.get(id));
  const lists = $derived(e ? events.listsOf(e) : { versions: [], assigned: [] });
  const songs = $derived(e ? events.tracksOf(e) : []);
  const set = $derived(e ? setSeconds(e) : null);
  const now = new Date();
  const needs = $derived(!!e && needsMusic(e, songs.length, now));
  let editing = $state(false);
  let flyer = $state<string | null>(null);
  $effect(() => { void events.flyerVersion; const ev = e; if (!ev?.flyer) { flyer = null; return; } void events.flyerUrl(ev).then(u => (flyer = u)); });
  let fileInput = $state<HTMLInputElement>();
  /** 1:30:00, or 52:10 under an hour. */
  function dur(sec: number) { const t = Math.round(sec), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, x = String(t % 60).padStart(2, '0'); return h ? h + ':' + String(m).padStart(2, '0') + ':' + x : m + ':' + x; }

  function info(l: List) {
    const ts = tracksFor({ kind: 'list', id: l.id }), secs = ts.reduce((a, t) => a + (t.duration ?? 0), 0);
    return { n: ts.length, secs, playable: ts.filter(t => t.status === 'linked' && !t.remote).map(t => t.id) };
  }
  function play(l: List) { const p = info(l).playable; if (p.length) void nowPlaying.play(p[0], p, 0, l.name); else lib.notice = 'Nothing in ' + l.name + ' can play here.'; }
  function open(l: List) { view.select({ kind: 'list', id: l.id }); router.go('#/'); }
  function remove() {
    if (!e || !confirm('Delete “' + e.name + '”?')) return;
    const withFolder = lists.versions.length > 0 ? confirm('Also delete its folder in Playlists, with the ' + lists.versions.length + ' playlist' + (lists.versions.length === 1 ? '' : 's') + ' made for it?\n\nCancel keeps them.') : true;
    void events.remove(e.id, withFolder);
    router.go('#/events');
  }
  const pickFrom = (el: Element, label: string, pick: (l: List) => void) => menu.from(el, () => listPicker(pick, { only: l => l.kind === 'playlist' && events.ofList(l.id)?.id !== id }), label, 'Find a playlist');
  function when(d: number) { return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d > 1 ? 'In ' + d + ' days' : isPast(e!, now) ? 'Been' : 'Now'; }
</script>

{#snippet row(l: List, assigned: boolean)}
  {@const x = info(l)}
  <li class="pl" data-list={l.id}>
    <div class="pn">
      <button type="button" class="name" onclick={() => open(l)} title="Open it in the library">{l.name}</button>
      <span class="n">{x.n} song{x.n === 1 ? '' : 's'} · {dur(x.secs)}{set ? ' of ' + dur(set) : ''}</span>
    </div>
    {#if set}<span class="fill" title={Math.round(x.secs / set * 100) + '% of the set'}><i style:width={Math.min(100, x.secs / set * 100) + '%'} class:over={x.secs > set}></i></span>{/if}
    <span class="acts">
      <button type="button" class="mini" disabled={!x.playable.length} onclick={() => play(l)}>Play</button>
      {#if assigned}<button type="button" class="mini" title="It stays where it is in Playlists" onclick={() => events.unassign(id, l.id)}>Unassign</button>{/if}
    </span>
  </li>
{/snippet}

<div class="evp" id="event-page">
  <nav class="crumbs"><a href="#/events">← Calendar</a></nav>
  {#if lib.notice}<div class="notice" role="status"><span>{lib.notice}</span><button type="button" aria-label="Dismiss" onclick={() => (lib.notice = '')}>×</button></div>{/if}
  {#if !e}
    <p class="muted">This event isn’t in the open collection.</p>
  {:else}
    <header class="eh">
      <div class="et">
        <span class="when">{when(daysUntil(e, now))}{e.status !== 'planned' ? ' · ' + e.status : ''}</span>
        <h2 id="event-name" class:cancelled={e.status === 'cancelled'}>{e.name}</h2>
        <p class="sub">{fmtWhen(e.starts)}{e.ends ? ' – ' + e.ends.slice(11, 16) : ''}{e.venue ? ' · ' + e.venue : ''}{e.city ? ', ' + e.city : ''}</p>
      </div>
      <div class="hb">
        <button type="button" class="mini" id="event-edit" disabled={lib.readOnly} onclick={() => (editing = true)}>Edit</button>
        <button type="button" class="mini" id="event-stats" onclick={() => (view.statsFor = { title: e!.name, ids: songs.map(t => t.id) })}>Stats…</button>
        <button type="button" class="mini danger" id="event-delete" disabled={lib.readOnly} onclick={remove}>Delete…</button>
      </div>
    </header>
    {#if needs}<p class="needs" id="event-needs">No music for it yet: make a version of a playlist for it, or assign one.</p>{/if}

    <div class="ecols">
      <section class="main">
        <h3>Music</h3>
        <div class="mbar">
          <button type="button" class="btn" id="event-version" disabled={lib.readOnly} onclick={ev => pickFrom(ev.currentTarget, 'Make a version of', l => { const v = events.makeVersion(id, l.id); if (v) lib.notice = 'Made “' + v.name + '” in the event’s folder: trim and reorder it there.'; })}>Make a version of a playlist…</button>
          <button type="button" class="mini" id="event-assign" disabled={lib.readOnly} onclick={ev => pickFrom(ev.currentTarget, 'Assign', l => events.assign(id, l.id))}>Assign a playlist…</button>
          <button type="button" class="mini" id="event-new-list" disabled={lib.readOnly} onclick={() => { const f = e!.folderId; const l = f ? lib.createList('playlist', 'Set', f) : null; if (l) open(l); }}>New empty playlist</button>
          {#if e.folderId}<button type="button" class="mini" id="event-folder" onclick={() => { view.select({ kind: 'list', id: e!.folderId! }); router.go('#/'); }}>Open its folder</button>{/if}
        </div>
        {#if lists.versions.length}
          <h4>Made for it <small>in Playlists › Events</small></h4>
          <ul class="pls" id="event-versions">{#each lists.versions as l (l.id)}{@render row(l, false)}{/each}</ul>
        {/if}
        {#if lists.assigned.length}
          <h4>Assigned</h4>
          <ul class="pls" id="event-assigned">{#each lists.assigned as l (l.id)}{@render row(l, true)}{/each}</ul>
        {/if}
        {#if !lists.versions.length && !lists.assigned.length}<p class="muted">No playlists yet.</p>{/if}
        {#if set}<p class="fine">The set: {e.setStart} – {e.setEnd} ({dur(set)}).</p>{/if}
      </section>

      <aside class="eside">
        <div class="flyer">
          {#if flyer}<img src={flyer} alt={'Flyer of ' + e.name} id="event-flyer" />{/if}
          <span class="fb">
            <button type="button" class="mini" id="event-flyer-add" disabled={lib.readOnly} onclick={() => fileInput?.click()}>{e.flyer ? 'Change the flyer…' : 'Add a flyer…'}</button>
            {#if e.flyer}<button type="button" class="mini" onclick={() => void events.removeFlyer(id)}>Remove</button>{/if}
          </span>
          <input type="file" accept="image/*" hidden bind:this={fileInput} id="event-flyer-file" onchange={ev => { const f = ev.currentTarget.files?.[0]; ev.currentTarget.value = ''; if (f) void events.setFlyer(id, f).catch(err => (lib.notice = 'Couldn’t read that picture: ' + (err as Error).message)); }} />
        </div>
        <dl>
          {#if e.setStart}<div><dt>My set</dt><dd>{e.setStart}{e.setEnd ? ' – ' + e.setEnd : ''}</dd></div>{/if}
          {#if e.venue || e.address}<div><dt>Where</dt><dd>{[e.venue, e.address, e.city].filter(Boolean).join(', ')}</dd></div>{/if}
          {#if e.lineup.length}<div><dt>Lineup</dt><dd class="lineup">{#each e.lineup as p (p.name)}<span class:me={p.me}>{p.name}</span>{/each}</dd></div>{/if}
          {#if e.url}<div><dt>Link</dt><dd><a href={e.url} target="_blank" rel="noopener noreferrer">{e.url.replace(/^https?:\/\//, '')}</a></dd></div>{/if}
          <div><dt>Reminder</dt><dd>{e.remindDays > 0 ? e.remindDays + ' days before, while it has no music' : 'None'}</dd></div>
        </dl>
        {#if e.notes}<p class="notes">{e.notes}</p>{/if}
      </aside>
    </div>
  {/if}
</div>

{#if editing && e}<EventEditor id={e.id} day={e.starts.slice(0, 10)} onclose={() => (editing = false)} />{/if}

<style>
  .evp { display: grid; gap: 14px; }
  .notice { display: flex; justify-content: space-between; gap: 12px; align-items: center; background: color-mix(in srgb, var(--accent) 9%, var(--surface)); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); border-radius: var(--radius); padding: 7px 12px; font-size: 13px; }
  .notice button { background: none; border: 0; color: var(--muted); font-size: 16px; cursor: pointer; }
  .crumbs a { color: var(--accent); text-decoration: none; font-size: 13.5px; }
  .eh { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; }
  .when { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
  h2 { font-size: 28px; margin: 2px 0 0; font-stretch: 112%; }
  h2.cancelled { text-decoration: line-through; color: var(--muted); }
  .sub { margin: 2px 0 0; color: var(--ink-2); }
  .hb { display: flex; gap: 8px; }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12.5px; padding: 3px 10px; cursor: pointer; }
  .mini:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .mini.danger { color: var(--bad); }
  .needs { margin: 0; padding: 8px 12px; border: 1px solid color-mix(in srgb, var(--warn) 50%, var(--line-2)); border-radius: 8px; background: color-mix(in srgb, var(--warn) 10%, transparent); color: var(--ink); font-size: 13.5px; }
  .ecols { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 22px; align-items: start; }
  h3 { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0 0 8px; }
  h4 { font-size: 13px; margin: 14px 0 6px; }
  h4 small { color: var(--muted); font-weight: 400; margin-left: 6px; }
  .mbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .pls { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .pl { display: grid; grid-template-columns: minmax(0, 1fr) 160px auto; gap: 12px; align-items: center; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  .pn { display: grid; min-width: 0; }
  .name { background: none; border: 0; padding: 0; text-align: left; color: var(--ink); font-weight: 650; font-size: 14px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name:hover { color: var(--accent); }
  .n { font: 12px var(--font-mono); color: var(--muted); }
  .fill { height: 6px; border-radius: 3px; background: var(--raised); overflow: hidden; }
  .fill i { display: block; height: 100%; background: var(--accent); }
  .fill i.over { background: var(--warn); }
  .acts { display: flex; gap: 6px; }
  .fine, .muted { color: var(--muted); font-size: 13px; margin: 8px 0 0; }
  .eside { display: grid; gap: 12px; }
  .flyer { display: grid; gap: 8px; }
  .flyer img { width: 100%; border-radius: 8px; border: 1px solid var(--line); display: block; }
  .fb { display: flex; gap: 6px; }
  dl { margin: 0; display: grid; gap: 8px; }
  dl div { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 8px; font-size: 13px; }
  dt { color: var(--muted); }
  dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
  dd a { color: var(--accent); }
  .lineup { display: flex; flex-wrap: wrap; gap: 4px; }
  .lineup span { padding: 1px 7px; border-radius: 9px; background: var(--raised); font-size: 12px; }
  .lineup span.me { background: color-mix(in srgb, var(--accent) 25%, transparent); color: var(--ink); font-weight: 650; }
  .notes { white-space: pre-wrap; font-size: 13px; color: var(--ink-2); margin: 0; }
  @media (max-width: 900px) { .ecols { grid-template-columns: minmax(0, 1fr); } .pl { grid-template-columns: minmax(0, 1fr) auto; } .fill { display: none; } }
  /* A phone (ADR 0078): the shell has the way back. */
  @media (max-width: 760px) { .crumbs { display: none; } }
</style>
