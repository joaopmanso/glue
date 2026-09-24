/* The full analysis behind a track page, kept so the page opens instantly (ADR 0023, 0024).
   Derived data in the browser's own storage (not the MCO folder): `details/<cid>/<shard>/<id>.json`
   (file facts, sample stats, tempo/key, sizes) + `<id>.bin`, deflate-compressed: the average spectrum
   as float32, then the spectrogram at one byte per cell (0.8 dB steps), rows delta-coded. */
import type { AnalysisResult, FileInfo } from '../core/types';
import { type Dir, readJSON, removePath, writeBlob, writeJSON } from './fsx';
import { shardOf } from './types';

export const DETAILS_VERSION = 2;    // bump when the analysis or this format changes
const Q_STEP = 0.8, Q_FLOOR = -204;  // one byte covers −204 … 0 dB
export const MAX_ROWS = 512;         // frequency rows kept (enough for the display; the verdict uses the full average spectrum)

export interface DetailsHeader {
  v: number; fileSize: number; fileMtime: number;
  info: FileInfo;
  res: Omit<AnalysisResult, 'spec' | 'ltas' | 'demoPcm'>;
  ltasLen: number; specLen: number;
}

async function pipe(data: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([data.slice().buffer]).stream().pipeThrough(t)).arrayBuffer());
}

/** Build the stored form. Also runs in the analysis workers. */
export async function encodeDetails(info: FileInfo, res: AnalysisResult, file: { size: number; mtime: number }): Promise<{ header: DetailsHeader; bin: Uint8Array }> {
  const { spec, ltas, demoPcm: _demo, ...rest } = res;
  const { pcm: _pcm, ...slimInfo } = info;
  // Fewer rows: keep the louder of each group, so thin lines (a lowpass edge, a pilot tone) survive.
  const f = Math.max(1, Math.ceil(res.rows / MAX_ROWS)), rows = Math.ceil(res.rows / f), cols = res.cols;
  const raw = new Uint8Array(ltas.length * 4 + cols * rows);
  new Float32Array(raw.buffer, 0, ltas.length).set(ltas);
  const q = raw.subarray(ltas.length * 4);
  for (let c = 0; c < cols; c++) {
    let prev = 0;
    for (let r = 0; r < rows; r++) {
      let m = -Infinity;
      for (let k = r * f; k < Math.min(res.rows, r * f + f); k++) m = Math.max(m, spec[c * res.rows + k]);
      const v = Math.max(0, Math.min(255, Math.round((m - Q_FLOOR) / Q_STEP)));
      q[c * rows + r] = (v - prev) & 255;   // neighbouring rows are similar: small deltas compress well
      prev = v;
    }
  }
  const header: DetailsHeader = { v: DETAILS_VERSION, fileSize: file.size, fileMtime: file.mtime, info: slimInfo as FileInfo, res: { ...rest, rows }, ltasLen: ltas.length, specLen: cols * rows };
  return { header, bin: await pipe(raw, new CompressionStream('deflate')) };
}

export async function decodeDetails(header: DetailsHeader, bin: Uint8Array): Promise<{ info: FileInfo; res: AnalysisResult }> {
  const raw = await pipe(bin, new DecompressionStream('deflate'));
  if (raw.length < header.ltasLen * 4 + header.specLen) throw new Error('Stored analysis is incomplete');
  const ltas = new Float32Array(raw.slice(0, header.ltasLen * 4).buffer);
  const q = raw.subarray(header.ltasLen * 4), rows = header.res.rows, spec = new Float32Array(header.specLen);
  for (let c = 0; c < header.res.cols; c++) {
    let v = 0;
    for (let r = 0; r < rows; r++) { v = (v + q[c * rows + r]) & 255; spec[c * rows + r] = v * Q_STEP + Q_FLOOR; }
  }
  return { info: header.info, res: { ...header.res, spec, ltas, demoPcm: null } };
}

const paths = (cid: string, id: string) => { const p = `details/${cid}/${shardOf(id)}/${id}`; return { json: p + '.json', bin: p + '.bin' }; };

export async function writeDetails(dir: Dir, cid: string, id: string, d: { header: DetailsHeader; bin: Uint8Array }) {
  const p = paths(cid, id);
  await writeBlob(dir, p.bin, new Blob([d.bin.slice().buffer]));
  await writeJSON(dir, p.json, d.header);   // written last: a header always has its data
}

/** The stored analysis, or null when there is none or the file has changed since. */
export async function loadDetails(dir: Dir, cid: string, id: string, file: { size: number | null; mtime: number | null }) {
  const p = paths(cid, id);
  let header: DetailsHeader | null;
  try { header = await readJSON<DetailsHeader>(dir, p.json); } catch { return null; }
  if (!header || header.v !== DETAILS_VERSION || header.fileSize !== file.size || header.fileMtime !== file.mtime) return null;
  try {
    const parts = p.bin.split('/'), name = parts.pop()!;
    let d = dir;
    for (const part of parts) d = await d.getDirectoryHandle(part);
    return await decodeDetails(header, new Uint8Array(await (await (await d.getFileHandle(name)).getFile()).arrayBuffer()));
  } catch { return null; }
}

/** Is there a valid stored analysis? (without reading the data) */
export async function hasDetails(dir: Dir, cid: string, id: string, file: { size: number | null; mtime: number | null }) {
  try { const h = await readJSON<DetailsHeader>(dir, paths(cid, id).json); return !!h && h.v === DETAILS_VERSION && h.fileSize === file.size && h.fileMtime === file.mtime; }
  catch { return false; }
}

export async function removeDetails(dir: Dir, cid: string, id: string) {
  const p = paths(cid, id);
  await removePath(dir, p.json); await removePath(dir, p.bin);
}
