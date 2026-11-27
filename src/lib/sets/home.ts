/* A set mixed by this computer's GLUE Home (ADR 0204): when it runs and has every song's file, it mixes (its engine
   runs the website's mixer, ported: crates/glue-sets) and streams the mix over the local link (`/set/<id>/pcm`, stereo
   f32 at 44.1 kHz); the tab only plays it, or writes it into the file. Otherwise the browser mixes, as before. */
import { lib } from '../library.svelte';
import { engineClient } from '../engine.svelte';
import { localHome } from '../localHome.svelte';
import type { SetPlan } from '../../core/sets/types';

export interface HomeMix {
  /** The stream of the mix: this address with `&from=<frame>`. */
  base: string;
  /** The mix's length (frames). */
  length: number;
}

/** One session with GLUE Home for a set: opened for a plan, kept to it as it changes, let go. */
export class HomeSet {
  private id: string | null = null;
  private sent: SetPlan | null = null;
  private length = 0;
  /** Why GLUE Home isn't mixing this set (songs it has no file for), or ''. */
  why = '';

  /** GLUE Home mixing this plan, or null (no GLUE Home here, or a song it can't reach: the browser mixes). */
  async ready(plan: SetPlan): Promise<HomeMix | null> {
    if (!lib.homeRuns() || !localHome.link) { await this.close(); return null; }
    const snap = JSON.parse(JSON.stringify(plan)) as SetPlan;
    try {
      if (this.id && this.sent !== plan) {
        const r = await engineClient.setPlan(this.id, snap).catch(() => null);
        if (r) { this.sent = plan; this.length = r.length; }
        else this.id = null;   // gone (GLUE Home restarted): opened again
      }
      if (!this.id) {
        const r = await engineClient.setOpen(snap);
        if (r.missing.length) {
          await engineClient.setClose(r.id);
          const t = lib.store?.tracks.get(r.missing[0].id);
          this.why = (t ? '“' + (t.title || t.fileName) + '”' : 'A song') + (r.missing.length > 1 ? ' and ' + (r.missing.length - 1) + ' more aren’t' : ' isn’t') + ' on this computer for GLUE Home: mixed here instead.';
          return null;
        }
        this.id = r.id; this.sent = plan; this.length = r.length; this.why = '';
      }
    } catch { return null; }
    const id = this.id!;
    return { length: this.length, base: localHome.playUrl('/set/' + id + '/pcm') };
  }

  async close() { const id = this.id; this.id = null; this.sent = null; if (id) await engineClient.setClose(id); }
}
