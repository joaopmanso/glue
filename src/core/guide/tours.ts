/* Gluey's tours (ADR 0126): each a few stops, each stop pointing at a part of GLUE marked \`data-guide="…"\` in the UI.
   Data only: the guide (lib/guide.svelte.ts) runs them, GuideLayer draws them. Pure. */

export type Pose = 'wave' | 'point' | 'think' | 'cheer';
export type Place = 'right' | 'left' | 'top' | 'bottom' | 'center';

/** What to open before a stop is shown. */
export type Go =
  | { route: string }                                   // a page, e.g. '#/' or '#/events'
  | { view: 'all' | 'dupes' | 'unlinked' | 'attention' | 'pending' }   // a library view
  | { song: 'first'; tab?: 'details' | 'prepare' };     // the first song's page

export interface TourStep {
  /** A \`data-guide\` name; none: Gluey in the middle of the screen. */
  target?: string;
  title: string;
  body: string;
  pose?: Pose;
  place?: Place;
  go?: Go;
  /** Left out quietly when its target isn't on the page (no songs yet, no GLUE Home…). */
  optional?: boolean;
}

export interface Tour {
  id: string;
  title: string;
  /** One line, for lists of tours. */
  summary: string;
  steps: TourStep[];
  /** For the phone's layout. */
  phone?: boolean;
}

