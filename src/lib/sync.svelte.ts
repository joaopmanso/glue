/* Cloud sync (ADR 0040, 0042), on for every profile of a signed-in user unless turned off:
   - push: this device's profile files (collections, tracks, analysis, playlists, tags, imports; never
     audio) go to GLUE Cloud, only the ones that changed;
   - edits: changes made elsewhere for this device are applied to its own files when it opens;
   - merged collections: a collection is merged with the same one on the account's other devices by
     itself; their songs and playlists show in this computer's library (lib.applyOverlay), from a copy
     kept in the GLUE folder (cloud/), so it opens at once and offline; edits to shared data are sent
     to the devices that own it;
   - views: any signed-in browser opens a device's collection, or a merged one, from the cloud copy;
     edits there are sent to the owning devices. */
import { lib } from './library.svelte';
import { account } from './account.svelte';
import { walk } from '../store/backup';
import { fileAt, readJSON, removePath, subdir, writeJSON, writeText, type Dir } from '../store/fsx';
import { MemDir, asDir } from '../store/memdir';
import { CollectionStore } from '../store/collection';
import { SCHEMA, shardOf, type Profile } from '../store/types';
import { apply, baseline, diff, type Baseline, type EditOp } from '../core/library/cloudEdits';
import { mergeCollections, translate, type Merged, type MemberData } from '../core/library/mergeCollections';
import { buildOverlay, overlayOps, type Overlay } from '../core/library/overlay';

export interface RemoteProfile {
  device: { id: string; name: string; kind: string }; profile: { id: string; name: string; color: string | null };
  stats: { collections?: { id: string; name: string; tracks: number }[] } | null;
  files: number; stored: number; bytes: number; updatedAt: number; complete: boolean;
}
export interface Member { device: string; profile: string; collection: string }
export interface Group { id: string; name: string; members: Member[] }
type PendingOp = { seq: number; collection: string; op: EditOp };
/** What the account had in the cloud last time (cloud/state.json), to open offline. */
interface CacheState { user: string | null; thisDevice: string; remote: RemoteProfile[]; groups: Group[] }
type OutOp = Member & { op: EditOp };

/** Cloud sync is on unless the user turned it off for the profile (ADR 0042). */
export const syncOn = (p: Profile | null | undefined) => !!p && p.cloudSync !== false;

const PUSH_DELAY = 20_000, PUSH_GAP = 90_000, PULL_EVERY = 120_000, PARALLEL = 4;

// ---- bytes ------------------------------------------------------------------------------------------
async function sha256hex(b: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', b.slice().buffer));
  return [...d].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function pipe(b: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([b.slice().buffer]).stream().pipeThrough(t)).arrayBuffer());
}
function toB64(b: Uint8Array): string { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); }
function fromB64(s: string): Uint8Array { const t = atob(s), o = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i); return o; }
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

class CloudSync {
  /** Per profile: the last push and any problem. */
  status = $state<Record<string, { at: number | null; busy: boolean; error: string }>>({});
  remote = $state.raw<RemoteProfile[]>([]);
  groups = $state.raw<Group[]>([]);
  loading = $state(false);
  /** Something is coming from the cloud right now (the library shows it). */
  busy = $state('');
  private hashes = new Map<string, { size: number; mtime: number; hash: string }>();
  private timers = new Map<string, number>();
  private lastPush = new Map<string, number>();
  private pullTimer = 0;

  /** Which of the account's collections exist in the cloud, and how they're merged. */
  async refresh() {
    if (!account.signedIn) { this.remote = []; this.groups = []; return; }
    this.loading = true;
    try {
      const [l, g] = await Promise.all([
        account.request<{ profiles: RemoteProfile[] }>('GET', '/v1/sync'),
        account.request<{ groups: Group[] }>('GET', '/v1/sync/links'),
      ]);
      this.remote = l.profiles; this.groups = g.groups;
      // A device that joined since the account's device list was read: read it again.
      if (l.profiles.some(r => !account.devices.some(d => d.id === r.device.id))) void account.loadMe().catch(() => {});
      if (account.thisDevice) void this.saveState({ user: account.user?.id ?? null, thisDevice: account.thisDevice, remote: this.remote, groups: this.groups });
    } finally { this.loading = false; }
  }
  groupOf(m: Member) { return this.groups.find(g => g.members.some(x => x.device === m.device && x.profile === m.profile && x.collection === m.collection)) ?? null; }
  /** The merged collection the open local collection belongs to, if any. */
  get localGroup() {
    const pid = lib.profile?.id, cid = lib.store?.meta.id, me = account.thisDevice;
    return pid && cid && me && !lib.cloud ? this.groupOf({ device: me, profile: pid, collection: cid }) : null;
  }

