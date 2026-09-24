import { describe, expect, it } from 'vitest';
import { parseContainer } from '../src/core/formats/parse';
import { scanClues } from '../src/core/formats/clues';
import { encodeWav, pcmToWav } from '../src/core/formats/wav';
import { makePcmReader } from '../src/core/audio/analyze';
import { fixture } from './helpers';

describe('container parsing on real encoder output', () => {
  it('MP3 (LAME 128k)', () => {
    const u8 = fixture('mp3-128k.mp3'), info = parseContainer(u8);
    expect(info.codec).toBe('MP3');
    expect(info.lossless).toBe(false);
    expect(info.sampleRate).toBe(44100);
    expect(info.encoder).toMatch(/^Lavc|^LAME/);
    expect(Math.round(info.bitrate)).toBeGreaterThanOrEqual(120);
    expect(info.duration).toBeGreaterThan(3.9);
    expect(info.tags.TIT2).toBe('Fixture MP3');
    expect(scanClues(u8, info).some(c => c.kind === 'ffmpeg' || c.kind === 'mp3')).toBe(true);
  });
  it('AAC in M4A', () => {
    const info = parseContainer(fixture('aac-128k.m4a'));
    expect(info.codec).toBe('AAC-LC');
    expect(info.lossless).toBe(false);
    expect(info.sampleRate).toBe(44100);
    expect(info.channels).toBe(2);
    expect(info.container).toMatch(/^MPEG-4/);
  });
  it('FLAC 96 kHz / 24-bit', () => {
    const info = parseContainer(fixture('flac-96k-24.flac'));
    expect(info).toMatchObject({ container: 'FLAC', codec: 'FLAC', lossless: true, sampleRate: 96000, bits: 24, channels: 2 });
    expect(info.tags.TITLE).toBe('Fixture FLAC');
    expect(info.vendor).toMatch(/Lavf|libFLAC/);
  });
  it('Opus in Ogg', () => {
    const info = parseContainer(fixture('opus-160k.opus'));
    expect(info).toMatchObject({ container: 'Ogg', codec: 'Opus', lossless: false, sampleRate: 48000 });
    expect(info.opusInputRate).toBe(48000);
    expect(info.duration).toBeGreaterThan(3.9);
  });
  it('AIFF 24-bit big-endian', () => {
    const info = parseContainer(fixture('aiff-44k-24.aiff'));
    expect(info).toMatchObject({ container: 'AIFF', lossless: true, sampleRate: 44100, bits: 24, channels: 2 });
    expect(info.pcm).toMatchObject({ fmt: 'int', le: false, blockAlign: 6, ch: 2 });
  });
  it('WAV 24-bit', () => {
    const info = parseContainer(fixture('wav-44k-24.wav'));
    expect(info).toMatchObject({ lossless: true, sampleRate: 44100, bits: 24, channels: 2 });
    expect(info.pcm).toMatchObject({ fmt: 'int', le: true, blockAlign: 6 });
  });
});

describe('WAV writers', () => {
  it('encodeWav round-trips through the parser and PCM reader (24-bit)', async () => {
    const L = new Float32Array(1000).map((_, i) => Math.sin(i / 10) * 0.5), R = L.map(v => -v);
    const u8 = new Uint8Array(await encodeWav([L, R], 48000, 24).arrayBuffer());
    const info = parseContainer(u8);
    expect(info).toMatchObject({ sampleRate: 48000, bits: 24, channels: 2 });
    const read = makePcmReader(u8, info.pcm!), f = new Float64Array(2), iv = new Int32Array(2);
    read(123, f, iv);
    expect(f[0]).toBeCloseTo(L[123], 5);
    expect(f[1]).toBeCloseTo(R[123], 5);
  });
  it('pcmToWav rewraps big-endian AIFF bit-identically', async () => {
    const aiff = fixture('aiff-44k-24.aiff'), a = parseContainer(aiff);
    const wav = new Uint8Array(await pcmToWav(aiff, a.pcm!, a.sampleRate).arrayBuffer()), w = parseContainer(wav);
    const ra = makePcmReader(aiff, a.pcm!), rw = makePcmReader(wav, w.pcm!);
    const fa = new Float64Array(2), fw = new Float64Array(2), ia = new Int32Array(2), iw = new Int32Array(2);
    for (const i of [0, 1, 999, 50000, 170000]) { ra(i, fa, ia); rw(i, fw, iw); expect(Array.from(iw)).toEqual(Array.from(ia)); }
  });
});
