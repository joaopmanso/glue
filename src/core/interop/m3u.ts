/* M3U / M3U8 playlists: one playlist, tracks by path (#EXTINF gives duration and "Artist - Title"). */
import { blankTrack, fileUrlToPath, normPath, type ImportedLibrary } from './types';

export function parseM3u(text: string, fileName = 'playlist.m3u8'): ImportedLibrary {
  const tracks = [], items: string[] = [];
  let pending: { dur: number | null; artist: string; title: string } | null = null;
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const m = /^#EXTINF:(-?\d+(?:\.\d+)?)[^,]*,(.*)$/.exec(line);
      const label = m ? m[2] : '', dash = label.indexOf(' - ');
      pending = { dur: m && +m[1] > 0 ? +m[1] : null, artist: dash > 0 ? label.slice(0, dash) : '', title: dash > 0 ? label.slice(dash + 3) : label };
      continue;
    }
    if (line.startsWith('#')) continue;
    const path = /^file:/i.test(line) ? fileUrlToPath(line) : normPath(line);
    const t = blankTrack(path.toLowerCase(), path);
    if (pending) { t.duration = pending.dur; t.artist = pending.artist; t.title = pending.title; }
    pending = null;
    tracks.push(t); items.push(t.externalId);
  }
  const name = fileName.replace(/\.m3u8?$/i, '');
  return { app: 'm3u', name: 'Playlist (' + fileName + ')', tracks, lists: [{ externalId: 'm3u:' + fileName, kind: 'playlist', name, parent: null, items }] };
}