  // ---- this device → cloud ------------------------------------------------------------------------
  /** Upload what changed in a profile's files (debounced while editing). */
  schedule(pid: string) {
    if (!account.signedIn) return;
    clearTimeout(this.timers.get(pid));
    const wait = Math.max(PUSH_DELAY, (this.lastPush.get(pid) ?? 0) + PUSH_GAP - Date.now());
    this.timers.set(pid, window.setTimeout(() => void this.push(pid).catch(() => {}), wait));
  }
  async push(pid: string) {
    const home = lib.homeHandle, profile = await lib.profileInfo(pid);
    if (!account.signedIn || !home || !syncOn(profile) || lib.readOnly) return;
    const pdir = await subdir(home, ['profiles', pid], false);
    if (!pdir) return;
    this.set(pid, { busy: true, error: '' });
    try {
      const files = await walk(pdir);
      // A File goes stale if the library saves that file meanwhile: read each one fresh, retry once.
      const read = async (path: string) => {
        for (let i = 0; ; i++) {
          try { const f = await fileAt(home, 'profiles/' + pid + '/' + path); return { f, bytes: new Uint8Array(await f.arrayBuffer()) }; }
          catch (e) { if (i >= 2 || (e as DOMException).name !== 'NotReadableError') throw e; await new Promise(r => setTimeout(r, 300)); }
        }
      };
      const list: { path: string; hash: string; size: number }[] = [];
      for (const { path, file } of files) {
        if (!/\.json$/.test(path)) continue;   // .damaged copies and anything else stay local
        const key = pid + '/' + path, c = this.hashes.get(key);
        if (c && c.size === file.size && c.mtime === file.lastModified) { list.push({ path, hash: c.hash, size: c.size }); continue; }
        const { f, bytes } = await read(path);
        const hash = await sha256hex(bytes);
        this.hashes.set(key, { size: f.size, mtime: f.lastModified, hash });
        list.push({ path, hash, size: f.size });
      }
      const stats = { collections: await Promise.all(profile!.collections.map(async c => ({ id: c.id, name: c.name, tracks: await this.trackCount(pid, c.id) }))) };
      const { need } = await account.request<{ need: string[] }>('POST', '/v1/sync/manifest', { json: { profile: { id: pid, name: profile!.name, color: profile!.color }, stats, files: list.map(({ path, hash, size }) => ({ path, hash, size })) } });
      const want = new Set(need);
      await pool(list.filter(f => want.has(f.path)), PARALLEL, async f => {
        const { bytes } = await read(f.path);
        // Changed since the manifest: send what's there now (the next push corrects the manifest).
        const hash = await sha256hex(bytes);
        const gz = await pipe(bytes, new CompressionStream('gzip'));
        await account.request('PUT', '/v1/sync/file?' + new URLSearchParams({ profile: pid, path: f.path, hash, size: String(bytes.length) }), { text: toB64(gz) });
      });
      this.lastPush.set(pid, Date.now());
      this.set(pid, { busy: false, at: Date.now(), error: '' });
      void this.refresh().catch(() => {});   // the cloud list shows the new copy
    } catch (e) { console.warn('Cloud sync: upload failed', e); this.set(pid, { busy: false, error: (e as Error).message }); throw e; }
  }
  private async trackCount(pid: string, cid: string): Promise<number> {
    if (lib.store && !lib.cloud && lib.store.meta.id === cid) return lib.ownTracks().length;
    const home = lib.homeHandle, d = home ? await subdir(home, ['profiles', pid, 'collections', cid, 'tracks'], false) : null;
    let n = 0;
    if (d) for (const { file } of await walk(d)) { try { n += Object.keys((JSON.parse(await file.text()) as { items: object }).items).length; } catch { /* skip */ } }
    return n;
  }
  private set(pid: string, v: Partial<{ at: number | null; busy: boolean; error: string }>) {
    const cur = this.status[pid] ?? { at: null, busy: false, error: '' };
    this.status = { ...this.status, [pid]: { ...cur, ...v } };
  }

