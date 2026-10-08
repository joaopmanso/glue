/* The DJ libraries' reference for GLUE Home's Rust parsers (crates/glue-interop, ADR 0167): library files of every
   app GLUE reads, made here with the corners each parser has (entities, file URLs, numbers as JavaScript reads them,
   a byte-order mark, Windows-1252, UTF-16, Apple's numeric keys, Engine DJ sets), parsed by the website's own
   `parseLibraryFiles`, into tests/golden/interop/<case>/{in/…, files.json, expected.json}. crates/glue-interop/tests/
   golden.rs parses the same files and must give the same libraries. Regenerate (on purpose):
   GOLDEN=1 npx vitest run tests/interop.golden.test.ts */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import initSqlJs from 'sql.js';
import { parseLibraryFiles } from '../src/lib/imports';

const OUT = join(__dirname, 'golden', 'interop');
const sql = () => initSqlJs();

// ── rekordbox ────────────────────────────────────────────────────────────────────────────────────────────────────
const rekordbox = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE x [ <!ENTITY y "z"> ]>
<!-- exported -->
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.8.5" Company="AlphaTheta"/>
  <COLLECTION Entries="5">
    <TRACK TrackID="1" Name="Caf&#233; &amp; Bar" Artist="D&#xE9;j&#xe0; &quot;Vu&quot;" Album="A" Genre="House" Label="L" Comments="c &lt;3" Grouping="warm, peak" Year="2019" TotalTime="301" AverageBpm="124.00" Tonality="8A" Rating="255" PlayCount="7" DateAdded="2024-03-01" Size="10485760" Location="file://localhost/C:/Music/Caf%C3%A9%20Bar.mp3">
      <TEMPO Inizio="0.025" Bpm="124.00" Metro="4/4" Battito="1"/>
      <POSITION_MARK Name="Drop" Type="0" Start="64.500" Num="1" Red="40" Green="226" Blue="20"/>
      <POSITION_MARK Name="" Type="0" Start="0.025" Num="-1"/>
      <POSITION_MARK Name="Roll" Type="4" Start="96.000" End="98.000" Num="2" Red="300" Green="-5" Blue="x"/>
      <POSITION_MARK Name="" Type="3" Start="1.0" Num="-1"/>
      <POSITION_MARK Name="" Type="1" Start="2.5"/>
    </TRACK>
    <TRACK TrackID="2" Name="Zero" Year="0" AverageBpm="0.00" Rating="102" Size=" 1e3 " TotalTime="0x10" Location="file:///Users/dj/Music/Zero%E0%A4%A.mp3"/>
    <TRACK TrackID="3" Name="No place"/>
    <TRACK Name="By location" Rating="153" Location="file://localhost/D:/Sets/loc.flac"/>
    <TRACK TrackID="5" Name='single &apos;quoted&apos;' Rating="nope" PlayCount="" Location="file://localhost/E:/a%2Fb/%F0%9F%8E%B5.wav"/>
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="4">
      <NODE Type="0" Name="2024" Count="2">
        <NODE Name="Warm" Type="1" KeyType="0" Entries="3"><TRACK Key="2"/><TRACK Key="1"/><TRACK Key="99"/></NODE>
        <NODE Name="Warm" Type="1" KeyType="0" Entries="0"/>
      </NODE>
      <NODE Name="By path" Type="1" KeyType="1" Entries="2"><TRACK Key="file://localhost/D:/Sets/loc.flac"/><TRACK Key="file://nowhere"/></NODE>
      <NODE Name="" Type="1" KeyType="0" Entries="1"><TRACK Key="5"/></NODE>
      <NODE Type="0" Name="Empty"/>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`;

// ── Traktor ──────────────────────────────────────────────────────────────────────────────────────────────────────
const traktor = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<NML VERSION="19"><HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor"></HEAD>
<COLLECTION ENTRIES="5">
<ENTRY TITLE="Win" ARTIST="A">
  <LOCATION DIR="/:Music/:House/:" FILE="win.mp3" VOLUME="C:" VOLUMEID="x"></LOCATION>
  <ALBUM TITLE="Alb"></ALBUM>
  <INFO BITRATE="320000" GENRE="House" LABEL="Lab" COMMENT="Com" KEY="Am" PLAYTIME="245" PLAYCOUNT="3" RANKING="204" IMPORT_DATE="2023/1/5" FILESIZE="9765"></INFO>
  <TEMPO BPM="125.000061" BPM_QUALITY="100.000000"></TEMPO>
  <MUSICAL_KEY VALUE="21"></MUSICAL_KEY>
  <CUE_V2 NAME="AutoGrid" DISPL_ORDER="0" TYPE="4" START="12.5" LEN="0" REPEATS="-1" HOTCUE="0"></CUE_V2>
  <CUE_V2 NAME="n.n." DISPL_ORDER="0" TYPE="0" START="30000" LEN="0" REPEATS="-1" HOTCUE="1"></CUE_V2>
  <CUE_V2 NAME="Loop" DISPL_ORDER="0" TYPE="5" START="1500.25" LEN="8000" REPEATS="-1" HOTCUE="-1"></CUE_V2>
  <CUE_V2 NAME="Out" TYPE="2" START="200000" HOTCUE="-1"></CUE_V2>
</ENTRY>
<ENTRY TITLE="Mac"><LOCATION DIR="/:Users/:dj/:Music/:" FILE="mac.aiff" VOLUME="Macintosh HD"></LOCATION><MUSICAL_KEY VALUE="7"></MUSICAL_KEY><INFO RANKING="" FILESIZE="0"></INFO></ENTRY>
<ENTRY TITLE="Ext"><LOCATION DIR="/:Sets/:" FILE="ext.wav" VOLUME="Stick"></LOCATION><TEMPO BPM="0"></TEMPO></ENTRY>
<ENTRY TITLE="Factory"><LOCATION DIR="/:Users/:dj/:Native Instruments/:Traktor/:" FILE="loop.wav" VOLUME="Macintosh HD"></LOCATION></ENTRY>
<ENTRY TITLE="No file"><LOCATION DIR="/:x/:" VOLUME="C:"></LOCATION></ENTRY>
</COLLECTION>
<PLAYLISTS><NODE TYPE="FOLDER" NAME="$ROOT"><SUBNODES COUNT="3">
  <NODE TYPE="PLAYLIST" NAME="_LOOPS"><PLAYLIST ENTRIES="0" TYPE="LIST" UUID="aa11"></PLAYLIST></NODE>
  <NODE TYPE="FOLDER" NAME="Gigs"><SUBNODES COUNT="2">
    <NODE TYPE="PLAYLIST" NAME="Friday"><PLAYLIST ENTRIES="2" TYPE="LIST" UUID="bb22">
      <ENTRY><PRIMARYKEY TYPE="TRACK" KEY="Stick/:Sets/:ext.wav"></PRIMARYKEY></ENTRY>
      <ENTRY><PRIMARYKEY TYPE="TRACK" KEY="C:/:Music/:House/:win.mp3"></PRIMARYKEY></ENTRY>
      <ENTRY><PRIMARYKEY TYPE="TRACK"></PRIMARYKEY></ENTRY>
    </PLAYLIST></NODE>
    <NODE TYPE="PLAYLIST" NAME="Friday"><PLAYLIST ENTRIES="0" TYPE="LIST"></PLAYLIST></NODE>
  </SUBNODES></NODE>
  <NODE TYPE="SMARTLIST" NAME="Smart"></NODE>
</SUBNODES></NODE></PLAYLISTS>
</NML>
`;

