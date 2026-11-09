/* Diagnostics (ADR 0060, through window.__gluePerf with ?perf): a file decoded by the worker and by
   the page, compared. They must be the same samples, trimmed the same way. */
import { NeedsPageDecode, decodedByWorker, pageJob } from './analysis';

export async function decodeCheck(url: string) {
  const blob = await (await fetch(url)).blob(), file = new File([blob], url.split('/').pop() ?? 'file');
  let w;
  try { w = await decodedByWorker(file); }
  catch (e) { if (e instanceof NeedsPageDecode) return { worker: 'page decode' as const }; throw e; }
  if (w.type !== 'float') return { worker: w.type };
  const p = await pageJob(file);
  if (p.type !== 'float') return { worker: 'float', page: p.type };
  // The largest difference with the page's samples `lag` frames later than the worker's (page[i] against worker[i + lag]);
  // `upTo` frames of each channel looked at (all by default).
  const diff = (lag: number, upTo = Infinity) => {
    let m = 0;
    const n = Math.min(w.channels[0].length - Math.max(0, lag), p.channels[0].length + Math.min(0, lag), upTo);
    for (let c = 0; c < Math.min(w.channels.length, p.channels.length); c++) {
      const a = w.channels[c], b = p.channels[c];
      for (let i = Math.max(0, -lag); i < n; i++) { const d = Math.abs(a[i + lag] - b[i]); if (d > m) m = d; }
    }
    return m;
  };
  const maxDiff = diff(0);
  // Not the same: the same samples a little apart? (Edge 156 trims WebM Opus's start 24 frames more than FFmpeg and
  // the worker, 2026-11-09.) The best start within 1 ms, found on the first 2 s, then checked on all of it.
  let lag = 0, maxDiffAligned = maxDiff;
  if (maxDiff > 1e-6) {
    const most = Math.round(w.sr / 1000);
    let best = Infinity;
    for (let l = -most; l <= most; l++) { const d = diff(l, w.sr * 2); if (d < best) { best = d; lag = l; } }
    maxDiffAligned = diff(lag);
  }
  return { worker: 'float', sr: [w.sr, p.sr], frames: [w.channels[0].length, p.channels[0].length], channels: [w.channels.length, p.channels.length], maxDiff, lag, maxDiffAligned };
}
