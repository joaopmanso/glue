/* The library's player: which track is loaded, and the queue it came from (the view it was
   started in). Shares the one audio element with the track page (lib/player). */
import { lib, remoteFileMessage } from './library.svelte';
import { player } from './player.svelte';
import { router } from './route.svelte';
import { blankInfo, parseContainer } from '../core/formats/parse';
import { pcmToWav } from '../core/formats/wav';
import type { Track } from '../store/types';

class NowPlaying {
  trackId = $state<string | null>(null);
  loading = $state(false);
  error = $state('');
  queue: string[] = [];

  get track(): Track | null { void lib.version; return this.trackId ? lib.store?.tracks.get(this.trackId) ?? null : null; }

  /** Start a track from a list; `queue` is the order Previous / Next walk. */
  /** `startAt`: seconds to start from (clicking a spot in a row's mini spectrogram). */
  async play(id: string, queue: string[] = this.queue, startAt = 0) {
    const t = lib.store?.tracks.get(id);
    if (!t) return;
    this.queue = queue.length ? queue : [id];
    this.trackId = id; this.error = '';
    if (t.status !== 'linked') { this.error = 'No file linked for this track.'; player.setSource(null); return; }
    if (t.remote && !lib.canRead(t)) { this.error = remoteFileMessage(t.remote.name); player.setSource(null); return; }
    this.loading = true;
    try {
      const file = await lib.fileFor(t);   // may ask for permission: still inside the click
      if (this.trackId !== id) return;
      player.setSource(await playable(file), { duration: t.duration ?? undefined, sampleRate: t.format?.sampleRate || undefined, key: 'track:' + id });
      if (startAt > 0) { const a = player.el, go = () => player.seek(startAt); if (a.readyState >= 1) go(); else a.addEventListener('loadedmetadata', go, { once: true }); }
      player.toggle();
    } catch (e) { if (this.trackId === id) { this.error = (e as Error).message || String(e); player.setSource(null); } }
    finally { if (this.trackId === id) this.loading = false; }
  }
  /** The track page loaded this track into the shared player. */
  adopt(id: string) { this.trackId = id; this.error = ''; if (!this.queue.includes(id)) this.queue = [id]; }
  clear() { this.trackId = null; this.queue = []; }

  private step(dir: 1 | -1) {
    const i = this.trackId ? this.queue.indexOf(this.trackId) : -1;
    for (let j = i + dir; j >= 0 && j < this.queue.length; j += dir) {
      const t = lib.store?.tracks.get(this.queue[j]);
      if (t && t.status === 'linked' && (!t.remote || lib.canRead(t))) return this.queue[j];
    }
    return null;
  }
  get hasNext() { return this.step(1) != null; }
  get hasPrev() { return this.step(-1) != null; }
  next() { const id = this.step(1); if (id) void this.play(id); }
  /** Previous restarts the track when more than 3 s in, like most players. */
  prev() { if (player.time > 3 || !this.hasPrev) { player.seek(0); return; } const id = this.step(-1); if (id) void this.play(id); }
  toggle(fallbackId?: string, queue?: string[]) {
    if (player.url) player.toggle();
    else if (fallbackId) void this.play(fallbackId, queue);
  }
}

/** Chrome and Firefox can't play AIFF: rewrap its PCM as WAV (same samples). */
export async function playable(file: File): Promise<Blob> {
  if (!/\.(aif|aiff|aifc)$/i.test(file.name)) return file;
  const u8 = new Uint8Array(await file.arrayBuffer());
  let info = blankInfo();
  try { info = parseContainer(u8); } catch { return file; }
  return info.pcm ? pcmToWav(u8, info.pcm, info.sampleRate) : file;
}

export const nowPlaying = new NowPlaying();
// A track page that starts its own track makes it the library's now-playing track too.
player.onSource = key => { const id = key?.startsWith('track:') ? key.slice(6) : null; if (id && id !== nowPlaying.trackId) nowPlaying.adopt(id); };
// Auto-advance only in the library; the track page stays on its own track.
player.onEnded = () => { if (router.current.name === 'library' && nowPlaying.trackId && nowPlaying.hasNext) nowPlaying.next(); };
