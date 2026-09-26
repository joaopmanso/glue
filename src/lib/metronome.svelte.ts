/* The Prepare tab's metronome (ADR 0052): a click on every beat of the grid, a higher one on each bar's
   first, through the same AudioContext and output as the music (player.audioClock), so both are heard
   in time. Clicks are scheduled a little ahead from the element's position and playback rate, and the
   schedule starts again after a seek, a pause or a grid change. */
import { player } from './player.svelte';

export interface Grid { bpm: number; beat0: number; bar: number }
const AHEAD = 0.15, EVERY = 25;

class Metronome {
  on = $state(false);
  volume = $state(0.7);
  private grid: () => Grid | null = () => null;
  private timer = 0;
  private next = -1;        // the next beat number to schedule
  private lastT = -1;       // the element's position at the last look
  private lastKey = '';     // the grid last scheduled from

  /** Turn on (inside a click, so the audio may start); \`grid\` says where the beats are now. */
  start(grid: () => Grid | null) {
    this.grid = grid;
    this.on = true;
    player.audioClock();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), EVERY);
    this.next = -1;
  }
  stop() { this.on = false; clearInterval(this.timer); this.timer = 0; this.next = -1; }
  toggle(grid: () => Grid | null) { if (this.on) this.stop(); else this.start(grid); }

  private tick() {
    const el = player.el, g = this.grid(), ctx = player.live.el === el ? player.live.ctx : null;
    if (!g || !(g.bpm > 0) || !ctx || el.paused) { this.next = -1; return; }
    const t = el.currentTime, rate = el.playbackRate || 1, now = ctx.currentTime, p = 60 / g.bpm;
    const key = g.bpm + '|' + g.beat0 + '|' + g.bar;
    // Start again after a jump (seek), or when the grid moved.
    if (this.next < 0 || t < this.lastT - 0.05 || t > this.lastT + 0.5 || key !== this.lastKey) this.next = Math.max(0, Math.ceil((t - g.beat0) / p - 1e-6));
    this.lastT = t; this.lastKey = key;
    for (;;) {
      const bt = g.beat0 + this.next * p;
      if (bt > t + AHEAD * rate) break;
      const when = now + (bt - t) / rate;
      if (when >= now - 0.005) this.click(ctx, Math.max(now, when), ((this.next - g.bar) % 4 + 4) % 4 === 0);
      this.next++;
    }
  }

  private click(ctx: AudioContext, when: number, accent: boolean) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(this.volume * (accent ? 1 : 0.6), when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    o.connect(g); g.connect(ctx.destination);
    o.start(when); o.stop(when + 0.06);
  }
}

export const metronome = new Metronome();
