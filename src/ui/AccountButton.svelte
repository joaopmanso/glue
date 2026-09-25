<script lang="ts">
  /* The optional GLUE account in the header: "Sign in" (Google) or your avatar with a small menu. */
  import { account } from '../lib/account.svelte';
  import { themes } from '../lib/themes.svelte';

  let open = $state(false);
  let gbox = $state<HTMLDivElement>();
  let confirmDelete = $state(false);
  $effect(() => {
    const el = gbox, dark = themes.resolved === 'dark';
    if (open && !account.signedIn && el) account.renderGoogle(el, dark).catch(e => { account.error = (e as Error).message; });
  });
  $effect(() => { if (account.signedIn && account.phase === 'signed-in') confirmDelete = false; });
  const initial = $derived((account.user?.name || account.user?.email || '?').slice(0, 1).toUpperCase());
  const homes = $derived(account.devices.filter(d => d.kind === 'home').length);
</script>

<svelte:window onpointerdown={e => { if (open && !(e.target as HTMLElement).closest('.acct')) open = false; }} onkeydown={e => { if (e.key === 'Escape') open = false; }} />

{#if account.available || account.signedIn || account.phase === 'working'}
<span class="acct">
  {#if account.signedIn}
    <button type="button" class="avatar" id="account-btn" aria-haspopup="dialog" aria-expanded={open} title={'Signed in as ' + (account.user?.email ?? '')} onclick={() => (open = !open)}>
      {#if account.user?.picture}<img src={account.user.picture} alt="" referrerpolicy="no-referrer">{:else}{initial}{/if}
      <i class="live" class:on={account.connected} aria-hidden="true"></i>
    </button>
  {:else}
    <button type="button" class="signin" id="account-btn" aria-haspopup="dialog" aria-expanded={open} disabled={account.phase === 'working'} onclick={() => (open = !open)}>
      {account.phase === 'working' ? 'Signing in…' : 'Sign in'}
    </button>
  {/if}
  {#if open}
    <div class="pop" role="dialog" aria-label="GLUE account" id="account-pop">
      {#if account.signedIn}
        <p class="who"><b>{account.user?.name ?? 'Signed in'}</b><span>{account.user?.email}</span></p>
        <p class="fine">{account.devices.length} device{account.devices.length === 1 ? '' : 's'}{homes ? ' · ' + homes + ' GLUE Home' : ''} · {account.connected ? 'connected' : 'connecting…'}</p>
        <div class="acts">
          <button type="button" class="mini" id="sign-out" onclick={() => { open = false; void account.signOut(); }}>Sign out</button>
          {#if !confirmDelete}<button type="button" class="mini danger" onclick={() => (confirmDelete = true)}>Delete account…</button>
          {:else}<button type="button" class="mini danger" id="delete-account" onclick={() => { open = false; void account.deleteAccount().catch(e => (account.error = (e as Error).message)); }}>Delete it: devices and codes too</button>{/if}
        </div>
        <p class="fine">Your music and your library stay on your computers; the account only lists your devices.</p>
      {:else}
        <h3>GLUE account <small>optional</small></h3>
        <p>Sign in to reach <b>GLUE Home</b> on the computer with your main collection from anywhere, and to see your devices. Without an account, GLUE works exactly as it does now.</p>
        <div class="gbtn" id="google-btn" bind:this={gbox}></div>
        {#if account.error}<p class="err" id="account-error">{account.error}</p>{/if}
        <p class="fine">Your music and your library never leave your computers. The account keeps your name, email and device list.</p>
      {/if}
    </div>
  {/if}
</span>
{/if}

<style>
  .acct { position: relative; }
  .signin { background: none; border: 1px solid var(--line-2); border-radius: 16px; padding: 5px 14px; font-size: 13px; color: var(--ink-2); cursor: pointer; }
  .signin:hover { border-color: var(--accent); color: var(--accent); }
  .avatar { position: relative; width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--line-2); background: var(--raised); color: var(--ink); font-weight: 700; cursor: pointer; padding: 0; display: grid; place-items: center; overflow: visible; }
  .avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  .live { position: absolute; right: -1px; bottom: -1px; width: 9px; height: 9px; border-radius: 50%; background: var(--line-2); border: 2px solid var(--ground); }
  .live.on { background: var(--ok); }
  .pop { position: absolute; right: 0; top: calc(100% + 8px); z-index: 50; width: 320px; background: var(--raised); border: 1px solid var(--line-2); border-radius: 10px; padding: 14px; box-shadow: 0 14px 36px rgb(0 0 0 / .45); display: grid; gap: 10px; font-size: 13px; }
  h3 { font-size: 16px; display: flex; gap: 8px; align-items: baseline; }
  h3 small { font-size: 11px; color: var(--muted); font-weight: 500; text-transform: uppercase; letter-spacing: .08em; }
  .pop p { color: var(--ink-2); }
  /* Google draws the button in an iframe; a matching colour scheme keeps its background transparent. */
  .gbtn { min-height: 44px; color-scheme: light; }
  .who { display: grid; }
  .who span { color: var(--muted); font-size: 12px; }
  .fine { color: var(--muted) !important; font-size: 11.5px; }
  .err { color: var(--bad) !important; }
  .acts { display: flex; gap: 6px; flex-wrap: wrap; }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 3px 9px; cursor: pointer; }
  .mini:hover { border-color: var(--accent); color: var(--accent); }
  .mini.danger { color: var(--bad); }
</style>
