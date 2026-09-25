<script lang="ts">
  /* Email + password sign-in, and a short register form (ADR 0041). No email check yet. */
  import { account } from '../lib/account.svelte';

  let { idPrefix = 'pw' }: { idPrefix?: string } = $props();
  let mode = $state<'signin' | 'register'>('signin');
  let email = $state(''), password = $state(''), confirm = $state(''), name = $state('');
  let busy = $state(false), error = $state('');
  const weak = $derived(mode === 'register' && password.length > 0 && password.length < 8);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (mode === 'register') {
      if (password.length < 8) { error = 'Use at least 8 characters.'; return; }
      if (password !== confirm) { error = 'The two passwords differ.'; return; }
    }
    busy = true;
    try { await account.withPassword(email, password, mode === 'register' ? { name } : undefined); password = ''; confirm = ''; }
    catch (err) { error = (err as Error).message.replace(/^\w/, c => c.toUpperCase()) + '.'; }
    finally { busy = false; }
  }
</script>

<form class="pwf" id={idPrefix + '-form'} onsubmit={submit}>
  <p class="or"><span>or with email</span></p>
  {#if mode === 'register'}
    <label>Name <input id={idPrefix + '-name'} bind:value={name} autocomplete="name" maxlength="60" placeholder="DJ name"></label>
  {/if}
  <label>Email <input id={idPrefix + '-email'} type="email" bind:value={email} autocomplete="email" required maxlength="254"></label>
  <label>Password <input id={idPrefix + '-password'} type="password" bind:value={password} autocomplete={mode === 'register' ? 'new-password' : 'current-password'} required></label>
  {#if mode === 'register'}
    <label>Password again <input id={idPrefix + '-confirm'} type="password" bind:value={confirm} autocomplete="new-password" required></label>
    {#if weak}<small class="hint">At least 8 characters.</small>{/if}
  {/if}
  {#if error}<p class="err" id={idPrefix + '-error'}>{error}</p>{/if}
  <button type="submit" class="btn" id={idPrefix + '-submit'} disabled={busy}>{busy ? (mode === 'register' ? 'Creating…' : 'Signing in…') : mode === 'register' ? 'Create account' : 'Sign in'}</button>
  <button type="button" class="swap" id={idPrefix + '-swap'} onclick={() => { mode = mode === 'register' ? 'signin' : 'register'; error = ''; }}>
    {mode === 'register' ? 'Have an account? Sign in' : 'New here? Create an account'}
  </button>
</form>

<style>
  .pwf { display: grid; gap: 8px; max-width: 320px; }
  .or { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: .08em; }
  .or::before, .or::after { content: ''; flex: 1; border-top: 1px solid var(--line); }
  label { display: grid; gap: 3px; font-size: 12.5px; color: var(--ink-2); }
  input { background: var(--ground); border: 1px solid var(--line-2); border-radius: 6px; padding: 7px 9px; font-size: 13.5px; color: var(--ink); }
  input:focus { outline: none; border-color: var(--accent); }
  .btn { justify-self: start; padding: 7px 16px; font-size: 13.5px; }
  .btn:disabled { opacity: .6; }
  .swap { justify-self: start; background: none; border: 0; padding: 0; color: var(--accent); font-size: 12.5px; cursor: pointer; text-decoration: underline; }
  .err { color: var(--bad); font-size: 12.5px; }
  .hint { color: var(--muted); font-size: 11.5px; }
</style>
