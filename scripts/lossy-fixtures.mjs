// The lossy fixtures for the native engine's parity (ADR 0147): the deterministic demo (src/core/audio/analyze.ts
// synthDemo, 12 s: long enough for tempo and key) encoded by ffmpeg into what the user's collection holds: MP3 (with a
// LAME tag and without), AAC in M4A, Ogg Vorbis, and ALAC with a FLAC of the same samples beside it. Written once
// into tests/fixtures/lossy/ (committed): the goldens come from them (e2e/golden.spec.ts in Edge; ALAC against FLAC).
//   node scripts/lossy-fixtures.mjs        (needs ffmpeg on PATH, or FFMPEG=<path>)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const ff = process.env.FFMPEG || 'ffmpeg';
const out = new URL('../tests/fixtures/lossy/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(out, { recursive: true });

// The demo's samples, through Vite's loader (the module is TypeScript).
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { synthDemo } = await vite.ssrLoadModule('/src/core/audio/analyze.ts');
const { channels, sr } = synthDemo();
await vite.close();

// 16-bit WAV (the demo's samples are on the 16-bit grid).
const n = channels[0].length, data = Buffer.alloc(n * 4);
for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(channels[c][i] * 32768))), (i * 2 + c) * 2);
const head = Buffer.alloc(44);
head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8); head.write('fmt ', 12); head.writeUInt32LE(16, 16);
head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(sr, 24); head.writeUInt32LE(sr * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
head.write('data', 36); head.writeUInt32LE(data.length, 40);
const tmp = mkdtempSync(join(tmpdir(), 'glue-lossy-')), wav = join(tmp, 'demo.wav');
writeFileSync(wav, Buffer.concat([head, data]));

const make = [
  ['demo-320.mp3', ['-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '320k']],
  ['demo-128.mp3', ['-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k']],
  ['demo-noxing.mp3', ['-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', '-write_xing', '0']],
  ['demo-256.m4a', ['-ar', '48000', '-c:a', 'aac', '-b:a', '256k']],
  ['demo.ogg', ['-ar', '48000', '-c:a', 'libvorbis', '-q:a', '6']],
  ['demo-alac.m4a', ['-ar', '44100', '-c:a', 'alac']],
  ['demo-alac.flac', ['-ar', '44100', '-c:a', 'flac']],
];
for (const [name, args] of make) {
  execFileSync(ff, ['-loglevel', 'error', '-y', '-i', wav, ...args, join(out, name)]);
  console.log(name);
}
