<script lang="ts">
  /* Tag tracks or a playlist: current tags as chips, type to add (a new tag is made on Enter),
     or tick existing ones. Changes apply at once. */
  import { lib } from '../../lib/library.svelte';
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
  const pos = $derived(at ? { left: Math.max(8, Math.min(window.innerWidth - W - 8, at.x)), top: Math.max(8, Math.min(at.y + 6, window.innerHeight - 390)) } : null);
  const focus = (el: HTMLInputElement) => { el.focus({ preventScroll: true }); };
</script>

<svelte:window onpointerdown={e => { if (at && !(e.target as HTMLElement).closest('.taged, [data-tags-open]')) close(); }} />

{#if at && target && pos}
  <div class="taged" id="tag-editor" role="dialog" aria-label={'Tags for ' + target.name} style:left={pos.left + 'px'} style:top={pos.top + 'px'} style:width={W + 'px'}>
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
  .taged { position: fixed; z-index: 70; background: var(--raised); border: 1px solid var(--line-2); border-radius: 8px; padding: 10px; box-shadow: 0 12px 32px rgb(0 0 0 / .5); display: grid; gap: 8px; }
  .head { display: flex; justify-content: space-between; gap: 8px; align-items: center; font-size: 13px; }
  .head b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .head button { background: none; border: 0; color: var(--muted); font-size: 18px; cursor: pointer; line-height: 1; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .tag { display: inline-flex; align-items: center; border-radius: 10px; background: color-mix(in srgb, var(--c) 22%, transparent); border: 1px solid color-mix(in srgb, var(--c) 55%, transparent); font-size: 12px; padding-left: 8px; }
  .tag.part { border-style: dashed; background: none; }
  .tag .nm { background: none; border: 0; padding: 0; font: inherit; color: var(--ink); cursor: default; }
  .tag button.nm { cursor: pointer; }
  .tag .rm { background: none; border: 0; color: var(--ink-2); cursor: pointer; padding: 0 6px 0 4px; font-size: 13px; }
  .none { color: var(--muted); font-size: 12px; }
  input:not([type="checkbox"]) { background: var(--surface); border: 1px solid var(--line-2); border-radius: 5px; padding: 6px 8px; font-size: 13px; }
  input:focus { outline: none; border-color: var(--accent); }
  .list { display: grid; gap: 1px; max-height: 190px; overflow-y: auto; }
  .list label { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 3px 4px; border-radius: 4px; cursor: pointer; }
  .list label:hover { background: var(--surface); }
  .list span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .list small { color: var(--muted); font-family: var(--font-mono); font-size: 11px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .make { text-align: left; background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px dashed color-mix(in srgb, var(--accent) 50%, transparent); border-radius: 4px; color: var(--accent); padding: 4px 8px; font-size: 13px; cursor: pointer; }
  .foot { color: var(--muted); font-size: 11.5px; }
</style>
