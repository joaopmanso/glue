<script lang="ts">
  /* GLUE Cloud on the profile screen and the start page (ADR 0101): the account, and the collections it
     keeps (one copy each, the same on every device; never the music). Sign in here; with cloud sync on,
     a profile's collections become the account's when they open. */
  import { account } from '../../lib/account.svelte';
  import { askDeleteShared, shared, type SharedInfo } from '../../lib/shared.svelte';
  import { themes } from '../../lib/themes.svelte';
  import EmailSignIn from '../EmailSignIn.svelte';

  let gbox = $state<HTMLDivElement>();
  let error = $state('');
  let confirmAll = $state(false);
  let working = $state('');
  $effect(() => { const el = gbox, dark = themes.resolved === 'dark'; if (el && !account.signedIn) account.renderGoogle(el, dark).catch(e => (error = (e as Error).message)); });
  $effect(() => { if (account.signedIn) void shared.refreshList(); });
  const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60e3); return m < 2 ? 'just now' : m < 60 ? m + ' min ago' : m < 48 * 60 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
  // Each computer of a collection (ADR 0112): its numbers as it last sent them, and whether it's there now.
  function computers(c: SharedInfo) {
    return Object.entries(c.stats?.by ?? {}).map(([id, st]) => {
      const d = account.devices.find(x => x.id === id), home = account.devices.find(x => x.kind === 'home' && x.companionOf === id);
      const online = account.online.has(id) || (!!home && account.online.has(home.id));
      const seen = Math.max(d?.lastSeen ?? 0, home?.lastSeen ?? 0, st.at ?? 0) || null;
      return { id, name: d?.name ?? 'A computer no longer in your account', home: !!home, online, seen, songs: st.songs, changed: st.changed ?? null };
    }).sort((a, b) => (b.songs ?? 0) - (a.songs ?? 0));
  }
  const lastChange = (c: SharedInfo) => Math.max(0, ...Object.values(c.stats?.by ?? {}).map(s => s.changed ?? 0)) || null;
  async function rename(c: SharedInfo) {
    const n = prompt('Rename “' + c.name + '” (on every device)', c.name);
    if (!n?.trim() || n.trim() === c.name) return;
    working = 'Renaming…'; error = '';
    try { await shared.rename(c.id, n); } catch (e) { error = (e as Error).message; } finally { working = ''; }
  }
  async function deleteAll() {
    confirmAll = false; working = 'Deleting…'; error = '';
    try {
      for (const c of shared.list) await account.request('DELETE', '/v1/shared/' + encodeURIComponent(c.id) + '?cloudOnly=1');   // each computer keeps its copy
      await shared.refreshList();
    } catch (e) { error = (e as Error).message; } finally { working = ''; }
  }
</script>

