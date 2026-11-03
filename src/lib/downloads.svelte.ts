/* Saving songs as files (ADR 0193), from this computer or, through its GLUE Home, from another one: one song as itself,
   several (or a playlist) as a zip. With a save dialog (Chrome, Edge) the bytes go straight to disk as they arrive, so
   any size fits; elsewhere (Firefox, Safari, phones) they gather in the browser and download at the end. */
import { lib } from './library.svelte';
import { remoteFiles } from './remoteFiles.svelte';
import { downloadBlob } from './download';
import { ZipWriter, type ZipSink } from '../core/zipStream';
import { planLists, planSongs, safeName, type PlanItem, type PlanList } from '../core/library/downloadPlan';
import type { List, Track } from '../store/types';

export interface Download {
  name: string; zip: boolean; phase: 'running' | 'finishing' | 'done' | 'failed' | 'cancelled';
  /** Bytes so far and expected (a song of unknown size counts when it starts). */
  got: number; total: number;
  /** Songs saved, of how many, and the one on its way. */
  saved: number; count: number; current: string;
  skipped: { name: string; why: string }[];
  error: string;
}

const PIECE = 4 * 1024 * 1024;
const notice = (s: string) => { lib.notice = s; };

/** Where the bytes go. */
interface Target extends ZipSink { close(): Promise<void>; abort(): Promise<void> }
interface SaveHandle { createWritable(o?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream> }
type SavePicker = (o: { suggestedName: string; id?: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<SaveHandle>;

/** The save dialog's file, written in place. */
function diskTarget(w: FileSystemWritableFileStream): Target {
  const at = (position: number, data: Uint8Array) => w.write({ type: 'write', position, data: data as Uint8Array<ArrayBuffer> });
  return { write: at, patch: at, truncate: size => w.truncate(size), close: () => w.close(), abort: () => w.abort() };
}
/** No save dialog: pieces gathered as Blobs (the browser keeps large ones on its disk), a download at the end. */
function browserTarget(name: string, type: string): Target {
  let parts: { pos: number; b: Blob | Uint8Array }[] = [];
  return {
    write: async (pos, b) => { parts.push({ pos, b: b.length < 4096 ? b.slice() : new Blob([b as Uint8Array<ArrayBuffer>]) }); },
    // Only a header goes back to be patched, and headers stay as bytes.
    patch: async (pos, b) => {
      const p = [...parts].reverse().find(x => x.pos <= pos);
      if (!p || p.b instanceof Blob) throw new Error('Can’t change what’s already gathered.');
      p.b.set(b, pos - p.pos);
    },
    truncate: async size => { parts = parts.filter(p => p.pos < size); },
    close: async () => { downloadBlob(new Blob(parts.map(p => p.b as BlobPart), { type }), name); parts = []; },
    abort: async () => { parts = []; },
  };
}

class Downloads {
  /** The download on screen (one at a time). */
  now = $state<Download | null>(null);
  private stop: AbortController | null = null;

  get running() { return this.now?.phase === 'running' || this.now?.phase === 'finishing'; }

  /** The song's bytes in pieces, wherever it is. */
  private async read(t: Track, on: { size: (n: number) => Promise<void>; bytes: (b: Uint8Array) => Promise<void> }, signal: AbortSignal) {
    if (t.remote) return remoteFiles.pull(t, on, signal);
    const f = await lib.fileFor(t);
    await on.size(f.size);
    for (let at = 0; at < f.size; at += PIECE) {
      if (signal.aborted) throw signal.reason;
      await on.bytes(new Uint8Array(await f.slice(at, Math.min(f.size, at + PIECE)).arrayBuffer()));
    }
  }

  /** From a click: the save dialog has to open before anything else is waited for. */
  async start(items: { t: Track; path: string }[], name: string, zip: boolean, noFile: Track[] = []) {
    if (this.running) { notice('Wait for the download on its way to finish.'); return; }
    if (!items.length) { notice('None of these songs has a file to download.'); return; }
    const type = zip ? 'application/zip' : 'application/octet-stream';
    const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
    let target: Target;
    if (picker) {
      // (The dialog refuses a file type with an odd ending: "Track.1 (remix)".)
      const ext = /\.[a-z0-9]{1,8}$/i.exec(name)?.[0];
      try {
        const handle = await picker({ suggestedName: name, id: 'glue-download', types: ext ? [{ description: zip ? 'Zip file' : 'Audio file', accept: { [type]: [ext] } }] : undefined });
        target = diskTarget(await handle.createWritable());
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;   // the dialog was closed
        notice('Couldn’t save there: ' + (e as Error).message); return;
      }
    } else target = browserTarget(name, type);

    const stop = new AbortController();
    this.stop = stop;
    const st: Download = { name, zip, phase: 'running', got: 0, total: items.reduce((n, i) => n + (i.t.size ?? 0), 0), saved: 0, count: items.length, current: '', skipped: noFile.map(t => ({ name: t.title || t.fileName, why: 'no file linked' })), error: '' };
    const show = () => { this.now = { ...st }; };
    show();
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', guard);
    try {
      if (zip) await this.zipTo(target, items, st, show, stop.signal);
      else await this.fileTo(target, items[0].t, st, show, stop.signal);
      st.phase = 'finishing'; st.current = ''; show();
      await target.close();
      st.phase = 'done'; show();
    } catch (e) {
      await target.abort().catch(() => {});
      if (stop.signal.aborted) st.phase = 'cancelled';
      else { st.phase = 'failed'; st.error = (e as Error).message; }
      st.current = ''; show();
    } finally {
      window.removeEventListener('beforeunload', guard);
      this.stop = null;
    }
  }

  private async fileTo(target: Target, t: Track, st: Download, show: () => void, signal: AbortSignal) {
    st.current = t.title || t.fileName; show();
    let pos = 0;
    await this.read(t, {
      size: async n => { st.total = n; show(); },
      bytes: async b => { await target.write(pos, b); pos += b.length; st.got = pos; show(); },
    }, signal);
    st.saved = 1;
  }

  /** Song after song; one that can't be had is left out and said at the end, the rest still come. */
  private async zipTo(target: Target, items: { t: Track; path: string }[], st: Download, show: () => void, signal: AbortSignal) {
    const zip = new ZipWriter(target);
    for (const { t, path } of items) {
      if (signal.aborted) throw signal.reason;
      st.current = t.title || t.fileName; show();
      const before = st.got;
      let counted = t.size ?? 0, open = false;
      try {
        await this.read(t, {
          size: async n => { st.total += n - counted; counted = n; await zip.add(path, n, t.mtime ? new Date(t.mtime) : undefined); open = true; show(); },
          bytes: async b => { await zip.write(b); st.got += b.length; show(); },
        }, signal);
        await zip.end();
        st.saved++;
      } catch (e) {
        if (signal.aborted || isDiskError(e)) throw e;
        if (open) await zip.drop();
        st.got = before; st.total -= counted;
        st.skipped = [...st.skipped, { name: t.title || t.fileName, why: (e as Error).message }];
        show();
      }
    }
    if (!st.saved) throw new Error(st.skipped[0]?.why ?? 'None of the songs could be fetched.');
    await zip.finish();
  }

  cancel() { this.stop?.abort(new DOMException('Cancelled', 'AbortError')); }
  dismiss() { if (!this.running) this.now = null; }
}

/** The disk filled up, or the file went: no song after this one would fit either. */
function isDiskError(e: unknown) { const n = (e as Error).name; return n === 'QuotaExceededError' || n === 'NotAllowedError' || n === 'InvalidStateError'; }

export const downloads = new Downloads();

const byId = (id: string) => lib.store?.tracks.get(id);
const items = (plan: PlanItem[]) => plan.map(p => ({ t: byId(p.id)!, path: p.path }));
const hasFile = (t: Track) => t.status === 'linked';

/** Songs from a selection: one as its own file, several in a zip, side by side. */
export function downloadTracks(ts: Track[]) {
  const songs = ts.filter(hasFile), noFile = ts.filter(t => !hasFile(t));
  if (songs.length === 1) { const name = safeName(songs[0].fileName); return downloads.start([{ t: songs[0], path: name }], name, false, noFile); }
  return downloads.start(items(planSongs(songs)), 'GLUE ' + songs.length + ' songs.zip', true, noFile);
}

/** A playlist as a zip of its folder, the set's order kept in the file names; a folder of playlists with its folders. */
export function downloadList(l: List) {
  const lists: PlanList[] = [], noFile: Track[] = [];
  const walk = (x: List, path: PlanList['path']) => {
    const here = [...path, { id: x.id, name: x.name }], ts = x.items.map(byId).filter((t): t is Track => !!t);
    lists.push({ path: here, songs: ts.filter(hasFile) });
    noFile.push(...ts.filter(t => !hasFile(t)));
    for (const c of lib.childLists(x.id)) walk(c, here);
  };
  walk(l, []);
  return downloads.start(items(planLists(lists)), safeName(l.name) + '.zip', true, noFile);
}

/** A named set of songs in order (a DJ app's playlist, a Discogs playlist's digital songs). */
export function downloadSet(name: string, ts: Track[]) {
  return downloads.start(items(planLists([{ path: [{ id: 'set', name }], songs: ts.filter(hasFile) }])), safeName(name) + '.zip', true, ts.filter(t => !hasFile(t)));
}
