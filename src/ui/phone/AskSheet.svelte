<script lang="ts">
  /* A question on a phone or a tablet (ADR 0079): a name to type, or yes / no. At the top of the screen,
     clear of the keyboard; instead of the browser's prompt and confirm. */
  import { phone } from '../../lib/phone.svelte';

  const a = $derived(phone.ask);
  let value = $state('');
  $effect(() => { value = a?.value ?? ''; });
  const focus = (el: HTMLInputElement) => { el.focus(); el.select(); };
  function ok() { if (!a) return; if (a.input && !value.trim()) return; a.done(a.input ? value : ''); }
  function cancel() { a?.done(null); }
</script>

{#if a}
  <div class="scrim" role="presentation" onclick={cancel}></div>
  <div class="ask" id="phone-ask" role="dialog" aria-modal="true" aria-label={a.title} tabindex="-1" onkeydown={e => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } }}>
    <form onsubmit={e => { e.preventDefault(); ok(); }}>
      <b>{a.title}</b>
      {#if a.text}<p>{a.text}</p>{/if}
      {#if a.input}<input id="phone-ask-input" bind:value placeholder={a.placeholder} autocomplete="off" autocapitalize="sentences" maxlength="120" use:focus />{/if}
      <div class="acts">
        <button type="button" id="phone-ask-cancel" onclick={cancel}>Cancel</button>
        <button type="submit" id="phone-ask-ok" class:danger={a.danger} disabled={a.input && !value.trim()}>{a.ok}</button>
      </div>
    </form>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 90; background: rgb(0 0 0 / .5); }
  .ask { position: fixed; z-index: 91; left: 10px; right: 10px; top: calc(env(safe-area-inset-top, 0px) + 12px); max-width: 480px; margin: 0 auto; padding: 16px; background: var(--surface); border: 1px solid var(--line-2); border-radius: 14px; box-shadow: 0 16px 48px rgb(0 0 0 / .5); }
  form { display: grid; gap: 12px; }
  b { font-size: 17px; }
  p { margin: 0; color: var(--ink-2); font-size: 15px; line-height: 1.4; }
  input { font-size: 16px; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--ground); color: var(--ink); }
  input:focus { outline: none; border-color: var(--accent); }
  .acts { display: flex; justify-content: flex-end; gap: 10px; }
  .acts button { min-width: 96px; padding: 11px 16px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--raised); color: var(--ink); font-size: 16px; font-weight: 600; cursor: pointer; }
  .acts button[type="submit"] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
  .acts button.danger { background: var(--bad); border-color: var(--bad); color: #fff; }
  .acts button:disabled { opacity: .45; }
</style>
