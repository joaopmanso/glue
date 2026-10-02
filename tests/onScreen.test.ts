import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnScreen, Retries } from '../src/lib/onScreen';

// The rows on screen and asking again (ADR 0131). The user, 2026-10-01: on the laptop, the first screen's
// waveforms often didn't load until the rows were scrolled away and back.
const state = vi.hoisted(() => ({ readable: true, tracks: new Map<string, unknown>(), dir: null as unknown }));
vi.mock('../src/lib/library.svelte', () => ({
  lib: {
    store: { meta: { id: 'c1' }, tracks: state.tracks, analysis: new Map() },
    canRead: () => state.readable,
    trackDetails: async () => null,
  },
}));
vi.mock('../src/platform', () => ({ cacheDir: async () => state.dir }));
vi.stubGlobal('window', globalThis);
const { waves } = await import('../src/lib/thumbs.svelte');
const { WAVE_BYTES } = await import('../src/core/library/thumb');

const remoteSong = (id: string) => ({ id, status: 'linked', remote: { device: 'desk', name: 'Desktop' } });
const bytes = new Uint8Array(WAVE_BYTES).fill(7);

describe('OnScreen and Retries', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts a row shown twice, and says when it came and when it left', () => {
    const s = new OnScreen();
    expect(s.hold('a')).toBe(true);
    expect(s.hold('a')).toBe(false);
    expect(s.drop('a')).toBe(false);
    expect(s.has('a')).toBe(true);
    expect(s.drop('a')).toBe(true);
    expect(s.has('a')).toBe(false);
  });

  it('asks again soon when it couldn’t ask, slowly when there was none yet, and never once the row has left', () => {
    const r = new Retries(), again = vi.fn();
    let shown = true;
    r.later('a', 'unreached', () => shown, again);
    vi.advanceTimersByTime(999); expect(again).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(again).toHaveBeenCalledTimes(1);
    r.later('a', 'unreached', () => shown, again);          // the second time: 2 s
    vi.advanceTimersByTime(1999); expect(again).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1); expect(again).toHaveBeenCalledTimes(2);
    r.done('a');
    r.later('a', 'notYet', () => shown, again);             // none there yet: 8 s
    vi.advanceTimersByTime(7999); expect(again).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1); expect(again).toHaveBeenCalledTimes(3);
    r.later('a', 'notYet', () => shown, again);
    r.cancel('a');                                          // scrolled away
    vi.advanceTimersByTime(60_000); expect(again).toHaveBeenCalledTimes(3);
    shown = false;
    r.later('a', 'unreached', () => shown, again);
    vi.advanceTimersByTime(60_000); expect(again).toHaveBeenCalledTimes(3);
  });
});

describe('waveforms of another computer’s songs (ADR 0131)', () => {
  beforeEach(() => { vi.useFakeTimers(); state.readable = true; state.tracks.clear(); });
  afterEach(() => vi.useRealTimers());

  it('a first ask that fails (the link still opening) is asked again while on screen, not taken as none', async () => {
    state.tracks.set('a', remoteSong('a'));
    const ask = vi.fn().mockResolvedValueOnce(new Map()).mockResolvedValueOnce(new Map([['a', bytes]]));
    waves.remote = ask;
    waves.hold('a'); waves.request('a');
    await vi.advanceTimersByTimeAsync(150);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(waves.get('a')).toBeUndefined();                 // unknown, not "none"
    await vi.advanceTimersByTimeAsync(1200);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(waves.get('a')).toEqual(bytes);
    waves.drop('a');
  });

  it('none there yet shows none, and a row coming back on screen asks again at once', async () => {
    state.tracks.set('b', remoteSong('b'));
    const ask = vi.fn().mockResolvedValueOnce(new Map([['b', null]])).mockResolvedValueOnce(new Map([['b', bytes]]));
    waves.remote = ask;
    waves.hold('b'); waves.request('b');
    await vi.advanceTimersByTimeAsync(150);
    expect(waves.get('b')).toBeNull();
    waves.drop('b');                                        // scrolled away: its retry is off
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ask).toHaveBeenCalledTimes(1);
    waves.hold('b');                                        // back on screen
    await vi.advanceTimersByTimeAsync(150);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(waves.get('b')).toEqual(bytes);
    waves.drop('b');
  });

  it('a song whose computer can’t be reached yet stays unknown, so its row asks once it can', async () => {
    state.tracks.set('c', remoteSong('c'));
    state.readable = false;
    const ask = vi.fn().mockResolvedValue(new Map([['c', bytes]]));
    waves.remote = ask;
    waves.hold('c'); waves.request('c');
    await vi.advanceTimersByTimeAsync(150);
    expect(ask).not.toHaveBeenCalled();
    expect(waves.get('c')).toBeUndefined();
    state.readable = true;
    waves.request('c');                                     // what the cell does when it becomes readable
    await vi.advanceTimersByTimeAsync(150);
    expect(waves.get('c')).toEqual(bytes);
    waves.drop('c');
  });
});

describe('this computer’s songs, from GLUE Home’s cache (ADR 0142)', () => {
  // The browser's own cache has none: every read goes to GLUE Home.
  const noneHere = { getDirectoryHandle: async () => { throw new Error('not there'); } };
  beforeEach(() => { vi.useFakeTimers(); state.dir = noneHere; state.tracks.clear(); });
  afterEach(() => { vi.useRealTimers(); state.dir = null; });
  const localSong = (id: string) => ({ id, status: 'linked' });
  /** GLUE Home answers each after 100 ms, or at once with nothing when the row cancels it. */
  const slow = vi.fn((id: string, signal?: AbortSignal) => new Promise<Uint8Array | null>(done => {
    const t = setTimeout(() => done(bytes), 100);
    signal?.addEventListener('abort', () => { clearTimeout(t); done(null); }, { once: true });
  }));

  // The user, 2026-10-02: after jumps down the list, a block of 5 or 6 rows in the middle got no waveform for 10–15 s;
  // the song's page and back loaded them at once. A row's song changed (its cover found, the engine's feed) while it
  // waited behind the 6 reads in flight: the cell said it left and came back, and what it had asked for was dropped.
  it('a row whose song changes while it waits still gets its waveform', async () => {
    waves.fromHome = slow;
    const ids = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'd'];
    for (const id of ids) { state.tracks.set(id, localSong(id)); waves.request(id); waves.hold(id); }
    await vi.advanceTimersByTimeAsync(0);
    // 'd' waits behind the six. Its song changes: the cell's effects run again, in their order.
    waves.request('d'); waves.drop('d'); waves.hold('d');
    await vi.advanceTimersByTimeAsync(500);
    expect(waves.get('d')).toEqual(bytes);
    for (const id of ids) waves.drop(id);
  });

  it('a row that comes back while its cancelled read is still ending asks again', async () => {
    waves.fromHome = slow;
    state.tracks.set('e', localSong('e'));
    waves.request('e'); waves.hold('e');
    await vi.advanceTimersByTimeAsync(10);
    waves.drop('e'); waves.hold('e');                       // away and back in the same moment
    await vi.advanceTimersByTimeAsync(500);
    expect(waves.get('e')).toEqual(bytes);
    waves.drop('e');
  });
});
