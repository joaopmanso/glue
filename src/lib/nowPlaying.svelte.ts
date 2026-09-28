/* The library's player (ADR 0068): which song is loaded, and its queue: the songs the user queued
   ("Next up"), then the rest of the list the song was started from, shuffled or not; repeat; Previous
   through what played (core/library/queue). Remembered per collection in this browser, with the place
   in the song. Shares the one audio element with the track page (lib/player). */
import { lib, remoteFileMessage } from './library.svelte';
import { player } from './player.svelte';
import { router } from './route.svelte';
import { view, viewTitle } from './view.svelte';
import { readPref, writePref } from './prefs';
import { EMPTY_QUEUE, advance, back, clear, dequeue, enqueue, jump, placeLater, prune, reshuffle, startFrom, type Queue, type Repeat } from '../core/library/queue';
import type { Track } from '../store/types';

const plural = (n: number) => n + ' song' + (n === 1 ? '' : 's');
const REPEATS: Repeat[] = ['off', 'all', 'one'];

class NowPlaying {
  q = $state.raw<Queue>(EMPTY_QUEUE);
  loading = $state(false);
  error = $state('');
  shuffle = $state(readPref('shuffle', '0') === '1');
  repeat = $state<Repeat>(REPEATS.find(r => r === readPref('repeat', 'off')) ?? 'off');
  /** The player opened up (the queue, the visualiser). */
  expanded = $state(false);
  /** Where to start the restored song (after a reload), once. */
  private resumeAt = 0;

  get trackId() { return this.q.current; }
  get track(): Track | null { void lib.version; return this.q.current ? lib.store?.tracks.get(this.q.current) ?? null : null; }
  /** Can this song play here now? */
  canPlay(id: string) { const t = lib.store?.tracks.get(id); return !!t && lib.playsHere(t); }

  /** Start a song. From a list (`ids`, as it's shown), the rest of the list plays after it and what's
      queued; `from` names the list (the view's name by default). `startAt`: seconds into it. */
  async play(id: string, ids: string[] = [], startAt = 0, from?: string) {
    if (!lib.store?.tracks.has(id)) return;
    const q = this.q;
    this.set(ids.length ? startFrom(q, id, ids, from ?? viewTitle(view.sel), this.shuffle)
      : q.current === id ? q : { ...q, current: id, played: q.current ? [...q.played, q.current].slice(-200) : q.played });
    await this.load(id, startAt);
  }
  private async load(id: string, startAt = 0) {
    const t = lib.store?.tracks.get(id);
    if (!t) return;
    this.error = ''; this.resumeAt = 0;
    if (t.status !== 'linked') { this.error = 'No file linked for this track.'; player.setSource(null); return; }
    if (t.remote && !lib.canRead(t)) { this.error = remoteFileMessage(t.remote.name); player.setSource(null); return; }
    this.loading = true;
    try {
      // Streamed when it can be (ADR 0076), else the file; may ask for permission: still inside the click.
      const src = await lib.mediaFor(t);
      if (this.trackId !== id) return;
      player.setSource(src, { duration: t.duration ?? undefined, sampleRate: t.format?.sampleRate || undefined, key: 'track:' + id });
      if (startAt > 0) { const a = player.el, go = () => player.seek(startAt); if (a.readyState >= 1) go(); else a.addEventListener('loadedmetadata', go, { once: true }); }
      player.toggle();
    } catch (e) { if (this.trackId === id) { this.error = (e as Error).message || String(e); player.setSource(null); } }
    finally { if (this.trackId === id) this.loading = false; }
  }
  /** The track page loaded this track into the shared player. */
  adopt(id: string) { this.error = ''; if (this.q.current !== id) this.set({ ...this.q, current: id }); }
  /** Nothing loaded any more (the queue stays). */
  clear() { this.set({ ...this.q, current: null }); }

  get hasNext() { return this.q.upNext.length > 0 || this.q.later.length > 0 || (this.repeat !== 'off' && this.q.fromIds.length > 0); }
  get hasPrev() { return this.q.played.length > 0; }
  next() {
    const n = advance(this.q, { repeat: this.repeat, shuffle: this.shuffle, ok: id => this.canPlay(id) });
    if (n) { this.set(n); void this.load(n.current!); }
  }
  /** Previous restarts the track when more than 3 s in, like most players. */
  prev() {
    if (player.time > 3 || !this.hasPrev) { player.seek(0); return; }
    const b = back(this.q);
    if (b) { this.set(b); void this.load(b.current!); }
  }
  /** Play / pause; with nothing loaded: the restored song, else `fallbackId` (from `ids`), else what's queued. */
  toggle(fallbackId?: string, ids?: string[]) {
    if (player.url) player.toggle();
    else if (this.q.current && this.track) void this.load(this.q.current, this.resumeAt);
    else if (fallbackId) void this.play(fallbackId, ids);
    else if (this.hasNext) this.next();
  }

