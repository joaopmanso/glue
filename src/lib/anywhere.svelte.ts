/* GLUE on a device without a library of its own (a phone, someone else's computer), signed in (ADR 0077,
   the user's list 2026-09-28): the account's library opens by itself, from GLUE Cloud. Nothing is made on
   the device: no GLUE folder, no collection. Its songs stream from the computers that have them, and
   playlist, tag and rating edits go to those computers (ADR 0040).

   "No library of its own": no GLUE folder chosen (the start page), or only an empty one in the browser's
   storage (made before this existed). The collection opened is the one opened last here, else the
   biggest merged collection, else the biggest collection of any device. */
import { lib } from './library.svelte';
import { account } from './account.svelte';
import { sync, type Group, type Member } from './sync.svelte';
import { readPref } from './prefs';

class Anywhere {
  /** Opening now (the start page says so). */
  opening = $state('');
  private tried = false;

  constructor() {
    $effect.root(() => {
      $effect(() => {
        void lib.phase; void account.signedIn; void sync.remote; void lib.version;
        this.check();
      });
    });
  }

  /** This device has no library of its own. */
  private bare() {
    if (lib.cloud) return false;
    if (lib.phase === 'welcome') return true;
    // An empty library in the browser's own storage (a phone that started one before) doesn't count.
    if (lib.homeKind !== 'private') return false;
    const profiles = lib.home?.index.profiles.length ?? 0;
    if (lib.phase === 'profiles') return profiles === 0;
    return lib.phase === 'library' && profiles <= 1 && !!lib.store && lib.store.tracks.size === 0;
  }

  private check() {
    if (this.tried || !account.signedIn || !this.bare()) return;
    if (!sync.remote.length) { if (!sync.loading) void sync.refresh().catch(() => {}); return; }
    const pick = this.choose();
    if (!pick) return;
    this.tried = true;
    this.opening = 'Opening your library from GLUE Cloud…';
    void (pick.group ? sync.openGroup(pick.group) : sync.openDevice(pick.member!))
      .catch(e => { lib.notice = 'Couldn’t open your library from GLUE Cloud: ' + (e as Error).message; })
      .finally(() => { this.opening = ''; });
  }

  private choose(): { group?: Group; member?: Member } | null {
    const last = readPref('cloudLibrary', '');
    const size = (m: Member) => sync.remote.find(r => r.device.id === m.device && r.profile.id === m.profile)?.stats?.collections?.find(c => c.id === m.collection)?.tracks ?? 0;
    const g = sync.groups.find(x => 'g:' + x.id === last) ?? [...sync.groups].sort((a, b) => b.members.reduce((n, m) => n + size(m), 0) - a.members.reduce((n, m) => n + size(m), 0))[0];
    if (g && (last === '' || last === 'g:' + g.id || !last.startsWith('d:'))) return { group: g };
    const all: Member[] = sync.remote.flatMap(r => (r.stats?.collections ?? []).map(c => ({ device: r.device.id, profile: r.profile.id, collection: c.id })));
    const key = (m: Member) => 'd:' + m.device + '/' + m.profile + '/' + m.collection;
    const m = all.find(x => key(x) === last) ?? all.sort((a, b) => size(b) - size(a))[0];
    return m ? { member: m } : g ? { group: g } : null;
  }

}

export const anywhere = new Anywhere();
