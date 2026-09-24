/* Audio player + live analyser. One <audio> element per source: a media element can feed only one
   AudioContext, and the live view wants one at the file's own sample rate. */
import { fmtKHz, freqLabel, niceStep } from '../core/format';
import { MONO, fitCanvas, theme } from '../ui/render/canvas';
import type { Cutoff } from '../core/types';
import { WF_BANDS, WF_DEPTH, WF_FPS, bandBins, drawWaterfall, type WaterfallFrame } from '../ui/render/waterfall';

// AnalyserNode scales by 1/N with a Blackman window (coherent gain 0.42); lift it so a
// full-scale sine reads 0 dB, matching the main spectrogram.
const LIVE_OFFSET = 20 * Math.log10(2 / 0.42);
// Scroll by wall-clock time, not frames, so the window is the same on 60 and 120 Hz screens.
const LIVE_COLS_PER_SEC = 60;
const LIVE_W = 720;
const CANT_PLAY = 'This browser can’t play this format, but the analysis above is unaffected.';

class Live {
  ctx: AudioContext | null = null;
  an: AnalyserNode | null = null;
  el: HTMLAudioElement | null = null;
  buf: Float32Array<ArrayBuffer> | null = null;
  peak: Float32Array | null = null;
  img: HTMLCanvasElement | null = null;
  ictx: CanvasRenderingContext2D | null = null;
  col: ImageData | null = null;
  rows = 0; drawn = false; last = 0; acc = 0; error = '';
  // 3D mode: recent spectra in log-spaced bands (frames[0] oldest).
  bands: Int32Array | null = null;
  frames: WaterfallFrame[] = [];
  wfAcc = 0;
  note = $state('What’s sounding now, scrolling right to left.');

  reset() {
    if (this.ctx) { try { void this.ctx.close(); } catch { /* already closed */ } }
    this.ctx = null; this.an = null; this.el = null; this.drawn = false; this.last = 0; this.acc = 0; this.error = '';
    this.frames = []; this.wfAcc = 0;
  }

  /** Attach to the player's element. Must run inside a user gesture so the context may start. */
  start(el: HTMLAudioElement, fileSr: number) {
    if (this.el === el && this.an && this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) { this.error = 'This browser has no Web Audio support.'; return; }
    const build = (rate: number) => {
      const ctx = rate ? new AC({ sampleRate: rate }) : new AC();
      try {
        const src = ctx.createMediaElementSource(el), an = ctx.createAnalyser();
        an.fftSize = ctx.sampleRate > 100000 ? 16384 : ctx.sampleRate > 50000 ? 8192 : 4096;
        an.smoothingTimeConstant = 0;
        an.minDecibels = -190; an.maxDecibels = 10;
        src.connect(an); an.connect(ctx.destination);
        return { ctx, an };
      } catch (e) { void ctx.close(); throw e; }
    };
    let chain: { ctx: AudioContext; an: AnalyserNode };
    try { chain = build(fileSr); }
    catch { try { chain = build(0); } catch (e2) { this.error = 'The live view couldn’t attach to the player: ' + (e2 as Error).message; return; } }
    this.rows = Math.min(512, chain.an.frequencyBinCount);
    this.img = document.createElement('canvas');
    this.img.width = LIVE_W; this.img.height = this.rows;
    this.ictx = this.img.getContext('2d')!;
    this.ictx.fillStyle = '#000'; this.ictx.fillRect(0, 0, LIVE_W, this.rows);
    this.col = this.ictx.createImageData(1, this.rows);
    this.buf = new Float32Array(chain.an.frequencyBinCount);
    this.peak = new Float32Array(this.rows);
    this.bands = bandBins(chain.an.frequencyBinCount, chain.ctx.sampleRate);
    this.frames = []; this.wfAcc = 0;
    this.ctx = chain.ctx; this.an = chain.an; this.el = el; this.drawn = false; this.error = '';
    const nyq = chain.ctx.sampleRate / 2, fileNyq = fileSr / 2;
    this.note = nyq < fileNyq * 0.99
      ? 'Limited to ' + fmtKHz(nyq) + ' by your audio output; the file goes to ' + fmtKHz(fileNyq) + '.'
      : 'What’s sounding now, scrolling right to left.';
    if (chain.ctx.state === 'suspended') void chain.ctx.resume();
  }

