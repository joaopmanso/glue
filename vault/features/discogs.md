---
status: shipped
milestone: M8
updated: 2026-10-31
adrs: [0186, 0187, 0188, 0189, 0190]
---
# Discogs

## Now
- **Connect:** a personal access token from discogs.com (Settings › Developers), pasted in GLUE Home's settings. GLUE
  Home checks it ("Connected as …") and keeps it on this computer, sent to Discogs' API only (ADR 0186).
- **Covers:** Discogs is the fourth cover service, after Deezer, iTunes and MusicBrainz, for songs whose tags have
  none. Songs that found nothing before the token are looked up again once.
- **Your records** (ADR 0187): **Discogs** in the sidebar's Music section (`#/discogs`).
  - **What it shows:** the collection and the wantlist, each record with its cover, title, artists, label and catalogue
    number, year, styles and formats.
  - **"In GLUE: 3 of 4 tracks"** (or N songs, before its tracklist is read; a click opens their album) or **"Not in
    GLUE"** (ADR 0188).
  - **Choose…** (on each record, or right-click): its tracks with the songs found for them, its songs ("Not on it" takes
    one off for good), and a library search to **Add** more. Remembered on the songs (`discogs`, `discogsNo`).
  - **Finding:** filter All / In GLUE / Not in GLUE, search (names, labels, catalogue numbers, styles), sort by added,
    artist, title, label or year.
  - **Right-click:** Show its songs, Play, Add to Discogs playlist, Open on Discogs.
- **Discogs playlists** (ADR 0189): under 💿 Discogs in the sidebar; **+ Playlist** / **+ Auto** in the Discogs view.
  - **They mix** your songs (they play) and vinyl tracks (cover, position, record, label and catalogue number, **On
    vinyl**). Added from a record's menu (its tracks), a track's ＋ in its panel, or a song's menu. Arranged by hand
    (move, drag, remove).
  - **The builder** (ADR 0190): from ticked records or tracks (or a record's or a track's menu; nothing: the rules
    alone). It takes how many tracks, per record, vinyl / digital / both, compilations, songs from the library, avoiding
    tracks already in the playlists, styles and artists (Prefer or Only), labels, formats and years. It picks tracks like
    the seeds (style, genre, label, years, artists); ↻ and × per track, ↻ Another; Save makes a Discogs playlist.
  - **The live-rules auto playlists** (ADR 0189) aren't made any more; existing ones still show and can be saved as a
    playlist.
  - **Kept out of** the library's Playlists, its pickers, Engine DJ and the exports.
- **How:**
  - **Reading:** GLUE Home reads the lists (100 a page, a request every 1.1 s) and the new records' covers. It does so
    after the token is checked, again after 20 hours (an hourly look), and on Refresh.
  - **Kept** in `profiles/<p>/discogs.json`. The page asks GLUE Home for it (`discogs`).
  - **Tracklists:** GLUE Home reads each record's once, after the covers (a request a record). What's missing is fetched at
    the next hourly look even when the list is fresh (0.79).
  - **Matching** on the page (`discogsMatch.ts`):
    - track by track: title and version, the track's or the record's artist, length within 8 s;
    - before the tracklist: the record's title as the songs' album by one of its artists, a compilation on its label, a
      single by its title;
    - the user's choices first.
- **Tests:**
  - `tests/discogs.rs`: the check, covers, the token's one host, the read with two pages, covers fetched once;
  - `tests/discogsMatch.test.ts`;
  - the covers golden;
  - `home.spec.ts` (the token in GLUE Home's settings);
  - `homemode.spec.ts` (the view: covers, in GLUE or not, filters, the wantlist, a record's songs, Refresh).
  - **Playlists:** collection lists marked `discogs`, items song ids or `dg:<release>:<position>`; auto ones worked out live
    (`discogsLists.ts` `discogsAuto`).
- **Not yet:**
  - devices without GLUE Home;
  - giving a matched record's cover to its songs without a search.
