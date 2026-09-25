/* Hash routes: #/ library · #/track/<id> track detail · #/analyze analyse a single file · #/admin admin panel ·
   #/connect-home sign in and connect GLUE Home (opened by GLUE Home). */
export type Route = { name: 'library' } | { name: 'track'; id: string } | { name: 'analyze' } | { name: 'admin' } | { name: 'connect-home' };

function parse(h: string): Route {
  const m = /^#\/track\/([\w-]+)/.exec(h);
  if (m) return { name: 'track', id: m[1] };
  if (h.startsWith('#/analyze')) return { name: 'analyze' };
  if (h.startsWith('#/admin')) return { name: 'admin' };
  if (h.startsWith('#/connect-home')) return { name: 'connect-home' };
  return { name: 'library' };
}

class Router {
  current = $state<Route>(parse(typeof location !== 'undefined' ? location.hash : ''));
  constructor() { if (typeof window !== 'undefined') window.addEventListener('hashchange', () => { this.current = parse(location.hash); }); }
  go(hash: string) { if (location.hash !== hash) location.hash = hash; else this.current = parse(hash); }
}
export const router = new Router();