export const TOURS: Tour[] = [
  {
    id: 'welcome',
    title: 'The first tour',
    summary: 'The library, adding music, the analysis, a song’s page, playlists and your devices, in a minute.',
    steps: [
      { title: 'Hi, I’m Gluey!', body: 'I stick your DJ apps together. Let me show you around GLUE: it takes about a minute, and you can stop me any time.', pose: 'wave', place: 'center' },
      { target: 'library-views', go: { view: 'all' }, title: 'Your library', place: 'right', pose: 'point',
        body: 'Every song from your music folders and DJ apps, in one place. These views pick some out: lower quality, not analysed yet, songs with no file, duplicates.' },
      { target: 'add-music', title: 'Adding music', place: 'right', pose: 'point',
        body: 'Add a music folder here and GLUE keeps it up to date. You can also drop songs or folders anywhere on the page. DJ libraries GLUE finds (rekordbox, Engine DJ, Serato, Traktor) show below.' },
      { target: 'analysis', title: 'Listening to every song', place: 'bottom', pose: 'think',
        body: 'GLUE analyses your songs in the background: their real quality (is that FLAC really lossless?), BPM, key, and a fingerprint that finds duplicates by sound.' },
      { target: 'track-tabs', go: { song: 'first' }, optional: true, title: 'A song’s page', place: 'bottom', pose: 'point',
        body: 'Double-click a song to open it. Details shows its quality and why; Prepare is for cues and the beat grid before a set.' },
      { target: 'playlists', go: { route: '#/' }, title: 'Playlists', place: 'right', pose: 'point',
        body: 'Make playlists and folders here and drag songs onto them, or build one from a song. Your DJ libraries’ playlists can be brought in too.' },
      { target: 'devices', title: 'Every computer, and your phone', place: 'bottom', pose: 'point',
        body: 'Sign in here to use your library on your laptop and phone too. Your library’s data follows you; your music stays on your computers.' },
      { target: 'pair-home|devices', title: 'GLUE Home', place: 'right', pose: 'point',
        body: 'A small app for your computer (Windows or macOS): it analyses with the browser closed and plays your songs on your other devices. Signed in, the Devices panel on the left has “+ GLUE Home”: it downloads the app and shows a code; type the code into GLUE Home’s window to connect it.' },
      { target: 'help', optional: true, title: 'I’m always here', place: 'top', pose: 'cheer',
        body: 'Click me any time for help, and for a tour of each feature: duplicates, songs with no file, Prepare, the calendar, GLUE Home and more. Have fun!' },
    ],
  },
  // ── A tour per feature (the help centre's "Show me") ──
  {
    id: 'library', title: 'The library and its views', summary: 'Views, search, and collections.',
    steps: [
      { target: 'view-all', go: { view: 'all' }, title: 'All tracks', place: 'right', body: 'Every song in the collection. Recently added and Browse (by artist, album, genre, label or year) are just below.' },
      { target: 'search', title: 'Search', place: 'bottom', body: 'Finds songs by title, artist, album, genre, label or tag. Filter, next to it, narrows by any column’s values.' },
      { target: 'view-attention', optional: true, title: 'Lower quality', place: 'right', body: 'Songs below a lossless file of their format. For information: nothing has to be done.' },
      { target: 'view-unlinked', optional: true, title: 'No file linked', place: 'right', body: 'Songs a DJ library lists whose file isn’t found. I can find most of them in your library.' },
      { target: 'view-dupes', optional: true, title: 'Duplicates', place: 'right', body: 'The same recording found by sound, however it’s named. Each song shows as its best copy.' },
      { target: 'collections', title: 'Collections', place: 'bottom', body: 'Switch collections here. Most people need one; another is for music you keep apart.' },
    ],
  },
  {
    id: 'adding-music', title: 'Adding music', summary: 'Music folders, songs, drops, and DJ libraries found.',
    steps: [
      { target: 'add-music', go: { route: '#/' }, title: 'Music folders', place: 'right', body: '+ Folder adds a folder, and GLUE keeps it up to date (↻ scans it again). + Songs adds files on their own. Dropping folders or songs on the page works too.' },
      { target: 'dj-libs', title: 'DJ libraries', place: 'right', body: 'DJ libraries GLUE finds show here: Add, or × to take one off the list. + Import takes one by hand.' },
      { target: 'analysis', title: 'Then GLUE listens', place: 'bottom', pose: 'think', body: 'New songs are analysed in the background: quality, BPM, key and the fingerprint for duplicates.' },
    ],
  },
  {
    id: 'dj-libraries', title: 'DJ libraries', summary: 'Importing, followed live, their playlists.',
    steps: [
      { target: 'dj-libs', go: { route: '#/' }, title: 'Your DJ apps', place: 'right', body: 'rekordbox, Engine DJ, Serato, Traktor and Apple Music. An imported library is followed: when the app changes it, GLUE reads it again. Your main Engine DJ library can also be kept in step both ways (right-click it).' },
      { target: 'playlists', title: 'Their playlists', place: 'right', body: 'A DJ library’s playlists are browsed under it, and brought in here when you want them. With your main Engine DJ library kept in step, you change its own playlists there too: right-click one, or drop songs on it. Yours go into Engine DJ’s GLUE folder with Keep in Engine DJ.' },
      { target: 'view-unlinked', optional: true, title: 'Songs with no file', place: 'right', body: 'Songs a DJ library lists whose files are gone show here; I can find most of them in your library.' },
    ],
  },
  {
    id: 'quality', title: 'Quality and verdicts', summary: 'What GLUE found out about your files.',
    steps: [
      { target: 'view-attention', go: { view: 'attention' }, optional: true, title: 'Lower quality', place: 'right', body: 'Lossy files, transcodes, upsampled “hi-res”, padded 24-bit… for information. Nothing has to be done.' },
      { target: 'verdict', go: { song: 'first' }, optional: true, title: 'The verdict, and why', place: 'right', pose: 'think', body: 'Each song’s page says what it really is, with the evidence: the measured bandwidth, the expected one, the likely origin. “Not a problem” takes a song off Lower quality.' },
      { target: 'analysis', go: { route: '#/' }, title: 'The analysis', place: 'bottom', body: 'GLUE analyses in the background, several songs at a time. Background analysis turns it off; songs you open are still analysed.' },
    ],
  },
  {
    id: 'song-page', title: 'A song’s page', summary: 'Details, the verdict, the spectrogram, Prepare.',
    steps: [
      { target: 'track-tabs', go: { song: 'first' }, optional: true, title: 'Details and Prepare', place: 'bottom', body: 'Details is about the file; Prepare is for the grid and cues before a set.' },
      { target: 'verdict', optional: true, title: 'The verdict', place: 'right', pose: 'think', body: 'What the file really is, and why. The spectrogram on the right shows the sound: hover to read it, click to play from there.' },
    ],
  },
  {
    id: 'prepare', title: 'Prepare', summary: 'The beat grid and cues before a set.',
    steps: [
      { target: 'prep-deck', go: { song: 'first', tab: 'prepare' }, optional: true, title: 'The deck', place: 'bottom', body: 'The song’s waveform around the play head, with the beat grid. Space plays; drag to move along.' },
      { target: 'prep-grid', optional: true, title: 'The beat grid', place: 'top', body: 'Check the BPM with the metronome (M); ÷2 and ×2 fix half or double tempo, Tap (T) taps it, ◀ ▶ move the grid.' },
      { target: 'prep-cues', optional: true, title: 'Cues and loops', place: 'top', body: 'Set cue points and loops here; they show on the waveform.' },
      { target: 'prep-apps', optional: true, title: 'From your DJ apps', place: 'top', body: 'What rekordbox, Engine DJ or Traktor has for this song: its cues, loops and beat grid. Use its cues or its grid to take them.' },
    ],
  },
  {
    id: 'playlists', title: 'Playlists and the builder', summary: 'Playlists, folders, tags and building one from a song.',
    steps: [
      { target: 'playlists', go: { route: '#/' }, title: 'Playlists and folders', place: 'right', body: 'Drag songs onto a playlist, playlists into folders; right-click for colours and more. Deleted ones go to Recently deleted first.' },
      { target: 'builder', title: 'Building one', place: 'right', body: '+ Auto builds a playlist from your collection. With a song selected, “Build playlist from this” makes one that flows from it.' },
      { target: 'tags', title: 'Tags', place: 'right', body: 'Tag songs from the Tags column or by dragging them here: a quick list of their own.' },
    ],
  },
  {
    id: 'duplicates', title: 'Duplicates', summary: 'The best copy, the main folder, cleaning up in bulk.',
    steps: [
      { target: 'view-dupes', go: { view: 'dupes' }, title: 'Duplicates', place: 'right', body: 'The same recording found by how it sounds. Each song shows as its best copy everywhere, and playlists use it.' },
      { target: 'dupes-main', optional: true, title: 'Your main folder', place: 'bottom', body: 'Optional: among copies, the one in this folder is kept (a lossless copy elsewhere still wins).' },
      { target: 'dupes-filters', optional: true, title: 'How sure', place: 'bottom', body: 'Each group says how it was found and how sure GLUE is. Filter, say, to 95 % and up.' },
      { target: 'dupes-group', optional: true, title: 'A group', place: 'top', body: '“Make it the best” picks the copy that stays; “Keep · not a duplicate” takes a copy out (an instrumental, a live take).' },
      { target: 'dupes-wave', optional: true, title: 'See and hear them', place: 'top', body: 'Each copy’s waveform, to the same time scale: the same recording lines up. Click one to play from there, drag to scrub; another copy’s ▶ starts at the same moment.' },
      { target: 'dupes-bulk', optional: true, title: 'Many at once', place: 'bottom', body: 'With GLUE Home: tick groups (or Tick all shown), then move the other copies aside or to the Recycle Bin.' },
    ],
  },
  {
    id: 'no-file', title: 'No file linked', summary: 'Finding songs whose files are gone, and linking them.',
    steps: [
      { target: 'view-unlinked', go: { view: 'unlinked' }, title: 'No file linked', place: 'right', body: 'Songs a DJ library lists whose files aren’t in your music folders: moved, renamed, or removed as duplicates.' },
      { target: 'relink-row', optional: true, title: 'Its match', place: 'bottom', pose: 'think', body: 'For each one I look for the song in your library, and say how sure I am and why. Link it, say “Not this one”, or Choose… the song yourself.' },
      { target: 'relink-bulk', optional: true, title: 'Many at once', place: 'bottom', body: 'Set Certainty at least (95 % is a good start), Tick all shown, then Link. Doubtful matches are set aside.' },
      { target: 'relink-list', optional: true, title: 'The plain list', place: 'left', body: 'Shows these songs as the usual table instead.' },
    ],
  },
  {
    id: 'calendar', title: 'Calendar and events', summary: 'Gigs, their playlists, reminders.',
    steps: [
      { target: 'calendar', go: { route: '#/events' }, title: 'Your calendar', place: 'top', body: 'Your gigs and sessions. An event coming up with no music yet shows a badge, and GLUE Home reminds you.' },
      { target: 'new-event', title: 'A new event', place: 'bottom', body: 'A date, a place, notes and a flyer; then give it a playlist, or a version of one made for it.' },
    ],
  },
  {
    id: 'glue-home', title: 'GLUE Home', summary: 'The app for your computer, and what it adds.',
    steps: [
      { target: 'devices', go: { route: '#/' }, title: 'GLUE Home', place: 'bottom', body: 'A small app for your computer (Windows or macOS): it analyses with the browser closed, and plays this computer’s songs on your laptop and phone. You need to be signed in: here.' },
      { target: 'devices-panel', optional: true, title: 'Your devices', place: 'right', body: 'The Devices panel on the left lists your computers and phones: which have GLUE Home, which are online. Click one to see only its songs; right-click for more.' },
      { target: 'pair-home|devices', title: 'Connecting GLUE Home', place: 'right', pose: 'think', body: '“+ GLUE Home” (in the Devices panel, once signed in) downloads the app and shows a code. Open GLUE Home, type the code into its window, and it joins your account as this computer’s.' },
      { target: 'analysis', title: 'The engine', place: 'bottom', pose: 'think', body: 'With GLUE Home running, it does the analysis: this bar shows its queue. Stop in its window hands the library back to the browser.' },
      { target: 'drag-dock', optional: true, title: 'The drag dock', place: 'bottom', body: 'Carries songs and playlists into Engine DJ, rekordbox or a folder.' },
    ],
  },
  {
    id: 'devices', title: 'Devices and accounts', summary: 'The same library on your laptop and phone.',
    steps: [
      { target: 'devices', go: { route: '#/' }, title: 'Your account', place: 'bottom', body: 'Sign in to use your library on your other devices. GLUE Cloud keeps its data in step, never your music.' },
      { target: 'devices-panel', optional: true, title: 'The Devices panel', place: 'right', body: 'Your computers and phones: which have GLUE Home and are online. Click one to see its songs; “+ GLUE Home” connects this computer’s.' },
      { target: 'collections', title: 'Your collections', place: 'bottom', body: 'Your account’s collections: every device sees them, each computer with its own music folders.' },
      { target: 'profile', title: 'Who’s using GLUE?', place: 'bottom', body: 'Your profiles are your artist names, the same everywhere. Click here to switch, change the theme, or see how this computer uses GLUE.' },
    ],
  },
  {
    id: 'analyze', title: 'Analyse a file', summary: 'One file’s real quality, without a library.',
    steps: [
      { target: 'analyze-open', go: { route: '#/analyze' }, title: 'Analyse a file', place: 'bottom', body: 'Open a file here, or drop one anywhere on this page: its verdict, spectrogram and evidence. Nothing is uploaded, and no library is needed.' },
    ],
  },
  {
    id: 'themes', title: 'Themes and dark mode', summary: 'Change GLUE’s look.',
    steps: [
      { target: 'mode', go: { route: '#/' }, title: 'Dark or light', place: 'bottom', body: 'Switches between dark and light.' },
      { target: 'profile', title: 'Themes', place: 'bottom', body: 'Click your name, then pick a theme in “Who’s using GLUE?”.' },
    ],
  },
  {
    id: 'welcome-phone',
    phone: true,
    title: 'The first tour (phone)',
    summary: 'Your library, the player and search on the phone.',
    steps: [
      { title: 'Hi, I’m Gluey!', body: 'Your GLUE library is here on your phone. Three quick things.', pose: 'wave', place: 'center' },
      { target: 'phone-library', title: 'Your library', place: 'bottom', pose: 'point', body: 'All your songs and playlists. Songs on your computer play from there, through GLUE Home.' },
      { target: 'phone-tabs', title: 'Browse, playlists, search', place: 'top', pose: 'point', body: 'Browse by artist, album or genre, open your playlists, or search for a song.' },
      { target: 'help', title: 'I’m always here', place: 'top', pose: 'cheer', body: 'Tap me for help any time.' },
    ],
  },
];

export const tourById = (id: string) => TOURS.find(t => t.id === id) ?? null;
/** Every \`data-guide\` name the tours use (a test checks each one is in the UI). */
export const guideTargets = () => [...new Set(TOURS.flatMap(t => t.steps.flatMap(s => s.target ? s.target.split('|') : [])))];
