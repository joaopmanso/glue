<script lang="ts">
  /* GLUE Cloud on the profile screen and the start page (ADR 0040): the Google account, every
     collection the account keeps in the cloud (per device, and merged ones), open any of them from
     this browser, and clean up. */
  import { account } from '../../lib/account.svelte';
  import { sync, type Group, type Member, type RemoteProfile } from '../../lib/sync.svelte';
  import { themes } from '../../lib/themes.svelte';
  import EmailSignIn from '../EmailSignIn.svelte';

  let gbox = $state<HTMLDivElement>();
  let opening = $state('');
  let error = $state('');
  let confirmAll = $state(false);
  $effect(() => { const el = gbox, dark = themes.resolved === 'dark'; if (el && !account.signedIn) account.renderGoogle(el, dark).catch(e => (error = (e as Error).message)); });
  $effect(() => { if (account.signedIn) void sync.refresh().catch(e => (error = (e as Error).message)); });

  const byDevice = $derived.by(() => {
    const m = new Map<string, { name: string; mine: boolean; profiles: RemoteProfile[] }>();
    for (const r of sync.remote) {
      const d = m.get(r.device.id) ?? { name: r.device.name, mine: r.device.id === account.thisDevice, profiles: [] };
      d.profiles.push(r); m.set(r.device.id, d);
    }
    return [...m.entries()].sort((a, b) => Number(b[1].mine) - Number(a[1].mine));
  });
  const deviceName = (id: string) => sync.remote.find(r => r.device.id === id)?.device.name ?? 'a device';
  const collectionName = (m: Member) => sync.remote.find(r => r.device.id === m.device && r.profile.id === m.profile)?.stats?.collections?.find(c => c.id === m.collection)?.name ?? 'collection';
  const tracksOf = (m: Member) => sync.remote.find(r => r.device.id === m.device && r.profile.id === m.profile)?.stats?.collections?.find(c => c.id === m.collection)?.tracks ?? 0;
  const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60e3); return m < 2 ? 'just now' : m < 60 ? m + ' min ago' : m < 48 * 60 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };

  async function run(label: string, f: () => Promise<unknown>) {
    opening = label; error = '';
    try { await f(); } catch (e) { error = (e as Error).message; } finally { opening = ''; }
  }
  const openDevice = (m: Member) => run('Opening ' + collectionName(m) + ' from the cloud…', () => sync.openDevice(m));
  const openGroup = (g: Group) => run('Merging ' + g.name + '…', () => sync.openGroup(g));
</script>

