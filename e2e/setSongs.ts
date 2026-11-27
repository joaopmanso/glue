/* Songs for the sets' tests (e2e/sets.spec.ts, e2e/homemode.spec.ts): synthetic, on the beat, with an intro. */

/** A 40 s song at `bpm`: a quiet 4 s intro, then kicks, hats and a chord (22.05 kHz mono, 16-bit WAV). */
export function setSong(bpm: number, root: number): Buffer {
  const sr = 22050, n = sr * 40, d = Buffer.alloc(n * 2);
  let a = bpm * 7919;
  const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296 * 2 - 1; };
  for (let i = 0; i < n; i++) {
    const t = i / sr, beat = (t * bpm / 60) % 1, e = (t * bpm / 30) % 1;
    let v = t < 4 ? 0.02 * Math.sin(2 * Math.PI * root * t) : 0;
    if (t >= 4) v += 0.5 * Math.exp(-beat * 12) * Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-beat * 30)) * t) + 0.08 * Math.exp(-e * 40) * r() + 0.08 * (Math.sin(2 * Math.PI * root * t) + Math.sin(2 * Math.PI * root * 1.26 * t) + Math.sin(2 * Math.PI * root * 1.5 * t));
    d.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + d.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(d.length, 40);
  return Buffer.concat([h, d]);
}
