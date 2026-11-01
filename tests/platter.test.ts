import { describe, expect, it } from 'vitest';
import { PROCESSOR } from '../src/lib/platter';

// The platter run outside the audio thread: a stand-in AudioWorkletProcessor, its port, sampleRate and currentTime.
const SR = 48000;
type Msg = Record<string, unknown>;
function platter() {
  let Cls: new () => { port: { onmessage: (e: { data: Msg }) => void }; process(i: unknown, o: Float32Array[][]): boolean } = null!;
  const sent: Msg[] = [];
  class Base { port = { onmessage: (_: { data: Msg }) => {}, postMessage: (m: Msg) => { sent.push(m); } }; }
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', 'currentTime', PROCESSOR)(Base, (_: string, c: typeof Cls) => { Cls = c; }, SR, 0);
  const p = new Cls();
  const tell = (m: Msg) => p.port.onmessage({ data: m });
  // Blocks of 128 frames, both channels.
  const run = (frames: number) => {
    const L: number[] = [];
    for (let n = 0; n < frames; n += 128) { const o = [new Float32Array(128), new Float32Array(128)]; p.process([], [o]); L.push(...o[0]); }
    return L;
  };
  return { p: p as unknown as { pos: number; vel: number; mode: string }, tell, run, sent };
}
// A 440 Hz tone, 10 s.
const tone = () => { const d = new Float32Array(SR * 10); for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / SR); return d; };
/** The largest step between two samples: a click is a step far above what the tone itself makes. */
const maxStep = (x: number[]) => { let m = 0; for (let i = 1; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1])); return m; };
const toneStep = 0.5 * 2 * Math.PI * 440 / SR;   // the tone's own steepest step at speed 1

describe('the vinyl platter', () => {
  it('held and dragged back and forth, it sounds without a click (no step beyond the tone pitched up)', () => {
    const { tell, run } = platter();
    tell({ type: 'load', channels: [tone(), tone()] });
    tell({ type: 'grab', pos: SR * 5, vel: 1 });
    const out: number[] = [];
    // The hand: 60 moves a second, jumping 20 ms forward, then back, as a pointer does.
    for (let k = 0; k < 60; k++) { tell({ type: 'hand', pos: SR * (5 + (k < 30 ? k : 60 - k) * 0.02) }); out.push(...run(SR / 60)); }
    expect(maxStep(out)).toBeLessThan(toneStep * 3.5);   // pitched up by the speed (at most a few times), never a jump
  });
  it('let go playing, the motor brings it back to the tempo in about a quarter of a second', () => {
    const { p, tell, run } = platter();
    tell({ type: 'load', channels: [tone()] });
    tell({ type: 'grab', pos: SR * 2, vel: 0 });
    run(SR * 0.05);
    tell({ type: 'motor', rate: 1.04 });
    run(SR * 0.25);
    expect(p.vel).toBeGreaterThan(1.04 * 0.95);
    run(SR * 0.3);
    expect(p.vel).toBeCloseTo(1.04, 2);
  });
  it('let go paused, it slows to a stop and says where', () => {
    const { p, tell, run, sent } = platter();
    tell({ type: 'load', channels: [tone()] });
    tell({ type: 'grab', pos: SR * 2, vel: 0 });
    tell({ type: 'hand', pos: SR * 3 });
    run(SR * 0.2);
    tell({ type: 'brake' });
    run(SR * 1);
    expect(p.vel).toBe(0);
    const stop = sent.find(m => m.type === 'stopped');
    expect(stop).toBeTruthy();
    expect(stop!.pos).toBe(p.pos);
  });
  it('it fades in when grabbed and out when told, without a step', () => {
    const { tell, run } = platter();
    tell({ type: 'load', channels: [tone()] });
    tell({ type: 'grab', pos: SR * 2, vel: 1 });
    tell({ type: 'motor', rate: 1 });
    const a = run(SR * 0.05);
    tell({ type: 'out', s: 0.04 });
    const b = run(SR * 0.08);
    expect(Math.abs(a[0])).toBeLessThan(0.01);
    expect(maxStep([...a, ...b])).toBeLessThan(toneStep * 1.5);
    expect(Math.max(...b.slice(-1500).map(Math.abs))).toBe(0);   // (the fade ends 40 ms in)
  });
});
