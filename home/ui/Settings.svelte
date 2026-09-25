<script lang="ts">
  /* GLUE Home's settings (ADR 0044): the service's state and Start / Stop / Restart, the GLUE account
     (email and password, Google in the browser, or a code from the website), the incoming folder,
     start with this computer, and the songs received lately. */
  import { onMount } from 'svelte';
  import { API, WEBSITE, askYesNo, autostart, bridge, onPairLink, openFolder, openUrl, pickFolder, type HomeConfig, type Status } from './bridge';
  import { claim, signIn, type Joined } from './cloud';
  import GlueStick from '../../src/ui/GlueStick.svelte';
  import { fmtBytes } from '../../src/core/format';

  let cfg = $state<HomeConfig | null>(null);
  let status = $state<Status | null>(null);
  let email = $state(''), password = $state(''), code = $state('');
  let busy = $state(''), error = $state('');
  let atLogin = $state(false);

  const blank = async (): Promise<HomeConfig> => ({ deviceId: null, token: null, name: await bridge.deviceName().catch(() => 'GLUE Home'), user: null, incoming: await bridge.defaultIncoming().catch(() => null), running: true, askedAutostart: false, received: [] });
  const paired = $derived(!!cfg?.deviceId && !!cfg?.token);
  const api = $derived(cfg?.api || API);

  async function save(patch: Partial<HomeConfig>) {
    // The service writes too (songs received): start from what's saved now.
    const now = (await bridge.config()) ?? cfg ?? await blank();
    const next = { ...$state.snapshot(now), ...patch } as HomeConfig;
    cfg = next;
    await bridge.saveConfig(next);
  }
  async function joined(j: Joined) {
    await save({ deviceId: j.deviceId, token: j.token, name: j.name, user: j.user, running: true });
    password = ''; code = ''; error = '';
  }
  async function run(label: string, f: () => Promise<void>) {
    busy = label; error = '';
    try { await f(); } catch (e) { error = (e as Error).message || String(e); } finally { busy = ''; }
  }
  const withPassword = () => run('Signing in…', async () => joined(await signIn(api, email, password, cfg?.name || 'GLUE Home')));
  const withCode = (c = code) => run('Connecting…', async () => joined(await claim(api, c, cfg?.name || 'GLUE Home')));
  async function disconnect() {
    if (!(await askYesNo('Disconnect this computer from ' + (cfg?.user?.email ?? 'the GLUE account') + '? Songs can’t be sent to it until you connect again. Remove it from the website’s device list too (sidebar › Devices › ⋯ › Remove).', 'GLUE Home', 'Disconnect', 'Cancel'))) return;
    await save({ deviceId: null, token: null, user: null });
  }
  async function chooseFolder() {
    const f = await pickFolder(cfg?.incoming);
    if (f) await save({ incoming: f });
  }
  async function setAtLogin(on: boolean) {
    const a = await autostart();
    try { if (on) await a.enable(); else await a.disable(); atLogin = await a.isEnabled(); } catch (e) { error = (e as Error).message; }
  }

  onMount(() => {
    void (async () => {
      cfg = (await bridge.config()) ?? await blank();
      if (!cfg.incoming) cfg = { ...cfg, incoming: await bridge.defaultIncoming().catch(() => null) };
      await bridge.onConfig(c => (cfg = c));
      await bridge.onStatus(s => (status = s));
      await bridge.askStatus();
      atLogin = await (await autostart()).isEnabled().catch(() => false);
      // gluehome://pair?code=… from the website's "Open GLUE Home".
      await onPairLink(c => { void bridge.showSettings(); void withCode(c); }).catch(() => {});
      // The first time: start with this computer?
      if (!cfg.askedAutostart) {
        const yes = await askYesNo('Start GLUE Home when this computer starts? It then stays ready to receive songs from your other computers.', 'GLUE Home', 'Yes, start with the computer', 'Not now');
        await setAtLogin(yes);
        await save({ askedAutostart: true });
      }
    })().catch(e => (error = (e as Error).message));
  });
  const pill = $derived(status?.state === 'online' ? 'Online' : status?.state === 'connecting' ? 'Connecting' : status?.state === 'offline' ? 'Offline' : status?.state === 'stopped' ? 'Stopped' : 'Not connected');
</script>

