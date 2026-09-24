/* Dragging out of MCO to other apps (ADR 0027), with Chromium's `DownloadURL` drag type: the drop
   target receives a copy of the file (a track) or a generated M3U8 (a playlist). The data has to be
   ready inside `dragstart`, so a track's file is opened as soon as the pointer is over its handle. */
import { lib } from './library.svelte';
import type { List, Track } from '../store/types';

/** Only Chromium implements DownloadURL. */
export const canDragOut = () => !!(navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands?.some(b => /Chromium/.test(b.brand));

const MIME: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff', flac: 'audio/flac', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm' };
const mimeOf = (name: string) => MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
/** DownloadURL is "mime:name:url"; a colon in the name would break it. */
const safeName = (n: string) => n.replace(/[:\\/*?"<>|]+/g, '_');

const ready = new Map<string, string>();   // track id → blob URL of its file
let forStore: unknown = null;

/** Open the track's file ahead of the drag (never asks for permission here). */
export async function prepareTrack(t: Track) {
  if (forStore !== lib.store) { for (const u of ready.values()) URL.revokeObjectURL(u); ready.clear(); forStore = lib.store; }
  if (ready.has(t.id) || !lib.canRead(t)) return;
  try { ready.set(t.id, URL.createObjectURL(await lib.fileFor(t))); } catch { /* not readable: the drag says so */ }
}

/** Absolute path of a track's file, when MCO knows where its folder is on disk. */
export function absolutePath(t: Track): string | null {
  if (!t.relPath) return null;
  const base = lib.rootState(t.rootId)?.root.absPath;
  if (!base) return null;
  const win = /^[A-Za-z]:|\\/.test(base);
  return win ? base.replace(/[\\/]+$/, '') + '\\' + t.relPath.replace(/\//g, '\\') : base.replace(/\/+$/, '') + '/' + t.relPath;
}

/** dragstart for a track's handle. Returns false (and cancels) when the file isn't ready. */
export function startTrackDrag(e: DragEvent, t: Track): boolean {
  const url = ready.get(t.id), dt = e.dataTransfer;
  if (!url || !dt) { e.preventDefault(); return false; }
  dt.effectAllowed = 'copy';
  dt.setData('DownloadURL', mimeOf(t.fileName) + ':' + safeName(t.fileName) + ':' + url);
  dt.setData('text/plain', absolutePath(t) ?? t.fileName);
  return true;
}

/** An M3U8 of a playlist, with absolute paths where the music folder's location is known. */
export function playlistM3u8(l: List): { text: string; missing: number } {
  const s = lib.store;
  const lines = ['#EXTM3U', '#PLAYLIST:' + l.name];
  let missing = 0;
  for (const id of l.items) {
    const t = s?.tracks.get(id);
    if (!t) continue;
    const path = absolutePath(t) ?? t.importPath;
    if (!path) { missing++; lines.push('# ' + (t.artist ? t.artist + ' - ' : '') + (t.title || t.fileName) + ' (location unknown)'); continue; }
    lines.push('#EXTINF:' + Math.round(t.duration ?? -1) + ',' + (t.artist ? t.artist + ' - ' : '') + (t.title || t.fileName), path);
  }
  return { text: lines.join('\r\n') + '\r\n', missing };
}

export function startPlaylistDrag(e: DragEvent, l: List) {
  const dt = e.dataTransfer;
  if (!dt) return;
  const { text, missing } = playlistM3u8(l);
  const url = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'audio/x-mpegurl' }));
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  dt.effectAllowed = 'copy';
  dt.setData('DownloadURL', 'audio/x-mpegurl:' + safeName(l.name) + '.m3u8:' + url);
  dt.setData('text/plain', text);
  if (missing) lib.notice = missing + ' track' + (missing === 1 ? '' : 's') + ' in “' + l.name + '” have no known location on disk; set the music folder’s location (⌖ in the sidebar) for a complete playlist file.';
}
