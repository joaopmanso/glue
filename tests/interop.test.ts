import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { parseXml } from '../src/core/interop/xml';
import { parseRekordboxXml } from '../src/core/interop/rekordbox';
import { parseTraktorNml, nmlPath } from '../src/core/interop/traktor';
import { parseAppleLibrary } from '../src/core/interop/apple';
import { buildSeratoLibrary, parseSeratoDatabase } from '../src/core/interop/serato';
import { parseEngineDb, engineKey, isSqlite } from '../src/core/interop/engine';
import { parseM3u } from '../src/core/interop/m3u';
import { fileUrlToPath } from '../src/core/interop/types';
import { matchTracks } from '../src/core/library/match';

describe('xml parser', () => {
  it('handles attributes, entities, CDATA, comments and self-closing tags', () => {
    const r = parseXml('<?xml version="1.0"?><!DOCTYPE x><a x="1 &amp; 2" y=\'&#233;\'><!-- c --><b/><c><![CDATA[<raw>]]></c>t&lt;</a>');
    const a = r.children[0];
    expect(a.attrs).toEqual({ x: '1 & 2', y: 'é' });
    expect(a.children.map(c => c.name)).toEqual(['b', 'c']);
    expect(a.children[1].text).toBe('<raw>');
    expect(a.text).toBe('t<');
  });
});

describe('rekordbox XML', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0"><PRODUCT Name="rekordbox" Version="7.0.0" Company="AlphaTheta"/>
<COLLECTION Entries="2">
  <TRACK TrackID="1" Name="Linguistics" Artist="7th Pyramid" Album="A" Genre="House" Kind="AIFF File" Size="67483110" TotalTime="234"
    Year="2024" AverageBpm="124.00" DateAdded="2026-09-01" BitRate="2304" SampleRate="48000" Comments="" PlayCount="3" Rating="204"
    Location="file://localhost/C:/Users/joao/Music/Deep%20House/Linguistics.aiff" Tonality="Fm" Label="L">
    <TEMPO Inizio="0.1" Bpm="124.00" Metro="4/4" Battito="1"/>
    <POSITION_MARK Name="" Type="0" Start="1.0" Num="0"/><POSITION_MARK Name="" Type="0" Start="30.0" Num="-1"/>
  </TRACK>
  <TRACK TrackID="2" Name="Other &amp; Co" Artist="B" Location="file://localhost/Users/joao/Music/b.mp3"/>
</COLLECTION>
<PLAYLISTS><NODE Type="0" Name="ROOT" Count="2">
  <NODE Type="0" Name="Gigs" Count="1"><NODE Name="Friday" Type="1" KeyType="0" Entries="2"><TRACK Key="2"/><TRACK Key="1"/></NODE></NODE>
  <NODE Name="By location" Type="1" KeyType="1" Entries="1"><TRACK Key="file://localhost/Users/joao/Music/b.mp3"/></NODE>
</NODE></PLAYLISTS></DJ_PLAYLISTS>`;
  it('reads tracks, folders and playlists', () => {
    const lib = parseRekordboxXml(xml);
    expect(lib.tracks).toHaveLength(2);
    expect(lib.tracks[0]).toMatchObject({ title: 'Linguistics', artist: '7th Pyramid', bpm: 124, key: 'Fm', rating: 4, playCount: 3, cues: 2, path: 'C:/Users/joao/Music/Deep House/Linguistics.aiff' });
    expect(lib.tracks[1]).toMatchObject({ title: 'Other & Co', path: '/Users/joao/Music/b.mp3' });
    expect(lib.lists.map(l => [l.kind, l.name, l.items])).toEqual([['folder', 'Gigs', []], ['playlist', 'Friday', ['2', '1']], ['playlist', 'By location', ['2']]]);
    expect(lib.lists[1].parent).toBe(lib.lists[0].externalId);
  });
});

describe('Traktor NML', () => {
  const nml = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?><NML VERSION="19"><HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor"/>
<COLLECTION ENTRIES="1"><ENTRY TITLE="Track A" ARTIST="Art"><LOCATION DIR="/:Users/:joao/:Music/:" FILE="a.flac" VOLUME="C:" VOLUMEID="c"/>
<ALBUM TITLE="Alb"/><INFO BITRATE="1411" GENRE="Techno" KEY="10m" PLAYCOUNT="5" PLAYTIME="300" RANKING="153" IMPORT_DATE="2026/9/1"/>
<TEMPO BPM="128.000" BPM_QUALITY="100"/><MUSICAL_KEY VALUE="12"/><CUE_V2 NAME="AutoGrid" TYPE="4" START="0"/><CUE_V2 NAME="Drop" TYPE="0" START="1000" HOTCUE="0"/></ENTRY></COLLECTION>
<PLAYLISTS><NODE TYPE="FOLDER" NAME="$ROOT"><SUBNODES COUNT="1"><NODE TYPE="PLAYLIST" NAME="Peak"><PLAYLIST ENTRIES="1" TYPE="LIST"><ENTRY><PRIMARYKEY TYPE="TRACK" KEY="C:/:Users/:joao/:Music/:a.flac"/></ENTRY></PLAYLIST></NODE></SUBNODES></NODE></PLAYLISTS></NML>`;
  it('reads entries and playlists, and decodes locations', () => {
    const lib = parseTraktorNml(nml);
    expect(lib.tracks[0]).toMatchObject({ title: 'Track A', album: 'Alb', genre: 'Techno', bpm: 128, key: '10m', rating: 3, playCount: 5, duration: 300, cues: 1, path: 'C:/Users/joao/Music/a.flac' });
    expect(lib.lists).toEqual([{ externalId: expect.any(String), kind: 'playlist', name: 'Peak', parent: null, items: ['C:/:Users/:joao/:Music/:a.flac'] }]);
    expect(nmlPath({ VOLUME: 'Macintosh HD', DIR: '/:Users/:x/:', FILE: 'b.mp3' })).toBe('/Users/x/b.mp3');
    expect(nmlPath({ VOLUME: 'USB', DIR: '/:DJ/:', FILE: 'c.mp3' })).toBe('/Volumes/USB/DJ/c.mp3');
  });
});

