/** Where raw PCM sits inside a WAV/AIFF file, so the worker can read it bit-exactly. */
export interface PcmLayout {
  fmt: 'int' | 'float';
  le: boolean;
  off: number;
  len: number;
  ch: number;
  blockAlign: number;
  unsigned8?: boolean;
}

export interface Clue { kind: string; label: string; match: string }

/** What the container says about a file (from the parsers). */
export interface FileInfo {
  container: string;
  codec: string;
  lossless: boolean | null;
  sampleRate: number;
  bits: number;
  channels: number;
  duration: number;
  bitrate: number;
  bitrateMode: string;
  encoder: string;
  vendor: string;
  tags: Record<string, string>;
  notes: string[];
  pcm?: PcmLayout;
  unsupported?: string;
  bitsLabel?: string;
  decodeRate?: number;
  brand?: string;
  compatBrands?: string[];
  lameLowpass?: number;
  lameMethod?: string;
  opusInputRate?: number;
  nominalBitrate?: number;
  channelMode?: string;
  webm?: boolean;
  clues?: Clue[];
  fileName?: string;
  fileSize?: number;
  example?: boolean;
}

export type ProgressFn = (stage: string, p: number) => void;

export interface SampleStats {
  peak: number;
  rms: number;
  clipRuns: number;
  wasted: number | null;
  assessed: boolean;
  nonInt: number;
  floatFmt: boolean;
  on16: number;
  on24: number;
  lrIdentical: boolean;
  lrCorr: number | null;
  silent: boolean;
}

export interface Key {
  tonic: number;           // pitch class 0 = C
  mode: 'major' | 'minor';
}
export interface KeyResult extends Key {
  r: number;
  margin: number;
  runnerUp: Key;
  tuning: number;          // cents from A440
}
export interface MusicResult { bpm: number | null; bpmConf: number; key: KeyResult | null }

export interface Spectrum {
  spec: Float32Array;      // cols × rows, dB, column-major
  cols: number;
  rows: number;
  ltas: Float32Array;      // average power spectrum, dB, per FFT bin
  N: number;
  binHz: number;
}

export interface AnalysisResult extends Spectrum {
  music: MusicResult;
  stats: SampleStats;
  sr: number;
  duration: number;
  channels: number;
  containerBits: number;
  demoPcm: Int16Array | null;
  fp?: { words: Uint32Array; loud: Uint8Array };   // acoustic fingerprint (background analysis only)
}

export type AnalysisJob =
  | { type: 'demo' }
  | { type: 'pcm'; buffer: ArrayBuffer; pcm: PcmLayout; sr: number }
  | { type: 'float'; channels: Float32Array[]; sr: number; bits: number };

export type Severity = 'bad' | 'warn' | 'ok' | 'info';
export interface Finding { sev: Severity; title: string; detail: string }

export interface Cutoff {
  fc: number;
  wall: boolean;
  drop: number;
  full: boolean;
  fade: number;
  globalFloor: number;
  ref: number;
  rising: boolean;
  imaging: { r: number; corr: number } | null;
  sm: Float32Array;
  reach?: number;          // quiet content (peak-hold) reaches this high, when it was checked
}

export type Grade = 'ok' | 'warn' | 'bad' | 'info';
export interface Verdict {
  grade: Grade;
  label: string;
  headline: string;
  sub: string;
  findings: Finding[];
  cut: Cutoff;
  depth: { eff: number; declared: number; float?: boolean } | null;
  bwTone: string;
  origin: string;
  expected: { hz: number; why: string } | null;
}