// ── Apple Music ──────────────────────────────────────────────────────────────────────────────────────────────────
const apple = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Major Version</key><integer>1</integer>
  <key>Tracks</key>
  <dict>
    <key>1000</key><dict><key>Track ID</key><integer>1000</integer><key>Name</key><string>Big</string><key>Artist</key><integer>42</integer><key>Year</key><integer>1999</integer><key>Total Time</key><integer>245123</integer><key>BPM</key><integer>0</integer><key>Rating</key><integer>80</integer><key>Rating Computed</key><true/><key>Play Count</key><integer>2</integer><key>Date Added</key><date>2020-02-02T10:00:00Z</date><key>Size</key><real>1.5e6</real><key>Location</key><string>file://localhost/Users/dj/Music/Big%20One.m4a</string></dict>
    <key>20</key><dict><key>Track ID</key><integer>20</integer><key>Name</key><string>Small &amp; early</string><key>Grouping</key><string>g</string><key>BPM</key><integer>128</integer><key>Rating</key><integer>60</integer><key>Total Time</key><string>100</string><key>Location</key><string>file:///Volumes/Ext/x.mp3</string></dict>
    <key>abc</key><dict><key>Name</key><string>Lettered</string><key>Location</key><string>file:///C:/Music/abc.mp3</string></dict>
    <key>7</key><dict><key>Name</key><string>Stream</string><key>Track Type</key><string>URL</string><key>Location</key><string>http://radio</string></dict>
    <key>8</key><dict><key>Name</key><string>Pod</string><key>Podcast</key><true/><key>Location</key><string>file:///p.mp3</string></dict>
    <key>9</key><dict><key>Name</key><string>Nowhere</string></dict>
    <key>20</key><dict><key>Name</key><string>Twenty again</string><key>Comments</key><data>AAA=</data><key>Location</key><string>file:///twenty.mp3</string></dict>
  </dict>
  <key>Playlists</key>
  <array>
    <dict><key>Name</key><string>Library</string><key>Master</key><true/><key>Playlist ID</key><integer>1</integer><key>Playlist Items</key><array><dict><key>Track ID</key><integer>20</integer></dict></array></dict>
    <dict><key>Name</key><string>Music</string><key>Distinguished Kind</key><integer>4</integer><key>Playlist ID</key><integer>2</integer></dict>
    <dict><key>Name</key><string>Hidden</string><key>Visible</key><false/><key>Playlist ID</key><integer>3</integer></dict>
    <dict><key>Name</key><string>Crates</string><key>Folder</key><true/><key>Playlist ID</key><integer>4</integer><key>Playlist Persistent ID</key><string>F0F0</string></dict>
    <dict><key>Name</key><string>Set</string><key>Playlist ID</key><integer>5</integer><key>Playlist Persistent ID</key><string>A1A1</string><key>Parent Persistent ID</key><string>F0F0</string><key>Playlist Items</key><array><dict><key>Track ID</key><integer>1000</integer></dict><dict><key>Track ID</key><integer>7</integer></dict><dict><key>Track ID</key><integer>20</integer></dict></array></dict>
    <dict><key>Name</key><string>Orphan</string><key>Playlist ID</key><real>6.5</real><key>Parent Persistent ID</key><string>GONE</string></dict>
    <dict><key>Playlist ID</key><integer>7</integer><key>Playlist Items</key><array></array></dict>
  </array>
