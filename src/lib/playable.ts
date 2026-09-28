/* What the browser can play (ADR 0076): a file as it is, or AIFF rewrapped as WAV (Chrome and Firefox
   can't play AIFF). And whether a format plays in the browser by itself, so it can stream. */
import { blankInfo, parseContainer } from '../core/formats/parse';
import { pcmToWav } from '../core/formats/wav';

/** Chrome and Firefox can't play AIFF: rewrap its PCM as WAV (same samples). */
export async function playable(file: File): Promise<Blob> {
  if (!/\.(aif|aiff|aifc)$/i.test(file.name)) return file;
  const u8 = new Uint8Array(await file.arrayBuffer());
  let info = blankInfo();
  try { info = parseContainer(u8); } catch { return file; }
  return info.pcm ? pcmToWav(u8, info.pcm, info.sampleRate) : file;
}

const TYPES: Record<string, string> = { mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff', aifc: 'audio/aiff', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg; codecs=opus', webm: 'audio/webm' };
/** The media type of a file name ('' when unknown). */
export const typeOfName = (name: string) => TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? '';
let probe: HTMLAudioElement | null = null;
/** Does this browser play the type by itself (so it can stream it, rather than rewrap the whole file)? */
export function playsNatively(type: string): boolean {
  if (!type || typeof document === 'undefined') return false;
  probe ??= document.createElement('audio');
  return probe.canPlayType(type) !== '';
}
