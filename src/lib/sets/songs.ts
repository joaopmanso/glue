/* The page's side of a set worker's questions (ADR 0199): a song's File, or its PCM when the worker can't decode it. */
import { lib } from '../library.svelte';
import { decodeAudio } from '../analysis';
import { MIX_RATE } from '../../core/sets/types';
import type { SongAnswer, SongQuestion } from '../../workers/setDecode';

export async function answerSong(m: SongQuestion, send: (a: SongAnswer, t?: Transferable[]) => void) {
  if (m.kind === 'want') {
    const t = lib.store?.tracks.get(m.id);
    const f = t ? await lib.fileFor(t).catch(() => null) : null;
    send({ kind: 'file', id: m.id, file: f });
  } else {
    try {
      const ab = await decodeAudio(await m.file.arrayBuffer(), MIX_RATE);
      const chs = Array.from({ length: Math.min(2, ab.numberOfChannels) }, (_, c) => new Float32Array(ab.getChannelData(c)));
      send({ kind: 'pcm', id: m.id, channels: chs, sr: ab.sampleRate }, chs.map(c => c.buffer));
    } catch { send({ kind: 'pcm', id: m.id, channels: null, sr: 0 }); }
  }
}
