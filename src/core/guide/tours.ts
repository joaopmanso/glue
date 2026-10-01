/* Gluey's tours (ADR 0126): each a few stops, each stop pointing at a part of GLUE marked \`data-guide="…"\` in the UI.
   Data only: the guide (lib/guide.svelte.ts) runs them, GuideLayer draws them. Pure. */

export type Pose = 'wave' | 'point' | 'think' | 'cheer';
export type Place = 'right' | 'left' | 'top' | 'bottom' | 'center';

/** What to open before a stop is shown. */
export type Go =
  | { route: string }                                   // a page, e.g. '#/' or '#/events'
  | { view: 'all' | 'dupes' | 'unlinked' | 'attention' | 'pending' }   // a library view
  | { song: 'first' };                                  // the first song's page

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
        body: 'Sign in to use your library on your laptop and phone. GLUE Home, a small app for your computer, analyses with the browser closed and plays your songs on your other devices.' },
      { target: 'help', title: 'I’m always here', place: 'top', pose: 'cheer',
        body: 'Click me any time for help, and for a tour of each feature: duplicates, songs with no file, Prepare, the calendar, GLUE Home and more. Have fun!' },
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
export const guideTargets = () => [...new Set(TOURS.flatMap(t => t.steps.map(s => s.target).filter((x): x is string => !!x)))];
