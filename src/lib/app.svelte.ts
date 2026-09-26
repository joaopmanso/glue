/* "Analyze a file" state and orchestration. */
import type { AnalysisJob, AnalysisResult, FileInfo, Verdict } from '../core/types';
import { blankInfo, parseContainer } from '../core/formats/parse';
import { scanClues } from '../core/formats/clues';
import { classify } from '../core/audio/verdict';
import { pcmToWav } from '../core/formats/wav';
import { fmtRate } from '../core/format';
import type { KeyNotation } from '../core/audio/keys';
import { analyze, decodeAudio } from './analysis';
import { buildLut, type PaletteName } from '../ui/render/palettes';
import { readPref, writePref } from './prefs';

const STAGE_WEIGHTS: Record<string, [number, number]> = {
  'Generating example': [0, 0.25], 'Reading samples': [0.25, 0.45], 'Computing spectrum': [0.45, 0.75], 'Detecting tempo and key': [0.75, 1],
};

class AppState {
  phase = $state<'start' | 'result'>('start');
  busy = $state<{ text: string; p: number | null } | null>(null);
  error = $state<{ name: string; message: string } | null>(null);
  info = $state.raw<FileInfo | null>(null);
  res = $state.raw<AnalysisResult | null>(null);
  verdict = $state.raw<Verdict | null>(null);
  playBlob = $state.raw<Blob | null>(null);
  /** The player source the result belongs to ('track:<id>'), or null for a one-off file. */
  playKey = $state<string | null>(null);
  dbFloor = $state(-120);
  palette = $state<PaletteName>('spek');
  lut = $state.raw<Uint8ClampedArray>(buildLut('spek'));
  markers = $state(true);
  /** A library track's page: the BPM as the library shows it (the user's correction, the profile's
      range), shown by the Tempo card instead of the analysis's (ADR 0052). */
  bpmView = $state<{ bpm: number; note: string } | null>(null);
  keyNotation = $state<KeyNotation>(readPref('keyNotation', 'camelot') as KeyNotation);
  liveOn = $state(readPref('live', '0') === '1');
  liveMode = $state<'scroll' | '3d'>(readPref('liveMode', 'scroll') === '3d' ? '3d' : 'scroll');
  dragging = $state(false);

  setPalette(p: PaletteName) { this.palette = p; this.lut = buildLut(p); }
  setNotation(n: KeyNotation) { this.keyNotation = n; writePref('keyNotation', n); }
  setLive(on: boolean) { this.liveOn = on; writePref('live', on ? '1' : '0'); }
  setLiveMode(m: 'scroll' | '3d') { this.liveMode = m; writePref('liveMode', m); }
}
export const app = new AppState();

let current = 0;   // only the latest request may update the UI

function progress(token: number) {
  return (stage: string, p: number) => {
    if (token !== current) return;
    const [a, b] = STAGE_WEIGHTS[stage] || [0, 1];
    app.busy = { text: stage + '…', p: a + (b - a) * p };
  };
}

/** Show an analysis result (fresh, or stored from an earlier visit). */
export function showResult(info: FileInfo, res: AnalysisResult, playBlob: Blob | null) { finish(info, res, playBlob); }

function finish(info: FileInfo, res: AnalysisResult, playBlob: Blob | null) {
  const verdict = classify(info, res);
  app.info = info; app.res = res; app.verdict = verdict; app.playBlob = playBlob;
  app.dbFloor = Math.max(-170, Math.min(-80, Math.round((verdict.cut.globalFloor - 8) / 10) * 10));
  app.phase = 'result';
  app.busy = null;
}

function errorMessage(info: FileInfo | null, err: unknown): string {
  const e = err as { name?: string; message?: string } | null;
  let msg = (e && e.message) || String(err || 'Unknown error');
  if (!err || e?.name === 'EncodingError' || /^(decode failed|null)$/i.test(msg) || /Unable to decode/i.test(msg)) msg = 'The browser couldn’t decode it.';
  if (info?.codec === 'ALAC') msg += ' Chrome and Firefox can’t decode ALAC; open it in Safari, or convert it to FLAC.';
  else if (info?.container === 'Unknown') msg += ' The format wasn’t recognised. FLAC, WAV, AIFF, M4A, MP3, AAC, Ogg, Opus and WebM are supported.';
  return msg;
}

