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

/** On a 'stream' channel (ADR 0045, 0046): the website asks a GLUE Home, one request at a time.
    Every answer is a `meta` (with its `data`, and the size of the bytes that follow as binary
    messages), then `eof`; or an `error`. */
export type StreamReq =
  | { t: 'get'; n: number; profile: string; collection: string; track: string }          // a song's file
  | { t: 'thumbs'; n: number; profile: string; collection: string; tracks: string[] }   // mini spectrograms (data: [id, size][])
  | { t: 'details'; n: number; profile: string; collection: string; track: string }     // the full analysis (data: its header)
  | { t: 'incoming'; n: number }                                                        // what's in the incoming folder (data: IncomingFile[])
  | { t: 'get-incoming'; n: number; name: string }                                      // a song there
  | { t: 'move-incoming'; n: number; name: string; folder: string }                     // into a music folder (data: its new path)
  | { t: 'folders'; n: number }                                                         // the music folders GLUE Home found (data: HomeFolder[])
  | { t: 'have'; n: number; profile: string; collection: string }                       // what it keeps (data: { thumbs, details } ids)
  | { t: 'put'; n: number; kind: 'thumb' | 'details'; profile: string; collection: string; track: string; size: number; header?: unknown }   // the bytes follow, then `end`
  | { t: 'end'; n: number };
export type StreamReply =
  | { t: 'meta'; n: number; size: number; name?: string; type?: string; data?: unknown }
  | { t: 'eof'; n: number; type?: string }
  | { t: 'error'; n: number; error: string };
export type StreamCtrl = StreamReq | StreamReply;
export interface IncomingFile { name: string; size: number; mtime: number }
export interface HomeFolder { id: string; name: string; collection: string }

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
