<script lang="ts">
  import { lib } from '../../lib/library.svelte';
  import { canKeepFiles, canPickFolders, pickAudioFiles, type FolderLook } from '../../platform';
  import { importFiles } from '../../lib/importActions';
  import { IMPORT_ACCEPT } from '../../lib/imports';
  import type { BackupManifest } from '../../store/backup';
  import type { ZipEntry } from '../../core/zip';
  import ThemePicker from '../ThemePicker.svelte';

  let profileName = $state('');
  let collectionName = $state('My collection');
  const full = canPickFolders();

  // Step 1: the folder for MCO's own data, checked before it's used.
  let checking = $state<{ dir: FileSystemDirectoryHandle; look: FolderLook } | null>(null);
  let restore = $state.raw<{ manifest: BackupManifest; entries: ZipEntry[] } | null>(null);
  let restoreError = $state('');
  let zipInput: HTMLInputElement;
  let libInput = $state<HTMLInputElement>();
  let confirmText = $state('');
  let showDanger = $state(false);
  let busy = $state('');

  async function chooseHome() {
    const r = await lib.pickHomeFolder();
    if (!r) return;
    const { look } = r;
    if (look.hasMco || (!look.audio && look.folders + look.files === 0)) return use(r.dir);   // an MCO library, or empty
    checking = r;   // not empty: show what's there before using it
  }
  async function use(dir: FileSystemDirectoryHandle) {
    checking = null;
    if (restore) lib.pendingRestore = restore;
    await lib.useHome(dir);
  }
  async function startPrivate() { if (restore) lib.pendingRestore = restore; await lib.usePrivateHome(); }

  async function pickZip(e: Event) {
    const input = e.currentTarget as HTMLInputElement, f = input.files?.[0];
    input.value = '';
    restoreError = '';
    if (!f) return;
    try {
      const b = await lib.readBackupFile(f);
      if (lib.phase === 'profiles' && lib.home) {
        const replace = lib.profileExists(b.manifest.profile.id);
        if (replace && !confirm('“' + b.manifest.profile.name + '” is already here. Replace it with the backup from ' + new Date(b.manifest.createdAt).toLocaleString() + '? Changes made since then are lost.')) return;
        busy = 'Restoring…';
        await lib.applyBackup(b, true);
      } else restore = b;
    } catch (err) { restoreError = (err as Error).message || String(err); }
    finally { busy = ''; }
  }
  async function backup(pid: string) {
    busy = 'Preparing the backup…';
    try { await lib.downloadBackup(pid); } catch (e) { restoreError = (e as Error).message; } finally { busy = ''; }
  }
  async function wipe() {
    busy = 'Deleting…';
    try { await lib.deleteAllData(); showDanger = false; confirmText = ''; restore = null; } finally { busy = ''; }
  }
  async function addSongs() {
    try { if (canKeepFiles()) await lib.addFiles(await pickAudioFiles()); } catch (e) { if ((e as DOMException).name !== 'AbortError') lib.notice = (e as Error).message; }
    lib.onboarding = null;
  }
  const tracks = (m: BackupManifest) => m.collections.reduce((n, c) => n + c.tracks, 0);
  const step = $derived(lib.phase === 'welcome' || lib.phase === 'reconnect' ? 1 : lib.onboarding === 'music' ? 3 : 2);
</script>

