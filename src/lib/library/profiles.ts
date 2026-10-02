/* Profiles (the account's artist aliases, ADR 0113) and the library they open; backups.
   Part of `lib` (src/lib/library.svelte.ts): its methods, `this` being the library. */
import { removePath } from '../../store/fsx';
import { PROFILE_COLORS, newId, type Alias, type Profile } from '../../store/types';
import { buildBackup, readBackup, writeBackup, type BackupManifest } from '../../store/backup';
import type { ZipEntry } from '../../core/zip';
import { downloadBlob } from '../download';
import * as platform from '../../platform';
import type { Library } from '../library.svelte';

export const profiles = {

  /** This GLUE folder has its library (the profile folder every alias uses). */
  hasLibrary(this: Library) { const c = this.home?.index.container; return !!c && !!this.home?.index.profiles.some(p => p.id === c); },
  /** A new profile (the "Who's using GLUE?" form): an alias of the account; the first one also makes the
      library. `cloudSync: false`: "Just this computer" (ADR 0092), so even signed in nothing is uploaded. */
  async createProfile(this: Library, name: string, opts: { cloudSync?: boolean } = {}) {
    const a = await this.addAlias(name, opts.cloudSync === false).catch(e => { this.notice = 'Couldn’t make the profile: ' + (e as Error).message; return null; });
    if (!a || !this.home) return;
    if (this.hasLibrary()) { await this.useAlias(a.id); return; }
    this.alias = a;
    await this.home.setLastAlias(a.id);
    await this.createLibrary(a.name, opts, a.id);
  },
  /** The GLUE folder's library, made (a profile folder, with a first collection). */
  async createLibrary(this: Library, name: string, opts: { cloudSync?: boolean } = {}, id?: string) {
    if (!this.home) return;
    let p = await this.home.createProfile(name, id);
    if (opts.cloudSync === false) { p = { ...p, cloudSync: false }; await this.home.saveProfile(p); }
    await this.home.setContainer(p.id);
    this.profile = p;
    this.phase = 'collections';
    await this.createCollection('My collection');
    this.onboarding = 'music';
  },
  /** A GLUE folder with more than one library (from before aliases): the one every profile opens. */
  async useLibrary(this: Library, pid: string) {
    const home = this.home;
    if (!home || !home.index.profiles.some(p => p.id === pid)) return;
    await home.setContainer(pid);
    this.home = null; this.home = home;
  },
  /** Use GLUE as this alias: the library opens (made, if this GLUE folder has none yet). */
  async useAlias(this: Library, id: string) {
    const home = this.home, a = home?.aliases.find(x => x.id === id);
    if (!home || !a) return;
    this.alias = a;
    if (!this.readOnly) await home.setLastAlias(id);
    if (this.hasLibrary()) await this.openProfile(home.index.container!);
    else await this.createLibrary(a.name, {}, a.id);
  },
  /** `local`: "Just this computer" (ADR 0092): not the account's. */
  async addAlias(this: Library, name: string, local = false): Promise<Alias | null> {
    const home = this.home;
    if (!home || !name.trim()) return null;
    let a: Alias = { id: newId(), name: name.trim().slice(0, 60), color: PROFILE_COLORS[home.aliases.length % PROFILE_COLORS.length] };
    if (this.aliasCloud && !local) a = await this.aliasCloud.create(a);
    await home.setAliases([...home.aliases.filter(x => x.id !== a.id), a]);
    this.home = null; this.home = home;
    return a;
  },
  async changeAlias(this: Library, id: string, change: Partial<Alias>) {
    const home = this.home, cur = home?.aliases.find(x => x.id === id);
    if (!home || !cur) return;
    let a: Alias = { ...cur, ...change };
    if (!a.bpmRange) delete a.bpmRange;
    if (this.aliasCloud) a = await this.aliasCloud.update(a);
    await home.setAliases(home.aliases.map(x => x.id === id ? a : x));
    if (this.alias?.id === id) this.alias = a;
    this.home = null; this.home = home;
  },
  /** The account's list came in (lib/profiles): kept here; the alias in use follows it. */
  async takeAliases(this: Library, list: Alias[]) {
    const home = this.home;
    if (!home) return;
    if (!this.readOnly && JSON.stringify(list) !== JSON.stringify(home.aliases)) await home.setAliases(list);
    else home.index.aliases = list;
    this.home = null; this.home = home;
    if (this.alias) this.alias = list.find(a => a.id === this.alias!.id) ?? null;
  },

  async downloadBackup(this: Library, pid: string) {
    const home = this.home, dir = this.homeDir;
    if (!home || !dir) return;
    if (this.profile?.id === pid) await this.flush();
    const p = this.profile?.id === pid ? this.profile : await home.loadProfile(pid);
    const blob = await buildBackup(dir, p);
    const day = new Date().toISOString().slice(0, 10), safe = p.name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'profile';
    downloadBlob(blob, `GLUE backup - ${safe} - ${day}.zip`);
    return blob.size;
  },
  /** Read a backup zip (checks it's a GLUE backup a this version can open). */
  async readBackupFile(this: Library, file: File) { return readBackup(new Uint8Array(await file.arrayBuffer())); },
  profileExists(this: Library, pid: string) { return !!this.home?.index.profiles.some(p => p.id === pid); },
  /** Put a backup's profile into the GLUE folder and open it. `replace`: an existing copy is removed first. */
  async applyBackup(this: Library, b: { manifest: BackupManifest; entries: ZipEntry[] }, replace: boolean) {
    const home = this.home, dir = this.homeDir;
    if (!home || !dir) { this.pendingRestore = b; return; }
    const pid = b.manifest.profile.id;
    if (this.profileExists(pid)) {
      if (!replace) return;
      if (this.profile?.id === pid) { await this.closeCollection(); this.profile = null; }
      await removePath(dir, `profiles/${pid}`);
    }
    await writeBackup(dir, b);
    await home.adoptProfile(b.manifest.profile);
    this.home = null; this.home = home;
    await this.useAlias(pid);
    const folders = this.roots.length;
    this.notice = 'Restored ' + b.manifest.profile.name + '.' + (folders ? ' Link its music folder' + (folders === 1 ? '' : 's') + ' again with “Find folder” in the sidebar.' : '');
  },
  /** Delete every file GLUE made (in its folder and in the browser) and start again. */
  async deleteAllData(this: Library) {
    const home = this.home, kind = this.homeKind;
    await this.closeCollection();
    this.profile = null;
    if (home) await home.wipe();
    await platform.wipeBrowserData(kind === 'private');
    this.home = null; this.homeDir = null; this.onboarding = null;
    this.phase = 'welcome';
  },
  async openProfile(this: Library, pid: string) {
    if (!this.home) return;
    await this.closeCollection();
    const p = await this.home.loadProfile(pid);
    await this.home.setLastProfile(pid);
    this.profile = p;
    if (p.lastCollection && p.collections.some(c => c.id === p.lastCollection)) await this.openCollection(p.lastCollection);
    else if (p.collections[0]) await this.openCollection(p.collections[0].id);
    else this.phase = 'collections';
  },
  /** Renamed for every device (an alias of the account, ADR 0113). */
  async renameProfile(this: Library, id: string, name: string) {
    if (!name.trim()) return;
    await this.changeAlias(id, { name: name.trim().slice(0, 60) }).catch(e => { this.notice = 'Couldn’t rename it: ' + (e as Error).message; });
  },
  /** An alias gone for every device; the library stays (it's every alias's). */
  async deleteProfile(this: Library, id: string) {
    const home = this.home;
    if (!home) return;
    try { await this.aliasCloud?.remove(id); } catch (e) { this.notice = 'Couldn’t delete it: ' + (e as Error).message; return; }
    await home.setAliases(home.aliases.filter(a => a.id !== id));
    this.home = null; this.home = home;
    if (this.alias?.id === id) { await this.closeCollection(); this.alias = null; this.profile = null; this.phase = 'profiles'; }
  },
  /** Turn cloud sync on or off for a profile of this GLUE folder (it's on by default, ADR 0042). */
  async setProfileSync(this: Library, pid: string, on: boolean) {
    const home = this.home;
    if (!home) return;
    const p = { ...(this.profile?.id === pid ? this.profile : await home.loadProfile(pid)), cloudSync: on };
    await home.saveProfile(p);
    if (this.profile?.id === pid) this.profile = p;
    this.home = null; this.home = home;
  },
  async profileInfo(this: Library, pid: string) { return this.profile?.id === pid ? this.profile : this.home ? this.home.loadProfile(pid) : null; },
  switchProfile(this: Library) { const from = this.alias?.id ?? null; void this.closeCollection().then(() => { this.lastProfile = from; this.profile = null; this.alias = null; this.phase = 'profiles'; }); },
  /** Back to the profile the profile screen was opened from, if it's still there. */
  backToLibrary(this: Library) { const id = this.lastProfile; if (id && this.home?.aliases.some(a => a.id === id)) { void this.useAlias(id); return true; } return false; },
  /** An alias's BPM range (ADR 0052, 0113), for every device. */
  async setBpmRange(this: Library, id: string, range: Profile['bpmRange']) {
    await this.changeAlias(id, { bpmRange: range }).catch(e => { this.notice = 'Couldn’t change it: ' + (e as Error).message; });
    this.version++;
  },
};