  /** ▶ on the row of the song that's loaded: play / pause. When it came without a list (its page loaded
      it), the rest of this list comes after it now, as a click on another row would do. */
  resumeFrom(id: string, ids: string[], from?: string) {
    const q = this.q;
    if (q.current === id && !q.fromIds.length && !q.upNext.length && ids.length > 1) this.set(startFrom(q, id, ids, from ?? viewTitle(view.sel), this.shuffle));
    player.toggle();
  }

  // ─── The queue ───
  /** Queue songs: right after this one ('next'), at the end of what's queued, or at a place in it. */
  enqueue(ids: string[], at: 'next' | 'end' | number = 'end') {
    const ok = ids.filter(id => lib.store?.tracks.has(id));
    if (!ok.length) return;
    this.set(enqueue(this.q, ok, at));
    if (typeof at !== 'number') lib.notice = (at === 'next' ? plural(ok.length) + ' play next.' : 'Queued ' + plural(ok.length) + '.') + (this.q.current ? '' : ' Press play to start.');
  }
  dequeue(which: 'upNext' | 'later', i: number) { this.set(dequeue(this.q, which, i)); }
  clearQueue(which: 'upNext' | 'later' | 'played') { this.set(clear(this.q, which)); }
  /** Move songs to a place in the list's rest ("Next from"). */
  placeLater(ids: string[], index: number) { this.set(placeLater(this.q, ids.filter(id => lib.store?.tracks.has(id)), index)); }
  /** Play a song from the queue now. */
  jumpTo(which: 'upNext' | 'later', i: number) { const j = jump(this.q, which, i); if (j) { this.set(j); void this.load(j.current!); } }
  setShuffle(on: boolean) { this.shuffle = on; writePref('shuffle', on ? '1' : '0'); this.set(reshuffle(this.q, on)); }
  cycleRepeat() { this.repeat = REPEATS[(REPEATS.indexOf(this.repeat) + 1) % 3]; writePref('repeat', this.repeat); }

  // ─── Remembered per collection (this browser) ───
  private collection: string | null = null;
  private timer = 0;
  private set(q: Queue) { this.q = q; clearTimeout(this.timer); this.timer = window.setTimeout(() => this.save(), 400); }
  save() {
    if (!this.collection) return;
    const q = this.q, here = !!q.current && player.sourceKey === 'track:' + q.current;
    writePref('queue.' + this.collection, JSON.stringify({ ...q, later: q.later.slice(0, 2000), fromIds: q.fromIds.length > 5000 ? [] : q.fromIds, played: q.played.slice(-100), t: here ? Math.round(player.time) : this.resumeAt }));
  }
  /** A collection opened: its queue as it was left (unless music from another one is playing). */
  restore(collection: string | null) {
    if (collection === this.collection) return;
    this.save();
    this.collection = collection;
    if (!collection || (player.url && !player.paused)) return;
    let saved: (Queue & { t?: number }) | null = null;
    try { saved = JSON.parse(readPref('queue.' + collection, 'null')); } catch { /* none */ }
    const s = lib.store;
    const q = saved && Array.isArray(saved.upNext) ? prune({ ...EMPTY_QUEUE, ...saved }, id => !!s?.tracks.has(id)) : EMPTY_QUEUE;
    this.q = q; this.resumeAt = q.current ? saved?.t ?? 0 : 0;
  }
}

export { playable } from './playable';

export const nowPlaying = new NowPlaying();
// A track page that starts its own track makes it the library's now-playing track too.
player.onSource = key => { const id = key?.startsWith('track:') ? key.slice(6) : null; if (id && id !== nowPlaying.trackId) nowPlaying.adopt(id); };
// Auto-advance everywhere but on the page of the song that ended (that page stays on its own song).
player.onEnded = () => {
  const r = router.current;
  if (!nowPlaying.trackId || (r.name === 'track' && r.id === nowPlaying.trackId)) return;
  if (nowPlaying.repeat === 'one') player.seek(0, true); else if (nowPlaying.hasNext) nowPlaying.next();
};
// Each collection's queue comes back as it opens (before its songs show).
lib.onQueue = cid => nowPlaying.restore(cid);
// The place in the song is kept every few seconds and when the page goes.
if (typeof window !== 'undefined') { setInterval(() => { if (!player.paused) nowPlaying.save(); }, 5000); addEventListener('pagehide', () => nowPlaying.save()); }
