<script lang="ts">
  /* A list of songs on a phone or a tablet (ADR 0078, 0079): what the open view shows (a playlist, a tag,
     an artist, a search), two lines a song, its cover. A tap plays it (the list plays on after it); ⋯ or a
     long press opens its menu. Select picks several songs for one action; a playlist's Edit reorders
     (drag ≡) and removes (⊖). Only the rows on screen are drawn. */
  import { lib } from '../../lib/library.svelte';
  import { view, type SortKey } from '../../lib/view.svelte';
  import { app } from '../../lib/app.svelte';
  import { phone } from '../../lib/phone.svelte';
  import { nowPlaying } from '../../lib/nowPlaying.svelte';
  import { player } from '../../lib/player.svelte';
  import { trackMenu } from '../../lib/trackMenu';
  import { addMenu, removeFrom } from '../../lib/phoneLists';
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
  const count = $derived(Math.ceil(height / ROW) + 12);
  // A new list starts at its top.
  $effect(() => { void view.sel; if (box) { box.scrollTop = 0; top = 0; } });

  // The playlist on screen, when it's one this device may change.
  const listId = $derived(view.sel.kind === 'list' ? view.sel.id : null);
  const mine = $derived.by(() => { void lib.version; const l = listId ? lib.store?.lists.get(listId) : null; return l && l.kind === 'playlist' && !lib.readOnly ? l : null; });
  const editing = $derived(!!mine && phone.editing === mine.id);

  function play(id: string) {
    if (!lib.playsHere(lib.store!.tracks.get(id)!)) { lib.notice = 'This song can’t play here: its computer’s GLUE Home isn’t reachable.'; return; }
    if (nowPlaying.trackId === id && player.url) nowPlaying.resumeFrom(id, order); else void nowPlaying.play(id, order);
  }
  function more(id: string) { const t = lib.store?.tracks.get(id); phone.menu(t?.title || t?.fileName || 'Song', () => trackMenu([id], { order })); }
  function tap(id: string) {
    if (editing) return;
    if (phone.selecting) { phone.pick(id); return; }
    if (pressed !== id) play(id);
    pressed = '';
  }
  // A long press opens the menu (no right-click on a phone).
  let pressT = 0, pressed = '';
  function down(id: string) { pressed = ''; clearTimeout(pressT); if (editing || phone.selecting) return; pressT = window.setTimeout(() => { pressed = id; more(id); }, 550); }
  function up() { clearTimeout(pressT); }
  const SORTS: [SortKey, string][] = [['order', 'Playlist order'], ['added', 'Recently added'], ['title', 'Title'], ['artist', 'Artist'], ['bpm', 'BPM'], ['key', 'Key'], ['duration', 'Length'], ['rating', 'Rating']];
  function sortMenu(): MenuEntry[] {
    const ordered = view.sel.kind === 'list' || view.sel.kind === 'dj';
    return tidy([
      ...SORTS.filter(([k]) => k !== 'order' || ordered).map(([k, label]) => ({ label, checked: view.sort.key === k, hint: view.sort.key === k && k !== 'order' ? (view.sort.dir === 1 ? '↑' : '↓') : undefined, attrs: { 'data-sort': k }, run: () => view.sortBy(k) })),
    ]);
  }
  const playable = $derived(rows.filter(r => lib.playsHere(r.t)).map(r => r.t.id));
  const picked = $derived([...phone.picked].filter(id => order.includes(id)));

  // ─── Reordering a playlist: drag a song by its handle ───
  let drag = $state<{ id: string; i: number; j: number; y0: number; s0: number; dy: number } | null>(null);
  let lastY = 0, raf = 0;
  function grab(e: PointerEvent, id: string, i: number) {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag = { id, i, j: i, y0: e.clientY, s0: box!.scrollTop, dy: 0 };
    lastY = e.clientY;
    const loop = () => {
      if (!drag || !box) return;
      // Near the top or bottom edge: the list scrolls under the finger.
      const r = box.getBoundingClientRect();
      if (lastY < r.top + 48) box.scrollTop -= 10; else if (lastY > r.bottom - 48) box.scrollTop += 10;
      top = box.scrollTop;
      follow();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  function follow() {
    const d = drag;
    if (!d || !box) return;
    const dy = lastY - d.y0 + (box.scrollTop - d.s0);
    const j = Math.max(0, Math.min(rows.length - 1, Math.round((d.i * ROW + dy) / ROW)));
    drag = { ...d, dy, j };
  }
  function drop() {
    cancelAnimationFrame(raf);
    const d = drag;
    drag = null;
    const l = mine;
    if (!d || !l || d.j === d.i || !rows[d.j]) return;
    // Next to the song it landed on: after it going down, before it going up.
    const at = l.items.indexOf(rows[d.j].t.id);
    if (at >= 0) lib.moveInList(l.id, [d.id], d.j > d.i ? at + 1 : at);
  }
  function yOf(idx: number) {
    const d = drag;
    if (!d) return idx * ROW;
    if (idx === d.i) return d.i * ROW + d.dy;
    if (d.i < d.j && idx > d.i && idx <= d.j) return (idx - 1) * ROW;
    if (d.j < d.i && idx >= d.j && idx < d.i) return (idx + 1) * ROW;
    return idx * ROW;
  }
  // The rows drawn: those on screen, and the one being dragged wherever it is.
  const idxs = $derived.by(() => {
    const out: number[] = [];
    for (let i = first; i < Math.min(rows.length, first + count); i++) out.push(i);
    if (drag && (drag.i < first || drag.i >= first + count) && drag.i < rows.length) out.push(drag.i);
    return out;
  });
</script>

<div class="songs" id="phone-songs" class:editing class:selecting={phone.selecting}>
  <div class="tools">
    {#if editing}
      <span class="n">Drag ≡ to reorder · ⊖ removes</span>
    {:else if phone.selecting}
      <button type="button" id="phone-select-done" onclick={() => phone.select(false)}>Cancel</button>
      <span class="n mid" id="phone-picked">{picked.length ? picked.length + ' selected' : 'Tap songs to select'}</span>
      <button type="button" id="phone-select-all" disabled={!rows.length} onclick={() => phone.pickAll(order)}>{picked.length === rows.length && rows.length ? 'None' : 'All'}</button>
    {:else}
      <span class="n">{rows.length.toLocaleString()} song{rows.length === 1 ? '' : 's'}</span>
      <button type="button" id="phone-play-all" disabled={!playable.length} onclick={() => void nowPlaying.play(playable[0], playable)}>▶ Play</button>
      <button type="button" class="ic" id="phone-shuffle" aria-label="Shuffle" disabled={!playable.length} onclick={() => { nowPlaying.setShuffle(true); void nowPlaying.play(playable[Math.floor(Math.random() * playable.length)], playable); }}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5h2.2l5.6 7H13M2 11.5h2.2l1.9-2.4M9.9 6.9l1.9-2.4H13M11.3 3 13 4.5l-1.7 1.5M11.3 10 13 11.5l-1.7 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" class="ic" id="phone-sort" aria-label="Sort" onclick={() => phone.menu('Sort by', sortMenu)}>⇅</button>
      <button type="button" class="ic" id="phone-select" aria-label="Select songs" disabled={!rows.length} onclick={() => phone.select(true)}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.2 8.2 7.2 10.1 10.9 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    {/if}
  </div>
  <div class="list" bind:this={box} bind:clientHeight={height} onscroll={() => (top = box!.scrollTop)} class:moving={!!drag}>
    <div class="spacer" style:height={rows.length * ROW + 'px'}>
      {#each idxs as idx (rows[idx].t.id)}
        {@const r = rows[idx]}
        {@const b = bpmShown(r.t, r.a, r.dj?.bpm ?? null)}
        {@const on = phone.picked.has(r.t.id)}
        <div class="row" role="button" tabindex="0" data-track={r.t.id} class:playing={nowPlaying.trackId === r.t.id} class:off={!lib.playsHere(r.t)} class:picked={on} class:held={drag?.i === idx}
          aria-pressed={phone.selecting ? on : undefined}
          style:transform={'translateY(' + yOf(idx) + 'px)'}
          onclick={() => tap(r.t.id)}
          onkeydown={e => { if (e.key === 'Enter') tap(r.t.id); }}
          onpointerdown={() => down(r.t.id)} onpointerup={up} onpointerleave={up} onpointercancel={up}
          oncontextmenu={e => { e.preventDefault(); if (!editing && !phone.selecting) more(r.t.id); }}>
          {#if editing}<button type="button" class="minus" aria-label={'Remove ' + (r.t.title || r.t.fileName) + ' from the playlist'} onclick={e => { e.stopPropagation(); removeFrom(mine!.id, [r.t.id]); }}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M5.5 10h9" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg></button>{/if}
          {#if phone.selecting}<span class="check" aria-hidden="true">{#if on}<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M6 10.3 8.7 13l5.3-5.6" fill="none" stroke="var(--accent-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>{/if}</span>{/if}
          <CoverArt t={r.t} px={44} />
          <span class="txt">
            <b>{r.t.title || r.t.fileName}</b>
            <small>{r.t.artist || 'Unknown artist'}{#if b} · {fmtBpm(b)}{/if}{#if r.a?.key} · {keyLabel(r.a.key, app.keyNotation)}{:else if r.dj?.key} · {r.dj.key}{/if}{#if r.t.duration} · {fmtTime(r.t.duration)}{/if}</small>
          </span>
          {#if editing}
            <span class="grip" role="button" tabindex="-1" aria-label="Drag to reorder" onpointerdown={e => grab(e, r.t.id, idx)} onpointermove={e => { if (drag) { lastY = e.clientY; follow(); } }} onpointerup={drop} onpointercancel={drop}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5h10M3 8h10M3 11h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </span>
          {:else if !phone.selecting}
            <button type="button" class="dots" aria-label="More" onclick={e => { e.stopPropagation(); more(r.t.id); }} onpointerdown={e => e.stopPropagation()}>⋯</button>
          {/if}
        </div>
      {/each}
    </div>
    {#if !rows.length}<p class="empty">{empty}</p>{/if}
  </div>
</div>

{#if phone.selecting}
  <div class="selbar" id="phone-selbar">
    <button type="button" id="phone-sel-add" disabled={!picked.length} onclick={() => { const ids = picked; phone.menu('Add ' + ids.length + ' song' + (ids.length === 1 ? '' : 's') + ' to', () => addMenu(ids, () => phone.select(false))); }}>Add to playlist</button>
    {#if mine}<button type="button" id="phone-sel-remove" class="danger" disabled={!picked.length} onclick={() => { removeFrom(mine.id, picked); phone.select(false); }}>Remove</button>{/if}
    <button type="button" class="ic" id="phone-sel-more" aria-label="More" disabled={!picked.length} onclick={() => { const ids = picked; phone.menu(ids.length + ' song' + (ids.length === 1 ? '' : 's'), () => trackMenu(ids, { order })); }}>⋯</button>
  </div>
{/if}

<style>
  .songs { display: flex; flex-direction: column; min-height: 0; flex: 1; }
  .tools { display: flex; align-items: center; gap: 8px; padding: 8px 14px; flex: none; min-height: 52px; box-sizing: border-box; }
  .n { flex: 1; color: var(--muted); font-size: 13px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .n.mid { text-align: center; color: var(--ink-2); font-size: 14px; }
  .tools button { background: var(--raised); border: 1px solid var(--line-2); border-radius: 18px; color: var(--ink); font-size: 14px; padding: 7px 14px; cursor: pointer; flex: none; }
  .tools button:disabled { opacity: .4; }
  .tools .ic { width: 38px; height: 36px; padding: 0; display: grid; place-items: center; }
  .tools .ic svg { width: 18px; height: 18px; }
  #phone-play-all { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 650; }
  .list { position: relative; flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .spacer { position: relative; }
  .row { position: absolute; left: 0; right: 0; height: 62px; display: flex; align-items: center; gap: 12px; padding: 0 6px 0 14px; border-bottom: 1px solid var(--line); background: var(--ground); cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; box-sizing: border-box; }
  .row:active { background: var(--raised); }
  .row.playing b { color: var(--accent); }
  .row.off { opacity: .55; }
  .row.picked { background: color-mix(in srgb, var(--accent) 10%, var(--ground)); }
  .moving .row { transition: transform .15s ease; }
  .moving .row.held { transition: none; z-index: 2; background: var(--raised); box-shadow: 0 8px 24px rgb(0 0 0 / .45); }
  .row :global(.cov) { border-radius: 6px; background: var(--raised); }
  .row :global(.cov:not(.has)) { display: grid; place-items: center; color: var(--muted); }
  .row :global(.cov:not(.has)::before) { content: '♪'; font-size: 18px; }
  .txt { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .txt b { font-size: 15.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .txt small { color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dots { width: 44px; height: 44px; flex: none; background: none; border: 0; color: var(--muted); font-size: 22px; cursor: pointer; }
  .minus { width: 28px; height: 28px; flex: none; padding: 0; background: none; border: 0; color: var(--bad); display: grid; place-items: center; cursor: pointer; }
  .minus svg { width: 22px; height: 22px; }
  .check { width: 22px; height: 22px; flex: none; border-radius: 50%; border: 2px solid var(--line-2); color: var(--accent); display: grid; place-items: center; box-sizing: border-box; }
  .picked .check { border: 0; }
  .check svg { width: 22px; height: 22px; }
  .grip { width: 48px; height: 52px; flex: none; display: grid; place-items: center; color: var(--muted); touch-action: none; cursor: grab; }
  .grip svg { width: 22px; height: 22px; }
  .empty { color: var(--muted); text-align: center; padding: 30px 20px; }
  .selbar { position: fixed; left: 8px; right: 8px; bottom: calc(60px + env(safe-area-inset-bottom, 0px) + 6px); z-index: 32; height: 56px; display: flex; align-items: center; gap: 8px; padding: 0 8px; background: var(--raised); border: 1px solid var(--line-2); border-radius: 12px; box-shadow: 0 6px 24px rgb(0 0 0 / .35); }
  .selbar button { flex: 1; height: 40px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 15px; font-weight: 600; cursor: pointer; }
  .selbar button:disabled { opacity: .4; }
  .selbar .danger { color: var(--bad); }
  .selbar .ic { flex: none; width: 48px; font-size: 20px; }
</style>