<section class="cloud" id="cloud-panel" aria-labelledby="cloud-h">
  <div class="ch">
    <h3 id="cloud-h">GLUE Cloud <small>optional</small></h3>
    {#if account.signedIn}<span class="acct">{account.user?.email} · <button type="button" class="link" onclick={() => account.signOut()}>Sign out</button></span>{/if}
  </div>
  {#if !account.signedIn}
    <p>Sign in (Google, or an email and password) to keep a copy of your collections' data in the cloud (tracks, playlists, ratings, notes, tags; <b>never the music</b>), see every device's collection from any browser, and merge collections across computers.</p>
    {#if account.available || account.phase === 'working'}<div class="gbtn" bind:this={gbox} id="cloud-google"></div><EmailSignIn idPrefix="cloud-pw" />
    {:else}<p class="fine">GLUE Cloud isn't reachable right now.</p>{/if}
  {:else}
    {#if sync.loading && !sync.remote.length}<p class="fine">Looking in your cloud…</p>
    {:else if !sync.remote.length}<p class="fine" id="cloud-empty">Nothing in your cloud yet. Turn on <b>Cloud sync</b> for a profile above and its collections appear here, and on every browser you sign in to.</p>{/if}

    {#if sync.groups.length}
      <h4>Merged collections</h4>
      <ul class="items">
        {#each sync.groups as g (g.id)}
          <li class="item merged" data-group={g.id}>
            <span class="what"><b>{g.name}</b><small>{g.members.map(m => deviceName(m.device) + ' · ' + collectionName(m) + ' (' + tracksOf(m) + ')').join(' + ')}</small></span>
            <button type="button" class="btn sm" onclick={() => openGroup(g)} disabled={!!opening}>Open</button>
            <button type="button" class="mini" title="Show them as separate collections again (nothing is deleted)" onclick={() => run('', () => sync.unmerge(g.id))}>Unmerge</button>
          </li>
        {/each}
      </ul>
    {/if}
    {#each byDevice as [did, d] (did)}
      <h4>{d.name}{#if d.mine} <small>this browser</small>{/if}</h4>
      <ul class="items">
        {#each d.profiles as r (r.profile.id)}
          {#each r.stats?.collections ?? [] as c (c.id)}
            {@const m = { device: did, profile: r.profile.id, collection: c.id }}
            {@const g = sync.groupOf(m)}
            <li class="item" data-cloud={did + '/' + r.profile.id + '/' + c.id}>
              <span class="what"><b>{c.name}</b><small>{r.profile.name} · {c.tracks.toLocaleString()} tracks · synced {ago(r.updatedAt)}{r.complete ? '' : ' · uploading…'}{g ? ' · in ' + g.name : ''}</small></span>
              <button type="button" class="btn sm" onclick={() => openDevice(m)} disabled={!!opening}>Open</button>
            </li>
          {/each}
          <li class="del"><button type="button" class="link" onclick={() => { if (confirm('Delete the cloud copy of “' + r.profile.name + '” from ' + d.name + '? The files on that computer stay; if it still has Cloud sync on it uploads again next time.')) void run('', () => sync.deleteCopy(did, r.profile.id)); }}>Delete {r.profile.name}'s cloud copy from {d.name}</button></li>
        {/each}
      </ul>
    {/each}
    {#if sync.remote.length}
      <div class="danger">
        {#if !confirmAll}<button type="button" class="link" id="cloud-clean" onclick={() => (confirmAll = true)}>Delete everything in my cloud…</button>
        {:else}<span>Removes every device's cloud copy, merges and waiting edits. Nothing on your computers is touched.</span>
          <button type="button" class="mini bad" id="cloud-clean-go" onclick={() => { confirmAll = false; void run('', () => sync.deleteAll()); }}>Delete cloud data</button>
          <button type="button" class="mini" onclick={() => (confirmAll = false)}>Cancel</button>{/if}
      </div>
    {/if}
  {/if}
  {#if opening}<p class="fine" role="status">{opening}</p>{/if}
  {#if error || account.error}<p class="err">{error || account.error}</p>{/if}
</section>

<style>
  .cloud { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; display: grid; gap: 10px; color: var(--ink-2); font-size: 14px; }
  .ch { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; flex-wrap: wrap; }
  h3 { font-size: 16px; color: var(--ink); display: flex; gap: 8px; align-items: baseline; }
  h3 small, h4 small { font-size: 10.5px; color: var(--muted); font-weight: 500; text-transform: uppercase; letter-spacing: .08em; }
  h4 { font-size: 13px; color: var(--ink); margin: 6px 0 0; display: flex; gap: 8px; align-items: baseline; }
  .acct { font-size: 12.5px; color: var(--muted); }
  .gbtn { min-height: 44px; color-scheme: light; justify-self: start; }
  .items { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .item { display: flex; gap: 10px; align-items: center; background: var(--ground); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
  .item.merged { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .what { flex: 1; min-width: 0; display: grid; line-height: 1.3; }
  .what b { color: var(--ink); font-weight: 600; }
  .what small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
  .del { text-align: right; }
  .btn.sm { padding: 5px 14px; font-size: 13px; }
  .btn:disabled { opacity: .5; }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 3px 9px; cursor: pointer; }
  .mini.bad { color: var(--bad); border-color: var(--bad); }
  .link { background: none; border: 0; color: var(--muted); text-decoration: underline; cursor: pointer; padding: 0; font-size: 12.5px; }
  .danger { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12.5px; border-top: 1px solid var(--line); padding-top: 8px; }
  .fine { color: var(--muted); font-size: 12.5px; }
  .err { color: var(--bad); font-size: 13px; }
</style>