/** Analyse one file. `playKey` names the library track it is, so the player can keep playing it. */
export async function analyzeFile(file: File, playKey: string | null = null) {
  const token = ++current;
  app.playKey = playKey;
  app.error = null;
  app.busy = { text: 'Reading file…', p: 0 };
  let info: FileInfo | null = null;
  try {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    try { info = parseContainer(u8); } catch (e) { console.warn(e); info = blankInfo(); }
    info.fileName = file.name; info.fileSize = file.size;
    info.clues = scanClues(u8, info);
    if (info.unsupported) throw new Error(info.unsupported);
    // AIFF won't play in Chrome/Firefox: rewrap the same PCM as WAV, before the buffer goes to the worker.
    const playBlob = info.pcm && /^AIFF/.test(info.container) ? pcmToWav(u8, info.pcm, info.sampleRate) : file;
    let job: AnalysisJob;
    if (info.pcm) job = { type: 'pcm', buffer: buf, pcm: info.pcm, sr: info.sampleRate };
    else {
      app.busy = { text: 'Decoding audio…', p: null };
      const rate = info.decodeRate || info.sampleRate || 48000;
      if (!info.sampleRate) info.notes.push('Sample rate not found in the header; decoded at 48 kHz.');
      const ab = await decodeAudio(buf, rate);
      if (ab.sampleRate !== rate) info.notes.push('The browser resampled this file to ' + fmtRate(ab.sampleRate) + ' while decoding.');
      const chs: Float32Array[] = [];
      for (let c = 0; c < ab.numberOfChannels; c++) chs.push(new Float32Array(ab.getChannelData(c)));
      job = { type: 'float', channels: chs, sr: ab.sampleRate, bits: info.lossless ? info.bits : 0 };
      if (!info.channels) info.channels = ab.numberOfChannels;
    }
    if (token !== current) return;
    const res = await analyze(job, progress(token));
    if (token !== current) return;   // a newer file was opened meanwhile
    if (!info.sampleRate) info.sampleRate = res.sr;
    if (!info.duration) info.duration = res.duration;
    if (!info.bitrate && info.duration && info.lossless === false) info.bitrate = (info.fileSize || 0) * 8 / info.duration / 1000;
    if (!info.channels) info.channels = res.channels;
    finish(info, res, playBlob);
  } catch (e) {
    if (token !== current) return;
    console.error(e);
    app.busy = null;
    app.error = { name: file.name, message: errorMessage(info, e) };
  }
}

export async function loadExample() {
  const token = ++current;
  app.playKey = null;
  app.error = null;
  app.busy = { text: 'Generating example…', p: 0 };
  try {
    const res = await analyze({ type: 'demo' }, progress(token));
    if (token !== current) return;
    const info = Object.assign(blankInfo(), {
      fileName: 'example-96k-24bit.flac', container: 'FLAC', codec: 'FLAC', lossless: true, sampleRate: 96000, bits: 24, channels: 2,
      duration: res.duration, vendor: 'reference libFLAC 1.4.3 20230623', example: true, clues: [],
      tags: { TITLE: 'Synthetic example', COMMENT: 'Generated in your browser: 16 kHz wall, 16-bit samples, 96 kHz / 24-bit label' },
    });
    const pcm = new Uint8Array(res.demoPcm!.buffer);
    finish(info, res, pcmToWav(pcm, { fmt: 'int', le: true, off: 0, len: pcm.length, ch: 2, blockAlign: 4 }, res.sr));
  } catch (e) {
    if (token !== current) return;
    console.error(e);
    app.busy = null;
    app.error = { name: 'the example', message: errorMessage(null, e) };
  }
}
