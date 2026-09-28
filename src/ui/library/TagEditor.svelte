<script lang="ts">
  /* Tag tracks or a playlist: current tags as chips, type to add (a new tag is made on Enter),
     or tick existing ones. Changes apply at once. */
  import { lib } from '../../lib/library.svelte';
  import { phone } from '../../lib/phone.svelte';
  import { view } from '../../lib/view.svelte';
  import { allTags, tagColorOf } from '../../lib/tags.svelte';
  import { cleanTag, hasTag, tagsOf } from '../../core/library/tagging';

  const W = 300;
  const at = $derived(view.tagFor);
  let q = $state('');
  let forKey = '';
  $effect(() => { const k = at ? (at.listId ?? at.ids.join(',')) : ''; if (k !== forKey) { forKey = k; q = ''; } });

  const target = $derived.by(() => {
    void lib.version;
    const s = lib.store;
    if (!at || !s) return null;
    if (at.listId) { const l = s.lists.get(at.listId); return l ? { name: l.name, sets: [l.tags ?? []] } : null; }
    const ts = (at.ids ?? []).map(id => s.tracks.get(id)).filter(t => !!t);
    return ts.length ? { name: ts.length === 1 ? ts[0].title || ts[0].fileName : ts.length + ' tracks', sets: ts.map(t => tagsOf(t)) } : null;
  });
  // For several tracks: a tag on all of them is "on", on some of them "part".
  function stateOf(tag: string): 'on' | 'part' | 'off' {
    const sets = target?.sets ?? [], n = sets.filter(s => hasTag(s, tag)).length;
    return n === 0 ? 'off' : n === sets.length ? 'on' : 'part';
  }
  const tags = $derived.by(() => { void lib.version; return allTags(); });
  const current = $derived(target ? tags.filter(t => stateOf(t.name) !== 'off') : []);
  const offered = $derived.by(() => { const w = q.trim().toLowerCase(); return w ? tags.filter(t => t.name.toLowerCase().includes(w)) : tags; });
  const typed = $derived(cleanTag(q));
  const isNew = $derived(!!typed && !tags.some(t => t.name.toLowerCase() === typed.toLowerCase()));

  function set(tag: string, on: boolean) {
    if (!at) return;
    if (at.listId) {
      const l = lib.store?.lists.get(at.listId);
      if (l) lib.setListTags(l.id, on ? [...(l.tags ?? []), tag] : (l.tags ?? []).filter(x => x.toLowerCase() !== tag.toLowerCase()));
    } else lib.tagTracks(at.ids ?? [], on ? [tag] : [], on ? [] : [tag]);
  }
  function addTyped() { if (!typed) return; set(tags.find(t => t.name.toLowerCase() === typed.toLowerCase())?.name ?? typed, true); q = ''; }
  function close() { view.tagFor = null; }
  // Below what opened it, or above it when there's more room there; never past the window: the chips
  // and the list scroll inside (a library can have hundreds of tags).
  let winH = $state(window.innerHeight), winW = $state(window.innerWidth);
  const pos = $derived.by(() => {
    if (!at) return null;
    // A phone: a sheet from the bottom, the width of the screen (ADR 0078).
    if (phone.active) { const w = Math.min(winW, 640); return { left: Math.round((winW - w) / 2), top: null, bottom: 0, max: Math.round(winH * .72), w }; }
    const below = winH - at.y - 14, above = at.y - 40, up = below < 320 && above > below;
    const room = Math.max(200, Math.min(520, up ? above : below));
    return { left: Math.max(8, Math.min(winW - W - 8, at.x)), top: up ? null : at.y + 6, bottom: up ? winH - at.y + 34 : null, max: room };
  });
  // Not on a phone: its keyboard would cover the list.
  const focus = (el: HTMLInputElement) => { if (!phone.active) el.focus({ preventScroll: true }); };
</script>

<svelte:window bind:innerHeight={winH} bind:innerWidth={winW} onpointerdown={e => { if (at && !(e.target as HTMLElement).closest('.taged, [data-tags-open]')) close(); }} />

