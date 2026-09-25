/* Cloud sync (ADR 0040), opt-in per profile, for signed-in users:
   - push: this device's profile files (collections, tracks, analysis, playlists, tags, imports; never
     audio) go to GLUE Cloud, only the ones that changed;
   - edits: changes made elsewhere for this device are applied to its own files when it opens;
   - views: any signed-in browser opens a device's collection, or a merged one, from the cloud copy;
     edits there are sent to the owning devices. */
import { lib } from './library.svelte';
import { account } from './account.svelte';
import { walk } from '../store/backup';
import { fileAt, subdir } from '../store/fsx';
import { MemDir, asDir } from '../store/memdir';
import { CollectionStore } from '../store/collection';
import { SCHEMA, shardOf, type Profile } from '../store/types';
import { apply, baseline, diff, type Baseline, type EditOp } from '../core/library/cloudEdits';
import { mergeCollections, translate, type Merged, type MemberData } from '../core/library/mergeCollections';

export interface RemoteProfile {
  device: { id: string; name: string; kind: string }; profile: { id: string; name: string; color: string | null };
  stats: { collections?: { id: string; name: string; tracks: number }[] } | null;
  files: number; stored: number; bytes: number; updatedAt: number; complete: boolean;
}
export interface Member { device: string; profile: string; collection: string }
export interface Group { id: string; name: string; members: Member[] }
type PendingOp = { seq: number; collection: string; op: EditOp };

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
    } finally { this.loading = false; }
  }
  groupOf(m: Member) { return this.groups.find(g => g.members.some(x => x.device === m.device && x.profile === m.profile && x.collection === m.collection)) ?? null; }

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
    if (!account.signedIn || !home || !profile?.cloudSync || lib.readOnly) return;
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
      const stats = { collections: await Promise.all(profile.collections.map(async c => ({ id: c.id, name: c.name, tracks: await this.trackCount(pid, c.id) }))) };
      const { need } = await account.request<{ need: string[] }>('POST', '/v1/sync/manifest', { json: { profile: { id: pid, name: profile.name, color: profile.color }, stats, files: list.map(({ path, hash, size }) => ({ path, hash, size })) } });
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
    if (lib.store && !lib.cloud && lib.store.meta.id === cid) return lib.store.tracks.size;
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
    if (!account.signedIn || !profile?.cloudSync || !home || lib.readOnly || lib.cloud) return 0;
    const { ops } = await account.request<{ ops: PendingOp[] }>('GET', '/v1/sync/ops?profile=' + encodeURIComponent(pid));
    if (!ops.length) return 0;
    let applied = 0;
    const byCollection = new Map<string, EditOp[]>();
    for (const o of ops) (byCollection.get(o.collection) ?? byCollection.set(o.collection, []).get(o.collection)!).push(o.op);
    for (const [cid, list] of byCollection) {
      if (!profile.collections.some(c => c.id === cid)) continue;
      if (lib.store && !lib.cloud && lib.store.meta.id === cid && lib.profile?.id === pid) { applied += apply(lib.store, list); await lib.flush(); }
      else { const s = await CollectionStore.load(home, pid, cid); applied += apply(s, list); await s.flush(); }
    }
    await account.request('POST', '/v1/sync/ops/ack', { json: { profile: pid, upTo: ops[ops.length - 1].seq } });
    if (applied) lib.notice = 'Applied ' + applied + ' change' + (applied === 1 ? '' : 's') + ' made on your other devices.';
    this.schedule(pid);
    return applied;
  }
  /** While a synced profile is open: fetch edits from elsewhere now and then. */
  watch(pid: string) {
    clearInterval(this.pullTimer);
    this.pullTimer = window.setInterval(() => { if (lib.profile?.id === pid && !lib.cloud) void this.pull(pid).catch(() => {}); }, PULL_EVERY);
  }

  // ---- linking a second device: merge or keep separate --------------------------------------------
  async merge(members: Member[], opts: { group?: string; name?: string }) {
    const r = await account.request<{ group: string; name: string }>('POST', '/v1/sync/links', { json: { ...opts, members } });
    await this.refresh();
    return r;
  }
  async unmerge(group: string) { await account.request('POST', '/v1/sync/unlink', { json: { group } }); await this.refresh(); }

  // ---- cloud → a view in this browser -------------------------------------------------------------
  private async snapshot(device: string, profile: string): Promise<MemDir> {
    const dir = new MemDir();
    const { files } = await account.request<{ files: { path: string }[] }>('GET', '/v1/sync/' + device + '/' + profile);
    await pool(files, 6, async f => {
      const b64 = await account.request<string>('GET', '/v1/sync/' + device + '/' + profile + '/file?path=' + encodeURIComponent(f.path), { raw: true });
      await dir.put('profiles/' + profile + '/' + f.path, await pipe(fromB64(b64), new DecompressionStream('gzip')));
    });
    return dir;
  }
  private async pending(device: string, profile: string): Promise<PendingOp[]> {
    return (await account.request<{ ops: PendingOp[] }>('GET', '/v1/sync/ops?device=' + device + '&profile=' + profile)).ops;
  }
  private async loadMember(m: Member, snaps: Map<string, Promise<MemDir>>) {
    const k = m.device + '/' + m.profile;
    if (!snaps.has(k)) snaps.set(k, this.snapshot(m.device, m.profile));
    const s = await CollectionStore.load(asDir(await snaps.get(k)!), m.profile, m.collection);
    // Show edits still waiting for that device on top of its last copy.
    apply(s, (await this.pending(m.device, m.profile)).filter(o => o.collection === m.collection).map(o => o.op));
    return s;
  }

  private base: Baseline | null = null;
  private target: { kind: 'device'; member: Member } | { kind: 'group'; members: Member[]; merged: Merged } | null = null;
  private sendTimer = 0;

  /** Open one device's collection from the cloud. */
  async openDevice(m: Member) {
    const r = this.remote.find(x => x.device.id === m.device && x.profile.id === m.profile);
    const s = await this.loadMember(m, new Map());
    this.begin(s, { kind: 'device', member: m });
    await lib.enterCloudView(s, { kind: 'device', title: r?.device.name ?? 'Another device', subtitle: (r?.profile.name ?? '') + ' · ' + s.meta.name, updatedAt: r?.updatedAt ?? null });
  }
  /** Open a merged collection: every member's cloud copy, merged in this browser. */
  async openGroup(g: Group) {
    const snaps = new Map<string, Promise<MemDir>>();
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
    const out: { device: string; profile: string; collection: string; op: EditOp }[] = [];
    if (t.kind === 'device') for (const op of ops) out.push({ ...t.member, op });
    else for (const [mi, list] of translate(ops, t.merged, t.members.length)) for (const op of list) out.push({ ...t.members[mi], op });
    for (let i = 0; i < out.length; i += 400) await account.request('POST', '/v1/sync/ops', { json: { ops: out.slice(i, i + 400) } });
    lib.notice = 'Saved to the cloud. ' + (t.kind === 'device' ? lib.cloud.title : 'Each device') + ' applies it the next time GLUE opens there.';
  }

  // ---- cleaning up --------------------------------------------------------------------------------
  async deleteCopy(device: string, profile: string) { await account.request('DELETE', '/v1/sync/' + device + '/' + profile); await this.refresh(); }
  async deleteAll() { await account.request('DELETE', '/v1/sync'); await this.refresh(); }
}

export const sync = new CloudSync();

// After a save, upload changes; when a synced profile opens, take in edits made elsewhere first.
lib.onFlushed = pid => { void lib.profileInfo(pid).then(p => { if ((p as Profile | null)?.cloudSync) sync.schedule(pid); }); };
account.onSignedIn = () => { void sync.refresh().catch(() => {}); if (lib.profile && lib.store && !lib.cloud) lib.onCollectionOpened?.(lib.profile.id, lib.store.meta.id); };
lib.onCollectionOpened = pid => {
  void (async () => {
    const p = await lib.profileInfo(pid);
    if (!p?.cloudSync || !account.signedIn) return;
    try { await sync.pull(pid); await sync.push(pid); } catch { /* shown in the profile's sync status */ }
    sync.watch(pid);
  })();
};
