<script lang="ts">
  /* GLUE Home's settings (ADR 0044, 0045): the service's state and Start / Stop / Restart; connecting
     with a code from the website on this computer; this computer's GLUE folder and music folders (to
     play its songs on your other computers); the incoming folder; start with this computer; the songs
     received lately; the duplicates folder (ADR 0070). A desktop window: pages on the left, one pane
     that scrolls (2026-09-27). */
  import { onMount } from 'svelte';
  import { API, WEBSITE, askYesNo, autostart, bridge, onPairLink, openFolder, openUrl, pickFolder, type Activity, type HomeConfig, type Status } from './bridge';
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
  // Where duplicates put aside by the website go (ADR 0070): the setting, else "GLUE duplicates" in the
  // user's folder (Music is often a music folder).
  let defaultDup = $state('');
  const dupFolder = $derived(cfg?.duplicates || defaultDup);
  const norm = (x: string) => x.replace(/[\\/]+$/, '').toLowerCase() + '/';
  const dupInside = $derived(!!dupFolder && [...Object.values(cfg?.folders ?? {}), cfg?.incoming ?? ''].filter(Boolean).some(f => norm(dupFolder.replace(/\\/g, '/')).startsWith(norm(f.replace(/\\/g, '/')))));
  async function chooseDuplicates() {
    const f = await pickFolder(dupFolder || null);
    if (f) await save({ duplicates: f });
  }

  // The pages on the left jump to their section; the one in view is marked.
  const PAGES = [{ id: 'service', name: 'Service' }, { id: 'account', name: 'Account' }, { id: 'library', name: 'Library' }, { id: 'folders', name: 'Folders' }, { id: 'updates', name: 'Updates' }, { id: 'received', name: 'Received' }];
  let page = $state('service'), pane = $state<HTMLElement>();
  // A page chosen stays chosen while the pane scrolls to it (the spy would pick the one above a short last
  // section on the way).
  let jumpUntil = 0;
  function go(id: string) { page = id; jumpUntil = Date.now() + 900; pane?.querySelector('#sec-' + id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  function spy() {
    if (!pane || Date.now() < jumpUntil) return;
    const top = pane.getBoundingClientRect().top + 40;
    // Scrolled to the end: the last section, even when it's too short to reach the top.
    if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2) { page = PAGES[PAGES.length - 1].id; return; }
    let cur = PAGES[0].id;
    for (const pg of PAGES) { const el = pane.querySelector('#sec-' + pg.id); if (el && el.getBoundingClientRect().top <= top) cur = pg.id; }
    page = cur;
  }
  async function setAtLogin(on: boolean) {
    const a = await autostart();
    try { if (on) await a.enable(); else await a.disable(); atLogin = await a.isEnabled(); } catch (e) { error = (e as Error).message; }
  }

  onMount(() => {
    void (async () => {
      cfg = (await bridge.config()) ?? await blank();
      if (!cfg.incoming) cfg = { ...cfg, incoming: await bridge.defaultIncoming().catch(() => null) };
      defaultDup = await bridge.defaultDuplicates().catch(() => '');
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
  // What GLUE Home was asked since it started (ADR 0083): its own side (the local link, file reads) and
  // what other devices asked its service page. To see what keeps it busy.
  let own = $state<{ seconds: number; counts: Record<string, Activity> } | null>(null);
  async function loadActivity() { await bridge.askStatus(); own = await bridge.activity().catch(() => null); }
  const activity = $derived.by(() => {
    const rows: { what: string; calls: number; ms: number; bytes: number }[] = [];
    for (const [k, a] of Object.entries(own?.counts ?? {})) rows.push({ what: k.startsWith('local ') ? 'This computer’s GLUE website: ' + k.slice(6) : k.startsWith('bridge ') ? 'Reading files: ' + k.slice(7) : k, ...a });
    for (const [k, a] of Object.entries(status?.served ?? {})) rows.push({ what: 'Other devices: ' + k, ...a });
    return rows.sort((a, b) => b.ms - a.ms);
  });
  const mb = (b: number) => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1e3 ? Math.round(b / 1e3) + ' kB' : b ? b + ' B' : '';
  const secs = (ms: number) => ms >= 60_000 ? (ms / 60_000).toFixed(1) + ' min' : ms >= 1000 ? (ms / 1000).toFixed(1) + ' s' : Math.round(ms) + ' ms';
  function copyActivity() {
    const text = 'GLUE Home ' + current + ', running ' + Math.round((own?.seconds ?? 0) / 60) + ' min\n' + activity.map(r => [r.what, r.calls, secs(r.ms), mb(r.bytes)].join('\t')).join('\n');
    void navigator.clipboard.writeText(text);
  }

  const pill = $derived(status?.state === 'online' ? 'Online' : status?.state === 'connecting' ? 'Connecting' : status?.state === 'offline' ? 'Offline' : status?.state === 'stopped' ? 'Stopped' : 'Not connected');
</script>

<div class="app">
  <header>
    <GlueStick size={30} />
    <div class="ttl"><h1>GLUE Home</h1><p>{status?.text ?? 'Starting…'}</p></div>
    <span class="pill" id="state-pill" data-state={status?.state ?? 'connecting'}>{pill}</span>
    <button type="button" class="primary" id="open-library" onclick={() => bridge.openLibrary()}>Open GLUE library</button>
  </header>
  <div class="body">
    <nav aria-label="Settings">
      {#each PAGES.filter(x => x.id !== 'received' || status?.receiving || status?.received.length) as pg (pg.id)}
        <button type="button" class:on={page === pg.id} data-page={pg.id} onclick={() => go(pg.id)}>{pg.name}</button>
      {/each}
      <p class="ver">GLUE Home {current}</p>
    </nav>
    <main bind:this={pane} onscroll={spy}>
      <section id="sec-service">
        <h2>Service</h2>
        <p class="fine">While it runs, your other computers can send songs here from the GLUE website.</p>
        <div class="row">
          <button type="button" id="svc-start" disabled={!paired || status?.running} onclick={() => bridge.control('start')}>Start</button>
          <button type="button" id="svc-stop" disabled={!paired || !status?.running} onclick={() => bridge.control('stop')}>Stop</button>
          <button type="button" id="svc-restart" disabled={!paired} onclick={() => bridge.control('restart')}>Restart</button>
        </div>
        <label class="check"><input type="checkbox" id="at-login" checked={atLogin} onchange={e => setAtLogin(e.currentTarget.checked)}> Start GLUE Home when this computer starts</label>
        <details id="activity" ontoggle={e => { if (e.currentTarget.open) void loadActivity(); }}>
          <summary>What GLUE Home was asked</summary>
          <p class="fine">Since it started{own ? ' ' + Math.round(own.seconds / 60) + ' min ago' : ''}, the most time first: what keeps GLUE Home busy.</p>
          {#if activity.length}
            <table class="act">
              <thead><tr><th>What</th><th>Times</th><th>Time</th><th>Data</th></tr></thead>
              <tbody>{#each activity as r (r.what)}<tr><td>{r.what}</td><td>{r.calls.toLocaleString()}</td><td>{secs(r.ms)}</td><td>{mb(r.bytes)}</td></tr>{/each}</tbody>
            </table>
          {:else}<p class="fine">Nothing yet.</p>{/if}
          <div class="row"><button type="button" id="activity-refresh" onclick={() => void loadActivity()}>Refresh</button><button type="button" id="activity-copy" disabled={!activity.length} onclick={copyActivity}>Copy</button></div>
        </details>
      </section>

      <section id="sec-account">
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
          <div class="row"><button type="button" id="get-code" onclick={() => openUrl(WEBSITE)}>Open the GLUE website</button></div>
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

      <section id="sec-library">
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
          <div class="remind">
            <label class="check"><input type="checkbox" id="reminders" checked={cfg?.reminders !== false} onchange={e => save({ reminders: e.currentTarget.checked })}> Remind me of events that need music</label>
            <button type="button" class="mini" id="remind-now" disabled={cfg?.reminders === false} onclick={() => void bridge.remindNow()}>Check now</button>
          </div>
          <p class="fine" id="remind-state">A notification once a day for each event coming within its reminder days (set on the event in GLUE’s Calendar) with no songs in its playlists.{#if status?.reminders} Last look {new Date(status.reminders.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: {status.reminders.coming ? status.reminders.coming + ' event' + (status.reminders.coming === 1 ? '' : 's') + ' need' + (status.reminders.coming === 1 ? 's' : '') + ' music' + (status.reminders.sent.length ? ' (notified now)' : '') : 'none needs music'}.{/if}</p>
        {/if}
      </section>

      <section id="sec-folders">
        <h2>Folders</h2>
        <div class="frow">
          <div><b>Incoming</b><small>Songs sent to this computer. In GLUE on this computer, add it as a music folder once: new songs then show up in your library.</small></div>
          <code id="incoming" title={cfg?.incoming ?? ''}>{cfg?.incoming ?? '…'}</code>
          <div class="row">
            <button type="button" class="mini" id="choose-incoming" onclick={chooseFolder}>Choose…</button>
            {#if cfg?.incoming}<button type="button" class="mini" onclick={() => openFolder(cfg!.incoming!).catch(e => (error = (e as Error).message))}>Open</button>{/if}
          </div>
        </div>
        <div class="frow">
          <div><b>Duplicates</b><small>Where the GLUE website puts duplicates aside (Duplicates › Move the others), under their music folder’s name and path. They leave your library; nothing is deleted.</small></div>
          <code id="duplicates" title={dupFolder}>{dupFolder || '…'}</code>
          <div class="row">
            <button type="button" class="mini" id="choose-duplicates" onclick={chooseDuplicates}>Choose…</button>
            {#if dupFolder}<button type="button" class="mini" onclick={() => openFolder(dupFolder).catch(e => (error = (e as Error).message))}>Open</button>{/if}
          </div>
        </div>
        {#if dupInside}<p class="err" id="dup-inside">The duplicates folder is inside a music folder, so GLUE would find those songs again. Choose another one.</p>{/if}
      </section>

      <section id="sec-updates">
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
        <section id="sec-received">
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
  </div>
</div>

<style>
  /* A desktop window (the user's list, 2026-09-27): a header, the pages on the left, one pane that
     scrolls; the window itself never shows scroll bars. */
  .app { height: 100vh; display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; }
  header { display: flex; gap: 12px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--line); background: var(--surface); }
  .ttl { flex: 1; min-width: 0; }
  h1 { font-size: 17px; margin: 0; letter-spacing: -.01em; }
  header p { margin: 0; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pill { font: 600 10.5px var(--font-mono); letter-spacing: .08em; text-transform: uppercase; padding: 3px 9px; border-radius: 999px; border: 1px solid currentColor; color: var(--muted); flex: none; }
  .pill[data-state="online"] { color: var(--ok); }
  .pill[data-state="connecting"], .pill[data-state="offline"] { color: var(--warn); }
  .body { display: grid; grid-template-columns: 160px minmax(0, 1fr); min-height: 0; }
  nav { display: flex; flex-direction: column; gap: 2px; padding: 12px 8px; border-right: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 55%, var(--ground)); }
  nav button { background: none; border: 0; text-align: left; padding: 6px 10px; border-radius: 6px; color: var(--ink-2); font-size: 13px; }
  nav button:hover { background: var(--raised); border: 0; }
  nav button.on { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--ink); font-weight: 600; }
  .ver { margin-top: auto; padding: 6px 10px 0; color: var(--muted); font-size: 11px; }
  main { overflow-y: auto; padding: 14px 18px 40vh; display: grid; gap: 12px; align-content: start; }
  section { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; display: grid; gap: 8px; scroll-margin-top: 14px; }
  h2 { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0; }
  p { margin: 0; }
  .fine { color: var(--muted); font-size: 12.5px; }
  #activity { margin-top: 10px; }
  #activity summary { cursor: pointer; color: var(--ink-2); font-size: 13px; }
  .act { width: 100%; border-collapse: collapse; font-size: 12px; margin: 6px 0; }
  .act th { text-align: left; color: var(--muted); font-weight: 600; padding: 2px 6px 4px 0; }
  .act td { padding: 3px 6px 3px 0; border-top: 1px solid var(--line); font-variant-numeric: tabular-nums; }
  .act td:not(:first-child), .act th:not(:first-child) { text-align: right; white-space: nowrap; }
  .err { color: var(--bad); font-size: 12.5px; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  button { background: var(--raised); border: 1px solid var(--line-2); border-radius: 6px; padding: 5px 12px; cursor: pointer; font-size: 13px; }
  button:hover:not(:disabled) { border-color: var(--accent); }
  button:disabled { opacity: .45; cursor: default; }
  button.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 600; flex: none; }
  button.link { background: none; border: 0; padding: 0; color: var(--muted); text-decoration: underline; justify-self: start; font-size: 12.5px; }
  button.mini { padding: 2px 10px; font-size: 12px; flex: none; }
  form { display: grid; gap: 8px; }
  label { display: grid; gap: 4px; font-size: 12.5px; color: var(--ink-2); }
  label small { color: var(--muted); }
  input:not([type="checkbox"]) { background: var(--ground); border: 1px solid var(--line-2); border-radius: 6px; padding: 6px 10px; font-size: 13.5px; }
  input:focus { outline: none; border-color: var(--accent); }
  .code { grid-template-columns: 1fr auto; align-items: end; }
  #code { font-family: var(--font-mono); letter-spacing: .12em; text-transform: uppercase; }
  .check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink); }
  .remind { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 10px; margin-top: 4px; border-top: 1px solid var(--line); }
  .frow { display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; padding: 8px 0; border-top: 1px solid var(--line); }
  .frow:first-of-type { border-top: 0; padding-top: 0; }
  .frow > div:first-child { display: grid; gap: 2px; }
  .frow b { font-size: 13px; }
  .frow small { color: var(--muted); font-size: 12px; }
  .frow code { display: block; font: 12px var(--font-mono); background: var(--ground); border: 1px solid var(--line); border-radius: 6px; padding: 5px 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  li { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; align-items: center; }
  li span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li small { color: var(--muted); white-space: nowrap; margin-left: 6px; }
  .now { color: var(--accent); font-size: 13px; }
  .path { display: block; font: 11.5px var(--font-mono); color: var(--muted); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  details summary { cursor: pointer; color: var(--muted); font-size: 12.5px; }
  details form { margin-top: 8px; }
  @media (max-width: 560px) { .body { grid-template-columns: minmax(0, 1fr); } nav { display: none; } }
</style>