  /** Edits made on other devices for this one: apply to the files here, then confirm. */
  async pull(pid: string) {
    const profile = await lib.profileInfo(pid), home = lib.homeHandle;
    if (!account.signedIn || !syncOn(profile) || !home || lib.readOnly || lib.cloud) return 0;
    const { ops } = await account.request<{ ops: PendingOp[] }>('GET', '/v1/sync/ops?profile=' + encodeURIComponent(pid));
    if (!ops.length) return 0;
    let applied = 0;
    const byCollection = new Map<string, EditOp[]>();
    for (const o of ops) (byCollection.get(o.collection) ?? byCollection.set(o.collection, []).get(o.collection)!).push(o.op);
    for (const [cid, list] of byCollection) {
      if (!profile!.collections.some(c => c.id === cid)) continue;
      if (lib.store && !lib.cloud && lib.store.meta.id === cid && lib.profile?.id === pid) { applied += apply(lib.store, list); await lib.flush(); }
      else { const s = await CollectionStore.load(home, pid, cid); applied += apply(s, list); await s.flush(); }
    }
    await account.request('POST', '/v1/sync/ops/ack', { json: { profile: pid, upTo: ops[ops.length - 1].seq } });
    if (applied) lib.notice = 'Applied ' + applied + ' change' + (applied === 1 ? '' : 's') + ' made on your other devices.';
    this.schedule(pid);
    return applied;
  }
  /** While a synced collection is open: take in edits from elsewhere, and newer copies of the other devices. */
  private watch(pid: string, cid: string) {
    clearInterval(this.pullTimer);
    this.pullTimer = window.setInterval(() => {
      if (lib.profile?.id !== pid || lib.store?.meta.id !== cid || lib.cloud || !account.signedIn) return;
      void (async () => {
        await this.pull(pid);
        const before = new Map(this.remote.map(r => [r.device.id + '/' + r.profile.id, r.updatedAt]));
        await this.refresh();
        const g = this.localGroup;
        const newer = !!g?.members.some(m => m.device !== account.thisDevice && this.remote.find(r => r.device.id === m.device && r.profile.id === m.profile)?.updatedAt !== before.get(m.device + '/' + m.profile));
        if (newer || !g !== !this.overlay) await this.showOverlay(pid, cid, true);
      })().catch(() => {});
    }, PULL_EVERY);
  }

  // ---- linking a second device: merge or keep separate --------------------------------------------
  async merge(members: Member[], opts: { group?: string; name?: string }, show = true) {
    const r = await account.request<{ group: string; name: string }>('POST', '/v1/sync/links', { json: { ...opts, members } });
    await this.refresh();
    if (show) await this.resync();
    return r;
  }
  async unmerge(group: string) { await account.request('POST', '/v1/sync/unlink', { json: { group } }); await this.refresh(); await this.resync(); }

  // ---- a merged collection in this computer's library (ADR 0042) ----------------------------------
  private run = 0;
  private overlay: Overlay | null = null;
  private others: MemberData[] = [];
  private otherMembers: Member[] = [];
  private overlayGroup: Group | null = null;
  private overlayBase: Baseline | null = null;
  private meId = '';
  private ownCount = 0;
  private editTimer = 0;
  private rebuildTimer = 0;
  private unsent: OutOp[] = [];

