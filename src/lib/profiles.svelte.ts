/* The account's profiles: its artist aliases, the same list on every device (ADR 0113). The GLUE folder keeps a
   copy (mco.json `aliases`) for when it's offline; signed in, the account's list is the truth.
   - Seeded once: the first computer with a GLUE folder of its own that signs in to an account with none sends its
     aliases, with their ids (the desktop's "404" stays b2df…). A phone or a browser's own storage never seeds.
   - After that, a device's own aliases that the account doesn't have drop out (their library stays: every alias
     uses the same one). The alias in use becomes the account's one of the same name, or its only one; else
     "Who's using GLUE?" asks.
   - Made, renamed and deleted in GLUE Cloud first; other devices hear of it at once. */
import { account } from './account.svelte';
import { lib } from './library.svelte';
import { homeMode } from '../platform';
import { PROFILE_COLORS, type Alias } from '../store/types';

interface CloudAlias { id: string; name: string; color: string | null; bpmRange: 'half' | 'full' | null }
const toLocal = (c: CloudAlias, i: number): Alias => ({ id: c.id, name: c.name, color: c.color ?? PROFILE_COLORS[i % PROFILE_COLORS.length], ...(c.bpmRange ? { bpmRange: c.bpmRange } : {}) });
const toCloud = (a: Alias) => ({ id: a.id, name: a.name, color: a.color, bpmRange: a.bpmRange ?? null });
type Listed = { profiles: CloudAlias[]; seeded: boolean };
/** Only what's a list of aliases (a GLUE Cloud from before them answers something else, or nothing). */
const isAlias = (c: unknown): c is CloudAlias => !!c && typeof (c as CloudAlias).id === 'string' && typeof (c as CloudAlias).name === 'string' && !!(c as CloudAlias).name.trim();
const listed = (r: unknown): Listed | null => r && Array.isArray((r as Listed).profiles) && typeof (r as Listed).seeded === 'boolean' ? { profiles: (r as Listed).profiles.filter(isAlias), seeded: (r as Listed).seeded } : null;

class Profiles {
  /** The account has had aliases (so this device never seeds it). */
  seeded = false;
  private running: Promise<void> | null = null;

  /** The account's list, asked for again (one request at a time). */
  refresh(): Promise<void> { return (this.running ??= this.once().finally(() => { this.running = null; })); }

  /** A computer with a GLUE folder of its own (not a phone, not a browser's own storage). */
  private canSeed() { return !!lib.home && !lib.readOnly && (lib.homeKind !== 'private' || homeMode()) && lib.home.aliases.length > 0; }

  /** The library's cloud sync is off ("Just this computer", ADR 0092): its profiles stay here too. */
  private async off() {
    const c = lib.home?.index.container;
    return !!c && (await lib.profileInfo(c)?.catch(() => null))?.cloudSync === false;
  }

  private async once() {
    if (!account.signedIn || !lib.home || await this.off()) return;
    let r = listed(await account.request('GET', '/v1/profiles').catch(() => null));
    if (!r) return;
    if (!r.seeded) {
      this.seeded = false;
      if (!this.canSeed()) return;   // a phone keeps what it has until the account has some
      r = listed(await account.request('POST', '/v1/profiles/seed', { json: { profiles: lib.home.aliases.map(toCloud) } }).catch(() => null));
      if (!r) return;
    }
    this.seeded = true;
    await this.adopt(r.profiles.map(toLocal));
  }

  /** The account's list, here; the alias in use follows it. */
  private async adopt(list: Alias[]) {
    const cur = lib.alias;
    await lib.takeAliases(list);
    if (!cur || lib.alias) return;
    // The alias in use isn't one of the account's (a device's own, from before): its namesake, or the only one.
    const name = cur.name.trim().toLowerCase();
    const same = list.find(a => a.name.trim().toLowerCase() === name) ?? (list.length === 1 ? list[0] : null);
    if (same) { lib.alias = same; if (!lib.readOnly) await lib.home?.setLastAlias(same.id); }
    else if (lib.phase === 'library') lib.switchProfile();
  }

  /** Made, changed or deleted in the account first (signed in); else only here. */
  readonly cloud = {
    create: async (a: Alias): Promise<Alias> => {
      if (!account.signedIn || await this.off()) return a;
      if (!this.seeded && this.canSeed()) {
        const r = listed(await account.request('POST', '/v1/profiles/seed', { json: { profiles: [...(lib.home?.aliases ?? []), a].map(toCloud) } }));
        if (!r) return a;
        this.seeded = true;
        await lib.takeAliases(r.profiles.map(toLocal));
        const made = r.profiles.find(x => x.id === a.id);
        if (made) return toLocal(made, 0);
      }
      const made = await account.request('POST', '/v1/profiles', { json: toCloud(a) });
      if (!isAlias(made)) return a;
      this.seeded = true;
      return toLocal(made, 0);
    },
    update: async (a: Alias): Promise<Alias> => {
      if (!account.signedIn || !this.seeded || await this.off()) return a;
      const r = await account.request('PATCH', '/v1/profiles/' + encodeURIComponent(a.id), { json: toCloud(a) });
      return isAlias(r) ? toLocal(r, 0) : a;
    },
    remove: async (id: string): Promise<void> => {
      if (!account.signedIn || !this.seeded || await this.off()) return;
      await account.request('DELETE', '/v1/profiles/' + encodeURIComponent(id)).catch(e => { if ((e as { status?: number }).status !== 404) throw e; });
    },
  };
}

export const profiles = new Profiles();
lib.aliasCloud = profiles.cloud;
account.onProfiles(() => void profiles.refresh());
const prevSignedIn = account.onSignedIn;
account.onSignedIn = () => { prevSignedIn?.(); void profiles.refresh(); };
if (typeof window !== 'undefined') {
  // Whenever a GLUE folder opens, or the profile screen shows, signed in.
  $effect.root(() => { $effect(() => { void account.signedIn; void lib.homeName; if (lib.phase === 'profiles' || lib.phase === 'library') void profiles.refresh(); }); });
}
