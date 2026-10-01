/* Gluey (ADR 0126): the tours and what he has shown. A person meets the first tour once, on their first login, not on
   each device: what was seen is kept in the browser, the GLUE folder (every browser on the computer) and the account
   (every device), and the union of the three is the truth. */
import { lib } from './library.svelte';
import { account } from './account.svelte';
import { router, trackHref } from './route.svelte';
import { view } from './view.svelte';
import { phone } from './phone.svelte';
import { readPref, writePref } from './prefs';
import { emptyGuide, guideAdds, mergeGuide, type GuideState } from '../core/guide/state';
import { tourById, type Go, type Tour } from '../core/guide/tours';

/** Libraries and accounts from before Gluey (2026-10-01) meet him with an offer, not a tour that starts by itself. */
const GLUEY_SINCE = Date.parse('2026-10-01T00:00:00Z');

function readLocal(): GuideState {
  try { return mergeGuide(JSON.parse(readPref('guide', 'null'))); } catch { return emptyGuide(); }
}

class Guide {
  state = $state<GuideState>(readLocal());
  /** The tour running, and its stop. */
  running = $state<{ tour: Tour; step: number } | null>(null);
  /** "New: I can show you around" (someone who used GLUE before Gluey). */
  offer = $state(false);
  /** Gluey's panel (the tours; the help centre). */
  panel = $state(false);
  /** Tests turn the automatic first tour off (e2e/launch.ts); tours still run when asked. */
  private get automatic() { return typeof window === 'undefined' || !(window as unknown as { __glueNoGuide?: boolean }).__glueNoGuide; }

  seen(id: string) { return this.state.seen.includes(id); }

  /** The three stores read again and merged; each that lacks something gets it. */
  async sync() {
    const home = lib.home && !lib.readOnly ? lib.home : null, user = account.signedIn ? account.user : null;
    const all = mergeGuide(this.state, readLocal(), lib.home?.index.guide, user?.guide);
    this.state = all;
    writePref('guide', JSON.stringify(all));
    if (home && guideAdds(mergeGuide(home.index.guide), all)) await home.setGuide(all).catch(() => {});
    if (user && guideAdds(mergeGuide(user.guide), all)) await account.addGuide(all).catch(() => {});
  }
  /** Something seen (a tour, a tip), kept everywhere. */
  mark(patch: Partial<GuideState>) {
    this.state = mergeGuide(this.state, patch);
    void this.sync();
  }

  private welcomed = false;
  /** The library is on screen: the first tour, once per person (after the account has said what it knows). */
  async welcome() {
    if (this.welcomed || !this.automatic || this.running) return;
    this.welcomed = true;
    await this.sync();
    if (this.seen('welcome')) return;
    const created = Date.parse(lib.store?.meta.createdAt ?? '') || Date.now();
    const userSince = account.signedIn ? account.user?.createdAt ?? Date.now() : Date.now();
    if (created < GLUEY_SINCE || userSince < GLUEY_SINCE) { this.offer = true; return; }
    this.start(phone.active ? 'welcome-phone' : 'welcome');
  }
  /** The offer answered: the tour now, or never by itself. */
  answerOffer(show: boolean) {
    this.offer = false;
    if (show) this.start(phone.active ? 'welcome-phone' : 'welcome');
    else this.mark({ seen: ['welcome', 'welcome-phone'] });
  }

  start(id: string) {
    const tour = tourById(id);
    if (!tour) return;
    this.panel = false; this.offer = false;
    this.running = { tour, step: 0 };
    this.go(tour.steps[0]?.go);
  }
  next() { this.to(+1); }
  back() { this.to(-1); }
  private to(d: number) {
    const r = this.running;
    if (!r) return;
    const step = r.step + d;
    if (step < 0) return;
    if (step >= r.tour.steps.length) { this.end(); return; }
    this.running = { tour: r.tour, step };
    this.go(r.tour.steps[step].go);
  }
  /** A stop whose target isn't there and may be left out: the next one (or the one before, going back). */
  skipMissing(back = false) { this.to(back ? -1 : +1); }
  /** Finished or stopped: seen either way (the phone's first tour counts as the first tour). */
  end() {
    const r = this.running;
    this.running = null;
    if (!r) return;
    this.mark({ seen: r.tour.id === 'welcome' || r.tour.id === 'welcome-phone' ? ['welcome', 'welcome-phone'] : [r.tour.id] });
  }

  private go(g: Go | undefined) {
    if (!g) return;
    if ('route' in g) router.go(g.route);
    else if ('view' in g) { router.go('#/'); view.select({ kind: g.view }); }
    else if ('song' in g) {
      const s = lib.store;
      const first = s ? [...s.tracks.values()].find(t => t.status === 'linked' && !t.remote) : null;
      if (first) router.go(trackHref(first.id));
    }
  }
}

export const guide = new Guide();