  capture(ts: number, lut: Uint8ClampedArray, floor: number) {
    if (!this.an || !this.buf || !this.peak || !this.col || !this.ictx || !this.img) return;
    const dt = this.last ? Math.min(250, ts - this.last) : 1000 / LIVE_COLS_PER_SEC;
    this.last = ts;
    this.acc += dt * LIVE_COLS_PER_SEC / 1000;
    this.wfAcc += dt * WF_FPS / 1000;
    const steps = Math.floor(this.acc), push = this.wfAcc >= 1;
    if (steps < 1 && !push) return;
    this.an.getFloatFrequencyData(this.buf);
    if (push) { this.wfAcc -= Math.floor(this.wfAcc); this.pushFrame(floor); }
    if (steps < 1) return;
    this.acc -= steps;
    const { buf, peak, rows, col, ictx } = this, n = buf.length, d = col.data;
    peak.fill(-Infinity);
    for (let k = 0; k < n; k++) { const r = Math.floor(k * rows / n), v = buf[k]; if (v > peak[r]) peak[r] = v; }
    for (let y = 0; y < rows; y++) {
      let t = (peak[rows - 1 - y] + LIVE_OFFSET - floor) / -floor;
      t = t > 0 ? (t < 1 ? t : 1) : 0;
      const li = Math.round(t * 255) * 3, p = y * 4;
      d[p] = lut[li]; d[p + 1] = lut[li + 1]; d[p + 2] = lut[li + 2]; d[p + 3] = 255;
    }
    ictx.drawImage(this.img, -steps, 0);
    for (let s = 1; s <= steps; s++) ictx.putImageData(col, LIVE_W - s, 0);
    this.drawn = true;
  }

  /** One 3D frame: the loudest bin of each log band, scaled 0–1 against the floor. */
  private pushFrame(floor: number) {
    const { buf, bands } = this;
    if (!buf || !bands) return;
    const f = this.frames.length >= WF_DEPTH ? this.frames.shift()! : { t: new Float32Array(WF_BANDS) };
    for (let b = 0; b < WF_BANDS; b++) {
      let m = -Infinity;
      for (let k = bands[b]; k < Math.max(bands[b] + 1, bands[b + 1]); k++) if (buf[k] > m) m = buf[k];
      const v = (m + LIVE_OFFSET - floor) / -floor;
      f.t[b] = v > 0 ? (v < 1 ? v : 1) : 0;
    }
    // A light 3-band smoothing, for the look of the ridges only (the scrolling view is untouched).
    let prev = f.t[0];
    for (let b = 1; b < WF_BANDS - 1; b++) { const cur = f.t[b]; f.t[b] = Math.max(cur, (prev + 2 * cur + f.t[b + 1]) / 4); prev = cur; }
    this.frames.push(f);
  }

  draw(cv: HTMLCanvasElement, rightMargin: number, hasSource: boolean, cut: Cutoff | null, markers: boolean, mode: 'scroll' | '3d' = 'scroll', lut?: Uint8ClampedArray) {
    const { ctx, w, h } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    const C = theme();
    const m = { l: 46, r: rightMargin, t: 6, b: 24 }, pw = w - m.l - m.r, ph = h - m.t - m.b;
    ctx.fillStyle = '#000'; ctx.fillRect(m.l, m.t, pw, ph);
    ctx.font = '11px ' + MONO;
    if (!this.drawn || !this.ctx || !this.img) {
      ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.error || (hasSource ? 'Press play to see what’s sounding right now' : 'Open a file to use the live view'), m.l + pw / 2, m.t + ph / 2);
      return;
    }
    const nyq = this.ctx.sampleRate / 2;
    if (mode === '3d' && lut) {
      drawWaterfall(ctx, { l: m.l, t: m.t, w: pw, h: ph }, this.frames, lut, nyq, C, markers && cut && (!cut.full || cut.wall) ? cut.fc : null, WF_DEPTH / WF_FPS);
      return;
    }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.img, m.l, m.t, pw, ph);
    ctx.fillStyle = C.muted; ctx.strokeStyle = C.line2; ctx.lineWidth = 1;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const fs = niceStep(nyq, Math.max(2, Math.floor(ph / 40)));
    for (let f = 0; f <= nyq + 1; f += fs) {
      const y = Math.round(m.t + ph - f / nyq * ph) + 0.5;
      ctx.fillText(freqLabel(f), m.l - 7, Math.min(m.t + ph - 4, Math.max(m.t + 5, y)));
      ctx.beginPath(); ctx.moveTo(m.l - 4, y); ctx.lineTo(m.l, y); ctx.stroke();
    }
    const span = LIVE_W / LIVE_COLS_PER_SEC;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left'; ctx.fillText('−' + span.toFixed(0) + ' s', m.l, m.t + ph + 7);
    ctx.textAlign = 'right'; ctx.fillText('now', m.l + pw, m.t + ph + 7);
    if (markers && cut && (!cut.full || cut.wall) && cut.fc < nyq) {
      const y = Math.round(m.t + ph - cut.fc / nyq * ph) + 0.5;
      ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = C.accent;
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); ctx.restore();
    }
  }
}

class Player {
  el: HTMLAudioElement = new Audio();
  url = $state<string | null>(null);
  ready = $state(false);
  paused = $state(true);
  time = $state(0);
  duration = $state(0);          // the analysis duration when known (more reliable than the element's)
  volume = $state(0.8);
  message = $state('');
  frame = $state(0);             // bumps every animation frame while playing, to drive redraws
  started = $state(false);       // has playback moved from 0 (for the playhead)
  live = new Live();
  liveOn = false;
  fileSr = 48000;
  onFrame: ((ts: number) => void) | null = null;
  onEnded: (() => void) | null = null;   // the library player moves to the next track
  private raf = 0;