</dict>
</plist>
`;

// ── Serato ───────────────────────────────────────────────────────────────────────────────────────────────────────
const u32 = (n: number) => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
const u16 = (n: number) => [n >> 8 & 255, n & 255];
const text = (s: string) => { const o: number[] = []; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); o.push(c >> 8, c & 255); } return o; };
const field = (tag: string, data: number[]) => [...tag].map(c => c.charCodeAt(0)).concat(u32(data.length), data);
const trk = (fs: number[][]) => field('otrk', fs.flat());
const seratoDb = new Uint8Array([
  ...field('vrsn', text('2.0/Serato Scratch LIVE Database')),
  ...trk([field('ttyp', text('mp3')), field('pfil', text('Users\\dj\\Music\\A.mp3')), field('tsng', text('Á \u{1F3B5} title\u0000\u0000')), field('tart', text('Art')),
    field('tbpm', text('126.5')), field('tkey', text('8A')), field('tlen', text('03:45.12')), field('uadd', u32(1767225600)), field('tsiz', text('8.5MB')),
    field('ttyr', text('2001')), field('bhrt', [1]), field('sbav', u16(258))]),
  ...trk([field('pfil', text('/Volumes/Ext/b.mp3')), field('tlen', text('225')), field('tbpm', text('')), field('uadd', u32(0)), field('tsiz', text('n/a'))]),
  ...trk([field('tsng', text('No path'))]),
  ...trk([field('pfil', text('c.mp3')), field('tlen', text('1:2:3')), field('tsng', [0xd8, 0x00])]),
  ...field('otrk', [1, 2, 3]),   // a record cut short
]);
const crate = (paths: string[]) => new Uint8Array([...field('vrsn', text('1.0/Serato ScratchLive Crate')), ...paths.map(p => field('otrk', field('ptrk', text(p)))).flat()]);

// ── Engine DJ ────────────────────────────────────────────────────────────────────────────────────────────────────
type SQL = Awaited<ReturnType<typeof initSqlJs>>;
function engineMain(SQL: SQL) {
  const db = new SQL.Database();
  db.run(`CREATE TABLE Information (id INTEGER PRIMARY KEY, uuid TEXT);
    CREATE TABLE Track (id INTEGER PRIMARY KEY, path TEXT, filename TEXT, title TEXT, artist TEXT, album TEXT, genre TEXT, comment TEXT, label TEXT,
      year INTEGER, bpm INTEGER, bpmAnalyzed REAL, key INTEGER, rating INTEGER, length REAL, dateAdded INTEGER, fileBytes INTEGER);
    CREATE TABLE Playlist (id INTEGER PRIMARY KEY, title TEXT, parentListId INTEGER, nextListId INTEGER);
    CREATE TABLE PlaylistEntity (id INTEGER PRIMARY KEY, listId INTEGER, trackId INTEGER, databaseUuid TEXT, nextEntityId INTEGER);
    INSERT INTO Information VALUES (1, 'pc-uuid');
    INSERT INTO Track VALUES (1,'../Music/a.mp3','a.mp3','A','X','Al','Techno','co','la',2024,128,127.98,1,80,300.5,1767225600,1000);
    INSERT INTO Track VALUES (2,'..\\Music\\b.mp3','b.mp3','B','Y','','','','',0,120,NULL,22,0,200,0,2000);
    INSERT INTO Track VALUES (3,NULL,'c.mp3','C',NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,24,NULL,NULL,-5,NULL);
    INSERT INTO Track VALUES (4,'',NULL,'D','','','','','',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
    INSERT INTO Track VALUES (5,'../Music/e.mp3','e.mp3','E','','','','','','1999',NULL,'128.5',2.5,'50',NULL,1700000000,'3000');
    INSERT INTO Playlist VALUES (10,'Second',0,0),(11,'First',0,10),(12,'Child',11,13),(13,'Child',11,0),(20,'Loop A',0,21),(21,'Loop B',0,20),(30,'Lost',99,0);
    INSERT INTO PlaylistEntity VALUES (100,10,2,'pc-uuid',101),(101,10,1,'pc-uuid',102),(102,10,5,'drive-uuid',103),(103,10,9,'stick-uuid',104),(104,10,77,'pc-uuid',0);
    INSERT INTO PlaylistEntity VALUES (105,11,1,NULL,0),(106,12,3,'pc-uuid',0),(107,13,5,'drive-uuid',0),(108,30,1,'pc-uuid',0);`);
  const b = db.export(); db.close(); return b;
}
function engineDrive(SQL: SQL) {
  const db = new SQL.Database();
  db.run(`CREATE TABLE Information (id INTEGER PRIMARY KEY, uuid TEXT);
    CREATE TABLE Track (id INTEGER PRIMARY KEY, path TEXT, title TEXT);
    CREATE TABLE Playlist (id INTEGER PRIMARY KEY, title TEXT, parentListId INTEGER, nextListId INTEGER);
    CREATE TABLE PlaylistEntity (id INTEGER PRIMARY KEY, listId INTEGER, trackId INTEGER, databaseUuid TEXT, nextEntityId INTEGER);
    INSERT INTO Information VALUES (1, 'drive-uuid');
    INSERT INTO Track VALUES (5,'../Music Collection/e.mp3','E on the drive');
    INSERT INTO Playlist VALUES (10,'Second',0,0);
    INSERT INTO PlaylistEntity VALUES (100,10,5,'drive-uuid',0);`);
  const b = db.export(); db.close(); return b;
}
function engineOld(SQL: SQL) {
  const db = new SQL.Database();
  db.run(`CREATE TABLE Track (id INTEGER PRIMARY KEY, path TEXT, title TEXT, bpm REAL, key INTEGER);
    INSERT INTO Track VALUES (1,'../Music/old.mp3','Old',0,30),(2,'../Music/new.mp3','New',95.5,-1);`);
  const b = db.export(); db.close(); return b;
}

// ── M3U ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const m3u8 = '\uFEFF#EXTM3U\r\n#EXTINF:245,Band - Song\r\nC:\\Music\\Song.flac\r\n\r\n#EXTINF:-1 tvg-id="x",Just a title\r\nfile:///Users/j/b%20c.mp3\r\n# comment\r\n#EXTINF:12.5,A - B - C\r\n  /Music/Ünï.mp3  \r\n#EXTINF:bad\r\nrel/x.mp3\r\n';
const cp1252 = new Uint8Array([...new TextEncoder().encode('#EXTINF:100,Caf'), 0xe9, ...new TextEncoder().encode(' - Euro '), 0x80, 0x81, ...new TextEncoder().encode('\nC:\\M\\caf'), 0xe9, ...new TextEncoder().encode('.mp3\n')]);

const enc = (s: string) => new TextEncoder().encode(s);
/** Each case: the files chosen together, in order. */
async function cases(): Promise<Record<string, [string, Uint8Array][]>> {
  const SQL = await initSqlJs();
  return {
    rekordbox: [['rekordbox.xml', enc(rekordbox)]],
    traktor: [['collection.nml', enc(traktor)]],
    apple: [['Library.xml', enc(apple)]],
    serato: [['B.crate', crate(['Volumes/Ext/b.mp3', 'Users/dj/Music/A.mp3'])], ['database V2', seratoDb], ['House%%Deep.crate', crate(['users/dj/music/a.mp3', 'nowhere.mp3'])], ['a.crate', crate([])], ['House.crate', crate(['c.mp3'])]],
    'engine-set': [['m.db', engineMain(SQL)], ['drive m.db', engineDrive(SQL)]],
    'engine-old': [['m.db', engineOld(SQL)]],
    m3u: [['Set One.m3u8', enc(m3u8)], ['old.m3u', cp1252], ['plain.M3U', enc('C:\\a.mp3\n')]],
    // What isn't a library, and crates without their database.
    skipped: [['notes.txt', enc('hello')], ['lonely.crate', crate(['a.mp3'])], ['broken.xml', enc('<DJ_PLAYLISTS><COLLECTION><TRACK Location="x"')], ['bad.nml', enc('<NML ')]],
  };
}

/** The parse as it'd be sent (Maps as objects). */
const plain = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => x instanceof Map ? Object.fromEntries(x) : x));

describe('golden DJ libraries for GLUE Home (ADR 0167)', () => {
  it(process.env.GOLDEN ? 'writes them' : 'are current', async () => {
    for (const [name, files] of Object.entries(await cases())) {
      const dir = join(OUT, name), r = plain(await parseLibraryFiles(files.map(([n, b]) => new File([b as Uint8Array<ArrayBuffer>], n)), sql));
      const want = { 'files.json': JSON.stringify(files.map(([n]) => n)) + '\n', 'expected.json': JSON.stringify(r, null, 1) + '\n' };
      if (process.env.GOLDEN) {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(join(dir, 'in'), { recursive: true });
        for (const [n, b] of files) writeFileSync(join(dir, 'in', n), b);
        for (const [f, t] of Object.entries(want)) writeFileSync(join(dir, f), t);
      } else for (const [f, t] of Object.entries(want)) {
        const path = join(dir, f);
        expect(existsSync(path), path + ' missing: GOLDEN=1 npx vitest run tests/interop.golden.test.ts').toBe(true);
        expect(JSON.parse(readFileSync(path, 'utf8')), name + '/' + f + ' is stale: GOLDEN=1 npx vitest run tests/interop.golden.test.ts, then the Rust parsers').toEqual(JSON.parse(t));
      }
    }
  }, 60_000);
});
