/* The vinyl deck's platter (scratch.svelte.ts): an AudioWorklet processor, as source (it runs in the audio thread,
   loaded from a Blob). Held, it chases the hand; motor, it comes back to the tempo; brake, it slows to a stop. */
export const PROCESSOR = `
class Platter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ch = null; this.len = 0; this.pos = 0; this.vel = 0; this.mode = 'idle'; this.target = 0; this.rate = 1;
    this.gain = 0; this.gainTo = 0; this.gainStep = 0; this.lp = [0, 0]; this.tick = 0;
    this.port.onmessage = e => {
      const m = e.data;
      if (m.type === 'load') { this.ch = m.channels; this.len = this.ch[0].length; }
      else if (m.type === 'grab') {
        if (!m.keep || this.mode === 'idle') { this.pos = m.pos; this.vel = m.vel; }
        this.target = this.pos; this.mode = 'hand'; this.fade(1, 0.008);
      }
      else if (m.type === 'hand') { this.target = m.pos; if (this.mode !== 'idle') this.mode = 'hand'; }
      else if (m.type === 'motor') { this.mode = 'motor'; this.rate = m.rate; }
      else if (m.type === 'brake') this.mode = 'brake';
      else if (m.type === 'out') this.fade(0, m.s);
      else if (m.type === 'stop') { this.mode = 'idle'; this.gain = 0; this.gainTo = 0; }
    };
  }
  fade(to, s) { this.gainTo = to; this.gainStep = Math.abs(to - this.gain) / Math.max(1, s * sampleRate); }
  // Four points around a fractional position, cubic (Catmull-Rom): smooth at every speed.
  at(d, p) {
    const i = Math.floor(p), f = p - i, n = this.len;
    const y0 = d[Math.max(0, i - 1)], y1 = d[Math.min(n - 1, Math.max(0, i))], y2 = d[Math.min(n - 1, i + 1)], y3 = d[Math.min(n - 1, i + 2)];
    return y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0)));
  }
  process(_in, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || out[0];
    if (!this.ch || this.mode === 'idle') { L.fill(0); if (R !== L) R.fill(0); return true; }
    const sr = sampleRate, hand = 1 - Math.exp(-1 / (0.014 * sr)), motor = 1 - Math.exp(-1 / (0.07 * sr)), brake = 1 - Math.exp(-1 / (0.09 * sr));
    const d0 = this.ch[0], d1 = this.ch[1] || this.ch[0];
    for (let s = 0; s < L.length; s++) {
      if (this.mode === 'hand') {
        // The hand pulls the record towards where it is; the platter's mass smooths the pull.
        let want = (this.target - this.pos) / (0.025 * sr);
        if (want > 6) want = 6; else if (want < -6) want = -6;
        this.vel += (want - this.vel) * hand;
      } else if (this.mode === 'motor') this.vel += (this.rate - this.vel) * motor;
      else if (this.mode === 'brake') {
        this.vel += -this.vel * brake;
        if (Math.abs(this.vel) < 0.002) { this.vel = 0; this.mode = 'held'; this.port.postMessage({ type: 'stopped', pos: this.pos }); }
      }
      this.pos += this.vel;
      if (this.pos < 0) { this.pos = 0; this.vel = 0; } else if (this.pos > this.len - 2) { this.pos = this.len - 2; this.vel = 0; }
      if (this.gain !== this.gainTo) this.gain = this.gain < this.gainTo ? Math.min(this.gainTo, this.gain + this.gainStep) : Math.max(this.gainTo, this.gain - this.gainStep);
      // Faster than the record's speed, a gentle low-pass against aliasing.
      const v = Math.abs(this.vel), a = v > 1 ? 1 / v : 1;
      this.lp[0] += (this.at(d0, this.pos) - this.lp[0]) * a;
      this.lp[1] += (this.at(d1, this.pos) - this.lp[1]) * a;
      L[s] = this.lp[0] * this.gain; if (R !== L) R[s] = this.lp[1] * this.gain;
    }
    if (++this.tick % 2 === 0) this.port.postMessage({ type: 'pos', pos: this.pos, vel: this.vel, t: currentTime });
    return true;
  }
}
registerProcessor('glue-platter', Platter);
`;
