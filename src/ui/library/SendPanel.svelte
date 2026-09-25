<script lang="ts">
  /* Songs on their way to a GLUE Home (ADR 0044): each file's progress, then where it was saved. */
  import { sendToHome } from '../../lib/sendToHome.svelte';
  import { fmtBytes } from '../../core/format';

  const s = $derived(sendToHome.now);
  const total = $derived(s ? s.files.reduce((a, f) => a + f.size, 0) : 0);
  const sent = $derived(s ? s.files.reduce((a, f) => a + f.sent, 0) : 0);
</script>

{#if s}
  <div class="send" id="send-panel" role="status" data-phase={s.phase}>
    <div class="head">
      <b>{s.phase === 'connecting' ? 'Connecting to ' + s.homeName + '…' : s.phase === 'sending' ? 'Sending to ' + s.homeName + '…' : s.phase === 'done' ? 'Sent to ' + s.homeName : 'Couldn’t send everything to ' + s.homeName}</b>
      {#if s.phase === 'done' || s.phase === 'failed'}<button type="button" aria-label="Dismiss" onclick={() => sendToHome.dismiss()}>×</button>{/if}
    </div>
    {#if s.phase === 'sending'}<div class="bar"><span style:width={(total ? sent / total : 0) * 100 + '%'}></span></div>{/if}
    <ul>
      {#each s.files as f, i (i)}
        <li data-state={f.state}><span class="n" title={f.name}>{f.name}</span>
          <span class="st">{f.state === 'saved' ? '✓ ' + (f.note || 'in the incoming folder') : f.state === 'failed' ? '✕ ' + (f.note || 'not sent') : f.state === 'sending' ? Math.round((f.size ? f.sent / f.size : 1) * 100) + '%' : fmtBytes(f.size)}</span></li>
      {/each}
    </ul>
    {#if s.error}<p class="err">{s.error}</p>{/if}
    {#if s.phase === 'done'}<p class="fine">On {s.homeName}, GLUE picks them up from the incoming folder (add it as a music folder there once).</p>{/if}
  </div>
{/if}

<style>
  .send { position: fixed; left: clamp(16px, 3vw, 32px); bottom: 76px; z-index: 26; width: min(420px, calc(100vw - 32px)); background: var(--raised); border: 1px solid var(--line-2); border-radius: 10px; padding: 12px 14px; box-shadow: 0 10px 30px rgb(0 0 0 / .45); display: grid; gap: 8px; font-size: 13px; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .head button { background: none; border: 0; color: var(--muted); font-size: 16px; cursor: pointer; }
  [data-phase="done"] .head b { color: var(--ok); }
  [data-phase="failed"] .head b { color: var(--bad); }
  .bar { height: 3px; background: var(--line); border-radius: 2px; overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--accent); transition: width .2s; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; max-height: 180px; overflow-y: auto; }
  li { display: flex; justify-content: space-between; gap: 10px; color: var(--ink-2); }
  .n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .st { flex: none; font-family: var(--font-mono); font-size: 11.5px; color: var(--muted); max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li[data-state="saved"] .st { color: var(--ok); }
  li[data-state="failed"] .st { color: var(--bad); }
  .err { color: var(--bad); font-size: 12.5px; }
  .fine { color: var(--muted); font-size: 12px; }
</style>