{#if at && target && pos}
  {#if phone.active}<div class="scrim" aria-hidden="true"></div>{/if}
  <div class="taged" id="tag-editor" role="dialog" aria-label={'Tags for ' + target.name} style:left={pos.left + 'px'} style:top={pos.top == null ? null : pos.top + 'px'} style:bottom={pos.bottom == null ? null : pos.bottom + 'px'} style:max-height={pos.max + 'px'} style:width={('w' in pos ? pos.w : W) + 'px'} class:sheet={phone.active}>
    <div class="head"><b>Tags · {target.name}</b><button type="button" aria-label="Close" onclick={close}>×</button></div>
    <div class="chips">
      {#each current as t (t.name)}
        {@const s = stateOf(t.name)}
        <span class="tag" class:part={s === 'part'} style:--c={tagColorOf(t.name)} title={s === 'part' ? 'On some of them: click to add it to all' : ''}>
          {#if s === 'part'}<button type="button" class="nm" onclick={() => set(t.name, true)}>{t.name}</button>{:else}<span class="nm">{t.name}</span>{/if}
          <button type="button" class="rm" aria-label={'Remove ' + t.name} onclick={() => set(t.name, false)}>×</button>
        </span>
      {:else}<span class="none">No tags yet.</span>{/each}
    </div>
    <input use:focus id="tag-input" placeholder="Add a tag… (Enter)" bind:value={q} autocomplete="off" maxlength="40"
      onkeydown={e => {
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTyped(); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'Backspace' && !q && current.length) set(current[current.length - 1].name, false);
      }}>
    <div class="list">
      {#if isNew}<button type="button" class="make" id="tag-new" onclick={addTyped}>+ New tag “{typed}”</button>{/if}
      {#each offered as t (t.name)}
        {@const s = stateOf(t.name)}
        <label><input type="checkbox" checked={s === 'on'} indeterminate={s === 'part'} onchange={e => set(t.name, e.currentTarget.checked)}>
          <i class="dot" style:background={tagColorOf(t.name)}></i><span>{t.name}</span><small>{t.tracks || ''}</small></label>
      {/each}
    </div>
    <p class="foot">{at.listId ? 'Playlist tags describe the playlist itself.' : 'Tags already in your files count too: Grouping, #hashtags in comments and rekordbox My Tags.'}</p>
  </div>
{/if}

<style>
  .taged { position: fixed; z-index: 70; background: var(--raised); border: 1px solid var(--line-2); border-radius: 8px; padding: 10px; box-shadow: 0 12px 32px rgb(0 0 0 / .5); display: flex; flex-direction: column; gap: 8px; overflow: hidden; box-sizing: border-box; }
  .taged > * { flex: none; }
  #tag-input { width: 100%; box-sizing: border-box; }
  .head { display: flex; justify-content: space-between; gap: 8px; align-items: center; font-size: 13px; }
  .head b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .head button { background: none; border: 0; color: var(--muted); font-size: 18px; cursor: pointer; line-height: 1; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; max-height: 96px; overflow-y: auto; }
  .tag { display: inline-flex; align-items: center; border-radius: 10px; background: color-mix(in srgb, var(--c) 22%, transparent); border: 1px solid color-mix(in srgb, var(--c) 55%, transparent); font-size: 12px; padding-left: 8px; }
  .tag.part { border-style: dashed; background: none; }
  .tag .nm { background: none; border: 0; padding: 0; font: inherit; color: var(--ink); cursor: default; }
  .tag button.nm { cursor: pointer; }
  .tag .rm { background: none; border: 0; color: var(--ink-2); cursor: pointer; padding: 0 6px 0 4px; font-size: 13px; }
  .none { color: var(--muted); font-size: 12px; }
  input:not([type="checkbox"]) { background: var(--surface); border: 1px solid var(--line-2); border-radius: 5px; padding: 6px 8px; font-size: 13px; }
  input:focus { outline: none; border-color: var(--accent); }
  .taged > .list { display: grid; align-content: start; gap: 1px; flex: 1 1 auto; min-height: 60px; overflow-y: auto; }
  .list label { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 3px 4px; border-radius: 4px; cursor: pointer; }
  .list label:hover { background: var(--surface); }
  .list span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .list small { color: var(--muted); font-family: var(--font-mono); font-size: 11px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .make { text-align: left; background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px dashed color-mix(in srgb, var(--accent) 50%, transparent); border-radius: 4px; color: var(--accent); padding: 4px 8px; font-size: 13px; cursor: pointer; }
  .foot { color: var(--muted); font-size: 11.5px; }
  /* A phone: a sheet from the bottom, with room for fingers. */
  .scrim { position: fixed; inset: 0; z-index: 69; background: rgb(0 0 0 / .45); }
  .taged.sheet { border-radius: 16px 16px 0 0; border-width: 1px 0 0; padding: 14px 16px calc(14px + env(safe-area-inset-bottom, 0px)); gap: 12px; }
  .sheet .head { font-size: 15px; } .sheet .head button { font-size: 26px; width: 40px; height: 36px; }
  .sheet input:not([type="checkbox"]) { font-size: 16px; padding: 10px 12px; border-radius: 10px; }
  .sheet .list label { font-size: 16px; padding: 11px 4px; }
  .sheet .tag { font-size: 14px; padding-left: 10px; } .sheet .tag .rm { font-size: 17px; padding: 3px 9px 3px 6px; }
  .sheet .chips { max-height: 120px; }
</style>
