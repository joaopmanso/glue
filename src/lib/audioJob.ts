/* A file's audio as a job for the analysis worker: raw PCM when GLUE reads the format itself (WAV,
   AIFF), else decoded by the browser. Used by the Prepare tab's waveform and by fingerprints made
   again on this browser. */
import { decodeAudio } from './analysis';
import { blankInfo, parseContainer } from '../core/formats/parse';
import type { AnalysisJob } from '../core/types';

export async function jobOf(file: File): Promise<Exclude<AnalysisJob, { type: 'demo' }>> {
  const buf = await file.arrayBuffer();
  let info = blankInfo();
  try { info = parseContainer(new Uint8Array(buf)); } catch { /* the browser decodes it */ }
  if (info.pcm) return { type: 'pcm', buffer: buf, pcm: info.pcm, sr: info.sampleRate };
  const ab = await decodeAudio(buf, info.decodeRate || info.sampleRate || 48000);
  const channels: Float32Array[] = [];
  for (let c = 0; c < ab.numberOfChannels; c++) channels.push(new Float32Array(ab.getChannelData(c)));
  return { type: 'float', channels, sr: ab.sampleRate, bits: 0 };
}
