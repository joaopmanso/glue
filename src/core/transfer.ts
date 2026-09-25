/* Sending songs to GLUE Home (ADR 0044): a WebRTC data channel between the website and GLUE Home,
   set up through the account's signaling room (which only relays the handshake, never the audio).
   Shared by both ends. Pure: message shapes, names and sizes. */

/** Direct connections (LAN or internet); a relay (TURN) comes later (ADR 0037). */
export const ICE_SERVERS = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
export const CHUNK = 64 * 1024;              // bytes per data-channel message
export const HIGH_WATER = 4 * 1024 * 1024;   // pause sending while this much is queued
export const MAX_FILE = 4 * 1024 ** 3;       // 4 GB per song is plenty

/** Handshake messages, carried as the room's opaque `data`. */
export type Handshake =
  | { app: 'glue-send'; t: 'offer'; id: string; sdp: string }
  | { app: 'glue-send'; t: 'answer'; id: string; sdp: string }
  | { app: 'glue-send'; t: 'ice'; id: string; candidate: RTCIceCandidateInit | null }
  | { app: 'glue-send'; t: 'bye'; id: string; reason?: string };

/** On the data channel: JSON text messages; a file's bytes follow its `file` message as binary ones. */
export type Ctrl =
  | { t: 'ready'; name: string }                                   // GLUE Home: ready to receive
  | { t: 'file'; n: number; name: string; size: number }           // website: a file starts
  | { t: 'end'; n: number }                                        // website: all its bytes are sent
  | { t: 'saved'; n: number; name: string }                        // GLUE Home: written (final name)
  | { t: 'failed'; n: number; error: string };                     // GLUE Home: couldn't write it

/** On a 'stream' channel: the website asks for a song of the GLUE Home's own library by its ids;
    GLUE Home answers with its size, the bytes (binary messages), and the end. One at a time. */
export type StreamCtrl =
  | { t: 'get'; n: number; profile: string; collection: string; track: string }
  | { t: 'meta'; n: number; name: string; size: number; type?: string }
  | { t: 'eof'; n: number; type?: string }
  | { t: 'error'; n: number; error: string };

export const isHandshake = (d: unknown): d is Handshake => !!d && typeof d === 'object' && (d as { app?: unknown }).app === 'glue-send';

/** A file name that's safe in any folder on Windows and macOS (no paths, no reserved names). */
export function safeName(name: string): string {
  let n = name.split(/[\\/]/).pop() ?? '';
  n = n.replace(/[\u0000-\u001f<>:"|?*]/g, '_').replace(/[. ]+$/, '').trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(n)) n = '_' + n;
  if (!n || n === '.' || n === '..') n = 'song';
  return n.length > 180 ? n.slice(0, 150) + n.slice(n.lastIndexOf('.')).slice(0, 30) : n;
}
/** "Song.mp3" → "Song (2).mp3" when the name is taken. */
export function nextName(name: string, taken: (n: string) => boolean): string {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf('.'), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; ; i++) { const n = base + ' (' + i + ')' + ext; if (!taken(n)) return n; }
}
