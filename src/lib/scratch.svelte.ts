/* Vinyl scrubbing on the Prepare deck: a dragged waveform sounds like a record under the hand, never the clicks of
   jumping an <audio> from place to place. The open track is decoded once into an AudioWorklet, a platter with mass:
   - held, it chases the hand's position (forwards or backwards, the pitch following the speed);
   - let go while playing, its motor brings it back to the tempo in about a quarter of a second, and the player takes
     over from where the record is, crossfaded;
   - let go while paused, it slows to a stop (vinyl mode, for finding a cue).
   The player keeps running (silent) while the deck is held, so taking over is a seek, not a start. */
import { player } from './player.svelte';
import { decodeAudio } from './analysis';
import { PROCESSOR } from './platter';


class Scratch {
  /** The deck is held or settling: its position is the record's, not the player's. */
  active = $state(false);
  time = $state(0);
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private out: GainNode | null = null;
  private key = '';
  /** The track is decoded for the deck. */
  ready = $state(false);
  private pos = 0; private vel = 0; private at = 0;   // the platter's last report (frames, frames per frame, ctx time)
  private wasPlaying = false;
  private raf = 0;
  private gen = 0;

  /** Decode this track for the deck (in the background; until it's ready, dragging seeks as before). */
  async load(key: string, file: Blob) {
    if (this.key === key) return;
    this.free();
    this.key = key; const g = ++this.gen;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      const url = URL.createObjectURL(new Blob([PROCESSOR], { type: 'text/javascript' }));
      await ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
      const ab = await decodeAudio(await file.arrayBuffer(), ctx.sampleRate);
      if (g !== this.gen) return;
      const node = new AudioWorkletNode(ctx, 'glue-platter', { numberOfInputs: 0, outputChannelCount: [2] });
      const out = ctx.createGain();
      node.connect(out).connect(ctx.destination);
      const channels = Array.from({ length: Math.min(2, ab.numberOfChannels) }, (_, c) => new Float32Array(ab.getChannelData(c)));
      node.port.postMessage({ type: 'load', channels }, channels.map(c => c.buffer));
      node.port.onmessage = e => this.heard(e.data);
      const sink = player.sinkId as string;
      if (sink && 'setSinkId' in ctx) void (ctx as unknown as { setSinkId(id: string): Promise<void> }).setSinkId(sink).catch(() => {});
      this.node = node; this.out = out; this.ready = true;
    } catch (e) {
      console.warn('Vinyl scrubbing is off for this track', e);
      if (g === this.gen) this.free();
    }
  }
  free() {
    this.gen++; this.stopLoop();
    if (this.active) this.restoreVolume();
    this.active = false; this.ready = false; this.key = '';
    this.node?.disconnect(); this.node = null; this.out = null;
    void this.ctx?.close().catch(() => {}); this.ctx = null;
  }
  get sr() { return this.ctx?.sampleRate ?? 48000; }

  /** The hand on the record at `t` (s). False when the deck can't scrub this way yet. */
  grab(key: string, t: number): boolean {
    if (!this.ready || this.key !== key || !this.ctx || !this.node || !this.out) return false;
    void this.ctx.resume();
    this.gen++;
    this.wasPlaying = this.active ? this.wasPlaying : !player.paused;
    this.out.gain.value = player.volume;
    // The player goes silent but keeps running: taking over again is then only a seek.
    if (this.wasPlaying) player.el.volume = 0;
    // Held again while it settles: the record stays where it is, at its speed.
    if (!this.active) { this.pos = t * this.sr; this.vel = this.wasPlaying ? player.rate : 0; this.at = this.ctx.currentTime; this.time = t; }
    this.node.port.postMessage({ type: 'grab', keep: this.active, pos: this.pos, vel: this.vel });
    this.active = true; this.loop();
    return true;
  }
  /** The hand moved the record to `t` (s). */
  move(t: number) { if (this.active) this.node?.port.postMessage({ type: 'hand', pos: Math.max(0, t) * this.sr }); }
  /** The hand lets go: back to the tempo and the player (playing), or to a stop (paused). */
  release() {
    if (!this.active || !this.node) return;
    const g = this.gen;
    if (!this.wasPlaying) { this.node.port.postMessage({ type: 'brake' }); return; }   // 'stopped' finishes it
    this.node.port.postMessage({ type: 'motor', rate: player.rate });
    setTimeout(() => { if (g === this.gen) this.handOver(g); }, 260);
  }
  /** The player takes over where the record is: a seek a little ahead (it lands while the platter turns on), then a
      crossfade from the platter to it. */
  private handOver(g: number) {
    const el = player.el, ahead = 0.04;
    let done = false;
    const go = () => {
      if (done || g !== this.gen) return;
      done = true;
      const vol = player.volume, steps = 8, dt = 5;
      this.node?.port.postMessage({ type: 'out', s: steps * dt / 1000 });
      let i = 0;
      const ramp = () => {
        if (g !== this.gen) return;
        el.volume = Math.min(1, vol * ++i / steps);
        if (i < steps) setTimeout(ramp, dt); else this.finish();
      };
      ramp();
    };
    el.addEventListener('seeked', go, { once: true });
    setTimeout(go, 400);   // (a seek that never says it landed)
    player.seek(this.now() + ahead * player.rate);
  }
  private finish() {
    this.node?.port.postMessage({ type: 'stop' });
    this.stopLoop(); this.active = false;
  }
  private restoreVolume() { player.el.volume = player.volume; }
  private heard(m: { type: string; pos: number; vel?: number; t?: number }) {
    if (m.type === 'pos') { this.pos = m.pos; this.vel = m.vel ?? 0; this.at = m.t ?? this.ctx?.currentTime ?? 0; }
    else if (m.type === 'stopped' && !this.wasPlaying && this.active) {
      this.pos = m.pos; this.vel = 0;
      player.seek(m.pos / this.sr);
      this.finish();
    }
  }
  /** Where the record is now (s), from the platter's last report and its speed since. */
  private now(): number {
    const ctx = this.ctx; if (!ctx) return this.pos / this.sr;
    return Math.max(0, (this.pos + this.vel * (ctx.currentTime - this.at) * this.sr) / this.sr);
  }
  private loop() {
    if (this.raf) return;
    const step = () => { this.time = this.now(); this.raf = requestAnimationFrame(step); };
    this.raf = requestAnimationFrame(step);
  }
  private stopLoop() { cancelAnimationFrame(this.raf); this.raf = 0; }
}

export const scratch = new Scratch();
