/* Hash routes: #/ library · #/track/<id> track detail (…/prepare: its Prepare tab) · #/analyze analyse a single file · #/admin admin panel. */
import { readPref, writePref } from './prefs';
export type TrackTab = 'details' | 'prepare';
export type Route = { name: 'library' } | { name: 'track'; id: string; tab: TrackTab } | { name: 'analyze' } | { name: 'admin' };

function parse(h: string): Route {
  const m = /^#\/track\/([\w-]+)(\/prepare)?/.exec(h);
  if (m) return { name: 'track', id: m[1], tab: m[2] ? 'prepare' : 'details' };
  if (h.startsWith('#/analyze')) return { name: 'analyze' };
  if (h.startsWith('#/admin')) return { name: 'admin' };
  return { name: 'library' };
}

class Router {
  current = $state<Route>(parse(typeof location !== 'undefined' ? location.hash : ''));
  constructor() { if (typeof window !== 'undefined') window.addEventListener('hashchange', () => { this.current = parse(location.hash); }); }
  go(hash: string) { if (location.hash !== hash) location.hash = hash; else this.current = parse(hash); }
}
export const router = new Router();

/** The track page's tab used last: opening a song goes back to it (Prepare stays the default until
    Details is chosen again; the user's list, 2026-09-27). */
class TrackTabs {
  last = $state<TrackTab>(readPref('trackTab', 'details') === 'prepare' ? 'prepare' : 'details');
  set(t: TrackTab) { if (t !== this.last) { this.last = t; writePref('trackTab', t); } }
}
export const trackTab = new TrackTabs();
/** A song's page, on the tab used last (or the one given). */
export const trackHref = (id: string, tab: TrackTab = trackTab.last) => '#/track/' + id + (tab === 'prepare' ? '/prepare' : '');
