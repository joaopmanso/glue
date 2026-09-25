/* Stem separation controller: talks to stems.worker, keeps the result, mixes selections. */
import type { StemReply, StemRequest } from '../workers/stems.worker';
import { LEGACY_MODEL_CACHE, MODEL_CACHE, MODEL_SIZE, MODEL_URL, ORT_URL, STEM_SR, STEMS } from '../core/stems/constants';
import { encodeWav } from '../core/formats/wav';
import { fmtEta } from '../core/format';
import { decodeAudio } from './analysis';
import { readPref, writePref } from './prefs';
import { STEM_STRIDE } from '../core/stems/constants';

type Phase = 'idle' | 'busy' | 'ready';
const HINT = 'Split into drums, bass, other and vocals with HT-Demucs, right here in your browser.';

class Stems {
  phase = $state<Phase>('idle');
  status = $state('');
  p = $state<number | null>(null);
  hint = $state(HINT);
  error = $state('');
  cached = $state(false);
  sel = $state<number[]>([0, 1, 2, 3]);
  data = $state.raw<Float32Array[][] | null>(null);
  ep = '';
  private worker: Worker | null = null;
  private job = 0;
  private waiters = new Map<number, { resolve: (d: StemReply) => void; reject: (e: Error) => void }>();

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('../workers/stems.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<StemReply>) => {
      const d = e.data;
      if (d.job !== this.job) return;   // a reply for a cancelled or superseded run
      if (d.type === 'progress') {
        if (d.stage === 'download') this.setStatus('Downloading the separation model… ' + Math.round(d.got / 1e6) + ' / ' + Math.round(d.total / 1e6) + ' MB', d.got / d.total);
        else if (d.stage === 'prepare') this.setStatus('Preparing the model on your graphics chip…', null);
        else if (d.stage === 'cache') this.setStatus('Loading the saved model…', null);
        else {
          // Remember this computer's speed (after the warm-up chunk) for the estimate shown before a run.
          if (d.perChunk) writePref('stemSecPerChunk', d.perChunk.toFixed(1));
          const left = d.perChunk ? d.perChunk * (d.n - d.i) : d.i ? d.elapsed / d.i * (d.n - d.i) : 0;
          this.setStatus('Separating on ' + d.label + ' · chunk ' + (d.i + 1) + ' of ' + d.n + (left ? ' · about ' + fmtEta(left) + ' left' : ''), d.i / d.n);
        }
        return;
      }
      const wt = this.waiters.get(d.job);
      if (!wt) return;
      this.waiters.delete(d.job);
      if (d.type === 'error') wt.reject(new Error(d.message)); else wt.resolve(d);
    };
    w.onerror = e => {
      e.preventDefault();
      for (const wt of this.waiters.values()) wt.reject(new Error(e.message || 'the separation worker stopped'));
      this.waiters.clear();
      this.worker = null;
    };
    this.worker = w;
    return w;
  }
  private call(msg: StemRequest, transfer: Transferable[] = []): Promise<StemReply> {
    return new Promise((resolve, reject) => {
      this.waiters.set(msg.job, { resolve, reject });
      this.getWorker().postMessage(msg, transfer);
    });
  }
  private setStatus(text: string, p: number | null) { this.status = text; this.p = p; }
  /** Told when a separation starts and ends (the library pauses background analysis meanwhile). */
  onBusy: ((busy: boolean) => void) | null = null;
  /** How long separating `seconds` of audio takes on this computer, from the last run; null before one. */
  estimate(seconds: number): number | null {
    const per = Number(readPref('stemSecPerChunk', '0'));
    return per > 0 && seconds > 0 ? per * Math.max(1, Math.ceil(seconds * STEM_SR / STEM_STRIDE)) : null;
  }

  async refreshCached() {
    try {
      for (const name of [MODEL_CACHE, LEGACY_MODEL_CACHE]) if (await (await caches.open(name)).match(MODEL_URL)) { this.cached = true; return; }
    } catch { /* no Cache Storage */ }
    this.cached = false;
  }

  reset() {
    this.cancel(true);
    this.data = null; this.sel = [0, 1, 2, 3]; this.phase = 'idle'; this.error = '';
    void this.refreshCached();
  }

  cancel(silent = false) {
    if (this.phase !== 'busy') return;
    const job = this.job;
    this.worker?.postMessage({ type: 'cancel', job } satisfies StemRequest);
    this.job++;   // ignore anything still in flight for the old run
    const wt = this.waiters.get(job);
    if (wt) { this.waiters.delete(job); wt.reject(new Error('cancelled')); }
    if (!silent) this.setStatus('Stopping…', null);
  }

  async run(source: Blob, isCurrent: () => boolean) {
    if (this.phase === 'busy') return;
    const job = ++this.job;
    this.phase = 'busy'; this.error = '';
    this.onBusy?.(true);
    this.setStatus('Loading the separation engine…', null);
    const stillMine = () => { if (job !== this.job || !isCurrent()) throw new Error('cancelled'); };
    try {
      // Ask once for persistent storage so the browser doesn't evict the cached model under pressure.
      try { await navigator.storage?.persist?.(); } catch { /* not granted: still works */ }
      const init: StemRequest = {
        type: 'init', job, ortUrl: ORT_URL, modelUrl: MODEL_URL, cacheNames: [MODEL_CACHE, LEGACY_MODEL_CACHE], size: MODEL_SIZE,
        device: readPref('stemDevice', 'auto'), threads: self.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1,
      };
      let r = await this.call(init);
      stillMine();
      if (r.type === 'ready') this.ep = r.ep;
      this.setStatus('Preparing the audio…', null);
      // The model is bound to 44.1 kHz stereo; the browser resamples while decoding.
      const ab = await decodeAudio(await source.arrayBuffer(), STEM_SR);
      stillMine();
      const L = new Float32Array(ab.getChannelData(0)), R = ab.numberOfChannels > 1 ? new Float32Array(ab.getChannelData(1)) : new Float32Array(L);
      try { r = await this.call({ type: 'run', job, L, R }, [L.buffer, R.buffer]); }
      catch (e) {
        if ((e as Error).message !== 'retry-cpu') throw e;
        await this.call(init);                      // the worker rebuilds on CPU
        const L2 = new Float32Array(ab.getChannelData(0)), R2 = ab.numberOfChannels > 1 ? new Float32Array(ab.getChannelData(1)) : new Float32Array(L2);
        r = await this.call({ type: 'run', job, L: L2, R: R2 }, [L2.buffer, R2.buffer]);
      }
      stillMine();
      if (r.type !== 'done') throw new Error('unexpected reply');
      this.data = r.out; this.sel = [0, 1, 2, 3]; this.phase = 'ready';
      void this.refreshCached();
    } catch (e) {
      if (job === this.job || (e as Error).message !== 'cancelled') console.error(e);
      if (this.phase === 'busy') this.phase = 'idle';
      const m = (e as Error).message;
      this.error = m === 'cancelled' ? '' : stemErrorText(m);
      void this.refreshCached();
    } finally { if (job === this.job || this.phase !== 'busy') this.onBusy?.(false); }
  }

  async forgetModel() {
    try { await caches.delete(MODEL_CACHE); await caches.delete(LEGACY_MODEL_CACHE); } catch { /* nothing to remove */ }
    this.worker?.terminate(); this.worker = null;
    void this.refreshCached();
  }

  /** Click toggles a stem; solo keeps only that one. Never allows an empty selection. */
  toggle(i: number, solo: boolean) {
    if (solo) this.sel = [i];
    else if (this.sel.includes(i)) { if (this.sel.length > 1) this.sel = this.sel.filter(x => x !== i); }
    else this.sel = [...this.sel, i].sort();
  }
  mix(idx: number[]): Float32Array[] {
    const d = this.data!, n = d[0][0].length, L = new Float32Array(n), R = new Float32Array(n);
    for (const i of idx) { const [a, b] = d[i]; for (let k = 0; k < n; k++) { L[k] += a[k]; R[k] += b[k]; } }
    return [L, R];
  }
  /** What the player should play for the current selection (null = the original file). */
  selectionBlob(): Blob | null {
    if (!this.data || this.sel.length === 4 || this.sel.length === 0) return null;
    return encodeWav(this.mix(this.sel), STEM_SR, 16);
  }
  stemBlob(i: number): Blob { return encodeWav(this.data![i], STEM_SR, 24); }
  selectionDownload(): { blob: Blob; label: string } {
    const idx = [...this.sel].sort();
    return { blob: encodeWav(this.mix(idx), STEM_SR, 24), label: idx.length === 4 ? 'Stems mix' : idx.map(i => STEMS[i].name).join(' + ') };
  }
}

function stemErrorText(m: string): string {
  if (m === 'no-gpu') return 'Stem separation needs a browser with WebGPU on a real graphics chip: current Chrome, Edge or Safari, or Firefox 141+ on Windows. This browser doesn’t offer one.';
  if (/memory|allocation|bad_alloc|OOM/i.test(m)) return 'The graphics chip ran out of memory for the model. Close other tabs or apps and try again.';
  if (/Failed to fetch|NetworkError|Load failed|download/i.test(m)) return 'Couldn’t download the separation model (' + m + '). Check the connection and try again. Some hosts, like the claude.ai preview, block the download; the deployed site doesn’t.';
  if (/import|module|script/i.test(m)) return 'Couldn’t load the separation engine: this page’s host blocks it (the claude.ai preview does). Open the deployed site instead.';
  return 'Stem separation failed: ' + m;
}

export const stems = new Stems();
export { STEMS };
