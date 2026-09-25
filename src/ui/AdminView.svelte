<script lang="ts">
  /* Admin panel (ADR 0041), #/admin: statistics, users and tiers, clearing data, maintenance.
     Only admins see it; the API checks again on every call. */
  import { account, type Tier } from '../lib/account.svelte';
  import { fmtBytes } from '../core/format';

  interface Stats {
    users: { total: number; byTier: Record<string, number>; byProvider: Record<string, number>; new7: number; new30: number; active7: number; signups: number[] };
    devices: { byKind: Record<string, number>; revoked: number; seen24h: number };
    sync: { profiles: number; files: number; bytes: number; merges: number; pendingEdits: number };
    housekeeping: { expiredCodes: number; expiredSessions: number; attempts: number; oldEdits: number };
    at: number;
  }
  interface AdminUser { id: string; email: string | null; name: string | null; tier: Tier; createdAt: number; providers: string[]; devices: number; lastSeen: number | null; bytes: number; profiles: number }

  let stats = $state<Stats | null>(null);
  let users = $state<AdminUser[]>([]);
  let q = $state('');
  let error = $state(''), note = $state('');
  let loading = $state(false);

  async function load() {
    loading = true; error = '';
    try {
      [stats, users] = await Promise.all([
        account.request<Stats>('GET', '/v1/admin/stats'),
        account.request<{ users: AdminUser[] }>('GET', '/v1/admin/users?q=' + encodeURIComponent(q.trim())).then(r => r.users),
      ]);
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }
  $effect(() => { if (account.isAdmin) void load(); });
  let searchTimer = 0;
  function search() { clearTimeout(searchTimer); searchTimer = window.setTimeout(load, 300); }

  async function act(label: string, f: () => Promise<unknown>) {
    error = ''; note = '';
    try { const r = await f() as { removed?: number } | undefined; note = label + (r && typeof r.removed === 'number' ? ': ' + r.removed + ' removed.' : '.'); await load(); }
    catch (e) { error = (e as Error).message; }
  }
  const setTier = (u: AdminUser, tier: string) => act('Tier of ' + (u.email ?? u.id) + ' is now ' + tier, () => account.request('PATCH', '/v1/admin/users/' + u.id, { json: { tier } }));
  function clearCloud(u: AdminUser) { if (confirm('Clear all cloud data of ' + (u.email ?? u.id) + '? Synced copies, merges and waiting edits go; the account stays.')) void act('Cleared cloud data of ' + (u.email ?? u.id), () => account.request('DELETE', '/v1/admin/users/' + u.id + '/cloud')); }
  function remove(u: AdminUser) {
    const typed = prompt('Delete the account ' + (u.email ?? u.id) + ' with its devices and cloud data? Type the email to confirm.');
    if (typed?.trim().toLowerCase() === (u.email ?? '').toLowerCase()) void act('Deleted ' + u.email, () => account.request('DELETE', '/v1/admin/users/' + u.id));
  }
  const maint = (task: string, label: string) => act(label, () => account.request('POST', '/v1/admin/maintenance', { json: { task } }));
  const ago = (t: number | null) => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60e3); return m < 60 ? m + ' min ago' : m < 48 * 60 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
  const maxSignup = $derived(Math.max(1, ...(stats?.users.signups ?? [0])));
</script>

