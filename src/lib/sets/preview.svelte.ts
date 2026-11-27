/* A set's live preview (ADR 0201): the set worker (setplay.worker.ts) runs the file's mixer a second ahead and sends
   its blocks to a small AudioWorklet here, at the mix rate, through the player's output. Play, pause, seek, the
   playhead; an edit while playing carries on from where it is with the new plan. With this computer's GLUE Home
   (ADR 0204), it mixes and the worker reads its stream instead. */
import { player } from '../player.svelte';
import { lib } from '../library.svelte';
import { answerSong } from './songs';
import { HomeSet } from './home';
import { MIX_RATE, type SetPlan } from '../../core/sets/types';
import type { FromSetPlay, ToSetPlay } from '../../workers/setplay.worker';

/** The worklet: plays the newest generation's blocks in order, says where it is and how much it has played. */
const PROCESSOR = `
class SetPlay extends AudioWorkletProcessor {
  constructor() {
    super();
    this.q = []; this.gen = -1; this.off = 0; this.played = 0; this.frame = -1; this.tick = 0; this.data = null; this.ended = false;
    this.port.onmessage = e => {
      const m = e.data;
      if (m.type === 'data') { this.data = m.port; this.data.onmessage = x => { this.start(x.data.gen, x.data.frame); if (x.data.gen === this.gen) this.q.push(x.data); }; }
      else if (m.type === 'gen') { this.start(m.gen, m.frame); }
    };
  }
  // Generations only grow: a newer one (from either port, whichever comes first) starts afresh; an older one is let go.
  start(gen, frame) { if (gen > this.gen) { this.gen = gen; this.q = []; this.off = 0; this.played = 0; this.frame = frame; this.ended = false; } }
  process(_in, outputs) {
    const L = outputs[0][0], R = outputs[0][1] || L;
    let k = 0;
    while (k < L.length && this.q.length) {
      const b = this.q[0], n = Math.min(L.length - k, b.l.length - this.off);
      L.set(b.l.subarray(this.off, this.off + n), k); if (R !== L) R.set(b.r.subarray(this.off, this.off + n), k);
      k += n; this.off += n; this.played += n; this.frame = b.frame + this.off;
      if (this.off >= b.l.length) { this.q.shift(); this.off = 0; if (b.end) this.ended = true; }
    }
    if (k < L.length) { L.fill(0, k); if (R !== L) R.fill(0, k); }
    if (k && this.data) this.data.postMessage({ gen: this.gen, played: this.played });
    if (++this.tick % 4 === 0 || this.ended) { this.port.postMessage({ gen: this.gen, frame: this.frame, ended: this.ended && !this.q.length }); if (this.ended && !this.q.length) this.ended = false; }
    return true;
  }
}
registerProcessor('glue-setplay', SetPlay);
`;

class Preview {
  playing = $state(false);
  /** Where the playhead is (frames at the mix rate). */
  frame = $state(0);
  /** Songs being decoded before it can play on. */
  loading = $state(false);
  error = $state('');
  /** Who mixes what's heard: this computer's GLUE Home, or the browser (and why not GLUE Home, when it runs). */
  by = $state<'home' | 'browser'>('browser');
  why = $state('');
  private home = new HomeSet();
  private synced: Promise<void> = Promise.resolve();
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private out: GainNode | null = null;
  private w: Worker | null = null;
  private gen = 0;
  private plan: SetPlan | null = null;
  private length = 0;

  /** The plan to play (sent on to the worker); while playing, it goes on from here with it. */
  setPlan(plan: SetPlan, length: number) {
    this.plan = plan; this.length = length;
    if (!this.w) return;
    this.synced = this.sync();
    if (this.playing) void this.synced.then(() => { if (this.playing) this.go(this.frame); });
  }
  /** The worker told the plan, and who mixes it (GLUE Home kept to it first). */
  private async sync() {
    const plan = this.plan;
    if (!plan) return;
    const via = await this.home.ready(plan);
    if (plan !== this.plan) return;
    this.by = via ? 'home' : 'browser'; this.why = this.home.why;
    this.send({ kind: 'plan', plan: $state.snapshot(plan) as SetPlan, home: via?.base ?? null });
  }

