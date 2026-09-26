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
  let maxDiff = 0;
  const n = Math.min(w.channels[0].length, p.channels[0].length);
  for (let c = 0; c < Math.min(w.channels.length, p.channels.length); c++) {
    const a = w.channels[c], b = p.channels[c];
    for (let i = 0; i < n; i++) { const d = Math.abs(a[i] - b[i]); if (d > maxDiff) maxDiff = d; }
  }
  return { worker: 'float', sr: [w.sr, p.sr], frames: [w.channels[0].length, p.channels[0].length], channels: [w.channels.length, p.channels.length], maxDiff };
}