  private bind(el: HTMLAudioElement) {
    el.preload = 'auto';
    el.volume = this.volume;
    el.addEventListener('loadedmetadata', () => { this.ready = true; if (!this.duration) this.duration = el.duration || 0; });
    el.addEventListener('play', () => { this.paused = false; this.startLoop(); });
    el.addEventListener('pause', () => { this.paused = true; this.live.last = 0; this.stopLoop(); this.sync(); });
    el.addEventListener('ended', () => { this.paused = true; this.stopLoop(); this.sync(); if (el === this.el) this.onEnded?.(); });
    el.addEventListener('timeupdate', () => this.sync());
    el.addEventListener('error', () => { if (this.url) this.message = CANT_PLAY; });
  }
  constructor() { this.bind(this.el); }

  private sync() {
    this.time = this.el.currentTime || 0;
    if (this.time > 0) this.started = true;
  }
  // Exactly one animation-frame loop at a time (the old page could stack two on a quick pause/play).
  private startLoop() {
    if (this.raf) return;
    const tick = (ts: number) => {
      if (this.el.paused) { this.raf = 0; return; }
      this.sync();
      this.onFrame?.(ts);
      this.frame++;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  private stopLoop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }

  /** Replace the source. keepPosition carries time and play state over (stem switching). */
  /** What the source is ('track:<id>' for a library track), so pages can tell it's already loaded. */
  sourceKey = $state<string | null>(null);
  /** A page's own source waiting while another track keeps playing: it loads on this page's first play or seek. */
  pending = $state.raw<{ blob: Blob; opts: SourceOpts } | null>(null);
  /** Told whenever a new source is loaded (the library player follows the track page this way). */
  onSource: ((key: string | null) => void) | null = null;

  /** Keep `blob` for later instead of interrupting what's playing (null forgets it). */
  defer(blob: Blob | null, opts: SourceOpts = {}) { this.pending = blob ? { blob, opts } : null; }
  private claim() { const p = this.pending; if (!p) return false; this.setSource(p.blob, p.opts); return true; }

  setSource(blob: Blob | null, opts: SourceOpts = {}) {
    this.pending = null;
    if (opts.key !== undefined) this.sourceKey = opts.key; else if (!opts.keepPosition) this.sourceKey = null;
    this.onSource?.(this.sourceKey);
    const t = this.el.currentTime, wasPlaying = !this.el.paused;
    this.el.pause();
    this.stopLoop();
    this.live.reset();
    this.el.removeAttribute('src'); this.el.load();
    const a = new Audio();
    this.bind(a);
    this.el = a;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = blob ? URL.createObjectURL(blob) : null;
    this.ready = false; this.message = ''; this.paused = true;
    if (!opts.keepPosition) { this.time = 0; this.started = false; }
    if (opts.duration) this.duration = opts.duration; else if (!opts.keepPosition) this.duration = 0;
    if (opts.sampleRate) this.fileSr = opts.sampleRate;
    if (!this.url) return;
    a.src = this.url; a.load();
    if (opts.keepPosition) {
      const go = () => {
        a.currentTime = Math.min(t, a.duration || t);
        this.sync();
        if (wasPlaying) { if (this.liveOn) this.live.start(a, this.fileSr); a.play().catch(() => {}); }
      };
      if (a.readyState >= 1) go(); else a.addEventListener('loadedmetadata', go, { once: true });
    }
  }

  /** Play / pause. A waiting page source is loaded first, unless `own` is false (the track that's playing). */
  toggle(own = true) {
    if (own && this.claim()) { this.play(); return; }
    if (!this.url) return;
    if (this.el.paused) {
      if (this.liveOn) this.live.start(this.el, this.fileSr);   // inside the click, so the AudioContext may start
      this.el.play().catch(() => { this.message = CANT_PLAY; });
    } else this.el.pause();
  }
  private play() { if (this.liveOn) this.live.start(this.el, this.fileSr); this.el.play().catch(() => { this.message = CANT_PLAY; }); }
  seek(t: number, play = false) {
    if (this.claim()) {
      const a = this.el, go = () => { this.seek(t); if (play) this.play(); };
      if (a.readyState >= 1) go(); else a.addEventListener('loadedmetadata', go, { once: true });
      return;
    }
    if (!this.url) return;
    this.el.currentTime = Math.max(0, Math.min(this.duration || this.el.duration || 0, t));
    this.sync(); this.started = true;
    if (play && this.el.paused) this.toggle();
  }
  setVolume(v: number) { this.volume = v; this.el.volume = v; }
  setLive(on: boolean) { this.liveOn = on; if (on && !this.el.paused) this.live.start(this.el, this.fileSr); }
}

export interface SourceOpts { duration?: number; sampleRate?: number; keepPosition?: boolean; key?: string | null }
export const player = new Player();