  private send(m: ToSetPlay, t: Transferable[] = []) { this.w?.postMessage(m, t); }

  private async ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC({ sampleRate: MIX_RATE, latencyHint: 'playback' });
    this.ctx = ctx;
    const url = URL.createObjectURL(new Blob([PROCESSOR], { type: 'text/javascript' }));
    try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    const node = new AudioWorkletNode(ctx, 'glue-setplay', { numberOfInputs: 0, outputChannelCount: [2] });
    const out = ctx.createGain(); out.gain.value = player.volume;
    node.connect(out).connect(ctx.destination);
    const sink = player.sinkId as string;
    if (sink && 'setSinkId' in ctx) void (ctx as unknown as { setSinkId(id: string): Promise<void> }).setSinkId(sink).catch(() => {});
    const w = new Worker(new URL('../../workers/setplay.worker.ts', import.meta.url), { type: 'module' });
    const ch = new MessageChannel();
    node.port.postMessage({ type: 'data', port: ch.port1 }, [ch.port1]);
    w.postMessage({ kind: 'port', port: ch.port2 } satisfies ToSetPlay, [ch.port2]);
    w.onmessage = (e: MessageEvent<FromSetPlay>) => {
      const m = e.data;
      if (m.kind === 'want' || m.kind === 'pagedecode') void answerSong(m, (a, t) => this.send(a, t));
      else if (m.kind === 'loading') this.loading = m.ids.length > 0;
      else if (m.kind === 'error') { const t = m.id ? lib.store?.tracks.get(m.id) : null; this.error = (t ? '“' + (t.title || t.fileName) + '” is silent: ' : '') + m.message; }
    };
    node.port.onmessage = (e: MessageEvent<{ gen: number; frame: number; ended: boolean }>) => {
      if (e.data.gen !== this.gen || !this.playing) return;
      if (e.data.frame >= 0) this.frame = e.data.frame;
      if (e.data.ended) this.pause();
    };
    this.node = node; this.out = out; this.w = w;
    this.synced = this.sync();
  }

  /** Play from `frame` (where it is, else). From a click: the AudioContext may start. */
  async play(frame = this.frame) {
    if (!this.plan) return;
    if (!player.paused) player.el.pause();
    this.error = '';
    try { await this.ensure(); } catch (e) { this.error = 'The preview can’t play here: ' + (e as Error).message; return; }
    if (this.out) this.out.gain.value = player.volume;
    void this.ctx?.resume();
    this.playing = true;
    await this.synced;
    if (this.playing) this.go(frame >= this.length ? 0 : frame);
  }
  private go(frame: number) {
    const f = Math.max(0, Math.min(this.length, Math.round(frame)));
    this.gen++; this.frame = f;
    this.node?.port.postMessage({ type: 'gen', gen: this.gen, frame: f });
    this.send({ kind: 'play', frame: f, gen: this.gen });
  }
  pause() {
    if (!this.playing) return;
    this.playing = false; this.loading = false; this.gen++;
    this.node?.port.postMessage({ type: 'gen', gen: this.gen, frame: this.frame });
    this.send({ kind: 'stop' });
  }
  toggle() { if (this.playing) this.pause(); else void this.play(); }
  /** Move the playhead (playing on from there, when playing). */
  seek(frame: number) { if (this.playing) this.go(frame); else this.frame = Math.max(0, Math.min(this.length, Math.round(frame))); }

  close() {
    this.pause();
    this.w?.terminate(); this.w = null;
    this.node?.disconnect(); this.node = null; this.out = null;
    void this.ctx?.close().catch(() => {}); this.ctx = null;
    this.frame = 0; this.plan = null; this.error = ''; this.by = 'browser'; this.why = '';
    void this.home.close();
  }
}
export const preview = new Preview();
