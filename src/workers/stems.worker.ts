/// <reference lib="webworker" />
/* HT-Demucs stem separation on WebGPU: model download + cache, float64 patch, chunked overlap-add. */
import { patchFloat64 } from '../core/stems/patch';
import { STEM_N as N, STEM_OVERLAP as OVERLAP, STEM_STRIDE as STRIDE } from '../core/stems/constants';

export type StemRequest =
  | { type: 'init'; job: number; ortUrl: string; modelUrl: string; cacheNames: string[]; size: number; device: string; threads: number }
  | { type: 'run'; job: number; L: Float32Array; R: Float32Array }
  | { type: 'cancel'; job: number };
export type StemReply =
  | { type: 'progress'; job: number; stage: 'download'; got: number; total: number }
  | { type: 'progress'; job: number; stage: 'prepare' }
  | { type: 'progress'; job: number; stage: 'cache' }
  | { type: 'progress'; job: number; stage: 'run'; i: number; n: number; elapsed: number; ep: string; label: string; perChunk: number | null }
  | { type: 'ready'; job: number; ep: string }
  | { type: 'done'; job: number; out: Float32Array[][] }
  | { type: 'error'; job: number; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
// onnxruntime-web is loaded at runtime from the CDN; typed loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ort: any = null, session: any = null, ep = '', modelBytes: Uint8Array | null = null, gpuName = '';
const cancelled = new Set<number>();
const post = (m: StemReply, t: Transferable[] = []) => scope.postMessage(m, t);
const check = (job: number) => { if (cancelled.has(job)) throw new Error('cancelled'); };

async function gpuUsable(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ isFallbackAdapter?: boolean; info?: Record<string, unknown> } | null> } }).gpu;
    if (!gpu) return false;
    const a = await gpu.requestAdapter();
    if (!a) return false;
    const info = (a.info || {}) as { isFallbackAdapter?: boolean; description?: string; architecture?: string; vendor?: string };
    gpuName = (info.description || [info.vendor, info.architecture].filter(Boolean).join(' ')).trim();
    // A software adapter (SwiftShader) is far slower than anything useful.
    return !((a as { isFallbackAdapter?: boolean }).isFallbackAdapter || info.isFallbackAdapter || /swiftshader|llvmpipe|software/i.test((info.description || '') + (info.architecture || '') + (info.vendor || '')));
  } catch { return false; }
}

async function download(msg: Extract<StemRequest, { type: 'init' }>): Promise<Uint8Array> {
  // The model comes straight from Hugging Face (CORS-enabled) and is kept in Cache Storage.
  let cache: Cache | null = null;
  try { cache = self.caches ? await caches.open(msg.cacheNames[0]) : null; } catch { cache = null; }
  // The legacy Speklone page lives on the same origin (joaopmanso.github.io) and caches the model
  // under its own name: reuse that copy as-is rather than storing 166 MB twice or deleting it.
  for (const name of msg.cacheNames) {
    try {
      const hit = await (await caches.open(name)).match(msg.modelUrl);
      if (hit) { post({ type: 'progress', job: msg.job, stage: 'cache' }); return new Uint8Array(await hit.arrayBuffer()); }
    } catch { /* no Cache Storage */ }
  }
  const res = await fetch(msg.modelUrl);
  if (!res.ok || !res.body) throw new Error('model download failed (' + res.status + ')');
  const declared = Number(res.headers.get('content-length')) || 0, total = declared || msg.size;
  const reader = res.body.getReader(), parts: Uint8Array[] = [];
  let got = 0, last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    if (got - last > 2e6) { last = got; post({ type: 'progress', job: msg.job, stage: 'download', got, total }); }
    if (cancelled.has(msg.job)) { await reader.cancel(); throw new Error('cancelled'); }
  }
  // Only compare against Content-Length when the body wasn't compressed in transit.
  if (declared && !res.headers.get('content-encoding') && got !== declared) throw new Error('model download was cut short, try again');
  const bytes = new Uint8Array(got);
  for (let o = 0, i = 0; i < parts.length; o += parts[i].length, i++) bytes.set(parts[i], o);
  if (cache) {
    try { await cache.put(msg.modelUrl, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(got) } })); }
    catch { /* storage full or refused: separation still works, it just downloads again next time */ }
  }
  return bytes;
}

