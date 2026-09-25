<script lang="ts">
  /* Sidebar › Devices (signed in only): this browser and each GLUE Home, online or when last seen;
     rename or remove; "+ GLUE Home" shows a pairing code (ADR 0036). */
  import { account, type CloudDevice } from '../../lib/account.svelte';

  let menuFor = $state<string | null>(null);
  let pairing = $state<{ code: string; expiresAt: number } | null>(null);
  let pairError = $state('');
  let now = $state(Date.now());
  let homesAtStart = 0;
  $effect(() => { if (!pairing) return; const t = setInterval(() => (now = Date.now()), 1000); return () => clearInterval(t); });
  // The dialog closes itself once the new GLUE Home has joined.
  $effect(() => { const n = account.devices.filter(d => d.kind === 'home').length; if (pairing && n > homesAtStart) { pairing = null; } });

  async function startPairing() {
    pairError = '';
    homesAtStart = account.devices.filter(d => d.kind === 'home').length;
    try { pairing = await account.pair(); now = Date.now(); }
    catch (e) { pairError = (e as Error).message; }
  }
  function seen(d: CloudDevice): string {
    if (d.id === account.thisDevice) return 'this browser';
    if (account.online.has(d.id)) return 'online';
    if (!d.lastSeen) return 'never connected';
    const m = Math.round((Date.now() - d.lastSeen) / 60e3);
    return 'last seen ' + (m < 2 ? 'just now' : m < 60 ? m + ' min ago' : m < 48 * 60 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago');
  }
  async function rename(d: CloudDevice) {
    menuFor = null;
    const name = prompt('Name this device', d.name)?.trim();
    if (name && name !== d.name) await account.rename(d.id, name).catch(e => alert((e as Error).message));
  }
  async function remove(d: CloudDevice) {
    menuFor = null;
    if (confirm('Remove “' + d.name + '” from your GLUE account? ' + (d.kind === 'home' ? 'It stops being reachable until you pair it again.' : 'It gets signed out.'))) await account.remove(d.id).catch(e => alert((e as Error).message));
  }
  const left = $derived(pairing ? Math.max(0, Math.round((pairing.expiresAt - now) / 1000)) : 0);
</script>

<svelte:window onpointerdown={e => { if (menuFor && !(e.target as HTMLElement).closest('.dmenu, .more')) menuFor = null; }} onkeydown={e => { if (e.key === 'Escape') { menuFor = null; pairing = null; } }} />

<section class="devs" id="devices">
  <div class="head">
    <h3 class="label">Devices</h3>
    <span class="add"><button type="button" id="pair-home" title="Connect the computer with your main collection" onclick={startPairing}>+ GLUE Home</button></span>
  </div>
  <ul>
    {#each account.devices as d (d.id)}
      {@const on = d.id === account.thisDevice ? account.connected : account.online.has(d.id)}
      <li>
        <div class="item dev" data-device={d.id}>
          <i class="dot" class:on aria-hidden="true"></i>
          <span class="dname"><b>{d.name}</b><small>{d.kind === 'home' ? 'GLUE Home · ' : ''}{seen(d)}</small></span>
          <span class="tools" class:open={menuFor === d.id}>
            <button type="button" class="more" title="More" aria-haspopup="menu" aria-expanded={menuFor === d.id} onclick={() => (menuFor = menuFor === d.id ? null : d.id)}>⋯</button>
          </span>
        </div>
        {#if menuFor === d.id}
          <div class="dmenu" role="menu">
            <button type="button" role="menuitem" onclick={() => rename(d)}>Rename…</button>
            <button type="button" role="menuitem" class="danger" onclick={() => remove(d)}>{d.id === account.thisDevice ? 'Remove (signs out)…' : 'Remove…'}</button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  {#if pairError}<p class="err">{pairError}</p>{/if}
</section>

{#if pairing}
  <div class="scrim" role="presentation" onpointerdown={e => { if (e.target === e.currentTarget) pairing = null; }}>
    <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="pair-h" id="pair-dialog">
      <h2 id="pair-h">Connect GLUE Home</h2>
      <p>On the computer with your main collection, start GLUE Home and enter this code:</p>
      <p class="code" id="pair-code">{pairing.code}</p>
      <p class="fine">{left > 0 ? 'Works once, for ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + ' more.' : 'This code has expired.'} This window closes by itself when GLUE Home has joined.</p>
      <details>
        <summary>Running GLUE Home (preview)</summary>
        <p>GLUE Home is in preview and runs from the GLUE source with Node.js 24:</p>
        <pre>node home/src/main.ts pair {pairing.code}
node home/src/main.ts run</pre>
      </details>
      <div class="acts">
        {#if left <= 0}<button type="button" class="btn" onclick={startPairing}>New code</button>{/if}
        <button type="button" class="btn-ghost" onclick={() => (pairing = null)}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .devs { display: grid; gap: 4px; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; }
  .add button { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 11.5px; padding: 2px 7px; cursor: pointer; }
  .add button:hover { border-color: var(--accent); color: var(--accent); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
  .dev { display: flex; align-items: center; gap: 8px; padding: 4px 4px 4px 10px; border-radius: 4px; min-height: 34px; }
  .dev:hover { background: var(--raised); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--line-2); flex: none; }
  .dot.on { background: var(--ok); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 25%, transparent); }
  .dname { flex: 1; min-width: 0; display: grid; line-height: 1.25; font-size: 13px; }
  .dname b { font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dname small { color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tools { display: none; }
  .dev:hover .tools, .tools.open { display: flex; }
  .more { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 0 6px 2px; font-size: 13px; }
  .dmenu { display: grid; gap: 2px; background: var(--raised); border: 1px solid var(--line-2); border-radius: 6px; padding: 6px; margin: 2px 4px 6px; font-size: 13px; }
  .dmenu button { background: none; border: 0; text-align: left; padding: 5px 8px; border-radius: 4px; cursor: pointer; color: var(--ink); }
  .dmenu button:hover { background: color-mix(in srgb, var(--accent) 15%, transparent); }
  .dmenu .danger { color: var(--bad); }
  .err { color: var(--bad); font-size: 12px; padding: 0 8px; }
  .scrim { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--ground) 70%, transparent); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; overflow-y: auto; }
  .dlg { width: min(460px, 100%); background: var(--surface); border: 1px solid var(--line-2); border-radius: 12px; padding: 22px; display: grid; gap: 12px; box-shadow: 0 24px 60px rgb(0 0 0 / .5); }
  .dlg h2 { font-size: 21px; }
  .dlg p { color: var(--ink-2); font-size: 14px; }
  .code { font: 700 34px/1.2 var(--font-mono); letter-spacing: .12em; color: var(--accent) !important; text-align: center; padding: 10px; border: 1px dashed color-mix(in srgb, var(--accent) 50%, transparent); border-radius: 8px; user-select: all; }
  .fine { color: var(--muted) !important; font-size: 12px !important; }
  details summary { cursor: pointer; color: var(--ink-2); font-size: 13px; }
  pre { background: var(--ground); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; font: 12px var(--font-mono); white-space: pre-wrap; margin: 6px 0 0; }
  .acts { display: flex; gap: 8px; justify-content: flex-end; }
</style>
