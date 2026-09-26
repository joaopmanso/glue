/* Editing a constant-tempo beat grid (ADR 0052): first beat \`beat0\` (the earliest at or after 0 s),
   \`bar\` = which of each four beats starts a bar. Every edit keeps the bar lines where the user heard
   them, renumbering the beats when the first one moves past a whole beat. Pure. */
export interface Grid { bpm: number; beat0: number; bar: number }

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** The grid of a tempo whose bar starts at \`t\` (s): "beat 1 here". */
export function anchorAt(t: number, bpm: number): Grid {
  const p = 60 / bpm, beat0 = mod(t, p), n = Math.round((t - beat0) / p);
  return { bpm, beat0, bar: mod(n, 4) };
}

/** The first bar line of a grid (s). */
export const downbeat = (g: Grid) => g.beat0 + g.bar * 60 / g.bpm;

/** Move the grid by \`dt\` seconds (later when positive). */
export function nudge(g: Grid, dt: number): Grid {
  return anchorAt(downbeat(g) + dt, g.bpm);
}

/** Another tempo (a correction, ×2, ÷2), bar lines kept from the first one. */
export function retempo(g: Grid, bpm: number): Grid {
  return anchorAt(downbeat(g), bpm);
}

/** Tap tempo: the BPM of the taps (ms timestamps), once there are enough of them close together. */
export function tapBpm(taps: number[]): number | null {
  if (taps.length < 4) return null;
  const gaps = taps.slice(1).map((t, i) => t - taps[i]);
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return avg > 0 ? 60000 / avg : null;
}
