/* GLUE on a device without a library of its own (a phone, someone else's computer), signed in (ADR 0077,
   0101): the account's collections open by themselves. They're kept in the browser's own storage (a GLUE
   folder there, made for it), opened and edited there, and synced like on any device. Songs stream from
   the computers that have them. The device stays a session, not one of the account's devices (ADR 0091).

   "No library of its own": no GLUE folder chosen (the start page), or only an empty one in the browser's
   storage. The collection opened is the one opened last here, else the biggest. */
import { lib } from './library.svelte';
import { account } from './account.svelte';
import { shared } from './shared.svelte';
import { homeMode } from '../platform';

class Anywhere {
  /** Opening now (the start page says so). */
  opening = $state('');
  private tried = false;

  constructor() {
    $effect.root(() => {
      $effect(() => {
        void lib.phase; void account.signedIn; void shared.list; void lib.version;
        void this.check();
      });
    });
  }

  /** This device has no library of its own. */
  private bare() {
    // A computer whose GLUE Home keeps its library: that's its library (ADR 0108).
    if (homeMode()) return false;
    if (lib.phase === 'welcome') return true;
    if (lib.homeKind !== 'private') return false;
    const profiles = lib.home?.index.profiles.length ?? 0;
    if (lib.phase === 'profiles') return profiles === 0;
    const p = lib.profile, here = new Set(shared.list.map(c => c.id));
    return lib.phase === 'library' && profiles <= 1 && !!p && p.collections.every(c => !here.has(c.id)) && !!lib.store && lib.store.tracks.size === 0;
  }

  private async check() {
    if (this.tried || !account.signedIn || !this.bare()) return;
    if (!shared.list.length) { void shared.refreshList(); return; }
    this.tried = true;
    this.opening = 'Opening your library…';
    shared.hold = true;
    try {
      if (lib.phase === 'welcome') await lib.usePrivateHome();
      if (!lib.profile) {
        const ps = lib.home?.index.profiles ?? [];
        if (ps[0]) await lib.openProfile(ps[0].id);
        else await lib.createProfile(account.user?.name || 'My library');
        lib.onboarding = null;
      }
      const p = lib.profile;
      if (!p) return;
      // Every collection of the account, the biggest opened (joining opens it).
      const empty = p.collections.filter(c => !shared.list.some(x => x.id === c.id)).map(c => c.id);
      const order = [...shared.list].sort((a, b) => (b.stats?.tracks ?? 0) - (a.stats?.tracks ?? 0));
      for (const c of [...order].reverse()) if (!lib.profile?.collections.some(x => x.id === c.id)) await shared.join(c.id);
      // The empty collection a new profile starts with isn't needed.
      for (const cid of empty) if (lib.store?.meta.id !== cid) await lib.deleteCollection(cid).catch(() => {});
      if (order[0] && lib.store?.meta.id !== order[0].id) await lib.openCollection(order[0].id);
    } catch (e) { lib.notice = 'Couldn’t open your library: ' + (e as Error).message; }
    finally { this.opening = ''; shared.hold = false; }
  }
}

export const anywhere = new Anywhere();
