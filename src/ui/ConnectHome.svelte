<script lang="ts">
  /* #/connect-home: GLUE Home's "Sign in with Google" opens this page (ADR 0044). Sign in here (Google
     or email), and the page makes a pairing code and hands it to GLUE Home through its link
     (gluehome://pair?code=…); the code is also shown to type in. Works without a GLUE folder. */
  import { account } from '../lib/account.svelte';
  import { themes } from '../lib/themes.svelte';
  import { homePairLink } from '../lib/homeApp';
  import EmailSignIn from './EmailSignIn.svelte';
  import GlueStick from './GlueStick.svelte';

  let gbox = $state<HTMLDivElement>();
  let code = $state<{ code: string; expiresAt: number } | null>(null);
  let error = $state('');
  let now = $state(Date.now());
  $effect(() => { const el = gbox, dark = themes.resolved === 'dark'; if (el && !account.signedIn) account.renderGoogle(el, dark).catch(e => (error = (e as Error).message)); });
  $effect(() => { if (!code) return; const t = setInterval(() => (now = Date.now()), 1000); return () => clearInterval(t); });
  // Signed in: make the code and open GLUE Home with it, once.
  let asked = false;
  $effect(() => { if (account.signedIn && !asked) { asked = true; void make(); } });
  async function make() {
    error = '';
    try { code = await account.pair(); now = Date.now(); location.href = homePairLink(code.code); }
    catch (e) { error = (e as Error).message; }
  }
  const left = $derived(code ? Math.max(0, Math.round((code.expiresAt - now) / 1000)) : 0);
</script>

<section class="connect" id="connect-home">
  <GlueStick size={48} />
  <h2>Connect GLUE Home</h2>
  {#if !account.signedIn}
    <p>Sign in with the account you use for GLUE. GLUE Home on this computer then joins it.</p>
    {#if account.available || account.phase === 'working'}
      <div class="gbtn" bind:this={gbox}></div>
      <EmailSignIn idPrefix="connect-pw" />
    {:else}<p class="fine">GLUE Cloud isn’t reachable right now.</p>{/if}
  {:else if code}
    <p>Your browser asks to open GLUE Home: allow it, and GLUE Home connects by itself. Or type this code into GLUE Home:</p>
    <p class="code" id="connect-code">{code.code}</p>
    <p class="fine">{left > 0 ? 'Works once, for ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + ' more.' : 'This code has expired.'} Signed in as {account.user?.email}.</p>
    <div class="acts">
      <a class="btn" id="connect-open" href={homePairLink(code.code)}>Open GLUE Home</a>
      {#if left <= 0}<button type="button" class="btn-ghost" onclick={make}>New code</button>{/if}
    </div>
  {:else}<p class="fine">Making a code…</p>{/if}
  {#if error || account.error}<p class="err">{error || account.error}</p>{/if}
  <p class="fine"><a href="#/">Go to your library</a></p>
</section>

<style>
  .connect { max-width: 480px; margin: 8vh auto 0; display: grid; gap: 14px; justify-items: center; text-align: center; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 30px 28px; }
  h2 { font-size: 24px; }
  p { color: var(--ink-2); font-size: 14px; }
  .gbtn { min-height: 44px; color-scheme: light; }
  .code { font: 700 34px/1.2 var(--font-mono); letter-spacing: .12em; color: var(--accent); padding: 10px 18px; border: 1px dashed color-mix(in srgb, var(--accent) 50%, transparent); border-radius: 8px; user-select: all; }
  .acts { display: flex; gap: 10px; }
  .btn { text-decoration: none; }
  .fine { color: var(--muted); font-size: 12.5px; }
  .fine a { color: var(--accent); }
  .err { color: var(--bad); font-size: 13px; }
  .connect :global(form) { width: 100%; text-align: left; }
</style>
