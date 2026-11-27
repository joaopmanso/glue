/* Exporting a set as one file (ADR 0199): the save dialog first (from the click), then the mixdown worker, which asks
   for each song's file as the mix reaches it. Progress, time left, cancel; the tracklist to save beside it. */
import { lib } from '../library.svelte';
import { decodeAudio } from '../analysis';
import { downloadBlob } from '../download';
import { MIX_RATE, type SetPlan } from '../../core/sets/types';
import type { FromMixdown, MixFormat, ToMixdown } from '../../workers/mixdown.worker';

type SavePicker = (o: { suggestedName: string; id?: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>;

class SetExport {
  busy = $state(false);
  done = $state(0);
  total = $state(0);
  /** Seconds left, once it can be told. */
  left = $state<number | null>(null);
  error = $state('');
  /** The file made: its name. */
  result = $state('');
  private w: Worker | null = null;
  private began = 0;

  /** From a click (the save dialog has to open first). */
  async start(plan: SetPlan, name: string, format: MixFormat) {
    if (this.busy) return;
    const file = name.replace(/[\\/:*?"<>|]+/g, ' ').trim() + (format === 'wav' ? '.wav' : '.mp3');
    const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
    let handle: FileSystemFileHandle | null = null;
    if (picker) {
      try { handle = await picker({ suggestedName: file, id: 'glue-set', types: [{ description: format === 'wav' ? 'WAV audio' : 'MP3 audio', accept: { [format === 'wav' ? 'audio/wav' : 'audio/mpeg']: [format === 'wav' ? '.wav' : '.mp3'] } }] }); }
      catch (e) { if ((e as Error).name === 'AbortError') return; this.error = 'Couldn’t save there: ' + (e as Error).message; return; }
    }
    this.busy = true; this.done = 0; this.total = 0; this.left = null; this.error = ''; this.result = ''; this.began = performance.now();
    const w = new Worker(new URL('../../workers/mixdown.worker.ts', import.meta.url), { type: 'module' });
    this.w = w;
    const send = (m: ToMixdown, t: Transferable[] = []) => w.postMessage(m, t);
    w.onmessage = async (e: MessageEvent<FromMixdown>) => {
      const m = e.data;
      if (m.kind === 'want') {
        const t = lib.store?.tracks.get(m.id);
        const f = t ? await lib.fileFor(t).catch(() => null) : null;
        send({ kind: 'file', id: m.id, file: f });
      } else if (m.kind === 'pagedecode') {
        try {
          const ab = await decodeAudio(await m.file.arrayBuffer(), MIX_RATE);
          const chs = Array.from({ length: Math.min(2, ab.numberOfChannels) }, (_, c) => new Float32Array(ab.getChannelData(c)));
          send({ kind: 'pcm', id: m.id, channels: chs, sr: ab.sampleRate }, chs.map(c => c.buffer));
        } catch { send({ kind: 'pcm', id: m.id, channels: null, sr: 0 }); }
      } else if (m.kind === 'progress') {
        this.done = m.done; this.total = m.total;
        const secs = (performance.now() - this.began) / 1000;
        if (m.done > MIX_RATE * 20 && secs > 2) this.left = Math.round(secs * (m.total - m.done) / m.done);
      } else if (m.kind === 'done') {
        if (m.blob) downloadBlob(m.blob, file);
        this.result = file; this.finish();
      } else if (m.kind === 'error') {
        const t = m.id ? lib.store?.tracks.get(m.id) : null;
        this.error = m.message === 'cancelled' ? '' : (t ? '“' + (t.title || t.fileName) + '”: ' : '') + m.message;
        this.finish();
      }
    };
    w.onerror = e => { this.error = 'The mixdown stopped: ' + (e.message || 'an error'); this.finish(); };
    send({ kind: 'start', plan: $state.snapshot(plan) as SetPlan, format, handle });
  }
  cancel() { this.w?.postMessage({ kind: 'cancel' } satisfies ToMixdown); }
  private finish() { this.busy = false; this.w?.terminate(); this.w = null; }

  /** The tracklist as a text file. */
  saveTracklist(text: string, name: string) { downloadBlob(new Blob([text + '\n'], { type: 'text/plain' }), name.replace(/[\\/:*?"<>|]+/g, ' ').trim() + ' – tracklist.txt'); }
}
export const setExport = new SetExport();
