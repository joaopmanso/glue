<script lang="ts">
  /* Sidebar › Devices (signed in only): this browser and the account's other devices, each in its
     colour (the Device column's), with its songs, when it was last seen, and that streaming from it
     is off until GLUE Home streaming exists. Clicking one shows only its songs (a merged collection,
     ADR 0042). Rename or remove from ⋯; "+ GLUE Home" shows a pairing code for this computer's GLUE Home (ADR 0036, 0045).
     A GLUE Home that serves a browser shows on that browser's row. */
  import { account, type CloudDevice } from '../../lib/account.svelte';
  import { sync } from '../../lib/sync.svelte';
  import { lib } from '../../lib/library.svelte';
  import { view, devicesOf, manyDevices } from '../../lib/view.svelte';
  import { deviceColor } from '../../lib/devices';
  import { sendToHome } from '../../lib/sendToHome.svelte';
  import { companionOf } from '../../lib/remoteFiles.svelte';
  import { remoteFiles } from '../../lib/remoteFiles.svelte';
  import { HOME_DOWNLOADS, homeOs, homePairLink } from '../../lib/homeApp';
  import { AUDIO_EXT } from '../../core/library/tags';
  import HomeInstallHelp from '../HomeInstallHelp.svelte';

  // Songs dropped on a GLUE Home, or picked from its menu, go to its incoming folder (ADR 0044).
  let dropOn = $state<string | null>(null);
  let picker = $state<HTMLInputElement>();
  let pickFor = '';
  const os = homeOs();
  const send = (id: string, files: File[]) => {
    const songs = files.filter(f => AUDIO_EXT.test(f.name));
    if (!songs.length) { lib.notice = 'Only songs can be sent to GLUE Home.'; return; }
    void sendToHome.send(id, songs).catch(e => (lib.notice = (e as Error).message));
  };
  /** A computer's GLUE Home (ADR 0045): a GLUE Home row itself, or the companion of a browser row. */
  const homeOf = (d: CloudDevice) => d.kind === 'home' ? d : companionOf(d.id);
  // One row per computer: a GLUE Home that serves a listed browser shows on that browser's row.
  const rows = $derived(account.devices.filter(d => !(d.kind === 'home' && d.companionOf && account.devices.some(b => b.id === d.companionOf))));
  function dropped(e: DragEvent, d: CloudDevice) {
    dropOn = null;
    const h = homeOf(d);
    if (!h || !e.dataTransfer?.files.length) return;
    e.preventDefault();
    (e as DragEvent & { glueTaken?: boolean }).glueTaken = true;
    send(h.id, [...e.dataTransfer.files]);
  }
  function pickSongs(h: CloudDevice) { menu = null; pickFor = h.id; picker?.click(); }

  let menu = $state<{ id: string; x: number; y: number; up: boolean } | null>(null);
  let pairing = $state<{ code: string; expiresAt: number } | null>(null);
  let pairError = $state('');
  let now = $state(Date.now());
  let homesAtStart = 0;
  $effect(() => { if (!pairing) return; const t = setInterval(() => (now = Date.now()), 1000); return () => clearInterval(t); });
  // The dialog closes itself once the new GLUE Home has joined.
  $effect(() => { const n = account.devices.filter(d => d.kind === 'home').length; if (pairing && n > homesAtStart) { pairing = null; } });
  // The menu floats over the page (the sidebar would cut it off): it goes away when anything scrolls.
  $effect(() => {
    if (!menu) return;
    const close = () => (menu = null);
    addEventListener('scroll', close, true); addEventListener('resize', close);
    return () => { removeEventListener('scroll', close, true); removeEventListener('resize', close); };
  });

  async function startPairing() {
    pairError = '';
    homesAtStart = account.devices.filter(d => d.kind === 'home').length;
    try { pairing = await account.pair(); now = Date.now(); }
    catch (e) { pairError = (e as Error).message; }
  }
  const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60e3); return m < 2 ? 'just now' : m < 60 ? m + ' min ago' : m < 48 * 60 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
  function seen(d: CloudDevice): string {
    if (d.id === account.thisDevice) return 'this browser';
    if (account.online.has(d.id)) return 'online';
    return d.lastSeen ? 'seen ' + ago(d.lastSeen) : 'never connected';
  }
  // Songs per device: in the open merged collection when there is one, else what the device uploaded.
  const shown = $derived.by(() => {
    void lib.version;
    const m = new Map<string, number>();
    if (manyDevices()) for (const t of lib.store?.tracks.values() ?? []) for (const d of devicesOf(t)) m.set(d, (m.get(d) ?? 0) + 1);
    return m;
  });
  function songs(d: CloudDevice): number | null {
    if (shown.has(d.name)) return shown.get(d.name)!;
    const rs = sync.remote.filter(r => r.device.id === d.id);
    if (!rs.length) return d.id === account.thisDevice && lib.store && !lib.cloud ? lib.ownTracks().length : null;
    return rs.reduce((n, r) => n + (r.stats?.collections ?? []).reduce((a, c) => a + c.tracks, 0), 0);
  }
  const syncedAt = (d: CloudDevice) => Math.max(0, ...sync.remote.filter(r => r.device.id === d.id).map(r => r.updatedAt)) || null;
  const only = $derived(view.filters.device);

  function openMenu(e: MouseEvent, d: CloudDevice) {
    if (menu?.id === d.id) { menu = null; return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(), up = r.bottom + 100 > innerHeight;
    menu = { id: d.id, x: Math.max(8, Math.min(innerWidth - 188, r.right - 180)), y: up ? innerHeight - r.top + 4 : r.bottom + 4, up };
  }
  async function rename(d: CloudDevice) {
    menu = null;
    const name = prompt('Name this device', d.name)?.trim();
    if (name && name !== d.name) await account.rename(d.id, name).catch(e => alert((e as Error).message));
  }
  async function remove(d: CloudDevice) {
    menu = null;
    if (confirm('Remove “' + d.name + '” from your GLUE account? ' + (d.kind === 'home' ? 'It stops being reachable until you pair it again.' : 'It gets signed out.'))) await account.remove(d.id).catch(e => alert((e as Error).message));
  }
  const left = $derived(pairing ? Math.max(0, Math.round((pairing.expiresAt - now) / 1000)) : 0);
  const menuDevice = $derived(menu ? account.devices.find(d => d.id === menu!.id) ?? null : null);
</script>

<svelte:window onpointerdown={e => { if (menu && !(e.target as HTMLElement).closest('.dmenu, .more')) menu = null; }} onkeydown={e => { if (e.key === 'Escape') { menu = null; pairing = null; } }} />

<section class="devs" id="devices">
  <div class="head">
    <h3 class="label">Devices</h3>
    <span class="add"><button type="button" id="pair-home" title="Install GLUE Home on this computer: its songs then play on your other computers" onclick={startPairing}>+ GLUE Home</button></span>
  </div>
  <ul>
    {#each rows as d (d.id)}
      {@const on = d.id === account.thisDevice ? account.connected : account.online.has(d.id)}
      {@const h = homeOf(d)}
      {@const hOn = !!h && account.online.has(h.id)}
      {@const n = songs(d)}
      {@const at = syncedAt(d)}
      {@const me = d.id === account.thisDevice}
      {@const loading = !!sync.busy && sync.busy.includes(d.name)}
      <li>
        <div class="item dev" data-device={d.id} class:sel={only.includes(d.name)} class:droppable={dropOn === d.id} style:--c={deviceColor(d.name)} role="group" aria-label={d.name}
          ondragover={e => { if (hOn && [...(e.dataTransfer?.types ?? [])].includes('Files')) { e.preventDefault(); dropOn = d.id; } }}
          ondragleave={() => { if (dropOn === d.id) dropOn = null; }} ondrop={e => dropped(e, d)}>
          <button type="button" class="dname" aria-pressed={only.includes(d.name)} title={only.includes(d.name) ? 'Show every device’s songs again' : 'Show only the songs on ' + d.name}
            onclick={() => view.toggleFilter('device', d.name)}>
            <i class="sw" class:on aria-hidden="true"></i>
            <span class="txt"><b>{d.name}</b><small>{d.kind === 'home' ? 'GLUE Home · ' : ''}{seen(d)}{h && d.kind !== 'home' ? ' · GLUE Home ' + (hOn ? 'on' : 'off') : ''}{hOn ? ' · drop songs to send' : ''}{n != null ? ' · ' + n.toLocaleString() + ' song' + (n === 1 ? '' : 's') : ''}{!me && at ? ' · synced ' + ago(at) : ''}</small></span>
          </button>
          {#if loading || (remoteFiles.loading && remoteFiles.loading.device === d.name)}<span class="spin" title={remoteFiles.loading ? 'Getting ' + remoteFiles.loading.name + ' from ' + d.name + '…' : 'Updating from ' + d.name + '…'}></span>
          {:else if hOn && !me}<span class="stream" title={'Streaming on: ' + d.name + '’s songs play here through its GLUE Home.'} aria-label="Streaming on">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 9.5v-3M5 11V5M8 12.5v-9M11 11V5M14 9.5v-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </span>
          {:else if !me}<span class="nostream" title={'Streaming from ' + d.name + ' is off: ' + (h ? 'its GLUE Home isn’t running.' : 'install GLUE Home there (+ GLUE Home).') + ' Its songs show here and play on ' + d.name + '.'} aria-label="Streaming off">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 9.5v-3M5 11V5M8 12.5v-9M11 11V5M14 9.5v-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2 14 14 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </span>{/if}
          <button type="button" class="more" class:open={menu?.id === d.id} title="More" aria-haspopup="menu" aria-expanded={menu?.id === d.id} onclick={e => openMenu(e, d)}>⋯</button>
        </div>
      </li>
    {/each}
  </ul>
  {#if rows.length > 1}<p class="fine"><span class="nostream" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M2 9.5v-3M5 11V5M8 12.5v-9M11 11V5M14 9.5v-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2 14 14 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span> A computer’s songs play here when GLUE Home runs on it (+ GLUE Home, on that computer).</p>{/if}
  {#if pairError}<p class="err">{pairError}</p>{/if}
</section>

<input type="file" multiple hidden bind:this={picker} accept="audio/*,.flac,.wav,.aif,.aiff,.m4a,.alac,.mp3,.aac,.ogg,.opus" id="send-input"
  onchange={e => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; if (f.length && pickFor) send(pickFor, f); }}>

{#if menu && menuDevice}
  {@const d = menuDevice}
  {@const h = homeOf(menuDevice)}
  <div class="dmenu" role="menu" style:left={menu.x + 'px'} style:top={menu.up ? null : menu.y + 'px'} style:bottom={menu.up ? menu.y + 'px' : null}>
    {#if h}<button type="button" role="menuitem" id="send-songs" disabled={!account.online.has(h.id)} title={account.online.has(h.id) ? 'Copy songs into its incoming folder' : 'Its GLUE Home is offline'} onclick={() => pickSongs(h)}>Send songs…</button>{/if}
    <button type="button" role="menuitem" onclick={() => rename(d)}>Rename…</button>
    {#if h && h.id !== d.id}<button type="button" role="menuitem" class="danger" onclick={() => remove(h)}>Disconnect its GLUE Home…</button>{/if}
    <button type="button" role="menuitem" class="danger" onclick={() => remove(d)}>{d.id === account.thisDevice ? 'Remove (signs out)…' : 'Remove…'}</button>
  </div>
{/if}

{#if pairing}
  <div class="scrim" role="presentation" onpointerdown={e => { if (e.target === e.currentTarget) pairing = null; }}>
    <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="pair-h" id="pair-dialog">
      <h2 id="pair-h">GLUE Home on this computer</h2>
      <p>GLUE Home is this computer’s companion: it plays its songs to your other computers and takes songs sent to it. Install it here and enter this code (or use the button):</p>
      <p class="code" id="pair-code">{pairing.code}</p>
      <p class="fine">{left > 0 ? 'Works once, for ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + ' more.' : 'This code has expired.'} This window closes by itself when GLUE Home has joined.</p>
      <p><a class="btn" id="pair-open" href={homePairLink(pairing.code)}>Open GLUE Home on this computer</a></p>
      <p class="fine">Don’t have it yet?
        {#each Object.entries(HOME_DOWNLOADS).sort(([a], [b]) => Number(b === os) - Number(a === os)) as [k, dl], i (k)}{i ? ' · ' : ' '}<a href={dl.url} data-download={k} class:mine={k === os}>Download for {dl.label}</a>{/each}
      </p>
      <HomeInstallHelp />
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
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .dev { display: flex; align-items: center; gap: 6px; padding: 3px 4px 3px 6px; border-radius: 5px; min-height: 38px; border: 1px solid transparent; }
  .dev:hover { background: var(--raised); }
  .dev.droppable { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .dev.sel { background: color-mix(in srgb, var(--c) 14%, transparent); border-color: color-mix(in srgb, var(--c) 45%, transparent); }
  .dname { flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; background: none; border: 0; padding: 0; text-align: left; color: inherit; cursor: pointer; font: inherit; }
  .sw { position: relative; width: 12px; height: 26px; border-radius: 3px; background: var(--c); flex: none; }
  .sw.on::after { content: ''; position: absolute; right: -3px; bottom: -2px; width: 8px; height: 8px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 2px var(--ground); }
  .txt { flex: 1; min-width: 0; display: grid; line-height: 1.25; font-size: 13px; }
  .txt b { font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .txt small { color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nostream { display: inline-grid; place-items: center; color: var(--muted); opacity: .75; flex: none; }
  .nostream svg, .stream svg { width: 14px; height: 14px; }
  .stream { display: inline-grid; place-items: center; color: var(--ok); flex: none; }
  .spin { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--accent); border-right-color: transparent; animation: spin .9s linear infinite; flex: none; margin: 0 2px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .more { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 0 6px 2px; font-size: 13px; opacity: 0; border-radius: 4px; }
  .dev:hover .more, .more.open, .more:focus-visible { opacity: 1; }
  .more:hover, .more.open { background: var(--surface); color: var(--ink); }
  .fine { display: flex; gap: 6px; align-items: flex-start; color: var(--muted); font-size: 11.5px; line-height: 1.35; padding: 2px 6px 0; }
  .dmenu { position: fixed; z-index: 50; width: 180px; display: grid; gap: 2px; background: var(--raised); border: 1px solid var(--line-2); border-radius: 6px; padding: 6px; font-size: 13px; box-shadow: 0 12px 30px rgb(0 0 0 / .45); }
  .dmenu button { background: none; border: 0; text-align: left; padding: 5px 8px; border-radius: 4px; cursor: pointer; color: var(--ink); }
  .dmenu button:hover { background: color-mix(in srgb, var(--accent) 15%, transparent); }
  .dmenu .danger { color: var(--bad); }
  .dmenu button:disabled { opacity: .45; cursor: default; }
  .dlg a.mine { font-weight: 700; }
  .dlg p a:not(.btn) { color: var(--accent); }
  .dlg a.btn { text-decoration: none; display: inline-block; }
  .err { color: var(--bad); font-size: 12px; padding: 0 8px; }
  .scrim { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--ground) 70%, transparent); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; overflow-y: auto; }
  .dlg { width: min(460px, 100%); background: var(--surface); border: 1px solid var(--line-2); border-radius: 12px; padding: 22px; display: grid; gap: 12px; box-shadow: 0 24px 60px rgb(0 0 0 / .5); }
  .dlg h2 { font-size: 21px; }
  .dlg p { color: var(--ink-2); font-size: 14px; }
  .code { font: 700 34px/1.2 var(--font-mono); letter-spacing: .12em; color: var(--accent) !important; text-align: center; padding: 10px; border: 1px dashed color-mix(in srgb, var(--accent) 50%, transparent); border-radius: 8px; user-select: all; }
  .dlg .fine { display: block; padding: 0; font-size: 12px !important; }
  .acts { display: flex; gap: 8px; justify-content: flex-end; }
</style>
