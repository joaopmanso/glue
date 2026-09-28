/* Audio player + live analyser. One <audio> element per source: a media element can feed only one
   AudioContext, and the live view wants one at the file's own sample rate. The audio goes through
   Web Audio (the "graph") only while something listens to it: the live view, the metronome, or a tap
   such as the visualiser's (ADR 0068). The output device follows the user's choice either way. */
import { fmtKHz, freqLabel, niceStep } from '../core/format';
import { time } from '../core/perf';
import { MONO, fitCanvas, theme } from '../ui/render/canvas';
import type { Cutoff } from '../core/types';
import { WF_BANDS, WF_DEPTH, WF_FPS, bandBins, type WaterfallFrame } from '../ui/render/waterfall';

// AnalyserNode scales by 1/N with a Blackman window (coherent gain 0.42); lift it so a
// full-scale sine reads 0 dB, matching the main spectrogram.
const LIVE_OFFSET = 20 * Math.log10(2 / 0.42);
// Scroll by wall-clock time, not frames, so the window is the same on 60 and 120 Hz screens.
const LIVE_COLS_PER_SEC = 60;
const LIVE_W = 720;
const CANT_PLAY = 'This browser can’t play this format, but the analysis above is unaffected.';
/** Why playing failed, in words: what the browser said, not a guess (the user's list, 2026-09-28). */
function refusal(e: unknown): string {
  const name = (e as DOMException | null)?.name;
  if (name === 'AbortError') return '';   // another song was chosen meanwhile
  if (name === 'NotAllowedError') return 'Tap ▶ to start: this browser plays only after a tap.';
  return CANT_PLAY;
}
function mediaError(err: MediaError | null): string {
  switch (err?.code) {
    case MediaError.MEDIA_ERR_ABORTED: return '';
    case MediaError.MEDIA_ERR_NETWORK: return 'The song stopped arriving: the connection to its computer dropped.';
    case MediaError.MEDIA_ERR_DECODE: return 'This browser couldn’t decode this file.';
    default: return CANT_PLAY;
  }
}
/** An analyser on the playing element, made again for each new source (the visualiser's). */
export type TapMaker = (ctx: BaseAudioContext) => AnalyserNode;
/** Chromium's output-device choice, on an element or a context ('' = the system's default). */
const toSink = (x: unknown, id: string) => (x as { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(id);

class Live {
  ctx: AudioContext | null = null;
  an: AnalyserNode | null = null;
  el: HTMLAudioElement | null = null;
  src: MediaElementAudioSourceNode | null = null;
  /** Analysers tapped off the source, by name; they end in a silent gain so the browser runs them. */
  taps = new Map<string, AnalyserNode>();
  private mute: GainNode | null = null;
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
  /** Frames pushed so far (the GPU view redraws when it changes). */
  pushed = 0;
  note = $state('What’s sounding now, scrolling right to left.');

  reset() {
    if (this.ctx) { try { void this.ctx.close(); } catch { /* already closed */ } }
    this.ctx = null; this.an = null; this.el = null; this.src = null; this.mute = null; this.taps.clear(); this.drawn = false; this.last = 0; this.acc = 0; this.error = '';
    this.frames = []; this.wfAcc = 0;
  }

  /** Attach to the player's element. Must run inside a user gesture so the context may start (or after
      one: browsers let a page that was interacted with start audio). */
  start(el: HTMLAudioElement, fileSr: number, makers: Map<string, TapMaker> = new Map(), sinkId = '') {
    if (this.el === el && this.an && this.ctx) {
      for (const [name, make] of makers) if (!this.taps.has(name)) this.addTap(name, make);
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
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
        return { ctx, an, src };
      } catch (e) { void ctx.close(); throw e; }
    };
    let chain: { ctx: AudioContext; an: AnalyserNode; src: MediaElementAudioSourceNode };
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
    this.ctx = chain.ctx; this.an = chain.an; this.src = chain.src; this.el = el; this.drawn = false; this.error = '';
    if (sinkId) void toSink(chain.ctx, sinkId)?.catch(() => {});
    for (const [name, make] of makers) this.addTap(name, make);
    const nyq = chain.ctx.sampleRate / 2, fileNyq = fileSr / 2;
    this.note = nyq < fileNyq * 0.99
      ? 'Limited to ' + fmtKHz(nyq) + ' by your audio output; the file goes to ' + fmtKHz(fileNyq) + '.'
      : 'What’s sounding now, scrolling right to left.';
    if (chain.ctx.state === 'suspended') void chain.ctx.resume();
  }

  addTap(name: string, make: TapMaker) {
    const { ctx, src } = this;
    if (!ctx || !src || this.taps.has(name)) return;
    if (!this.mute) { this.mute = ctx.createGain(); this.mute.gain.value = 0; this.mute.connect(ctx.destination); }
    const a = make(ctx);
    src.connect(a); a.connect(this.mute);
    this.taps.set(name, a);
  }
  removeTap(name: string) {
    const a = this.taps.get(name);
    if (!a) return;
    try { this.src?.disconnect(a); a.disconnect(); } catch { /* already gone */ }
    this.taps.delete(name);
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
    this.pushed++;
  }

  /** The scrolling view (the 3D one is ui/Live3D). */
  draw(cv: HTMLCanvasElement, rightMargin: number, hasSource: boolean, cut: Cutoff | null, markers: boolean) {
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
  /** Playback speed (the Prepare tab's pitch fader, ADR 0052), and whether the pitch stays (key lock). */
  rate = $state(1);
  keyLock = $state(true);

  private bind(el: HTMLAudioElement) {
    const c = new AbortController(), o = { signal: c.signal };
    this.binds.set(el, c);
    el.preload = 'auto';
    el.volume = this.volume;
    if (this.sinkId) void toSink(el, this.sinkId)?.catch(() => {});
    this.applyRate(el);
    el.addEventListener('loadedmetadata', () => { this.ready = true; if (!this.duration) this.duration = el.duration || 0; }, o);
    el.addEventListener('play', () => { this.unlocked.add(el); this.paused = false; this.startLoop(); }, o);
    el.addEventListener('pause', () => { this.paused = true; this.live.last = 0; this.stopLoop(); this.sync(); }, o);
    el.addEventListener('ended', () => { this.paused = true; this.stopLoop(); this.sync(); if (el === this.el) this.onEnded?.(); }, o);
    el.addEventListener('timeupdate', () => this.sync(), o);
    el.addEventListener('error', () => { if (this.url && el === this.el) this.message = mediaError(el.error); }, o);
  }
  constructor() {
    this.bind(this.el);
    if (typeof document !== 'undefined') for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) document.addEventListener(ev, () => this.unlock(), { capture: true, passive: true });
  }

  // ─── Elements a tap has unlocked (the user's list, 2026-09-28) ───
  // iOS lets an <audio> play by itself only once a tap has touched it. A song chosen by a tap starts
  // after the network answers (a stream from another computer), and the next song starts on its own
  // when one ends: both play on an element unlocked by an earlier tap. The same trick as web players
  // such as Howler.js (its HTML5 audio pool).
  private spare: HTMLAudioElement[] = [];
  private unlocked = new WeakSet<HTMLAudioElement>();
  private binds = new WeakMap<HTMLAudioElement, AbortController>();
  /** Joined to Web Audio (the live view, the visualiser): an element joins only once, so never reused. */
  private wired = new WeakSet<HTMLAudioElement>();
  private unlock() {
    while (this.spare.length < 2) { const a = new Audio(); a.load(); this.unlocked.add(a); this.spare.push(a); }
  }
  /** A new element for a song: an unlocked one when there is one. */
  private fresh(): HTMLAudioElement { return this.spare.pop() ?? new Audio(); }
  /** The last song's element: emptied, and kept for another song if a tap unlocked it. */
  private retire(el: HTMLAudioElement) {
    this.binds.get(el)?.abort(); this.binds.delete(el);
    el.removeAttribute('src'); el.removeAttribute('crossorigin'); el.load();
    if (this.unlocked.has(el) && !this.wired.has(el) && this.spare.length < 3) this.spare.push(el);
  }

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
      if (this.onFrame) time('draw:capture', () => this.onFrame!(ts));
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
  pending = $state.raw<{ blob: Blob | string; opts: SourceOpts } | null>(null);
  /** The address was made here (an object URL, revoked when replaced), not given (a stream's). */
  private ownUrl = false;
  /** Told whenever a new source is loaded (the library player follows the track page this way). */
  onSource: ((key: string | null) => void) | null = null;

  /** Keep `blob` for later instead of interrupting what's playing (null forgets it). */
  defer(blob: Blob | string | null, opts: SourceOpts = {}) { this.pending = blob ? { blob, opts } : null; }
  private claim() { const p = this.pending; if (!p) return false; this.setSource(p.blob, p.opts); return true; }

  /** A file (Blob), or an address that streams (ADR 0076: GLUE Home's local link, or a stream through the
      service worker). */
  setSource(blob: Blob | string | null, opts: SourceOpts = {}) {
    this.pending = null;
    if (opts.key !== undefined) this.sourceKey = opts.key; else if (!opts.keepPosition) this.sourceKey = null;
    this.onSource?.(this.sourceKey);
    const t = this.el.currentTime, wasPlaying = !this.el.paused;
    this.el.pause();
    this.stopLoop();
    this.live.reset();
    this.retire(this.el);
    const a = this.fresh();
    this.bind(a);
    this.el = a;
    if (this.url && this.ownUrl) URL.revokeObjectURL(this.url);
    this.ownUrl = blob instanceof Blob;
    this.url = blob == null ? null : typeof blob === 'string' ? blob : URL.createObjectURL(blob);
    // Another origin (the local link): asked with CORS, so the live view and the visualiser can read it.
    if (typeof blob === 'string' && /^https?:/i.test(blob) && !blob.startsWith(location.origin)) a.crossOrigin = 'anonymous';
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
        if (wasPlaying) { if (this.graphWanted) this.startGraph(a); a.play().catch(() => {}); }
      };
      if (a.readyState >= 1) go(); else a.addEventListener('loadedmetadata', go, { once: true });
    }
  }

  /** Play / pause. A waiting page source is loaded first, unless `own` is false (the track that's playing). */
  toggle(own = true) {
    if (own && this.claim()) { this.play(); return; }
    if (!this.url) return;
    if (this.el.paused) {
      if (this.graphWanted) this.startGraph(this.el);   // inside the click, so the AudioContext may start
      const el = this.el;
      el.play().catch(e => { if (el === this.el) this.message = refusal(e); });
    } else this.el.pause();
  }
  private play() { if (this.graphWanted) this.startGraph(this.el); const el = this.el; el.play().catch(e => { if (el === this.el) this.message = refusal(e); }); }
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
  setRate(rate: number, keyLock = this.keyLock) { this.rate = rate; this.keyLock = keyLock; this.applyRate(this.el); }
  private applyRate(el: HTMLAudioElement) {
    el.preservesPitch = this.keyLock;
    // A new source resets playbackRate to the default rate: set both.
    el.defaultPlaybackRate = this.rate; el.playbackRate = this.rate;
  }
  /** The AudioContext the music plays through (the live chain), so other sounds (the metronome) are on
      its clock and output. Call inside a click, so it may start. */
  audioClock(): AudioContext | null { this.startGraph(this.el); return this.live.ctx; }
  setLive(on: boolean) { this.liveOn = on; if (on && !this.el.paused) this.startGraph(this.el); }

  // ─── Taps and the output device (ADR 0068) ───
  private makers = new Map<string, TapMaker>();
  private get graphWanted() { return this.liveOn || this.makers.size > 0; }
  private startGraph(el: HTMLAudioElement) { this.wired.add(el); this.live.start(el, this.fileSr, this.makers, this.sinkId); }
  /** Tap the music with an analyser (made again for each track); taking effect now if it's playing. */
  tap(name: string, make: TapMaker) {
    this.makers.set(name, make);
    if (this.live.el === this.el) this.live.addTap(name, make); else if (!this.el.paused) this.startGraph(this.el);
  }
  untap(name: string) { this.makers.delete(name); this.live.removeTap(name); }
  /** The current track's analyser for a tap, when the music runs through the graph. */
  analyser(name: string): AnalyserNode | null { return this.live.el === this.el ? this.live.taps.get(name) ?? null : null; }
  /** Where the music comes out ('' = the system's default device). */
  sinkId = '';
  async setSink(id: string) {
    await toSink(this.el, id);
    if (this.live.ctx) await toSink(this.live.ctx, id);
    this.sinkId = id;
  }
}

export interface SourceOpts { duration?: number; sampleRate?: number; keepPosition?: boolean; key?: string | null }
export const player = new Player();
