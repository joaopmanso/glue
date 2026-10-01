/* At most `max` at a time, the user's first (ADR 0138). A browser keeps 6 connections to 127.0.0.1: background requests
   to GLUE Home (its analyses' results, rows' pictures) took them all while GLUE Home was busy, and a song clicked
   waited behind them, the old one still playing (2026-10-01). Background goes through a gate that leaves the rest
   for what the user asks for; a user's request in the gate goes first. */

export class Gate {
  private running = 0;
  private high: (() => void)[] = [];
  private low: (() => void)[] = [];
  constructor(readonly max: number) {}

  async run<T>(f: () => Promise<T>, first = false): Promise<T> {
    // A place handed over by one finishing is this one's already (not counted again).
    if (this.running >= this.max) await new Promise<void>(go => (first ? this.high : this.low).push(go));
    else this.running++;
    try { return await f(); }
    finally {
      const next = this.high.shift() ?? this.low.shift();
      if (next) next(); else this.running--;
    }
  }
  /** Waiting now (for tests and the perf panel). */
  get waiting() { return this.high.length + this.low.length; }
}
