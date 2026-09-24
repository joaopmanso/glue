<script lang="ts">
  import { lib } from '../../lib/library.svelte';
  import { canPickFolders } from '../../platform';

  let profileName = $state('');
  let collectionName = $state('My collection');
  const full = canPickFolders();
</script>

<section class="welcome">
  {#if lib.phase === 'boot'}
    <p class="muted">Opening your library…</p>
  {:else if lib.phase === 'welcome'}
    <h2>Your music, organised on your computer</h2>
    <p class="lede">MCO keeps its data in a folder you choose. Nothing is uploaded and there’s no account: back up or move the folder like any other.</p>
    {#if full}
      <ol class="steps">
        <li>Click <b>Choose MCO folder</b>.</li>
        <li>Open <b>Documents</b>, create a folder called <b>MCO</b> and select it.</li>
        <li>Allow MCO to edit files in it.</li>
      </ol>
      <div class="actions">
        <button type="button" class="btn" id="choose-home" onclick={() => lib.chooseHome()}>Choose MCO folder</button>
        <a class="btn-ghost" href="#/analyze">Just analyse a file</a>
      </div>
    {:else}
      <p class="note">This browser can’t open folders, so MCO keeps your library in the browser’s own storage and music folders can’t be linked. For the full experience use Chrome or Edge.</p>
      <div class="actions">
        <button type="button" class="btn" id="use-private" onclick={() => lib.usePrivateHome()}>Start in browser storage</button>
        <a class="btn-ghost" href="#/analyze">Just analyse a file</a>
      </div>
    {/if}
  {:else if lib.phase === 'reconnect'}
    <h2>Welcome back</h2>
    <p class="lede">Your browser asks again before MCO can use your <b>{lib.homeName}</b> folder. Choose “Allow on every visit” to skip this next time.</p>
    <div class="actions">
      <button type="button" class="btn" id="reconnect" onclick={() => lib.reconnect()}>Open {lib.homeName}</button>
      <button type="button" class="btn-ghost" onclick={() => lib.changeHome()}>Use a different folder</button>
    </div>
  {:else if lib.phase === 'profiles'}
    <h2>Who’s using MCO?</h2>
    <p class="lede">Each profile has its own collections and playlists, all in <b>{lib.homeName}</b>.</p>
    {#if lib.home?.index.profiles.length}
      <ul class="profiles">
        {#each lib.home.index.profiles as p (p.id)}
          <li class="pwrap">
            <button type="button" class="profile" onclick={() => lib.openProfile(p.id)}><span class="dot" style:background={p.color}>{p.name.slice(0, 1).toUpperCase()}</span>{p.name}</button>
            <span class="ptools">
              <button type="button" title="Rename" onclick={() => { const n = prompt('Rename profile', p.name); if (n?.trim()) void lib.renameProfile(p.id, n); }}>✎</button>
              <button type="button" title="Delete" onclick={() => { if (confirm('Delete the profile “' + p.name + '” with all its collections and playlists? Your music files aren’t touched.')) void lib.deleteProfile(p.id); }}>×</button>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
    <form class="create" onsubmit={e => { e.preventDefault(); if (profileName.trim()) void lib.createProfile(profileName); }}>
      <label class="label" for="profile-name">New profile</label>
      <div class="row">
        <input id="profile-name" placeholder="Your name or DJ name" bind:value={profileName} maxlength="60" autocomplete="off">
        <button type="submit" class="btn" disabled={!profileName.trim()}>Create profile</button>
      </div>
    </form>
    <button type="button" class="link" onclick={() => lib.changeHome()}>Use a different MCO folder</button>
  {:else if lib.phase === 'collections'}
    <h2>Create a collection</h2>
    <p class="lede">A collection is a set of music folders, imported libraries and playlists. Most people need one; make more to keep, say, a wedding library apart.</p>
    <form class="create" onsubmit={e => { e.preventDefault(); void lib.createCollection(collectionName); }}>
      <div class="row">
        <input id="collection-name" bind:value={collectionName} maxlength="80" autocomplete="off">
        <button type="submit" class="btn">Create collection</button>
      </div>
    </form>
  {:else if lib.phase === 'error'}
    <div class="error"><b>Couldn’t open your library.</b> {lib.error}</div>
    <div class="actions"><button type="button" class="btn-ghost" onclick={() => lib.changeHome()}>Choose the MCO folder again</button></div>
  {/if}
</section>

<style>
  .welcome { max-width: 640px; margin: 8vh auto 0; display: grid; gap: 18px; }
  h2 { font-size: 30px; font-stretch: 115%; }
  .lede { color: var(--ink-2); font-size: 16px; }
  .muted, .note { color: var(--muted); }
  .steps { margin: 0; padding-left: 20px; color: var(--ink-2); display: grid; gap: 4px; }
  .actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .profiles { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 10px; }
  .profile { display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 16px 10px 10px; cursor: pointer; font-weight: 600; }
  .profile:hover { border-color: var(--accent); }
  .pwrap { display: flex; align-items: center; gap: 4px; }
  .ptools { display: flex; flex-direction: column; gap: 2px; opacity: 0; }
  .pwrap:hover .ptools, .pwrap:focus-within .ptools { opacity: 1; }
  .ptools button { background: none; border: 1px solid var(--line-2); border-radius: 3px; color: var(--muted); font-size: 10px; padding: 0 5px; cursor: pointer; }
  .dot { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: #06121d; font-weight: 800; }
  .create { display: grid; gap: 6px; }
  .row { display: flex; gap: 10px; }
  input { flex: 1; min-width: 0; background: var(--surface); border: 1px solid var(--line-2); border-radius: var(--radius); padding: 9px 12px; }
  .btn:disabled { opacity: .5; cursor: default; }
  .link { background: none; border: 0; color: var(--muted); text-decoration: underline; cursor: pointer; justify-self: start; padding: 0; font-size: 13px; }
</style>
