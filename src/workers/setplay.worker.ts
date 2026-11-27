/* A set's live preview (ADR 0201): the same mixer as the file (src/core/sets/mixer.ts), run here a second or so ahead
   of what's heard, its blocks sent straight to the preview's AudioWorklet through a MessagePort. The worklet says how
   much it has played, and this renders on while it's less than AHEAD in front. Songs are decoded as the mix reaches
   them (asked of the page, like the mixdown), a few kept for seeking back. */
import { Mixer, type Pcm } from '../core/sets/mixer';
import { MIX_RATE, type SetPlan } from '../core/sets/types';
import { Asker, decodeSong, type SongAnswer, type SongQuestion } from './setDecode';

export type ToSetPlay =
  | { kind: 'port'; port: MessagePort }
  | { kind: 'plan'; plan: SetPlan }
  /** Play from `frame`; its blocks carry `gen` (the worklet plays only the newest). */
  | { kind: 'play'; frame: number; gen: number }
  | { kind: 'stop' }
  | SongAnswer;
export type FromSetPlay =
  | SongQuestion
  /** Songs being decoded before the mix can go on (none: it goes on). */
  | { kind: 'loading'; ids: string[] }
  | { kind: 'error'; message: string; id?: string };
/** To the worklet: a block of the mix. */
export interface SetBlock { gen: number; frame: number; l: Float32Array; r: Float32Array; end?: boolean }

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: FromSetPlay) => scope.postMessage(m);
const asker = new Asker(post);

const BLOCK = 2048, AHEAD = MIX_RATE * 1.2, SOON = MIX_RATE * 20, KEEP = 4;
let port: MessagePort | null = null;
let plan: SetPlan | null = null, mixer: Mixer | null = null;
let gen = 0, running = false, sent = 0, played = 0;
let wake: (() => void) | null = null;
const pcm = new Map<string, Pcm>(), loading = new Map<string, Promise<Pcm>>(), used = new Map<string, number>();
const failed = new Set<string>();

function load(id: string) {
  let p = loading.get(id);
  if (!p) {
    p = decodeSong(id, asker).then(x => { pcm.set(id, x); return x; });
    p.catch(e => { failed.add(id); post({ kind: 'error', message: (e as Error).message, id }); });
    loading.set(id, p);
  }
  return p;
}
/** Keep the songs needed soon, and the last few played (for seeking back); let the rest go. */
function prune(keep: string[]) {
  const tick = performance.now();
  for (const id of keep) used.set(id, tick);
  const old = [...pcm.keys()].filter(id => !keep.includes(id)).sort((a, b) => (used.get(b) ?? 0) - (used.get(a) ?? 0));
  for (const id of old.slice(KEEP)) { pcm.delete(id); loading.delete(id); used.delete(id); }
}

async function run(g: number, from: number) {
  if (!plan || !port) return;
  const m = new Mixer(plan, { get: id => pcm.get(id) ?? null });
  mixer = m; m.seek(from); sent = 0; played = 0;
  let f = Math.max(0, Math.floor(from));
  while (running && g === gen && f < m.length) {
    if (sent - played >= AHEAD) { await new Promise<void>(r => { wake = r; }); continue; }
    const now = m.needed(f, f + BLOCK).filter(id => !failed.has(id)), soon = m.needed(f, f + SOON);
    for (const id of soon) if (!failed.has(id)) void load(id).catch(() => {});
    const missing = now.filter(id => !pcm.has(id));
    if (missing.length) {
      post({ kind: 'loading', ids: missing });
      await Promise.allSettled(missing.map(load));
      if (g !== gen) return;
      post({ kind: 'loading', ids: [] });
      continue;
    }
    prune(soon);
    const L = new Float32Array(BLOCK), R = new Float32Array(BLOCK), n = m.render(L, R, BLOCK);
    const block: SetBlock = { gen: g, frame: f, l: n < BLOCK ? L.slice(0, n) : L, r: n < BLOCK ? R.slice(0, n) : R, ...(f + n >= m.length || !n ? { end: true } : {}) };
    port.postMessage(block, [block.l.buffer, block.r.buffer]);
    sent += n; f += n;
    if (!n) break;
  }
}

scope.onmessage = (e: MessageEvent<ToSetPlay>) => {
  const d = e.data;
  if (d.kind === 'port') {
    port = d.port;
    port.onmessage = (x: MessageEvent<{ gen: number; played: number }>) => { if (x.data.gen === gen) { played = x.data.played; wake?.(); wake = null; } };
  } else if (d.kind === 'plan') { plan = d.plan; failed.clear(); }
  else if (d.kind === 'play') { gen = d.gen; running = true; wake?.(); wake = null; void run(d.gen, d.frame); }
  else if (d.kind === 'stop') { running = false; gen++; wake?.(); wake = null; }
  else asker.answer(d);
};
