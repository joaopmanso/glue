<script lang="ts">
  /* GLUE Home's settings (ADR 0044, 0045): the service's state and Start / Stop / Restart; connecting
     with a code from the website on this computer; this computer's GLUE folder and music folders (to
     play its songs on your other computers); the incoming folder; start with this computer; the songs
     received lately. */
  import { onMount } from 'svelte';
  import { API, WEBSITE, askYesNo, autostart, bridge, onPairLink, openFolder, openUrl, pickFolder, type HomeConfig, type Status } from './bridge';
  import { claim, type Joined } from './cloud';
  import { collectionKey, describe, shared, type LibraryInfo } from './library';
  import { findUpdate, install, version } from './updates';
  import type { Update } from '@tauri-apps/plugin-updater';
  import GlueStick from '../../src/ui/GlueStick.svelte';
  import { fmtBytes } from '../../src/core/format';

  let cfg = $state<HomeConfig | null>(null);
  let status = $state<Status | null>(null);
  let code = $state('');
  let lib = $state<LibraryInfo | null>(null);
  let busy = $state(''), error = $state('');
  let atLogin = $state(false);
  // Updates: this version, a check on demand, installing (with progress).
  let current = $state('');
  let update = $state<Update | null>(null);
  let upd = $state('');
  async function checkUpdates() {
    upd = 'Checking…'; update = null;
    try { update = await findUpdate(); upd = update ? 'Version ' + update.version + ' is available.' : 'You have the latest version.'; }
    catch (e) { upd = 'Couldn’t check for updates: ' + ((e as Error).message || e); }
  }
  async function installUpdate() {
    if (!update) return;
    const u = update;
    upd = 'Downloading ' + u.version + '…';
    try { await install(u, (got, total) => (upd = 'Downloading ' + u.version + '… ' + (total ? Math.round(got / total * 100) + '%' : Math.round(got / 1e6) + ' MB'))); }
    catch (e) { upd = 'Couldn’t install the update: ' + ((e as Error).message || e); }
  }

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
    code = ''; error = '';
  }
  async function run(label: string, f: () => Promise<void>) {
    busy = label; error = '';
    try { await f(); } catch (e) { error = (e as Error).message || String(e); } finally { busy = ''; }
  }
  // Connecting again (a new code) replaces this GLUE Home's previous device in the account.
  const withCode = (c = code) => run('Connecting…', async () => joined(await claim(api, c, cfg?.name || 'GLUE Home', cfg?.deviceId && cfg?.token ? { deviceId: cfg.deviceId, token: cfg.token } : null)));

  // This computer's GLUE library: every collection is shared, its music folders found by the service.
  async function scan() { lib = cfg?.glue ? await describe() : null; }
  async function chooseGlue() {
    const f = await pickFolder(cfg?.glue ?? null);
    if (!f) return;
    await save({ glue: f });
    await scan();
    if (!lib) error = 'That folder isn’t a GLUE folder (it has no mco.json). Choose the folder GLUE on the website uses.';
  }
  async function setShared(p: string, c: string, on: boolean) { await save({ serve: { ...(cfg?.serve ?? {}), [collectionKey(p, c)]: on } }); }
  /** Only if a music folder can't be found by itself (it's checked with one of its songs). */
  async function chooseFolder2(id: string) {
    const f = await pickFolder(cfg?.folders?.[id] ?? null);
    if (f) await save({ folders: { ...(cfg?.folders ?? {}), [id]: f } });
  }
  const folderCount = (roots: { id: string }[]) => roots.filter(r => cfg?.folders?.[r.id]).length;
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
      await bridge.onConfig(c => { const glueChanged = c.glue !== cfg?.glue; cfg = c; if (glueChanged) void scan(); });
      // The website's GLUE folder, if it's in a usual place.
      if (!cfg.glue) { const g = await bridge.findGlue().catch(() => null); if (g) await save({ glue: g }); }
      await scan().catch(() => {});
      await bridge.onStatus(s => (status = s));
      await bridge.askStatus();
      atLogin = await (await autostart()).isEnabled().catch(() => false);
      current = await version().catch(() => '');
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
      <details><summary>Connect again with a new code</summary>
        <form class="code" onsubmit={e => { e.preventDefault(); void withCode(); }}>
          <label>Code <input id="code-again" placeholder="ABCD-EFGH" autocomplete="off" spellcheck="false" bind:value={code} required></label>
          <button type="submit" disabled={!!busy}>Connect</button>
        </form>
      </details>
      <button type="button" class="link" onclick={disconnect}>Disconnect this computer</button>
    {:else}
      <p class="fine">On the GLUE website <b>on this computer</b>: sidebar › Devices › <b>+ GLUE Home</b>. Then press “Open GLUE Home on this computer”, or type the code here. GLUE Home becomes this computer’s companion.</p>
      <button type="button" id="get-code" onclick={() => openUrl(WEBSITE)}>Open the GLUE website</button>
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
    <h2>This computer’s library</h2>
    {#if !cfg?.glue || (cfg?.glue && !lib)}
      <p class="fine">GLUE Home shares the library the GLUE website uses on this computer. It didn’t find it in the usual places: choose the website’s GLUE folder.</p>
      <div class="row"><button type="button" id="choose-glue" onclick={chooseGlue}>Choose the GLUE folder…</button></div>
    {:else}
      <p class="fine">Every collection of this computer’s GLUE is shared with your other computers (read only: GLUE Home never changes it). <span class="path" id="glue-folder" title={cfg.glue}>{cfg.glue}</span></p>
      <ul id="collections">
        {#each lib?.profiles ?? [] as p (p.id)}
          {#each p.collections as c (c.id)}
            {@const n = folderCount(c.roots)}
            <li data-collection={c.id}>
              <label class="check"><input type="checkbox" checked={shared(cfg, p.id, c.id)} onchange={e => setShared(p.id, c.id, e.currentTarget.checked)}>
                <span><b>{c.name}</b> <small>{p.name}{c.roots.length ? ' · ' + (status?.library?.searching && n < c.roots.length ? 'finding its music folders…' : n + ' of ' + c.roots.length + ' music folder' + (c.roots.length === 1 ? '' : 's') + ' found') : ''}</small></span></label>
            </li>
          {/each}
        {/each}
      </ul>
      {#if status?.library?.missing.length && !status.library.searching}
        <details id="missing-folders"><summary>{status.library.missing.length} music folder{status.library.missing.length === 1 ? '' : 's'} not found on this computer</summary>
          <ul>
            {#each status.library.missing as m (m.id)}
              <li data-root={m.id}><span><b>{m.name}</b> <small>{m.collection}</small></span><button type="button" class="mini" onclick={() => chooseFolder2(m.id)}>Choose…</button></li>
            {/each}
          </ul>
        </details>
      {/if}
      {#if status?.analysis && (status.analysis.running || status.analysis.total)}
        <p class="fine" id="analysis-state">Waveforms and analyses for your other computers: {status.analysis.running ? status.analysis.done.toLocaleString() + ' of ' + status.analysis.total.toLocaleString() + ' made here (the website on this computer hands over what it has)' : 'ready'}</p>
      {/if}
      <button type="button" class="link" onclick={chooseGlue}>Use another GLUE folder…</button>
    {/if}
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

  <section>
    <h2>Updates</h2>
    <p class="fine" id="version">GLUE Home {current}</p>
    <div class="row">
      <button type="button" id="check-updates" onclick={checkUpdates}>Check for updates</button>
      {#if update}<button type="button" class="primary" id="install-update" onclick={installUpdate}>Install and restart</button>{/if}
    </div>
    {#if upd}<p class="fine" id="update-state" role="status">{upd}</p>{/if}
    <label class="check"><input type="checkbox" id="auto-update" checked={cfg?.autoUpdate !== false} onchange={e => save({ autoUpdate: e.currentTarget.checked })}> Install updates by itself</label>
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
  .folder code { display: block; font: 12.5px var(--font-mono); background: var(--ground); border: 1px solid var(--line); border-radius: 6px; padding: 7px 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  li { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
  li span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li small { color: var(--muted); white-space: nowrap; }
  .now { color: var(--accent); font-size: 13px; }
  .path { display: block; font: 11.5px var(--font-mono); color: var(--muted); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li small { margin-left: 6px; }
  button.mini { padding: 2px 10px; font-size: 12px; flex: none; }
  li { align-items: center; }
  details summary { cursor: pointer; color: var(--muted); font-size: 12.5px; }
  details form { margin-top: 8px; }
</style>
