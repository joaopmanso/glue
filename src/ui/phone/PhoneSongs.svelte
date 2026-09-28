<script lang="ts">
  /* A list of songs on a phone (ADR 0078): what the open view shows (a playlist, a tag, an artist, a
     search), two lines a song, its cover. A tap plays it (the list plays on after it); ⋯ or a long press
     opens its menu. Only the rows on screen are drawn. */
  import { lib } from '../../lib/library.svelte';
  import { view, type SortKey } from '../../lib/view.svelte';
  import { app } from '../../lib/app.svelte';
  import { phone } from '../../lib/phone.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { player } from '../../lib/player.svelte';
  import { trackMenu } from '../../lib/trackMenu';
  import { tidy, type MenuEntry } from '../../lib/menu.svelte';
  import { bpmShown, fmtBpm } from '../../lib/bpm';
  import { keyLabel } from '../../core/audio/keys';
  import { fmtTime } from '../../core/format';
  import CoverArt from '../library/CoverArt.svelte';

  let { empty = 'No songs here.' }: { empty?: string } = $props();
  const ROW = 62;
  const rows = $derived.by(() => { void lib.version; void view.search; return view.rows(app.keyNotation); });
  const order = $derived(rows.map(r => r.t.id));
  let box = $state<HTMLDivElement>(), top = $state(0), height = $state(700);
  const first = $derived(Math.max(0, Math.floor(top / ROW) - 6));
  const shown = $derived(rows.slice(first, first + Math.ceil(height / ROW) + 12));
  // A new list starts at its top.
  $effect(() => { void view.sel; if (box) { box.scrollTop = 0; top = 0; } });

  function play(id: string) {
    if (!lib.playsHere(lib.store!.tracks.get(id)!)) { lib.notice = 'This song can’t play here: its computer’s GLUE Home isn’t reachable.'; return; }
    if (nowPlaying.trackId === id && player.url) nowPlaying.resumeFrom(id, order); else void nowPlaying.play(id, order);
  }
  function more(id: string) { const t = lib.store?.tracks.get(id); phone.menu(t?.title || t?.fileName || 'Song', () => trackMenu([id], { order })); }
  // A long press opens the menu (no right-click on a phone).
  let pressT = 0, pressed = '';
  function down(id: string) { pressed = ''; clearTimeout(pressT); pressT = window.setTimeout(() => { pressed = id; more(id); }, 550); }
  function up() { clearTimeout(pressT); }
  const SORTS: [SortKey, string][] = [['order', 'Playlist order'], ['added', 'Recently added'], ['title', 'Title'], ['artist', 'Artist'], ['bpm', 'BPM'], ['key', 'Key'], ['duration', 'Length'], ['rating', 'Rating']];
  function sortMenu(): MenuEntry[] {
    const ordered = view.sel.kind === 'list' || view.sel.kind === 'dj';
    return tidy([
      ...SORTS.filter(([k]) => k !== 'order' || ordered).map(([k, label]) => ({ label, checked: view.sort.key === k, hint: view.sort.key === k && k !== 'order' ? (view.sort.dir === 1 ? '↑' : '↓') : undefined, attrs: { 'data-sort': k }, run: () => view.sortBy(k) })),
    ]);
  }
  const playable = $derived(rows.filter(r => lib.playsHere(r.t)).map(r => r.t.id));
</script>

<div class="songs" id="phone-songs">
  <div class="tools">
    <span class="n">{rows.length.toLocaleString()} song{rows.length === 1 ? '' : 's'}</span>
    <button type="button" id="phone-play-all" disabled={!playable.length} onclick={() => void nowPlaying.play(playable[0], playable)}>▶ Play</button>
    <button type="button" id="phone-shuffle" disabled={!playable.length} onclick={() => { nowPlaying.setShuffle(true); void nowPlaying.play(playable[Math.floor(Math.random() * playable.length)], playable); }}>Shuffle</button>
    <button type="button" class="sort" id="phone-sort" aria-label="Sort" onclick={() => phone.menu('Sort by', sortMenu)}>⇅</button>
  </div>
  <div class="list" bind:this={box} bind:clientHeight={height} onscroll={() => (top = box!.scrollTop)}>
    <div class="spacer" style:height={rows.length * ROW + 'px'}>
      {#each shown as r, j (r.t.id)}
        {@const b = bpmShown(r.t, r.a, r.dj?.bpm ?? null)}
        <div class="row" role="button" tabindex="0" data-track={r.t.id} class:playing={nowPlaying.trackId === r.t.id} class:off={!lib.playsHere(r.t)}
          style:transform={'translateY(' + (first + j) * ROW + 'px)'}
          onclick={() => { if (pressed !== r.t.id) play(r.t.id); pressed = ''; }}
          onkeydown={e => { if (e.key === 'Enter') play(r.t.id); }}
          onpointerdown={() => down(r.t.id)} onpointerup={up} onpointerleave={up} onpointercancel={up}
          oncontextmenu={e => { e.preventDefault(); more(r.t.id); }}>
          <CoverArt t={r.t} px={44} />
          <span class="txt">
            <b>{r.t.title || r.t.fileName}</b>
            <small>{r.t.artist || 'Unknown artist'}{#if b} · {fmtBpm(b)}{/if}{#if r.a?.key} · {keyLabel(r.a.key, app.keyNotation)}{:else if r.dj?.key} · {r.dj.key}{/if}{#if r.t.duration} · {fmtTime(r.t.duration)}{/if}</small>
          </span>
          <button type="button" class="dots" aria-label="More" onclick={e => { e.stopPropagation(); more(r.t.id); }} onpointerdown={e => e.stopPropagation()}>⋯</button>
        </div>
      {/each}
    </div>
    {#if !rows.length}<p class="empty">{empty}</p>{/if}
  </div>
</div>

<style>
  .songs { display: flex; flex-direction: column; min-height: 0; flex: 1; }
  .tools { display: flex; align-items: center; gap: 8px; padding: 8px 14px; flex: none; }
  .n { flex: 1; color: var(--muted); font-size: 13px; }
  .tools button { background: var(--raised); border: 1px solid var(--line-2); border-radius: 18px; color: var(--ink); font-size: 14px; padding: 7px 14px; cursor: pointer; }
  .tools button:disabled { opacity: .4; }
  #phone-play-all { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 650; }
  .tools .sort { padding: 7px 12px; }
  .list { position: relative; flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .spacer { position: relative; }
  .row { position: absolute; left: 0; right: 0; height: 62px; display: flex; align-items: center; gap: 12px; padding: 0 6px 0 14px; border-bottom: 1px solid var(--line); cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  .row:active { background: var(--raised); }
  .row.playing b { color: var(--accent); }
  .row.off { opacity: .55; }
  .row :global(.cov) { border-radius: 6px; background: var(--raised); }
  .row :global(.cov:not(.has)) { display: grid; place-items: center; color: var(--muted); }
  .row :global(.cov:not(.has)::before) { content: '♪'; font-size: 18px; }
  .txt { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .txt b { font-size: 15.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .txt small { color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dots { width: 44px; height: 44px; flex: none; background: none; border: 0; color: var(--muted); font-size: 22px; cursor: pointer; }
  .empty { color: var(--muted); text-align: center; padding: 30px 20px; }
</style>