<section class="cloud" id="cloud-panel" aria-labelledby="cloud-h">
  <div class="ch">
    <h3 id="cloud-h">GLUE Cloud <small>optional</small></h3>
    {#if account.signedIn}<span class="acct">{account.user?.email} · <button type="button" class="link" onclick={() => account.signOut()}>Sign out</button></span>{/if}
  </div>
  {#if !account.signedIn}
    <p>Sign in (Google, or an email and password) and your collections are the same on every device you sign in to: songs, analyses, playlists, ratings and tags (<b>never the music</b>, which streams from the computer that has it).</p>
    {#if account.available || account.phase === 'working'}<div class="gbtn" bind:this={gbox} id="cloud-google"></div><EmailSignIn idPrefix="cloud-pw" />
    {:else}<p class="fine">GLUE Cloud isn't reachable right now.</p>{/if}
  {:else}
    {#if !shared.list.length}<p class="fine" id="cloud-empty">Nothing in your account yet. Open a profile with <b>Cloud sync</b> on and its collections join your account by themselves.</p>
    {:else}
      <ul class="items">
        {#each shared.list as c (c.id)}
          {@const comps = computers(c)}
          {@const changed = lastChange(c)}
          <li class="item coll" data-cloud={c.id}>
            <div class="head">
              <span class="what"><b>{c.name}</b><small>{c.stats?.tracks != null ? c.stats.tracks.toLocaleString() + ' songs' : 'Songs not counted yet'}{changed ? ' · changed ' + ago(changed) : ''}</small></span>
              <button type="button" class="mini" data-rename={c.id} onclick={() => void rename(c)}>Rename</button>
              <button type="button" class="mini bad" data-delete={c.id} onclick={() => void askDeleteShared(c.id, c.name)}>Delete…</button>
            </div>
            {#if comps.length}
              <ul class="comps">
                {#each comps as d (d.id)}
                  <li data-computer={d.id}><span class="dot" class:on={d.online} title={d.online ? 'Online now' : 'Not online'}></span><b>{d.name}</b>{#if d.home}<span class="tag">GLUE Home</span>{/if}
                    <small>{d.songs != null ? d.songs.toLocaleString() + ' songs' : ''}{d.online ? ' · online' : d.seen ? ' · seen ' + ago(d.seen) : ''}{d.changed ? ' · changed ' + ago(d.changed) : ''}</small></li>
                {/each}
              </ul>
            {:else}<small class="fine">No computer has sent its numbers yet: they show after its next sync.</small>{/if}
          </li>
        {/each}
      </ul>
      <div class="danger">
        {#if !confirmAll}<button type="button" class="link" id="cloud-clean" onclick={() => (confirmAll = true)}>Delete everything in my cloud…</button>
        {:else}<span>Removes your account's collections from GLUE Cloud. Each computer keeps its own copy.</span>
          <button type="button" class="mini bad" id="cloud-clean-go" onclick={() => void deleteAll()}>Delete cloud data</button>
          <button type="button" class="mini" onclick={() => (confirmAll = false)}>Cancel</button>{/if}
      </div>
    {/if}
  {/if}
  {#if working}<p class="fine" role="status">{working}</p>{/if}
  {#if error || account.error}<p class="err">{error || account.error}</p>{/if}
</section>

<style>
  .cloud { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; display: grid; gap: 10px; color: var(--ink-2); font-size: 14px; }
  .ch { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; flex-wrap: wrap; }
  h3 { font-size: 16px; color: var(--ink); display: flex; gap: 8px; align-items: baseline; }
  h3 small { font-size: 10.5px; color: var(--muted); font-weight: 500; text-transform: uppercase; letter-spacing: .08em; }
  .acct { font-size: 12.5px; color: var(--muted); }
  .gbtn { min-height: 44px; color-scheme: light; justify-self: start; }
  .items { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .item { display: flex; gap: 10px; align-items: center; background: var(--ground); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
  .what { flex: 1; min-width: 0; display: grid; line-height: 1.3; }
  .what b { color: var(--ink); font-weight: 600; }
  .coll { display: grid; gap: 6px; align-items: stretch; }
  .head { display: flex; gap: 8px; align-items: center; }
  .comps { list-style: none; margin: 0; padding: 0 0 0 4px; display: grid; gap: 3px; font-size: 12.5px; }
  .comps li { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
  .comps b { color: var(--ink-2); font-weight: 600; }
  .comps small { color: var(--muted); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--line-2); align-self: center; flex: none; }
  .dot.on { background: var(--ok, #3fb950); }
  .tag { font-size: 10.5px; color: var(--muted); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
  .what small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 3px 9px; cursor: pointer; }
  .mini.bad { color: var(--bad); border-color: var(--bad); }
  .link { background: none; border: 0; color: var(--muted); text-decoration: underline; cursor: pointer; padding: 0; font-size: 12.5px; }
  .danger { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12.5px; border-top: 1px solid var(--line); padding-top: 8px; }
  .fine { color: var(--muted); font-size: 12.5px; }
  .err { color: var(--bad); font-size: 13px; }
</style>
