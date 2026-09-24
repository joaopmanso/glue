<script lang="ts">
  /* A small popup to write notes about a track; saved as you type (on a short pause) and on close. */
  import { lib } from '../../lib/library.svelte';
  import { view } from '../../lib/view.svelte';

  const W = 320, H = 210;
  const at = $derived(view.noteFor);
  const track = $derived.by(() => { void lib.version; return at ? lib.store?.tracks.get(at.id) ?? null : null; });
  let text = $state('');
  let timer = 0;
  let forId = '';
  // Load the note when the editor opens for a (new) track.
  $effect(() => { const id = at?.id ?? ''; if (id !== forId) { forId = id; text = track?.notes ?? ''; } });

  function save() { clearTimeout(timer); if (forId) lib.setTrackNotes(forId, text.trim() ? text : ''); }
  function close() { save(); view.noteFor = null; }
  const pos = $derived(at ? {
    left: Math.max(8, Math.min(window.innerWidth - W - 8, at.x - W)),
    top: at.y + H + 8 > window.innerHeight - 70 ? Math.max(8, at.y - H - 34) : at.y + 6,
  } : null);
  const focus = (el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); };
</script>

<svelte:window onpointerdown={e => { if (at && !(e.target as HTMLElement).closest('.noteed, .note')) close(); }} />

{#if at && track && pos}
  <div class="noteed" role="dialog" aria-label={'Notes for ' + (track.title || track.fileName)} style:left={pos.left + 'px'} style:top={pos.top + 'px'} style:width={W + 'px'}>
    <div class="head"><b>{track.title || track.fileName}</b><button type="button" aria-label="Close" onclick={close}>×</button></div>
    <textarea use:focus bind:value={text} style:height={H - 70 + 'px'} placeholder="Cue ideas, mix-in points, where it works in a set…"
      oninput={() => { clearTimeout(timer); timer = window.setTimeout(save, 600); }}
      onkeydown={e => { if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); close(); } }}></textarea>
    <div class="foot"><span>Saved automatically · Ctrl+Enter closes</span>{#if text}<button type="button" onclick={() => { text = ''; save(); }}>Clear</button>{/if}</div>
  </div>
{/if}

<style>
  .noteed { position: fixed; z-index: 40; background: var(--raised); border: 1px solid var(--line-2); border-radius: 8px; padding: 10px; box-shadow: 0 12px 32px rgb(0 0 0 / .5); display: grid; gap: 8px; }
  .head { display: flex; justify-content: space-between; gap: 8px; align-items: center; font-size: 13px; }
  .head b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .head button { background: none; border: 0; color: var(--muted); font-size: 18px; cursor: pointer; line-height: 1; }
  textarea { width: 100%; resize: vertical; background: var(--surface); border: 1px solid var(--line-2); border-radius: 5px; padding: 8px; font: 13px/1.45 var(--font-sans); color: var(--ink); }
  textarea:focus { outline: none; border-color: var(--accent); }
  .foot { display: flex; justify-content: space-between; align-items: center; color: var(--muted); font-size: 11.5px; }
  .foot button { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 11.5px; padding: 1px 8px; cursor: pointer; }
</style>