  /** A local collection opened: the merged collection from the copy in the GLUE folder at once, then
      edits from elsewhere in, this device's changes up, merging, and fresh copies of the others. */
  async syncCollection(pid: string, cid: string) {
    const p = await lib.profileInfo(pid);
    if (!syncOn(p)) return;
    const token = ++this.run;
    const still = () => token === this.run && lib.profile?.id === pid && lib.store?.meta.id === cid && !lib.cloud;
    if (!account.signedIn) {
      // Not signed in yet, or offline: what this account left in the cache.
      const st = await this.loadState();
      if (st && still() && !this.groups.length) { this.remote = st.remote; this.groups = st.groups; }
      if (st && still()) await this.showOverlay(pid, cid, false, st.thisDevice, still).catch(() => {});
      return;
    }
    await this.showOverlay(pid, cid, false, account.thisDevice ?? '', still).catch(() => {});
    this.busy = 'Syncing with GLUE Cloud…';
    try {
      await this.pull(pid).catch(() => {});
      await this.push(pid).catch(() => {});
      await this.refresh();
      if (!still()) return;
      await this.autoLink(pid, cid);
      await this.showOverlay(pid, cid, true, account.thisDevice ?? '', still);
    } catch (e) { console.warn('Cloud sync', e); }
    finally { if (token === this.run) this.busy = ''; }
    this.watch(pid, cid);
  }
  /** Again after merging, unmerging or deleting cloud copies. */
  private async resync() {
    const pid = lib.profile?.id, cid = lib.store?.meta.id;
    if (pid && cid && !lib.cloud) await this.showOverlay(pid, cid, true).catch(() => {});
  }

  /** A collection that isn't merged yet is merged with the same one on another device: the one with
      the same name, or the only one there is. Once merged and then unmerged, it's left apart. */
  private async autoLink(pid: string, cid: string) {
    const me = account.thisDevice, s = lib.store;
    if (!me || !s || lib.readOnly || lib.cloud) return;
    const mine: Member = { device: me, profile: pid, collection: cid };
    if (this.groupOf(mine)) { if (!s.meta.cloudMerged) { s.meta.cloudMerged = true; s.saveMeta(); } return; }
    if (s.meta.cloudMerged) return;
    const norm = (x: string) => x.trim().toLowerCase();
    const cands: { group?: Group; member?: Member; name: string; where: string }[] = [];
    for (const g of this.groups) if (!g.members.some(m => m.device === me)) cands.push({ group: g, name: g.name, where: [...new Set(g.members.map(m => this.deviceName(m.device)))].join(', ') });
    for (const r of this.remote) {
      if (r.device.id === me) continue;
      for (const c of r.stats?.collections ?? []) {
        const m = { device: r.device.id, profile: r.profile.id, collection: c.id };
        if (!this.groupOf(m)) cands.push({ member: m, name: c.name, where: r.device.name });
      }
    }
    const profile = await lib.profileInfo(pid);
    let pick = cands.filter(c => norm(c.name) === norm(s.meta.name));
    if (!pick.length && profile?.collections.length === 1 && cands.length === 1) pick = cands;
    const c = pick.find(x => x.group) ?? pick[0];
    if (!c) return;
    if (c.group) await this.merge([mine], { group: c.group.id }, false);
    else await this.merge([c.member!, mine], { name: c.name }, false);
    s.meta.cloudMerged = true; s.saveMeta();
    lib.notice = 'Merged “' + s.meta.name + '” with ' + c.where + ': its songs and playlists show here too, and stay in sync.';
  }

  /** A device's name as the account knows it (this browser: its own name). */
  deviceName(id: string) {
    return account.devices.find(d => d.id === id)?.name ?? this.remote.find(r => r.device.id === id)?.device.name ?? 'This computer';
  }

