// The Math functions the analysis uses, on the inputs it uses (crates/glue-audio/tests/jsmath.rs computes the same
// grids from plain arithmetic). Every 37th output is kept (tests/data/jsmath.bin): the engine's maths (libm) must be
// within 2 ulp of V8's. Measured 2026-10-02: cos/sin/exp/log/log10/pow differ by 1-2 ulp on 0.001-9% of inputs, far
// below what reaches a stored result (f32, 0.8 dB steps, bytes).
//   node scripts/jsmath.mjs            writes crates/glue-audio/tests/data/jsmath.bin
//   node scripts/jsmath.mjs dump <fn>  every output of one grid, to see where it differs
import { writeFileSync } from 'node:fs';

export const GRIDS = {
  // FFT twiddles and windows: 2πi/n for every size used (512..16384), and 2πi/(n-1)
  cos_tw: () => { const o = []; for (let n = 512; n <= 16384; n *= 2) for (let i = 0; i < n; i++) o.push(2 * Math.PI * i / n, 2 * Math.PI * i / (n - 1)); return o; },
  // dB: log10 of powers from 1e-30 to 1e6
  log10: () => { const o = []; let x = 1e-31; for (let i = 0; i < 200000; i++) { o.push(x + 1e-30); x *= 1.000414; } return o; },
  // power from dB: pow(10, x/10) for x in -310..120
  pow10: () => { const o = []; for (let i = 0; i <= 43000; i++) o.push((-310 + i / 100) / 10); return o; },
  // log2 / log / exp / pow(2,..) on the music path
  log2: () => { const o = []; for (let i = 1; i <= 100000; i++) o.push(i / 997.0 + 1e-6); return o; },
  log: () => { const o = []; for (let i = 0; i < 100000; i++) o.push(1 + i * 0.37); return o; },
  exp: () => { const o = []; for (let i = 0; i < 100000; i++) o.push(-50 + i / 1000); return o; },
  pow2: () => { const o = []; for (let i = 0; i < 100000; i++) o.push(-40 + i / 1000); return o; },
  atan2: () => { const o = []; for (let i = 0; i < 20000; i++) o.push(((i * 13) % 211) - 105.5, ((i * 7) % 173) - 86.25 + 0.01 * (i % 5)); return o; },
  sin_tw: () => { const o = []; for (let n = 512; n <= 16384; n *= 2) for (let i = 0; i < n; i++) o.push(2 * Math.PI * i / n); return o; },
  sqrt: () => { const o = []; for (let i = 0; i < 100000; i++) o.push(i * 1.7 + 0.001); return o; },
};
export const FNS = {
  cos_tw: x => Math.cos(x), sin_tw: x => Math.sin(x), log10: x => Math.log10(x), pow10: x => Math.pow(10, x), log2: x => Math.log2(x),
  log: x => Math.log(x), exp: x => Math.exp(x), pow2: x => Math.pow(2, x), sqrt: x => Math.sqrt(x),
};
const out = (name) => {
  const ins = GRIDS[name](), res = [];
  if (name === 'atan2') for (let i = 0; i < ins.length; i += 2) res.push(Math.atan2(ins[i], ins[i + 1]));
  else for (const x of ins) res.push(FNS[name](x));
  return { ins, res };
};
if (process.argv[2] === 'dump') {
  const { ins, res } = out(process.argv[3]);
  writeFileSync(process.argv[4] ?? 'jsmath-' + process.argv[3] + '.bin', Buffer.from(new Float64Array(res).buffer));
  console.log(ins.length, 'inputs');
} else {
  const parts = [];
  for (const name of Object.keys(GRIDS)) {
    const { res } = out(name), kept = res.filter((_, i) => i % 37 === 0), head = Buffer.alloc(8 + name.length);
    head.writeUInt32LE(name.length, 0); head.write(name, 4, 'latin1'); head.writeUInt32LE(kept.length, 4 + name.length);
    parts.push(head, Buffer.from(new Float64Array(kept).buffer));
  }
  writeFileSync(new URL('../crates/glue-audio/tests/data/jsmath.bin', import.meta.url), Buffer.concat(parts));
  console.log(Object.keys(GRIDS).join(', '));
}
