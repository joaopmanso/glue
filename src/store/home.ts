/* The GLUE folder's top level: profiles (ADR 0018). */
import { type Dir, readJSON, removePath, writeJSON } from './fsx';
import { type Collection, type HomeIndex, type Profile, PROFILE_COLORS, SCHEMA, newId } from './types';
import { migrate } from './migrations';

const now = () => new Date().toISOString();

export class HomeStore {
  private constructor(readonly root: Dir, public index: HomeIndex) {}

  static async open(root: Dir): Promise<HomeStore> {
    const index = await readJSON<HomeIndex>(root, 'mco.json');
    if (index) return new HomeStore(root, migrate('home', index));
    const fresh: HomeIndex = { schemaVersion: SCHEMA, profiles: [], lastProfile: null };
    await writeJSON(root, 'mco.json', fresh);
    return new HomeStore(root, fresh);
  }

  private saveIndex() { return writeJSON(this.root, 'mco.json', this.index); }
  private profilePath(pid: string) { return `profiles/${pid}/profile.json`; }

  async createProfile(name: string): Promise<Profile> {
    const id = newId(), color = PROFILE_COLORS[this.index.profiles.length % PROFILE_COLORS.length];
    const p: Profile = { schemaVersion: SCHEMA, id, name: name.trim() || 'Me', color, createdAt: now(), collections: [], lastCollection: null };
    await writeJSON(this.root, this.profilePath(id), p);
    this.index.profiles.push({ id, name: p.name, color });
    this.index.lastProfile = id;
    await this.saveIndex();
    return p;
  }

  async loadProfile(pid: string): Promise<Profile> {
    const p = await readJSON<Profile>(this.root, this.profilePath(pid));
    if (!p) throw new Error('Profile not found in your GLUE folder.');
    return migrate('profile', p);
  }

  async saveProfile(p: Profile) {
    await writeJSON(this.root, this.profilePath(p.id), p);
    const ref = this.index.profiles.find(r => r.id === p.id);
    if (ref && (ref.name !== p.name || ref.color !== p.color)) { ref.name = p.name; ref.color = p.color; await this.saveIndex(); }
  }

  async setLastProfile(pid: string) { if (this.index.lastProfile !== pid) { this.index.lastProfile = pid; await this.saveIndex(); } }

  async deleteProfile(pid: string) {
    await removePath(this.root, `profiles/${pid}`);
    this.index.profiles = this.index.profiles.filter(p => p.id !== pid);
    if (this.index.lastProfile === pid) this.index.lastProfile = this.index.profiles[0]?.id ?? null;
    await this.saveIndex();
  }

  async setAppearance(a: { theme: string; mode: 'dark' | 'light' | 'system' }) {
    if (this.index.appearance?.theme === a.theme && this.index.appearance?.mode === a.mode) return;
    this.index.appearance = a; await this.saveIndex();
  }

  /** A restored profile's files are in place: list it (replacing an entry with the same id). */
  async adoptProfile(ref: { id: string; name: string; color: string }) {
    this.index.profiles = [...this.index.profiles.filter(p => p.id !== ref.id), ref];
    this.index.lastProfile = ref.id;
    await this.saveIndex();
  }

  /** Remove everything GLUE wrote in its folder (and nothing else the user keeps there). */
  async wipe() {
    for (const name of ['profiles', 'files', 'cloud', 'mco.json']) await removePath(this.root, name);
    this.index = { schemaVersion: SCHEMA, profiles: [], lastProfile: null };
  }

  async createCollection(p: Profile, name: string): Promise<Collection> {
    const c: Collection = { schemaVersion: SCHEMA, id: newId(), name: name.trim() || 'My collection', createdAt: now(), roots: [] };
    await writeJSON(this.root, `profiles/${p.id}/collections/${c.id}/collection.json`, c);
    p.collections.push({ id: c.id, name: c.name });
    p.lastCollection = c.id;
    await this.saveProfile(p);
    return c;
  }

  async deleteCollection(p: Profile, cid: string) {
    await removePath(this.root, `profiles/${p.id}/collections/${cid}`);
    p.collections = p.collections.filter(c => c.id !== cid);
    if (p.lastCollection === cid) p.lastCollection = p.collections[0]?.id ?? null;
    await this.saveProfile(p);
  }
}