describe('Apple Music library XML', () => {
  const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Major Version</key><integer>1</integer><key>Tracks</key><dict>
<key>101</key><dict><key>Track ID</key><integer>101</integer><key>Name</key><string>Song</string><key>Artist</key><string>Band</string>
<key>Total Time</key><integer>245000</integer><key>BPM</key><integer>122</integer><key>Rating</key><integer>80</integer>
<key>Date Added</key><date>2025-02-03T10:00:00Z</date><key>Location</key><string>file:///Users/joao/Music/Music/Media/Band/Song.m4a</string></dict>
</dict><key>Playlists</key><array>
<dict><key>Name</key><string>Library</string><key>Master</key><true/><key>Playlist Items</key><array><dict><key>Track ID</key><integer>101</integer></dict></array></dict>
<dict><key>Name</key><string>Sets</string><key>Playlist Persistent ID</key><string>F1</string><key>Folder</key><true/></dict>
<dict><key>Name</key><string>Sunday</string><key>Playlist Persistent ID</key><string>P1</string><key>Parent Persistent ID</key><string>F1</string>
<key>Playlist Items</key><array><dict><key>Track ID</key><integer>101</integer></dict></array></dict>
</array></dict></plist>`;
  it('reads tracks and playlists, skipping the master library', () => {
    const lib = parseAppleLibrary(plist);
    expect(lib.tracks[0]).toMatchObject({ title: 'Song', artist: 'Band', duration: 245, bpm: 122, rating: 4, dateAdded: '2025-02-03', path: '/Users/joao/Music/Music/Media/Band/Song.m4a' });
    expect(lib.lists.map(l => [l.kind, l.name, l.parent, l.items])).toEqual([['folder', 'Sets', null, []], ['playlist', 'Sunday', 'F1', ['101']]]);
  });
});

// Build Serato TLV bytes in the test, exactly as the format describes.
const u32 = (n: number) => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
const text = (s: string) => { const o: number[] = []; for (const ch of s) { const c = ch.charCodeAt(0); o.push(c >> 8, c & 255); } return o; };
const field = (tag: string, data: number[]) => [...tag].map(c => c.charCodeAt(0)).concat(u32(data.length), data);
describe('Serato database V2 and crates', () => {
  const trk = (path: string, title: string, bpm: string, key: string) =>
    field('otrk', [...field('ttyp', text('mp3')), ...field('pfil', text(path)), ...field('tsng', text(title)), ...field('tbpm', text(bpm)), ...field('tkey', text(key)), ...field('uadd', u32(1767225600))]);
  const db = new Uint8Array([...field('vrsn', text('2.0/Serato Scratch LIVE Database')), ...trk('Users/joao/Music/a.mp3', 'A', '126', '8A'), ...trk('Users/joao/Music/b.mp3', 'B', '', '')]);
  const crate = new Uint8Array([...field('vrsn', text('1.0/Serato ScratchLive Crate')), ...field('otrk', field('ptrk', text('Users/joao/Music/b.mp3'))), ...field('otrk', field('ptrk', text('Users/joao/Music/a.mp3')))]);
  it('reads tracks from the database', () => {
    const t = parseSeratoDatabase(db);
    expect(t.map(x => [x.title, x.path, x.bpm, x.key])).toEqual([['A', '/Users/joao/Music/a.mp3', 126, '8A'], ['B', '/Users/joao/Music/b.mp3', null, null]]);
    expect(t[0].dateAdded).toBe('2026-01-01');
  });
  it('turns crates into (nested) playlists', () => {
    const lib = buildSeratoLibrary(db, [{ fileName: 'House%%Deep.crate', bytes: crate }]);
    expect(lib.lists.map(l => [l.kind, l.name])).toEqual([['folder', 'House'], ['playlist', 'Deep']]);
    expect(lib.lists[1].items).toEqual(['/users/joao/music/b.mp3', '/users/joao/music/a.mp3']);
    expect(lib.lists[1].parent).toBe(lib.lists[0].externalId);
  });
});

describe('Engine DJ m.db', () => {
  it('reads tracks and linked-list ordered playlists', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(`CREATE TABLE Track (id INTEGER PRIMARY KEY, path TEXT, filename TEXT, title TEXT, artist TEXT, album TEXT, genre TEXT, comment TEXT, label TEXT,
      year INTEGER, bpm INTEGER, bpmAnalyzed REAL, key INTEGER, rating INTEGER, length INTEGER, dateAdded INTEGER, fileBytes INTEGER);
      CREATE TABLE Playlist (id INTEGER PRIMARY KEY, title TEXT, parentListId INTEGER, nextListId INTEGER);
      CREATE TABLE PlaylistEntity (id INTEGER PRIMARY KEY, listId INTEGER, trackId INTEGER, nextEntityId INTEGER);
      INSERT INTO Track VALUES (1,'../Music/a.mp3','a.mp3','A','X','','Techno','','',2024,128,127.98,1,80,300,1767225600,1000);
      INSERT INTO Track VALUES (2,'../Music/b.mp3','b.mp3','B','Y','','','','',0,120,NULL,22,0,200,0,2000);
      INSERT INTO Playlist VALUES (10,'Second',0,0),(11,'First',0,10),(12,'Child',11,0);
      INSERT INTO PlaylistEntity VALUES (100,10,2,101),(101,10,1,0),(102,12,1,0);`);
    const bytes = db.export(); db.close();
    expect(isSqlite(bytes)).toBe(true);
    const lib = parseEngineDb(bytes, SQL);
    expect(lib.tracks.map(t => [t.title, t.bpm, t.key, t.rating, t.path])).toEqual([['A', 127.98, '8A', 4, '../Music/a.mp3'], ['B', 120, '7B', 0, '../Music/b.mp3']]);
    expect(lib.lists.map(l => [l.name, l.kind, l.items, l.parent])).toEqual([['First', 'folder', [], null], ['Child', 'playlist', ['1'], '11'], ['Second', 'playlist', ['2', '1'], null]]);
    expect(engineKey(0)).toBe('8B'); expect(engineKey(3)).toBe('9A');
  });
});

describe('M3U8', () => {
  it('reads EXTINF and paths', () => {
    const lib = parseM3u('#EXTM3U\n#EXTINF:245,Band - Song\nC:\\Music\\Song.flac\nfile:///Users/j/b.mp3\n', 'Set.m3u8');
    expect(lib.tracks.map(t => [t.artist, t.title, t.duration, t.path])).toEqual([['Band', 'Song', 245, 'C:/Music/Song.flac'], ['', '', null, '/Users/j/b.mp3']]);
    expect(lib.lists[0].name).toBe('Set');
  });
  it('decodes file URLs', () => {
    expect(fileUrlToPath('file://localhost/C:/A%20B/c.mp3')).toBe('C:/A B/c.mp3');
    expect(fileUrlToPath('file:///Users/x/a.mp3')).toBe('/Users/x/a.mp3');
  });
});

describe('linking imported tracks to files', () => {
  it('matches by trailing path segments, breaks ties by size, infers the root path', () => {
    const files = [
      { rootId: 'r', relPath: 'Deep House/Linguistics.aiff', size: 67483110, mtime: 0 },
      { rootId: 'r', relPath: 'Old/Linguistics.aiff', size: 5, mtime: 0 },
      { rootId: 'r', relPath: 'Techno/a.flac', size: 9, mtime: 0 },
      { rootId: 'r', relPath: 'x/dup.mp3', size: 1, mtime: 0 }, { rootId: 'r', relPath: 'y/dup.mp3', size: 1, mtime: 0 },
    ];
    const tracks = [
      { id: 't1', importPath: 'C:/Users/joao/Music/Deep House/Linguistics.aiff', fileName: 'Linguistics.aiff', size: null },
      { id: 't2', importPath: 'C:/Users/joao/Music/Techno/a.flac', fileName: 'a.flac', size: 9 },
      { id: 't3', importPath: '/elsewhere/dup.mp3', fileName: 'dup.mp3', size: 1 },
      { id: 't4', importPath: '/nothing/here.mp3', fileName: 'here.mp3', size: null },
    ];
    const { links, rootPaths } = matchTracks(tracks, files);
    expect(links.get('t1')!.relPath).toBe('Deep House/Linguistics.aiff');
    expect(links.get('t2')!.relPath).toBe('Techno/a.flac');
    expect(links.has('t3')).toBe(false);   // ambiguous: same name, same size, no path clue
    expect(links.has('t4')).toBe(false);
    expect(rootPaths.get('r')).toBe('C:\\Users\\joao\\Music');
  });
});