<section class="admin" id="admin">
  <div class="ah">
    <h2>Admin</h2>
    <button type="button" class="mini" onclick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
  </div>
  {#if !account.isAdmin}
    <p class="muted" id="admin-denied">{account.signedIn ? 'Admins only.' : 'Sign in with the admin Google account to use the admin panel.'}</p>
  {:else}
    {#if error}<p class="err" role="alert">{error}</p>{/if}
    {#if note}<p class="ok" role="status">{note}</p>{/if}
    {#if stats}
      <div class="cards" id="admin-stats">
        <div class="card"><span class="label">Users</span><b>{stats.users.total}</b><small>{Object.entries(stats.users.byTier).map(([t, n]) => n + ' ' + t).join(' · ')}</small></div>
        <div class="card"><span class="label">New</span><b>{stats.users.new7}</b><small>this week · {stats.users.new30} in 30 days</small></div>
        <div class="card"><span class="label">Active</span><b>{stats.users.active7}</b><small>users seen this week · {stats.devices.seen24h} devices in 24 h</small></div>
        <div class="card"><span class="label">Devices</span><b>{Object.values(stats.devices.byKind).reduce((a, b) => a + b, 0)}</b><small>{Object.entries(stats.devices.byKind).map(([k, n]) => n + ' ' + (k === 'home' ? 'GLUE Home' : k)).join(' · ')}</small></div>
        <div class="card"><span class="label">Cloud data</span><b>{fmtBytes(stats.sync.bytes)}</b><small>{stats.sync.profiles} synced profiles · {stats.sync.files.toLocaleString()} files</small></div>
        <div class="card"><span class="label">Merges · edits</span><b>{stats.sync.merges} · {stats.sync.pendingEdits}</b><small>merged collections · edits waiting</small></div>
        <div class="card"><span class="label">Sign-in</span><b>{Object.values(stats.users.byProvider).reduce((a, b) => a + b, 0)}</b><small>{Object.entries(stats.users.byProvider).map(([p, n]) => n + ' ' + p).join(' · ')}</small></div>
        <div class="card wide"><span class="label">Sign-ups, last 30 days</span>
          <svg class="spark" viewBox="0 0 300 50" preserveAspectRatio="none" role="img" aria-label="Sign-ups per day">
            {#each stats.users.signups as n, i (i)}<rect x={i * 10 + 1} y={50 - (n / maxSignup) * 46 - 1} width="8" height={(n / maxSignup) * 46 + 1}><title>{n}</title></rect>{/each}
          </svg>
        </div>
      </div>
    {/if}

    <div class="ush">
      <h3>Users</h3>
      <input type="search" placeholder="Search email or name" bind:value={q} oninput={search} aria-label="Search users" id="admin-search">
    </div>
    <div class="tablewrap">
      <table class="users" id="admin-users">
        <thead><tr><th>User</th><th>Sign-in</th><th>Tier</th><th>Devices</th><th>Cloud</th><th>Last seen</th><th>Joined</th><th></th></tr></thead>
        <tbody>
          {#each users as u (u.id)}
            <tr data-user={u.id}>
              <td><b>{u.email ?? '—'}</b><small>{u.name ?? ''}</small></td>
              <td>{u.providers.join(', ')}</td>
              <td><select value={u.tier} aria-label={'Tier of ' + (u.email ?? u.id)} disabled={u.id === account.user?.id} onchange={e => setTier(u, e.currentTarget.value)}>
                {#each ['free', 'paid', 'admin'] as t (t)}<option value={t}>{t}</option>{/each}
              </select></td>
              <td class="n">{u.devices}</td>
              <td class="n">{u.bytes ? fmtBytes(u.bytes) + ' · ' + u.profiles : '—'}</td>
              <td>{ago(u.lastSeen)}</td>
              <td>{new Date(u.createdAt).toLocaleDateString()}</td>
              <td class="acts">
                <button type="button" class="mini" disabled={!u.bytes} onclick={() => clearCloud(u)}>Clear cloud data</button>
                <button type="button" class="mini bad" disabled={u.id === account.user?.id} onclick={() => remove(u)}>Delete</button>
              </td>
            </tr>
          {:else}<tr><td colspan="8" class="muted">No users match.</td></tr>{/each}
        </tbody>
      </table>
    </div>

    {#if stats}
      <h3>Maintenance</h3>
      <div class="maint" id="admin-maint">
        <button type="button" class="mini" onclick={() => maint('codes', 'Removed used and expired pairing codes')}>Pairing codes ({stats.housekeeping.expiredCodes})</button>
        <button type="button" class="mini" onclick={() => maint('sessions', 'Removed expired sessions')}>Expired sessions ({stats.housekeeping.expiredSessions})</button>
        <button type="button" class="mini" onclick={() => maint('attempts', 'Reset rate limits')}>Rate limits ({stats.housekeeping.attempts})</button>
        <button type="button" class="mini" onclick={() => maint('old-edits', 'Removed edits older than 90 days')}>Edits older than 90 days ({stats.housekeeping.oldEdits})</button>
        <button type="button" class="mini" onclick={() => maint('revoked-devices', 'Removed devices revoked over 30 days ago')}>Devices removed 30+ days ago ({stats.devices.revoked})</button>
      </div>
      <p class="muted small">Stats from {new Date(stats.at).toLocaleString()}.</p>
    {/if}
  {/if}
</section>

<style>
  .admin { display: grid; gap: 16px; }
  .ah, .ush { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  h2 { font-size: 24px; }
  h3 { font-size: 16px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 14px; display: grid; gap: 3px; }
  .card.wide { grid-column: span 2; }
  .card b { font: 700 22px var(--font-mono); font-variant-numeric: tabular-nums; }
  .card small { color: var(--muted); font-size: 12px; }
  .spark { width: 100%; height: 50px; }
  .spark rect { fill: var(--accent); }
  input[type="search"] { width: min(320px, 100%); background: var(--surface); border: 1px solid var(--line-2); border-radius: var(--radius); padding: 6px 10px; }
  .tablewrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  .users { width: 100%; border-collapse: collapse; font-size: 13px; }
  .users th { text-align: left; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; padding: 8px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  .users td { padding: 7px 10px; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); vertical-align: middle; white-space: nowrap; }
  .users td b { display: block; font-weight: 600; }
  .users td small { color: var(--muted); font-size: 11.5px; }
  .users .n { font-family: var(--font-mono); }
  .users select { background: var(--ground); border: 1px solid var(--line-2); border-radius: 4px; padding: 2px 6px; font-size: 12.5px; }
  .acts { display: flex; gap: 6px; justify-content: flex-end; }
  .maint { display: flex; gap: 8px; flex-wrap: wrap; }
  .mini { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--ink-2); font-size: 12px; padding: 4px 10px; cursor: pointer; }
  .mini:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .mini:disabled { opacity: .4; cursor: default; }
  .mini.bad { color: var(--bad); }
  .muted { color: var(--muted); }
  .small { font-size: 12px; }
  .err { color: var(--bad); }
  .ok { color: var(--ok); }
  @media (max-width: 600px) { .card.wide { grid-column: auto; } }
</style>