<main>
  <header>
    <GlueStick size={34} />
    <div><h1>GLUE Home</h1><p>{status?.text ?? 'Starting…'}</p></div>
    <span class="pill" id="state-pill" data-state={status?.state ?? 'connecting'}>{pill}</span>
  </header>
  <button type="button" class="primary wide" id="open-library" onclick={() => bridge.openLibrary()}>Open GLUE library</button>

  <section>
    <h2>Service</h2>
    <p class="fine">While it runs, your other computers can send songs here from the GLUE website.</p>
    <div class="row">
      <button type="button" id="svc-start" disabled={!paired || status?.running} onclick={() => bridge.control('start')}>Start</button>
      <button type="button" id="svc-stop" disabled={!paired || !status?.running} onclick={() => bridge.control('stop')}>Stop</button>
      <button type="button" id="svc-restart" disabled={!paired} onclick={() => bridge.control('restart')}>Restart</button>
    </div>
    <label class="check"><input type="checkbox" id="at-login" checked={atLogin} onchange={e => setAtLogin(e.currentTarget.checked)}> Start GLUE Home when this computer starts</label>
  </section>

  <section>
    <h2>GLUE account</h2>
    {#if paired}
      <p id="account">Connected to <b>{cfg?.user?.email ?? 'your account'}</b> as <b>{cfg?.name}</b>.</p>
      <button type="button" class="link" onclick={disconnect}>Disconnect this computer</button>
    {:else}
      <form onsubmit={e => { e.preventDefault(); void withPassword(); }}>
        <label>Email <input type="email" id="email" autocomplete="username" bind:value={email} required></label>
        <label>Password <input type="password" id="password" autocomplete="current-password" bind:value={password} required></label>
        <button type="submit" class="primary" id="sign-in" disabled={!!busy}>Sign in</button>
      </form>
      <div class="or"><span>or</span></div>
      <button type="button" id="google" onclick={() => openUrl(WEBSITE + '#/connect-home')}>Sign in with Google in your browser</button>
      <p class="fine">Your browser opens the GLUE website; sign in there and it connects this computer.</p>
      <div class="or"><span>or</span></div>
      <form class="code" onsubmit={e => { e.preventDefault(); void withCode(); }}>
        <label>Code from the website <small>(sidebar › Devices › + GLUE Home)</small>
          <input id="code" placeholder="ABCD-EFGH" autocomplete="off" spellcheck="false" bind:value={code} required></label>
        <button type="submit" id="use-code" disabled={!!busy}>Connect</button>
      </form>
      <label class="name">This computer’s name <input id="device-name" value={cfg?.name ?? ''} onchange={e => { if (cfg) cfg = { ...cfg, name: e.currentTarget.value.trim() || cfg.name }; }}></label>
    {/if}
    {#if busy}<p class="fine" role="status">{busy}</p>{/if}
    {#if error}<p class="err" id="error">{error}</p>{/if}
  </section>

  <section>
    <h2>Incoming folder</h2>
    <p class="fine">Songs sent to this computer are saved here. In GLUE on this computer, add this folder as a music folder once: new songs then show up in your library.</p>
    <div class="folder"><code id="incoming" title={cfg?.incoming ?? ''}>{cfg?.incoming ?? '…'}</code></div>
    <div class="row">
      <button type="button" id="choose-incoming" onclick={chooseFolder}>Choose…</button>
      {#if cfg?.incoming}<button type="button" onclick={() => openFolder(cfg!.incoming!).catch(e => (error = (e as Error).message))}>Open folder</button>{/if}
    </div>
  </section>

  {#if status?.receiving || status?.received.length}
    <section>
      <h2>Received</h2>
      {#if status.receiving}<p class="now">Receiving {status.receiving.name}… {Math.round(status.receiving.size ? status.receiving.got / status.receiving.size * 100 : 0)}%</p>{/if}
      <ul id="received">
        {#each status.received.slice(0, 8) as r (r.path + r.at)}
          <li><span title={r.path}>{r.name}</span><small>{fmtBytes(r.size)} · {new Date(r.at).toLocaleString()}</small></li>
        {/each}
      </ul>
    </section>
  {/if}
</main>

<style>
  main { display: grid; gap: 14px; padding: 18px 20px 24px; max-width: 560px; margin: 0 auto; }
  header { display: flex; gap: 12px; align-items: center; }
  header div { flex: 1; min-width: 0; }
  h1 { font-size: 20px; margin: 0; letter-spacing: -.01em; }
  header p { margin: 0; color: var(--muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pill { font: 600 11px var(--font-mono); letter-spacing: .08em; text-transform: uppercase; padding: 3px 9px; border-radius: 999px; border: 1px solid currentColor; color: var(--muted); }
  .pill[data-state="online"] { color: var(--ok); }
  .pill[data-state="connecting"], .pill[data-state="offline"] { color: var(--warn); }
  section { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; gap: 10px; }
  h2 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0; }
  p { margin: 0; }
  .fine { color: var(--muted); font-size: 12.5px; }
  .err { color: var(--bad); font-size: 13px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  button { background: var(--raised); border: 1px solid var(--line-2); border-radius: 6px; padding: 6px 14px; cursor: pointer; }
  button:hover:not(:disabled) { border-color: var(--accent); }
  button:disabled { opacity: .45; cursor: default; }
  button.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 600; }
  button.wide { justify-self: stretch; padding: 9px 14px; }
  button.link { background: none; border: 0; padding: 0; color: var(--muted); text-decoration: underline; justify-self: start; }
  form { display: grid; gap: 8px; }
  label { display: grid; gap: 4px; font-size: 12.5px; color: var(--ink-2); }
  label small { color: var(--muted); }
  input:not([type="checkbox"]) { background: var(--ground); border: 1px solid var(--line-2); border-radius: 6px; padding: 7px 10px; font-size: 14px; }
  input:focus { outline: none; border-color: var(--accent); }
  .code { grid-template-columns: 1fr auto; align-items: end; }
  #code { font-family: var(--font-mono); letter-spacing: .12em; text-transform: uppercase; }
  .check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--ink); }
  .or { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 12px; }
  .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  .folder code { display: block; font: 12.5px var(--font-mono); background: var(--ground); border: 1px solid var(--line); border-radius: 6px; padding: 7px 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  li { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
  li span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li small { color: var(--muted); white-space: nowrap; }
  .now { color: var(--accent); font-size: 13px; }
</style>