  /** Lay the other devices' part of the merged collection over the open one (or take it away). */
  private async showOverlay(pid: string, cid: string, online: boolean, me = account.thisDevice ?? '', still = () => lib.profile?.id === pid && lib.store?.meta.id === cid && !lib.cloud) {
    const g = this.groups.find(x => x.members.some(m => m.device === me && m.profile === pid && m.collection === cid)) ?? null;
    if (!g) { if (this.overlay) { await this.sendEdits(); this.overlay = null; this.others = []; lib.applyOverlay(null); } return; }
    const data: MemberData[] = [], used: Member[] = [];
    try {
      for (const m of g.members) {
        if (m.device === me) continue;
        const r = this.remote.find(x => x.device.id === m.device && x.profile.id === m.profile);
        if (!r) continue;   // that device hasn't uploaded yet
        if (online) this.busy = 'Updating from ' + r.device.name + '…';
        try {
          const dir = await this.mirror(m.device, m.profile, online);
          const s = await CollectionStore.load(dir, m.profile, m.collection);
          // Edits still waiting for that device, on top of its last copy.
          if (online) apply(s, (await this.pending(m.device, m.profile)).filter(o => o.collection === m.collection).map(o => o.op));
          data.push({ device: { id: m.device, name: r.device.name }, profile: m.profile, collection: m.collection, meta: s.meta, tracks: [...s.tracks.values()], analysis: s.analysis, lists: [...s.lists.values()], sources: [] });
          used.push(m);
        } catch (e) { if (online) console.warn('Cloud sync: no copy of ' + r.device.name + ' yet', e); }
      }
    } finally { if (online) this.busy = ''; }
    if (!still()) return;
    await this.sendEdits();   // what changed against the previous overlay goes out first
    this.others = data; this.otherMembers = used; this.overlayGroup = g; this.meId = me;
    this.rebuild();
  }
  /** Merge the open collection (as it is now) with the other devices' copies, and show it. */
  private rebuild() {
    const s = lib.store, g = this.overlayGroup, p = lib.profile;
    if (!s || !p || lib.cloud || !g) return;
    if (!this.others.length) { if (this.overlay) { this.overlay = null; lib.applyOverlay(null); } return; }
    const own = lib.ownTracks();
    const local: MemberData = { device: { id: this.meId, name: this.deviceName(this.meId) }, profile: p.id, collection: s.meta.id, meta: s.meta, tracks: own, analysis: s.analysis, lists: lib.ownLists(), sources: [] };
    const o = buildOverlay(local, this.others, g);
    lib.applyOverlay(o, [local.device.name, ...new Set(this.others.map(d => d.device.name))]);
    this.overlay = o; this.ownCount = own.length;
    this.overlayBase = baseline(s.tracks.values(), s.lists.values());
  }
  /** The open collection changed: edits to shared data go out; songs added or removed here re-merge. */
  onLocalChange() {
    const o = this.overlay, s = lib.store;
    if (!o || !s) return;
    clearTimeout(this.editTimer);
    this.editTimer = window.setTimeout(() => void this.sendEdits(), 800);
    if (s.tracks.size - o.tracks.length !== this.ownCount) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = window.setTimeout(() => void this.sendEdits().then(() => this.rebuild()), 2500);
    }
  }
  private async sendEdits() {
    const s = lib.store, o = this.overlay, b = this.overlayBase;
    if (s && o && b && !lib.cloud) {
      const ops = diff(b, s.tracks.values(), s.lists.values());
      this.overlayBase = baseline(s.tracks.values(), s.lists.values());
      for (const [mi, list] of overlayOps(ops, o, this.others.length + 1)) for (const op of list) this.unsent.push({ ...this.otherMembers[mi - 1], op });
    }
    if (!this.unsent.length || !account.signedIn) return;
    const out = this.unsent; this.unsent = [];
    try { for (let i = 0; i < out.length; i += 400) await account.request('POST', '/v1/sync/ops', { json: { ops: out.slice(i, i + 400) } }); }
    catch (e) { this.unsent = [...out, ...this.unsent]; console.warn('Cloud sync: edits are sent on the next try', e); }
  }
  /** Signed out: the other devices' songs go, and so does the account's cached state. */
  forgetOverlay() {
    this.run++; clearInterval(this.pullTimer);
    this.overlay = null; this.others = []; this.overlayGroup = null; this.unsent = [];
    this.remote = []; this.groups = [];
    lib.applyOverlay(null);
    const home = lib.homeHandle;
    if (home && !lib.readOnly) void removePath(home, 'cloud/state.json').catch(() => {});
  }

  // ---- the copy kept in the GLUE folder (cloud/) --------------------------------------------------
  private async cacheRoot(): Promise<Dir | null> {
    const home = lib.homeHandle;
    return home ? await subdir(home, ['cloud'], !lib.readOnly).catch(() => null) : null;
  }
  private async saveState(st: CacheState) {
    const d = lib.readOnly ? null : await this.cacheRoot();
    if (d) await writeJSON(d, 'state.json', st).catch(() => {});
  }
  private async loadState(): Promise<CacheState | null> {
    const d = await this.cacheRoot();
    return d ? await readJSON<CacheState>(d, 'state.json').catch(() => null) : null;
  }
  /** A device's profile files: the copy in cloud/<device>/, brought up to date from the cloud when
      online (only the files that changed). Offline, or while GLUE Cloud can't be reached: the last copy. */
  private async mirror(device: string, profile: string, online: boolean): Promise<Dir> {
    const root = await this.cacheRoot();
    const dir = (root && await subdir(root, [device], !lib.readOnly).catch(() => null)) || asDir(new MemDir());
    const hashesAt = profile + '.hashes.json';
    const known = (await readJSON<Record<string, string>>(dir, hashesAt).catch(() => null)) ?? {};
    if (!online) { if (!Object.keys(known).length) throw new Error('No copy of this device yet.'); return dir; }
    let files: { path: string; hash: string }[];
    try { files = (await account.request<{ files: { path: string; hash: string }[] }>('GET', '/v1/sync/' + device + '/' + profile)).files; }
    catch (e) { if (Object.keys(known).length) return dir; throw e; }
    const want = new Map(files.map(f => [f.path, f.hash]));
    await pool(files.filter(f => known[f.path] !== f.hash), 6, async f => {
      const b64 = await account.request<string>('GET', '/v1/sync/' + device + '/' + profile + '/file?path=' + encodeURIComponent(f.path), { raw: true });
      await writeText(dir, 'profiles/' + profile + '/' + f.path, new TextDecoder().decode(await pipe(fromB64(b64), new DecompressionStream('gzip'))));
      known[f.path] = f.hash;
    });
    for (const path of Object.keys(known)) if (!want.has(path)) { await removePath(dir, 'profiles/' + profile + '/' + path).catch(() => {}); delete known[path]; }
    await writeJSON(dir, hashesAt, known).catch(() => {});
    return dir;
  }

  // ---- cloud → a view in this browser -------------------------------------------------------------
  private async pending(device: string, profile: string): Promise<PendingOp[]> {
    return (await account.request<{ ops: PendingOp[] }>('GET', '/v1/sync/ops?device=' + device + '&profile=' + profile)).ops;
  }
  private async loadMember(m: Member, snaps: Map<string, Promise<Dir>>) {
    const k = m.device + '/' + m.profile;
    if (!snaps.has(k)) snaps.set(k, this.mirror(m.device, m.profile, true));
    const s = await CollectionStore.load(await snaps.get(k)!, m.profile, m.collection);
    // Show edits still waiting for that device on top of its last copy.
    apply(s, (await this.pending(m.device, m.profile)).filter(o => o.collection === m.collection).map(o => o.op));
    return s;
  }

  private base: Baseline | null = null;
  private target: { kind: 'device'; member: Member } | { kind: 'group'; members: Member[]; merged: Merged } | null = null;
  private sendTimer = 0;

  /** Open one device's collection from the cloud. */
  async openDevice(m: Member) {
    this.busy = 'Opening from GLUE Cloud…';
    try {
      const r = this.remote.find(x => x.device.id === m.device && x.profile.id === m.profile);
      const s = await this.loadMember(m, new Map());
      this.begin(s, { kind: 'device', member: m });
      await lib.enterCloudView(s, { kind: 'device', title: r?.device.name ?? 'Another device', subtitle: (r?.profile.name ?? '') + ' · ' + s.meta.name, updatedAt: r?.updatedAt ?? null });
    } finally { this.busy = ''; }
  }
  /** Open a merged collection: every member's cloud copy, merged in this browser. */
  async openGroup(g: Group) {
    this.busy = 'Merging ' + g.name + ' from GLUE Cloud…';
    try { await this.openGroupNow(g); } finally { this.busy = ''; }
  }
  private async openGroupNow(g: Group) {
    const snaps = new Map<string, Promise<Dir>>();
    const data: MemberData[] = [];
    for (const m of g.members) {
      const r = this.remote.find(x => x.device.id === m.device && x.profile.id === m.profile);
      if (!r) continue;   // that device hasn't uploaded yet
      const s = await this.loadMember(m, snaps);
      data.push({ device: { id: m.device, name: r.device.name }, profile: m.profile, collection: m.collection, meta: s.meta, tracks: [...s.tracks.values()], analysis: s.analysis, lists: [...s.lists.values()], sources: [...s.sources.values()] });
    }
    if (!data.length) throw new Error('None of this collection’s devices has synced yet.');
    const mg = mergeCollections(data, g);
    const dir = new MemDir(), base = 'profiles/merged/collections/' + mg.meta.id;
    await dir.put(base + '/collection.json', JSON.stringify(mg.meta));
    const shard = <T,>(items: [string, T][], folder: string) => {
      const by = new Map<string, Record<string, T>>();
      for (const [id, v] of items) (by.get(shardOf(id)) ?? by.set(shardOf(id), {}).get(shardOf(id))!)[id] = v;
      return Promise.all([...by].map(([sh, it]) => dir.put(`${base}/${folder}/${sh}.json`, JSON.stringify({ schemaVersion: SCHEMA, items: it }))));
    };
    await shard(mg.tracks.map(t => [t.id, t]), 'tracks');
    await shard([...mg.analysis], 'analysis');
    for (const l of mg.lists) await dir.put(`${base}/lists/${l.id}.json`, JSON.stringify(l));
    for (const s of mg.sources) await dir.put(`${base}/sources/${s.id}.json`, JSON.stringify(s));
    const s = await CollectionStore.load(asDir(dir), 'merged', mg.meta.id);
    // Stored files can't hold the view-only device names: put them back.
    for (const t of mg.tracks) { const x = s.tracks.get(t.id); if (x) x.onDevices = t.onDevices; }
    const members = data.map(d => ({ device: d.device.id, profile: d.profile, collection: d.collection }));
    this.begin(s, { kind: 'group', members, merged: mg });
    await lib.enterCloudView(s, { kind: 'group', title: g.name, subtitle: 'Merged from ' + data.map(d => d.device.name).join(', '), updatedAt: Math.max(...data.map(d => this.remote.find(x => x.device.id === d.device.id)?.updatedAt ?? 0)) || null });
  }
  private begin(s: CollectionStore, target: NonNullable<typeof this.target>) {
    this.run++;   // the local collection's sync stops while a cloud view is open
    this.overlay = null;
    this.target = target;
    this.base = baseline(s.tracks.values(), s.lists.values());
    lib.onCloudChange = () => { clearTimeout(this.sendTimer); this.sendTimer = window.setTimeout(() => void this.send().catch(e => { lib.notice = 'Couldn’t send your change to GLUE Cloud: ' + (e as Error).message; }), 600); };
  }
  /** Edits in the cloud view → operations for the devices that own the data. */
  private async send() {
    const s = lib.store, t = this.target, b = this.base;
    if (!s || !t || !b || !lib.cloud) return;
    const ops = diff(b, s.tracks.values(), s.lists.values());
    if (!ops.length) return;
    this.base = baseline(s.tracks.values(), s.lists.values());
    const out: OutOp[] = [];
    if (t.kind === 'device') for (const op of ops) out.push({ ...t.member, op });
    else for (const [mi, list] of translate(ops, t.merged, t.members.length)) for (const op of list) out.push({ ...t.members[mi], op });
    for (let i = 0; i < out.length; i += 400) await account.request('POST', '/v1/sync/ops', { json: { ops: out.slice(i, i + 400) } });
    lib.notice = 'Saved to the cloud. ' + (t.kind === 'device' ? lib.cloud.title : 'Each device') + ' applies it the next time GLUE opens there.';
  }

  // ---- cleaning up --------------------------------------------------------------------------------
  async deleteCopy(device: string, profile: string) {
    await account.request('DELETE', '/v1/sync/' + device + '/' + profile);
    const root = lib.readOnly ? null : await this.cacheRoot();
    if (root) await removePath(root, device).catch(() => {});
    await this.refresh(); await this.resync();
  }
  async deleteAll() {
    await account.request('DELETE', '/v1/sync');
    const home = lib.homeHandle;
    if (home && !lib.readOnly) await removePath(home, 'cloud').catch(() => {});
    await this.refresh(); await this.resync();
  }
}

export const sync = new CloudSync();

// After a save, upload changes; when a collection opens, show the merged collection, take in edits
// made elsewhere and upload. Signing in starts it for the open collection; signing out ends it.
lib.onFlushed = pid => { void lib.profileInfo(pid).then(p => { if (syncOn(p)) sync.schedule(pid); }); };
lib.onLocalChange = () => sync.onLocalChange();
account.onSignedIn = () => { void sync.refresh().catch(() => {}); if (lib.profile && lib.store && !lib.cloud) lib.onCollectionOpened?.(lib.profile.id, lib.store.meta.id); };
account.onSignedOut = () => sync.forgetOverlay();
lib.onCollectionOpened = (pid, cid) => { void sync.syncCollection(pid, cid); };
