/* Songs arriving in GLUE Home's incoming folder (ADR 0048), analysed at once so they're ready when the website shows
   them in TO BE SORTED: made and kept by GLUE Home's engine (`i/<name>.…`, ADR 0147). The rest of GLUE Home's cache
   (the shared songs' mini spectrograms, waveforms, full analyses and covers, ADR 0046, 0082, 0085) is the engine's,
   which answers other devices from it (crates/glue-engine/src/answers.rs, ADR 0156). */
import { bridge } from './bridge';
import { incomingKey } from '../../src/core/transfer';

async function read(rel: string): Promise<Uint8Array | null> { try { return new Uint8Array(await bridge.cacheRead(rel)); } catch { return null; } }

/** Analyse a song that just arrived (or one there without an analysis yet): its summary, mini spectrogram and full
    analysis. */
export async function analyseIncoming(name: string, path: string) {
  if (await read(incomingKey(name, 'summary.json'))) return;
  await bridge.analyseIncoming(name, path);
}
