/* Fingerprints: strings that rippers, encoders and downloaders leave in files. */
import type { Clue, FileInfo } from '../types';
import { latin1 } from './parse';

const CLUES: { kind: string; re: RegExp; label: string }[] = [
  { kind: 'yt', re: /(?:youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com)[\w\-=?&]{4,}/i, label: 'YouTube URL embedded in the tags' },
  { kind: 'yt', re: /yt-dlp|youtube-dl/i, label: 'Downloaded with yt-dlp / youtube-dl' },
  { kind: 'yt', re: /google\/video-file/i, label: 'Google video-file muxer (YouTube)' },
  { kind: 'yt', re: /4K Video Downloader|ClipGrab|MediaHuman|Freemake|Any Video Converter|y2mate|ytmp3|savefrom|onlinevideoconverter/i, label: 'Video downloader / converter' },
  { kind: 'stream', re: /soundcloud\.com|SoundCloud/, label: 'SoundCloud' },
  { kind: 'stream', re: /Audials|Streamripper|Deezloader|deemix|spotdl|SpotDL|Soundiiz/, label: 'Stream recorder / downloader' },
  { kind: 'store', re: /Qobuz|HDtracks|7digital|TIDAL|Tidal|Deezer|Beatport|Bandcamp|bandcamp\.com|Spotify|Amazon Music/, label: 'Store or streaming service' },
  { kind: 'mp3', re: /LAME ?3\.\d{2,3}|LAME3\.\d+|Lame 3\.\d+/, label: 'LAME MP3 encoder' },
  { kind: 'mp3', re: /Fraunhofer|FhG IIS/, label: 'Fraunhofer MP3/AAC encoder' },
  { kind: 'lossy', re: /Xiph\.Org libVorbis|libvorbis/, label: 'libVorbis encoder' },
  { kind: 'lossy', re: /libopus \d/, label: 'libopus encoder' },
  { kind: 'lossy', re: /Nero AAC|Nero Digital/, label: 'Nero AAC encoder' },
  { kind: 'ffmpeg', re: /Lavf\d+\.\d+\.\d+/, label: 'FFmpeg muxer (libavformat)' },
  { kind: 'ffmpeg', re: /Lavc\d+\.\d+\.\d+/, label: 'FFmpeg encoder (libavcodec)' },
  { kind: 'apple', re: /iTunes \d|iTunNORM|Apple Music/, label: 'iTunes / Apple Music' },
  { kind: 'rip', re: /Exact Audio Copy|EAC V\d/, label: 'Exact Audio Copy (CD ripper)' },
  { kind: 'rip', re: /X Lossless Decoder|XLD \d/, label: 'XLD (CD ripper)' },
  { kind: 'rip', re: /CUERipper|CUETools|whipper|morituri|Rubyripper|cdparanoia/, label: 'CD ripper' },
  { kind: 'rip', re: /dBpoweramp/, label: 'dBpoweramp (ripper / converter)' },
  { kind: 'tool', re: /foobar2000/i, label: 'foobar2000' },
  { kind: 'tool', re: /Audacity/, label: 'Audacity' },
  { kind: 'tool', re: /\bSoX\b|libsoxr/, label: 'SoX resampler' },
  { kind: 'tool', re: /Adobe Audition|iZotope|Sonic Studio|Saracon|Weiss/, label: 'Mastering / resampling software' },
  { kind: 'flac', re: /reference libFLAC [\d.]+/, label: 'libFLAC encoder' },
];

export function scanClues(u8: Uint8Array, info: FileInfo): Clue[] {
  const H = 1 << 20;
  const head = latin1(u8.subarray(0, Math.min(u8.length, H)));
  const tail = u8.length > H ? latin1(u8.subarray(Math.max(H, u8.length - 262144))) : '';
  const text = [head, tail, Object.values(info.tags).join('\n'), info.vendor, info.encoder].join('\n');
  const found: Clue[] = [];
  for (const c of CLUES) { const m = text.match(c.re); if (m) found.push({ kind: c.kind, label: c.label, match: m[0].replace(/[^\x20-\x7e]/g, '').slice(0, 70) }); }
  if (info.brand === 'dash' || (info.compatBrands || []).includes('dash'))
    found.push({ kind: 'yt', label: 'MP4 “dash” brand: DASH audio as YouTube streams it', match: 'ftyp dash' });
  if (info.webm) found.push({ kind: 'web', label: 'WebM container, the way YouTube serves Opus', match: info.container + ' / ' + info.codec });
  return found;
}