async function init(msg: Extract<StemRequest, { type: 'init' }>) {
  if (session) return post({ type: 'ready', job: msg.job, ep });
  if (!ort) { ort = await import(/* @vite-ignore */ msg.ortUrl); ort.env.wasm.numThreads = msg.threads; }
  check(msg.job);
  if (!modelBytes) modelBytes = patchFloat64(await download(msg)).bytes;
  check(msg.job);
  post({ type: 'progress', job: msg.job, stage: 'prepare' });
  const opts = { graphOptimizationLevel: 'all' };
  const gpu = await gpuUsable();
  // Without a GPU the browser can't fit this model in WebAssembly's 4 GB, so say so up front (ADR 0003).
  if (!gpu && msg.device !== 'cpu') throw new Error('no-gpu');
  if (ep !== 'CPU-only' && msg.device !== 'cpu' && gpu) {
    try { session = await ort.InferenceSession.create(modelBytes, { ...opts, executionProviders: ['webgpu', 'wasm'] }); ep = 'GPU'; }
    catch { session = null; }
  }
  // No arena / memory-pattern planning on the CPU path: both over-reserve, and WebAssembly has only 4 GB.
  if (!session) { session = await ort.InferenceSession.create(modelBytes, { ...opts, enableCpuMemArena: false, enableMemPattern: false, executionMode: 'sequential', executionProviders: ['wasm'] }); ep = 'CPU'; }
  post({ type: 'ready', job: msg.job, ep });
}

async function separate(job: number, L: Float32Array, R: Float32Array): Promise<Float32Array[][]> {
  const total = L.length, nChunks = Math.max(1, Math.ceil(total / STRIDE));
  const out = [0, 1, 2, 3].map(() => [new Float32Array(total), new Float32Array(total)]);
  const weight = new Float32Array(total), win = new Float32Array(N).fill(1);
  for (let i = 0; i < OVERLAP; i++) { const v = i / OVERLAP; win[i] = v; win[N - 1 - i] = v; }
  const t0 = performance.now();
  // The first chunk also compiles the GPU shaders, so the speed is measured from the second on.
  let t1 = 0;
  const label = ep === 'GPU' && gpuName ? 'GPU (' + gpuName + ')' : ep;
  for (let i = 0; i < nChunks; i++) {
    await new Promise(r => setTimeout(r, 0));   // let a cancel message in
    check(job);
    if (i === 1) t1 = performance.now();
    const perChunk = i >= 2 ? (performance.now() - t1) / 1000 / (i - 1) : null;
    post({ type: 'progress', job, stage: 'run', i, n: nChunks, elapsed: (performance.now() - t0) / 1000, ep, label, perChunk });
    const start = i * STRIDE, end = Math.min(start + N, total), len = end - start;
    const input = new Float32Array(2 * N);
    input.set(L.subarray(start, end), 0);
    input.set(R.subarray(start, end), N);
    let result;
    try { result = await session.run({ mix: new ort.Tensor('float32', input, [1, 2, N]) }); }
    catch (e) {
      if (ep !== 'GPU' || i > 0) throw e;
      // GPU session built but can't run this graph: rebuild on CPU once.
      session = null; ep = 'CPU-only'; throw new Error('retry-cpu');
    }
    const y = result.stems.data as Float32Array;   // (1, 4, 2, N): drums, bass, other, vocals
    for (let s = 0; s < 4; s++) for (let c = 0; c < 2; c++) {
      const row = (s * 2 + c) * N, dst = out[s][c];
      for (let k = 0; k < len; k++) dst[start + k] += y[row + k] * win[k];
    }
    for (let k = 0; k < len; k++) weight[start + k] += win[k];
    if (result.stems.dispose) result.stems.dispose();
  }
  for (const st of out) for (const ch of st) for (let k = 0; k < total; k++) ch[k] /= Math.max(weight[k], 1e-8);
  return out;
}

scope.onmessage = async (e: MessageEvent<StemRequest>) => {
  const m = e.data;
  if (m.type === 'cancel') { cancelled.add(m.job); return; }
  try {
    if (m.type === 'init') await init(m);
    else if (m.type === 'run') {
      const out = await separate(m.job, m.L, m.R);
      post({ type: 'done', job: m.job, out }, out.flat().map(a => a.buffer));
    }
  } catch (err) {
    post({ type: 'error', job: m.job, message: String((err as Error)?.message || err) });
  }
};
