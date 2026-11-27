/* A set's song decoded for the mixer (ADR 0199): its File asked of the page, decoded here (or by the page when this
   browser can't here), resampled to the mix rate, stereo. Shared by the mixdown and the preview workers. */
import type { Pcm } from '../core/sets/mixer';
import { resample } from '../core/sets/dsp';
import { MIX_RATE } from '../core/sets/types';
import { blankInfo, parseContainer } from '../core/formats/parse';
import { makePcmReader } from '../core/audio/analyze';
import { decodeHere } from './decode';

/** The page's answers: a song's file, or its PCM when the page decoded it. */
export type SongAnswer = { kind: 'file'; id: string; file: Blob | null } | { kind: 'pcm'; id: string; channels: Float32Array[] | null; sr: number };
export type SongQuestion = { kind: 'want'; id: string } | { kind: 'pagedecode'; id: string; file: Blob };

/** Questions to the page, answered through `answer`. */
export class Asker {
  private waiting = new Map<string, (v: SongAnswer) => void>();
  constructor(private post: (m: SongQuestion) => void) {}
  ask(m: SongQuestion): Promise<SongAnswer> {
    return new Promise(res => { this.waiting.set((m.kind === 'want' ? 'file:' : 'pcm:') + m.id, res); this.post(m); });
  }
  /** True when it was an answer. */
  answer(d: { kind: string; id?: string }): boolean {
    if (d.kind !== 'file' && d.kind !== 'pcm') return false;
    const k = d.kind + ':' + d.id, res = this.waiting.get(k);
    if (res) { this.waiting.delete(k); res(d as SongAnswer); }
    return true;
  }
}

/** A song at the mix rate, stereo. Throws an Error with `id` when it can't be had. */
export async function decodeSong(id: string, asker: Asker): Promise<Pcm> {
  const a = await asker.ask({ kind: 'want', id });
  const file = a.kind === 'file' ? a.file : null;
  if (!file) throw Object.assign(new Error('its file isn’t here'), { id });
  const u8 = new Uint8Array(await file.arrayBuffer());
  let info;
  try { info = parseContainer(u8); } catch { info = blankInfo(); }
  info.fileName = (file as File).name ?? ''; info.fileSize = file.size;
  if (info.unsupported) throw Object.assign(new Error(info.unsupported), { id });
  let chs: Float32Array[], sr: number;
  if (info.pcm) {
    const p = info.pcm, read = makePcmReader(u8, p), n = Math.floor(p.len / p.blockAlign), f = new Float64Array(p.ch), iv = new Int32Array(p.ch);
    chs = Array.from({ length: Math.min(2, p.ch) }, () => new Float32Array(n));
    for (let i = 0; i < n; i++) { read(i, f, iv); for (let c = 0; c < chs.length; c++) chs[c][i] = f[c]; }
    sr = info.sampleRate;
  } else {
    const d = await decodeHere(file, info, u8).catch(() => null);
    if (d) { chs = d.channels; sr = d.sr; }
    else {
      const r = await asker.ask({ kind: 'pagedecode', id, file });
      if (r.kind !== 'pcm' || !r.channels?.length) throw Object.assign(new Error('it couldn’t be decoded'), { id });
      chs = r.channels; sr = r.sr;
    }
  }
  const l = chs[0], r = chs[1] ?? chs[0];
  return { l: resample(l, sr, MIX_RATE), r: r === l ? resample(l, sr, MIX_RATE) : resample(r, sr, MIX_RATE) };
}