{#snippet stepper()}
  <ol class="stepper" aria-label="Getting started">
    <li class:on={step === 1} class:done={step > 1}><span>1</span>Where MCO saves its data</li>
    <li class:on={step === 2} class:done={step > 2}><span>2</span>Your profile</li>
    <li class:on={step === 3}><span>3</span>Add your music</li>
  </ol>
{/snippet}

<input type="file" accept=".zip,application/zip" hidden bind:this={zipInput} onchange={pickZip} id="restore-input">

<section class="welcome">
  {#if lib.phase === 'boot'}
    <p class="muted">Opening your library…</p>

  {:else if lib.phase === 'welcome'}
    {@render stepper()}
    <h2>Welcome to MCO</h2>
    <p class="lede">MCO organises your music on your own computer. There’s no account and nothing is uploaded. First, MCO needs a small folder of its own to save your profile, playlists, ratings and analysis.</p>

    {#if checking}
      <div class="card warn" role="alertdialog" aria-labelledby="chk-h">
        <h3 id="chk-h">{checking.look.audio ? 'That looks like a music folder' : 'That folder isn’t empty'}</h3>
        <p>
          “{checking.dir.name}” has {checking.look.audio ? checking.look.audio + (checking.look.audio >= 200 ? '+' : '') + ' audio files and ' : ''}{checking.look.folders} folder{checking.look.folders === 1 ? '' : 's'}.
          MCO would add its own files there (<code>mco.json</code>, <code>profiles/</code>). {#if checking.look.audio}Your music is added in step 3: MCO only reads it and never writes into music folders.{/if}
        </p>
        <p>Recommended: an <b>empty folder called MCO inside Documents</b>. In the folder picker, open Documents and use “New folder”.</p>
        <div class="actions">
          <button type="button" class="btn" id="choose-other" onclick={chooseHome}>Choose another folder</button>
          <button type="button" class="btn-ghost" id="use-anyway" onclick={() => use(checking!.dir)}>Use “{checking.dir.name}” anyway</button>
        </div>
      </div>
    {:else}
      <div class="paths">
        <div class="card main">
          <h3>{restore ? 'Where should the restored library go?' : 'Start fresh'}</h3>
          {#if full}
            <p><b>This is not your music folder.</b> Pick (or create) an empty folder for MCO’s own files, a few megabytes. The usual place:</p>
            <p class="where"><span class="crumb">Documents</span> › <span class="crumb new">MCO</span></p>
            <ol class="how">
              <li>Click the button below.</li>
              <li>Open <b>Documents</b>, click <b>New folder</b>, name it <b>MCO</b>, and select it.</li>
              <li>Allow MCO to save changes to it.</li>
            </ol>
            <button type="button" class="btn" id="choose-home" onclick={chooseHome}>Choose where to save MCO’s data</button>
            <p class="fine">Already used MCO on this computer? Choose that same MCO folder and everything opens as you left it.</p>
          {:else}
            <p>This browser can’t open folders, so MCO keeps its data in the browser’s own storage. For the full experience (linking music folders, instant access to your files) use Chrome or Edge.</p>
            <button type="button" class="btn" id="use-private" onclick={startPrivate}>{restore ? 'Restore into browser storage' : 'Start in browser storage'}</button>
          {/if}
        </div>
        <div class="card side">
          <h3>Restore a backup</h3>
          {#if restore}
            <p class="ok">Backup of <b>{restore.manifest.profile.name}</b> from {new Date(restore.manifest.createdAt).toLocaleString()}: {restore.manifest.collections.length} collection{restore.manifest.collections.length === 1 ? '' : 's'}, {tracks(restore.manifest)} track{tracks(restore.manifest) === 1 ? '' : 's'}.</p>
            <p class="fine">Now choose where MCO saves its data (left). The backup is restored there.</p>
            <button type="button" class="link" onclick={() => (restore = null)}>Cancel restore</button>
          {:else}
            <p>Moving to a new computer or starting over? Pick an MCO backup (<code>.zip</code>) made from the profile screen.</p>
            <button type="button" class="btn-ghost" id="restore-btn" onclick={() => zipInput.click()}>Choose backup file…</button>
          {/if}
          {#if restoreError}<p class="err">{restoreError}</p>{/if}
        </div>
      </div>
      <p class="fine center"><a href="#/analyze">Or just analyse a single file</a> without setting anything up.</p>
    {/if}

  {:else if lib.phase === 'reconnect'}
    <h2>Welcome back</h2>
    <p class="lede">Your browser asks again before MCO can use your <b>{lib.homeName}</b> folder. Choose “Allow on every visit” to skip this next time.</p>
    <div class="actions">
      <button type="button" class="btn" id="reconnect" onclick={() => lib.reconnect()}>Open {lib.homeName}</button>
      <button type="button" class="btn-ghost" onclick={() => lib.changeHome()}>Use a different folder</button>
    </div>

  {:else if lib.phase === 'profiles'}
    {#if !lib.home?.index.profiles.length}{@render stepper()}{/if}
    <h2>Who’s using MCO?</h2>
    <p class="lede">Each profile has its own collections, playlists and ratings, all saved in <b>{lib.homeName}</b>.</p>
    {#if lib.home?.index.profiles.length}
      <ul class="profiles">
        {#each lib.home.index.profiles as p (p.id)}
          <li class="pcard">
            <button type="button" class="profile" onclick={() => lib.openProfile(p.id)} title="Open"><span class="dot" style:background={p.color}>{p.name.slice(0, 1).toUpperCase()}</span>{p.name}</button>
            <span class="ptools">
              <button type="button" class="backup-btn" title="Download a backup (.zip) of this profile" onclick={() => backup(p.id)}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 12.5v1h11v-1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>Backup
              </button>
              <button type="button" title="Rename" onclick={() => { const n = prompt('Rename profile', p.name); if (n?.trim()) void lib.renameProfile(p.id, n); }}>Rename</button>
              <button type="button" class="del" title="Delete this profile" onclick={() => { if (confirm('Delete the profile “' + p.name + '” with all its collections and playlists? Download a backup first if you might want it back. Your music files aren’t touched.')) void lib.deleteProfile(p.id); }}>Delete</button>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
    <form class="create" onsubmit={e => { e.preventDefault(); if (profileName.trim()) void lib.createProfile(profileName); }}>
      <label class="label" for="profile-name">{lib.home?.index.profiles.length ? 'New profile' : 'Your name or DJ name'}</label>
      <div class="row">
        <input id="profile-name" placeholder="e.g. DJ Nova" bind:value={profileName} maxlength="60" autocomplete="off">
        <button type="submit" class="btn" disabled={!profileName.trim()}>Create profile</button>
      </div>
    </form>
    <ThemePicker />
    <div class="more">
      <button type="button" class="btn-ghost sm" id="restore-btn" onclick={() => zipInput.click()}>Restore a backup…</button>
      <button type="button" class="link" onclick={() => lib.changeHome()}>Use a different MCO folder</button>
      <button type="button" class="link danger" id="danger-toggle" onclick={() => (showDanger = !showDanger)}>Delete all MCO data…</button>
    </div>
    {#if restoreError}<p class="err">{restoreError}</p>{/if}
    {#if showDanger}
      <div class="card danger-zone" role="alertdialog" aria-labelledby="dz-h">
        <h3 id="dz-h">Delete all MCO data</h3>
        <p>This removes every profile, collection, playlist, rating, note and analysis MCO saved, in <b>{lib.homeName}</b> and in this browser, and takes you back to the start. <b>Your music files are not touched</b>, and anything else in that folder stays.</p>
        <p>Download backups of the profiles you want to keep first. Type <b>delete</b> to confirm.</p>
        <div class="row">
          <input id="danger-confirm" bind:value={confirmText} placeholder="delete" autocomplete="off" aria-label="Type delete to confirm">
          <button type="button" class="btn danger" id="danger-go" disabled={confirmText.trim().toLowerCase() !== 'delete'} onclick={wipe}>Delete everything</button>
        </div>
      </div>
    {/if}

  {:else if lib.phase === 'collections'}
    <h2>Create a collection</h2>
    <p class="lede">A collection is a set of music folders, imported libraries and playlists. Most people need one; make more to keep, say, a wedding library apart.</p>
    <form class="create" onsubmit={e => { e.preventDefault(); void lib.createCollection(collectionName); }}>
      <div class="row">
        <input id="collection-name" bind:value={collectionName} maxlength="80" autocomplete="off">
        <button type="submit" class="btn">Create collection</button>
      </div>
    </form>

  {:else if lib.phase === 'library' && lib.onboarding === 'music'}
    {@render stepper()}
    <h2>Add your music, {lib.profile?.name}</h2>
    <p class="lede">MCO reads your music where it already is. Nothing is moved, copied or changed, and you can add more at any time from the sidebar.</p>
    <div class="paths three">
      {#if full}
        <div class="card"><h3>A music folder</h3><p>Your whole Music folder, or the folder with your DJ tracks. MCO keeps it up to date.</p>
          <button type="button" class="btn" id="onb-folder" onclick={async () => { lib.onboarding = null; await lib.addFolder(); }}>Choose music folder</button></div>
      {/if}
      {#if canKeepFiles()}
        <div class="card"><h3>Some songs</h3><p>Pick individual files. You can also drop songs onto MCO later.</p>
          <button type="button" class="btn-ghost" onclick={addSongs}>Choose songs</button></div>
      {/if}
      <div class="card"><h3>A DJ library</h3><p>rekordbox XML, Engine DJ, Serato, Traktor, Apple Music or an M3U playlist: tracks and playlists come in, then you link the music folder.</p>
        <button type="button" class="btn-ghost" onclick={() => libInput?.click()}>Import a library file</button>
        <input type="file" hidden multiple accept={IMPORT_ACCEPT} bind:this={libInput} onchange={e => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; lib.onboarding = null; void importFiles(f); }}></div>
    </div>
    <p class="center"><button type="button" class="link" id="onb-skip" onclick={() => (lib.onboarding = null)}>I’ll do it later</button></p>

  {:else if lib.phase === 'error'}
    <div class="error"><b>Couldn’t open your library.</b> {lib.error}</div>
    <div class="actions"><button type="button" class="btn-ghost" onclick={() => lib.changeHome()}>Choose the MCO folder again</button></div>
  {/if}
  {#if busy}<p class="muted" role="status">{busy}</p>{/if}
</section>

<style>
  .welcome { max-width: 900px; margin: 5vh auto 0; display: grid; gap: 18px; }
  h2 { font-size: 30px; font-stretch: 115%; }
  h3 { font-size: 16px; }
  .lede { color: var(--ink-2); font-size: 16px; max-width: 720px; }
  .muted, .fine { color: var(--muted); }
  .fine { font-size: 12.5px; }
  .center { text-align: center; }
  .center a, .fine a { color: var(--accent); }
  code { font-family: var(--font-mono); font-size: 12px; background: var(--raised); padding: 0 4px; border-radius: 3px; }
  .stepper { list-style: none; margin: 0; padding: 0; display: flex; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--muted); }
  .stepper li { display: flex; align-items: center; gap: 8px; padding: 4px 12px 4px 4px; border: 1px solid var(--line); border-radius: 20px; }
  .stepper span { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--raised); font-weight: 700; font-size: 12px; }
  .stepper li.on { color: var(--ink); border-color: var(--accent); }
  .stepper li.on span { background: var(--accent); color: var(--accent-ink); }
  .stepper li.done span { background: color-mix(in srgb, var(--ok) 30%, var(--raised)); color: var(--ok); }
  .paths { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; align-items: start; }
  .paths.three { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; display: grid; gap: 10px; align-content: start; color: var(--ink-2); font-size: 14px; }
  .card h3 { color: var(--ink); }
  .card.main { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .card.warn { border-color: color-mix(in srgb, var(--warn) 55%, var(--line)); background: color-mix(in srgb, var(--warn) 6%, var(--surface)); }
  .card .btn, .card .btn-ghost { justify-self: start; }
  .where { font-family: var(--font-mono); font-size: 13px; color: var(--ink); }
  .crumb { padding: 2px 8px; border: 1px solid var(--line-2); border-radius: 4px; }
  .crumb.new { border-color: var(--accent); color: var(--accent); }
  .how { margin: 0; padding-left: 20px; display: grid; gap: 3px; }
  .ok { color: var(--ink); }
  .err { color: var(--bad); font-size: 13px; }
  .actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .profiles { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .pcard { display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px 6px 6px; }
  .profile { flex: 1; display: flex; align-items: center; gap: 10px; background: none; border: 0; padding: 4px; cursor: pointer; font-weight: 650; font-size: 15px; text-align: left; }
  .profile:hover { color: var(--accent); }
  .dot { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: #06121d; font-weight: 800; }
  .ptools { display: flex; gap: 6px; }
  .ptools button { display: inline-flex; align-items: center; gap: 5px; background: none; border: 1px solid var(--line-2); border-radius: 5px; color: var(--ink-2); font-size: 12.5px; padding: 4px 10px; cursor: pointer; }
  .ptools button:hover { color: var(--accent); border-color: var(--accent); }
  .ptools .del:hover { color: var(--bad); border-color: var(--bad); }
  .ptools svg { width: 13px; height: 13px; }
  .create { display: grid; gap: 6px; }
  .row { display: flex; gap: 10px; }
  input:not([type="file"]) { flex: 1; min-width: 0; background: var(--surface); border: 1px solid var(--line-2); border-radius: var(--radius); padding: 9px 12px; }
  .btn:disabled { opacity: .5; cursor: default; }
  .more { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  .link { background: none; border: 0; color: var(--muted); text-decoration: underline; cursor: pointer; padding: 0; font-size: 13px; }
  .link.danger { color: color-mix(in srgb, var(--bad) 80%, var(--muted)); }
  .danger-zone { border-color: color-mix(in srgb, var(--bad) 55%, var(--line)); background: color-mix(in srgb, var(--bad) 6%, var(--surface)); }
  .btn.danger { background: var(--bad); color: #1a0505; }
  @media (max-width: 760px) { .paths { grid-template-columns: 1fr; } }
</style>
