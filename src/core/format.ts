/** Small, pure formatting helpers shared by core and UI. */
export function fmtRate(sr: number): string { return +(sr / 1000).toFixed(2) + ' kHz'; }
export function fmtKHz(hz: number): string { return (hz / 1000).toFixed(1) + ' kHz'; }
export function fmtTime(s: number, frac?: boolean): string {
  const m = Math.floor(s / 60), r = s - m * 60;
  return m + ':' + (frac ? r.toFixed(1).padStart(4, '0') : String(Math.floor(r)).padStart(2, '0'));
}
export function fmtBytes(b: number): string {
  if (!b) return '—';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
  while (b >= 1024 && i < 3) { b /= 1024; i++; }
  return b.toFixed(i ? 1 : 0) + ' ' + u[i];
}
export function fmtDb(v: number): string { return (v < 0 ? '−' : '') + Math.abs(v).toFixed(0) + ' dB'; }
export function fmtEta(s: number): string {
  return s < 60 ? Math.max(1, Math.round(s)) + ' s' : Math.floor(s / 60) + ' min ' + String(Math.round(s % 60)).padStart(2, '0') + ' s';
}
export function niceStep(range: number, maxTicks: number): number {
  const raw = range / Math.max(1, maxTicks), mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
}
export function niceTimeStep(dur: number, maxTicks: number): number {
  for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200]) if (dur / s <= maxTicks) return s;
  return 1800;
}
export function freqLabel(f: number): string { return f === 0 ? '0' : +(f / 1000).toFixed(2) + 'k'; }
