/* Hash routes: #/ library (#/<view>: the view shown, view.svelte `viewHash`; #/ alone: as it was) · #/track/<id> track detail (…/prepare: its Prepare tab) · #/events the calendar
   (#/events/<id> an event, ADR 0074) · #/analyze analyse a single file · #/admin admin panel. */
import { readPref, writePref } from './prefs';
export type TrackTab = 'details' | 'prepare';
export type Route = { name: 'library'; path: string } | { name: 'track'; id: string; tab: TrackTab } | { name: 'events' } | { name: 'event'; id: string } | { name: 'analyze' } | { name: 'admin' } | { name: 'help'; id: string | null };

function parse(h: string): Route {
  const m = /^#\/track\/([\w-]+)(\/prepare)?/.exec(h);
  if (m) return { name: 'track', id: m[1], tab: m[2] ? 'prepare' : 'details' };
  const ev = /^#\/events(?:\/([\w-]+))?/.exec(h);
  if (ev) return ev[1] ? { name: 'event', id: ev[1] } : { name: 'events' };
  if (h.startsWith('#/analyze')) return { name: 'analyze' };
  if (h.startsWith('#/admin')) return { name: 'admin' };
  const help = /^#\/help(?:\/([\w-]+))?/.exec(h);
  if (help) return { name: 'help', id: help[1] ?? null };
  return { name: 'library', path: h.replace(/^#\/?/, '') };
}

class Router {
  current = $state<Route>(parse(typeof location !== 'undefined' ? location.hash : ''));
  /** The song's sheet open now was opened from the library in this tab: closing it is a step back (one step: moving
      between songs and tabs in it replaces the address). */
  fromLibrary = false;
  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('hashchange', () => {
      const next = parse(location.hash);
      this.fromLibrary = next.name === 'track' && (this.current.name === 'library' || (this.current.name === 'track' && this.fromLibrary));
      this.current = next;
    });
  }
  go(hash: string) { if (location.hash !== hash) location.hash = hash; else this.current = parse(hash); }
  /** This address instead of the current one (no step in the browser's history). */
  replace(hash: string) { if (location.hash !== hash) { history.replaceState(history.state, '', hash); this.current = parse(hash); } }
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
