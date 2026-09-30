/* The account's profiles: its artist aliases, the same list on every device (ADR 0113, 0114). The GLUE folder
   keeps a copy (mco.json `aliases`) for when it's offline.
   - The account's list is every device's: signed in, a device sends the aliases it has that the account doesn't
     (with their ids), and takes the account's. Two of the same name both stay: the user deletes what they
     don't want.
   - One deleted on any device is gone for all (the account remembers it, `gone`): a device that still has it
     drops it and never sends it again.
   - Each device keeps its own choice of alias (mco.json `lastAlias`); one deleted elsewhere: the only one left,
     else "Who's using GLUE?" asks.
   - Made, renamed and deleted in GLUE Cloud first; other devices hear of it at once. "Just this computer"
     (ADR 0092) keeps its profiles to itself. */
import { account } from './account.svelte';
import { lib } from './library.svelte';
import { PROFILE_COLORS, type Alias } from '../store/types';

interface CloudAlias { id: string; name: string; color: string | null; bpmRange: 'half' | 'full' | null }
const toLocal = (c: CloudAlias, i: number): Alias => ({ id: c.id, name: c.name, color: c.color ?? PROFILE_COLORS[i % PROFILE_COLORS.length], ...(c.bpmRange ? { bpmRange: c.bpmRange } : {}) });
const toCloud = (a: Alias) => ({ id: a.id, name: a.name, color: a.color, bpmRange: a.bpmRange ?? null });
type Listed = { profiles: CloudAlias[]; gone: string[] };
/** Only what's a list of aliases (a GLUE Cloud from before them answers something else, or nothing). */
const isAlias = (c: unknown): c is CloudAlias => !!c && typeof (c as CloudAlias).id === 'string' && typeof (c as CloudAlias).name === 'string' && !!(c as CloudAlias).name.trim();
const listed = (r: unknown): Listed | null => {
  const l = r as Partial<Listed> | null;
  return l && Array.isArray(l.profiles) ? { profiles: l.profiles.filter(isAlias), gone: Array.isArray(l.gone) ? l.gone.filter(x => typeof x === 'string') : [] } : null;
};

class Profiles {
  private running: Promise<void> | null = null;

  /** The account's list, asked for again (one request at a time). */
  refresh(): Promise<void> { return (this.running ??= this.once().finally(() => { this.running = null; })); }

  /** The library's cloud sync is off ("Just this computer", ADR 0092): its profiles stay here too. */
  private async off() {
    const c = lib.home?.index.container;
    return !!c && (await lib.profileInfo(c)?.catch(() => null))?.cloudSync === false;
  }

  private async once() {
    if (!account.signedIn || !lib.home || await this.off()) return;
    const r0 = listed(await account.request('GET', '/v1/profiles').catch(() => null));
    if (!r0) return;
    // This device's aliases the account doesn't have (and never deleted): the account's too.
    const known = new Set([...r0.profiles.map(p => p.id), ...r0.gone]);
    const mine = lib.home.aliases.filter(a => !known.has(a.id));
    const r = mine.length ? listed(await account.request('POST', '/v1/profiles/merge', { json: { profiles: mine.map(toCloud) } }).catch(() => null)) ?? r0 : r0;
    await this.adopt(r.profiles.map(toLocal));
  }

  /** The account's list, here; the alias in use follows it (deleted elsewhere: the only one left, else asked). */
  private async adopt(list: Alias[]) {
    const cur = lib.alias;
    await lib.takeAliases(list);
    if (!cur || lib.alias) return;
    if (list.length === 1) { lib.alias = list[0]; if (!lib.readOnly) await lib.home?.setLastAlias(list[0].id); }
    else if (lib.phase === 'library') lib.switchProfile();
  }

  /** Made, changed or deleted in the account first (signed in); else only here (sent when it signs in). */
  readonly cloud = {
    create: async (a: Alias): Promise<Alias> => {
      if (!account.signedIn || await this.off()) return a;
      const made = await account.request('POST', '/v1/profiles', { json: toCloud(a) });
      return isAlias(made) ? toLocal(made, 0) : a;
    },
    update: async (a: Alias): Promise<Alias> => {
      if (!account.signedIn || await this.off()) return a;
      const r = await account.request('PATCH', '/v1/profiles/' + encodeURIComponent(a.id), { json: toCloud(a) }).catch(e => { if ((e as { status?: number }).status === 404) return null; throw e; });
      return isAlias(r) ? toLocal(r, 0) : a;
    },
    remove: async (id: string): Promise<void> => {
      if (!account.signedIn || await this.off()) return;
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
