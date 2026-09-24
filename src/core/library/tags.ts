/* Normalise container tags (ID3 frames, Vorbis comments, MP4 atoms, RIFF INFO) into track fields. */
import type { FileInfo } from '../types';

const PICK: Record<string, string[]> = {
  title: ['TIT2', 'TITLE', '©nam', 'Title', 'NAME'],
  artist: ['TPE1', 'ARTIST', '©ART', 'Artist', 'AUTH', 'TPE2', 'ALBUMARTIST', 'aART'],
  album: ['TALB', 'ALBUM', '©alb', 'Album'],
  genre: ['TCON', 'GENRE', '©gen'],
  label: ['TPUB', 'LABEL', 'ORGANIZATION', 'PUBLISHER'],
  comment: ['COMM', 'COMMENT', 'DESCRIPTION', '©cmt', 'Comment', 'ANNO'],
  year: ['TDRC', 'TYER', 'DATE', 'YEAR', '©day'],
  bpm: ['TBPM', 'BPM', 'tmpo'],
  key: ['TKEY', 'INITIALKEY', 'KEY'],
};
export type TagFields = Record<keyof typeof PICK, string>;

export function tagFields(tags: Record<string, string>): TagFields {
  const upper = new Map(Object.entries(tags).map(([k, v]) => [k.toUpperCase(), v]));
  const out = {} as TagFields;
  for (const [field, keys] of Object.entries(PICK)) {
    let v = '';
    for (const k of keys) { v = tags[k] ?? upper.get(k.toUpperCase()) ?? ''; if (v) break; }
    out[field] = v.split(' · ')[0].trim();
  }
  out.year = (/\d{4}/.exec(out.year) || [''])[0];
  out.genre = out.genre.replace(/^\((\d+)\)$/, '');   // numeric ID3v1 genres aren't worth a table
  return out;
}

/** "Artist - Title.ext" → fields, for files without tags. */
export function nameFields(fileName: string): { artist: string; title: string } {
  const stem = fileName.replace(/\.[^.]+$/, '').replace(/^\d{1,3}[\s._-]+(?=\D)/, '');
  const m = /^(.+?)\s+[-–]\s+(.+)$/.exec(stem);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: stem.trim() };
}

export function formatOf(info: FileInfo) {
  return { container: info.container, codec: info.codec, lossless: info.lossless, sampleRate: info.sampleRate, bits: info.bits, bitrate: Math.round(info.bitrate || 0), channels: info.channels };
}

export const AUDIO_EXT = /\.(flac|wav|wave|aif|aiff|aifc|m4a|mp4|alac|mp3|aac|ogg|oga|opus|webm|mka|wv|ape|dsf|dff)$/i;
