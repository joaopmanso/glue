/* A burst of changes like background analysis makes (ADR 0058): each step stores a track's analysis
   and the track again, as analyseOne does. Reached only through window.__gluePerf.storm (?perf). */
import { lib } from './library.svelte';

export async function storm(n: number, perSecond: number): Promise<number> {
  const s = lib.store;
  if (!s) return 0;
  const ids = [...s.analysis.keys()];
  const every = 1000 / perSecond, t0 = performance.now();
  let done = 0;
  while (done < n && ids.length && lib.store === s) {
    const id = ids[Math.floor(Math.random() * ids.length)];
    const a = s.analysis.get(id), t = s.tracks.get(id);
    if (a) s.putAnalysis(id, { ...a, at: new Date().toISOString() });
    if (t) s.putTrack({ ...t });
    done++;
    await new Promise(r => setTimeout(r, Math.max(0, t0 + done * every - performance.now())));
  }
  return done;
}
