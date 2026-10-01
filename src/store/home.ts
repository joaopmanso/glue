/* The GLUE folder's top level: profiles (ADR 0018). */
import { type Dir, readJSON, removePath, writeJSON } from './fsx';
import { type Alias, type Collection, type HomeIndex, type Profile, PROFILE_COLORS, SCHEMA, newId } from './types';
import { migrate } from './migrations';
import { guideAdds, mergeGuide, type GuideState } from '../core/guide/state';

const now = () => new Date().toISOString();
/** mco.json's aliases, as made (ADR 0113, 0114). */
const ALIASES_V = 2;

export class HomeStore {
  /** `root` changes when the library moves between GLUE Home's disk and the browser's (ADR 0051). */
  private constructor(public root: Dir, public index: HomeIndex) {}

  static async open(root: Dir): Promise<HomeStore> {
    const index = await readJSON<HomeIndex>(root, 'mco.json');
    if (index) return new HomeStore(root, migrate('home', index));
    const fresh: HomeIndex = { schemaVersion: SCHEMA, profiles: [], lastProfile: null };
    await writeJSON(root, 'mco.json', fresh);
    return new HomeStore(root, fresh);
  }

  private saveIndex() { return writeJSON(this.root, 'mco.json', this.index); }
  /** Which computer this GLUE folder is on (ADR 0108), once GLUE Home or a sign-in has said. */
  async rememberComputer(id: string) { if (this.index.computer === id) return; this.index.computer = id; await this.saveIndex(); }
  private profilePath(pid: string) { return `profiles/${pid}/profile.json`; }

  /** `id`: the alias it's made for (the first library of a GLUE folder takes its alias's id, as older ones have). */
  async createProfile(name: string, id = newId()): Promise<Profile> {
    const color = PROFILE_COLORS[this.index.profiles.length % PROFILE_COLORS.length];
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
    if (this.index.container === pid) this.index.container = this.index.profiles[0]?.id ?? null;
    await this.saveIndex();
  }

  // ─── Aliases (ADR 0113) ────────────────────────────────────────────────────
  /** From before aliases: each profile is an alias too, and the one used last holds the library (the container).
      Nothing moves on disk. True when mco.json changed (saved unless `save` is false: a read-only tab). */
  async ensureAliases(save = true): Promise<boolean> {
    const ix = this.index;
    let changed = false;
    // Each profile folder is an alias too: once when aliases come in, and once more (v2) to put back those the
    // first version dropped for the account's list (the laptop's own "404", the iPhone's "Joao Manso",
    // 2026-09-30). The library a device without one made that day ("Library") was never an alias.
    if (!ix.aliases || (ix.aliasesV ?? 1) < ALIASES_V) {
      const aliases: Alias[] = [...(ix.aliases ?? [])];
      for (const r of ix.profiles) {
        if (aliases.some(a => a.id === r.id)) continue;
        const p = await readJSON<Profile>(this.root, this.profilePath(r.id)).catch(() => null);
        if (ix.aliases && r.name === 'Library' && (p?.createdAt ?? '') >= '2026-09-30') continue;
        aliases.push({ id: r.id, name: r.name, color: r.color, ...(p?.bpmRange ? { bpmRange: p.bpmRange } : {}) });
      }
      ix.aliases = aliases; ix.aliasesV = ALIASES_V; changed = true;
    }
    if (!ix.container || !ix.profiles.some(p => p.id === ix.container)) {
      const c = ix.lastProfile && ix.profiles.some(p => p.id === ix.lastProfile) ? ix.lastProfile : ix.profiles[0]?.id ?? null;
      if ((ix.container ?? null) !== c) { ix.container = c; changed = true; }
    }
    if (ix.lastAlias === undefined) { ix.lastAlias = ix.aliases.some(a => a.id === ix.container) ? ix.container : ix.aliases[0]?.id ?? null; changed = true; }
    if (changed && save) await this.saveIndex();
    return changed;
  }
  get aliases(): Alias[] { return this.index.aliases ?? []; }
  async setAliases(list: Alias[]) {
    this.index.aliases = list;
    if (this.index.lastAlias && !list.some(a => a.id === this.index.lastAlias)) this.index.lastAlias = null;
    await this.saveIndex();
  }
  async setLastAlias(id: string | null) { if (this.index.lastAlias !== id) { this.index.lastAlias = id; await this.saveIndex(); } }
  /** The profile folder that holds this GLUE folder's library. */
  async setContainer(pid: string) { if (this.index.container !== pid) { this.index.container = pid; this.index.lastProfile = pid; await this.saveIndex(); } }

  /** What Gluey has shown (ADR 0126), merged in: every browser using this GLUE folder knows it. */
  async setGuide(g: GuideState) {
    const cur = mergeGuide(this.index.guide), next = mergeGuide(cur, g);
    if (!guideAdds(cur, next)) return;
    this.index.guide = next; await this.saveIndex();
  }
  async setAppearance(a: { theme: string; mode: 'dark' | 'light' | 'system'; at?: number }) {
    if (this.index.appearance?.theme === a.theme && this.index.appearance?.mode === a.mode && (this.index.appearance?.at ?? 0) >= (a.at ?? 0)) return;
    this.index.appearance = a; await this.saveIndex();
  }

  /** A restored profile's files are in place: list it (replacing an entry with the same id). It's the library now,
      and its alias the one in use (added if it isn't one, ADR 0113). */
  async adoptProfile(ref: { id: string; name: string; color: string }) {
    this.index.profiles = [...this.index.profiles.filter(p => p.id !== ref.id), ref];
    this.index.lastProfile = ref.id;
    this.index.container = ref.id;
    const aliases = this.index.aliases ?? [];
    if (!aliases.some(a => a.id === ref.id)) this.index.aliases = [...aliases, { id: ref.id, name: ref.name, color: ref.color }];
    this.index.lastAlias = ref.id;
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

  /** A shared collection from another device (ADR 0094): its folder is made here under its own id, and
      filled by the first sync. */
  async joinCollection(p: Profile, id: string, name: string) {
    if (!p.collections.some(c => c.id === id)) p.collections.push({ id, name });
    p.lastCollection = id;
    await this.saveProfile(p);
  }

  async deleteCollection(p: Profile, cid: string) {
    await removePath(this.root, `profiles/${p.id}/collections/${cid}`);
    p.collections = p.collections.filter(c => c.id !== cid);
    if (p.lastCollection === cid) p.lastCollection = p.collections[0]?.id ?? null;
    await this.saveProfile(p);
  }
}
