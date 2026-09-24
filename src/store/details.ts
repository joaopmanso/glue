/* The full analysis behind a track page, kept so the page opens instantly next time (ADR 0023).
   Per track: `details/<shard>/<id>.json` (file facts, stats, tempo/key) + `<id>.bin` (the average
   spectrum as float32, then the spectrogram quantised to one byte per cell: 0.8 dB steps). */
import type { AnalysisResult, FileInfo } from '../core/types';
import { type Dir, readJSON, removePath, writeBlob, writeJSON } from './fsx';
import { shardOf } from './types';

export const DETAILS_VERSION = 1;   // bump when the analysis or this format changes
const Q_STEP = 0.8, Q_FLOOR = -204;  // one byte covers −204 … 0 dB

interface Header {
  v: number; fileSize: number; fileMtime: number;
  info: FileInfo;
  res: Omit<AnalysisResult, 'spec' | 'ltas' | 'demoPcm'>;
  ltasLen: number; specLen: number;
}

export function encodeDetails(info: FileInfo, res: AnalysisResult, file: { size: number; mtime: number }): { header: Header; bin: Uint8Array } {
  const { spec, ltas, demoPcm: _demo, ...rest } = res;
  const { pcm: _pcm, ...slimInfo } = info;
  const bin = new Uint8Array(ltas.length * 4 + spec.length);
  new Float32Array(bin.buffer, 0, ltas.length).set(ltas);
  const q = bin.subarray(ltas.length * 4);
  for (let i = 0; i < spec.length; i++) q[i] = Math.max(0, Math.min(255, Math.round((spec[i] - Q_FLOOR) / Q_STEP)));
  return { header: { v: DETAILS_VERSION, fileSize: file.size, fileMtime: file.mtime, info: slimInfo as FileInfo, res: rest, ltasLen: ltas.length, specLen: spec.length }, bin };
}

export function decodeDetails(header: Header, bin: Uint8Array): { info: FileInfo; res: AnalysisResult } {
  const ltas = new Float32Array(bin.slice(0, header.ltasLen * 4).buffer);
  const q = bin.subarray(header.ltasLen * 4, header.ltasLen * 4 + header.specLen);
  const spec = new Float32Array(header.specLen);
  for (let i = 0; i < spec.length; i++) spec[i] = q[i] * Q_STEP + Q_FLOOR;
  return { info: header.info, res: { ...header.res, spec, ltas, demoPcm: null } };
}

const paths = (base: string, id: string) => { const p = `${base}/details/${shardOf(id)}/${id}`; return { json: p + '.json', bin: p + '.bin' }; };

export async function saveDetails(root: Dir, base: string, id: string, info: FileInfo, res: AnalysisResult, file: { size: number; mtime: number }) {
  const { header, bin } = encodeDetails(info, res, file), p = paths(base, id);
  await writeBlob(root, p.bin, new Blob([bin.slice().buffer]));
  await writeJSON(root, p.json, header);   // written last: a header always has its data
}

/** The stored analysis, or null when there is none or the file has changed since. */
export async function loadDetails(root: Dir, base: string, id: string, file: { size: number | null; mtime: number | null }) {
  const p = paths(base, id);
  let header: Header | null;
  try { header = await readJSON<Header>(root, p.json); } catch { return null; }
  if (!header || header.v !== DETAILS_VERSION || header.fileSize !== file.size || header.fileMtime !== file.mtime) return null;
  try {
    const parts = p.bin.split('/'), name = parts.pop()!;
    let d = root;
    for (const part of parts) d = await d.getDirectoryHandle(part);
    const bin = new Uint8Array(await (await (await d.getFileHandle(name)).getFile()).arrayBuffer());
    if (bin.length < header.ltasLen * 4 + header.specLen) return null;
    return decodeDetails(header, bin);
  } catch { return null; }
}

export async function removeDetails(root: Dir, base: string, id: string) {
  const p = paths(base, id);
  await removePath(root, p.json); await removePath(root, p.bin);
}
