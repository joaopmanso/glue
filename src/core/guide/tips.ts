/* Gluey's tips (ADR 0126): one line the first time a part of GLUE is opened, and the tour that shows it. Pure. */
export const TIPS: Record<string, { text: string; tour?: string }> = {
  duplicates: { text: 'Duplicates are found by how songs sound. Each song shows as its best copy; clean up the others here, many at once.', tour: 'duplicates' },
  'no-file': { text: 'These songs are in a DJ library, but their files are gone. I can find most of them in your library.', tour: 'no-file' },
  quality: { text: 'Lower quality is for information: songs below a lossless file of their format. Nothing has to be done.', tour: 'quality' },
  browse: { text: 'Browse by artist, album, genre, label or year: pick one, then its songs.' },
  calendar: { text: 'Put your gigs here and give each a playlist; I’ll remind you of one with no music yet.', tour: 'calendar' },
  prepare: { text: 'Set the beat grid and cues before a set. Space plays, T taps the tempo, M is the metronome.', tour: 'prepare' },
};
