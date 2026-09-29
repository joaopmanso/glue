/* When a shared collection's changes go up to GLUE Cloud (ADR 0105). Every push rewrites whole files
   (a shard of up to a few hundred songs) and each costs the database a few written rows, so a library
   being analysed (every song's shard changes, over and over) mustn't push each batch:
   - nothing analysing: everything that changed, at once;
   - analysing: the files the user edited (a rating, a playlist) at once, and the rest at most once
     every `every` (an hour); what's left goes when the analysis ends. */
export const PUSH_BUSY_EVERY = 60 * 60e3;

export type PushPlan = 'all' | 'none' | Set<string>;

export class PushPace {
  private last = 0;
  private edits = new Set<string>();
  constructor(private every = PUSH_BUSY_EVERY) {}
  /** Files the user changed (paths in the collection's folder: tracks/ab.json, lists/<id>.json…). */
  edited(paths: string[]) { for (const p of paths) this.edits.add(p); }
  /** What to send now: everything, only the edited files, or nothing yet. */
  plan(now: number, busy: boolean): PushPlan {
    if (!busy || now - this.last >= this.every) return 'all';
    return this.edits.size ? new Set(this.edits) : 'none';
  }
  /** Sent as planned. */
  pushed(now: number, plan: PushPlan) {
    if (plan === 'all') { this.last = now; this.edits.clear(); }
    else if (plan !== 'none') for (const p of plan) this.edits.delete(p);
  }
}
