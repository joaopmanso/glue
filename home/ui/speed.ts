/* How fast GLUE Home analyses, and what might make it faster (ADR 0136). Pure: the analysis loop records a sample per
   song; GLUE Home's window shows the numbers and a suggestion. The user tunes "Songs at a time" and "From each network
   folder at a time" by these, rather than GLUE Home guessing from one computer (2026-10-01). */

/** One song analysed: when, its size, how long reading it took, and analysing it; from a network folder or not. */
export interface Sample { at: number; bytes: number; readMs: number; analyseMs: number; net: boolean }
export interface Speed {
  /** Songs analysed a minute, over the last two minutes. */
  perMin: number;
  /** MB read a second, from this computer's drives and from network folders. */
  localMBs: number; netMBs: number;
  /** A song's average time reading (this computer's drives, network folders) and analysing, ms. */
  localReadMs: number; netReadMs: number; analyseMs: number;
  songs: number; netSongs: number;
  /** Songs a minute over the last ten minutes, in half-minute steps, oldest first (the window's little chart). */
  history: number[];
}

export const WINDOW = 120_000;
/** What the history keeps: ten minutes, in 20 steps. */
export const HISTORY = 600_000, STEPS = 20;

/** Songs a minute in each half minute of the last ten, oldest first. */
export function historyOf(samples: readonly Sample[], now: number): number[] {
  const step = HISTORY / STEPS, out = new Array<number>(STEPS).fill(0);
  for (const x of samples) { const i = STEPS - 1 - Math.floor((now - x.at) / step); if (i >= 0 && i < STEPS) out[i] += 60_000 / step; }
  return out;
}

export function speedOf(samples: readonly Sample[], now: number, windowMs = WINDOW): Speed | null {
  const s = samples.filter(x => now - x.at <= windowMs);
  if (!s.length) return null;
  // Over the time they cover (at least 10 s, so a first song doesn't read as hundreds a minute), at most the window.
  const span = Math.max(10_000, Math.min(windowMs, now - Math.min(...s.map(x => x.at - x.readMs - x.analyseMs))));
  const net = s.filter(x => x.net), local = s.filter(x => !x.net);
  const avg = (xs: readonly Sample[], f: (x: Sample) => number) => xs.length ? xs.reduce((a, x) => a + f(x), 0) / xs.length : 0;
  const mbs = (xs: readonly Sample[]) => xs.reduce((a, x) => a + x.bytes, 0) / 1e6 / (span / 1000);
  return {
    perMin: s.length / (span / 60_000), localMBs: mbs(local), netMBs: mbs(net),
    localReadMs: avg(local, x => x.readMs), netReadMs: avg(net, x => x.readMs), analyseMs: avg(s, x => x.analyseMs),
    songs: s.length, netSongs: net.length, history: historyOf(samples, now),
  };
}

/** A suggestion from the numbers, or '' when nothing stands out. `netCap` 0: no limit. */
export function suggest(sp: Speed | null, o: { atOnce: number; cores: number; netCap: number }): string {
  if (!sp || sp.songs < 5) return '';
  if (sp.netSongs >= 3 && sp.netReadMs > 2 * sp.analyseMs && (o.netCap === 0 || o.netCap > 4))
    return 'Songs on network folders spend most of their time being read: fewer at once from each network folder (try 4) leaves places for songs on this computer’s drives.';
  const reading = Math.max(sp.localReadMs, sp.netReadMs);
  if (sp.analyseMs >= reading && o.atOnce < o.cores) return 'The processor has room: try ' + o.cores + ' at a time.';
  if (sp.analyseMs >= reading && o.atOnce > o.cores * 1.5) return 'More at a time than this computer has processors (' + o.cores + '): ' + o.cores + ' may be as fast, and leaves the computer freer.';
  return '';
}
