/* A set (ADR 0199): a playlist laid out as a mix. Every song runs on one clock of mix beats, so songs that overlap are
   beat-matched by construction: song j at mix beat b is at `in + (b − start) · 60 / bpm` seconds into its file. The
   tempo map (tempo.ts) turns mix beats into seconds. Plain JSON, kept on the playlist (`List.set`). */

/** How one song hands over to the next. */
/** `layer`: the two play along (the incoming one's bass held back), then the outgoing one's bass and volume go. */
export type FxStyle = 'blend' | 'bassSwap' | 'filter' | 'echo' | 'cut' | 'double' | 'layer';
/** How the whole set is mixed: one song at a time, continuous blends, double drops. */
export type SetStyle = 'single' | 'blend' | 'double';

export interface SetItem {
  id: string;
  /** Its lane, 0-based. */
  deck: number;
  /** The song's tempo and first beat (s) as planned: its grid. */
  bpm: number;
  beat0: number;
  /** Seconds into the file where it starts playing (a downbeat). */
  in: number;
  /** The mix beat where `in` plays (a multiple of 4: a bar). */
  start: number;
  /** How many beats it plays. */
  beats: number;
  keyLock: boolean;
  /** Gain (dB) to bring it to the set's loudness, from its sound profile. */
  trim?: number;
  /** The hand-over into the next song (over the overlap); `drop`: beats into the overlap where both drops land. */
  fx?: { style: FxStyle; drop?: number };
  /** Planned without a grid from a DJ app or Prepare: the first beat guessed. */
  guessed?: boolean;
}

export interface SetPlan {
  v: 1;
  decks: 2 | 3;
  style: SetStyle;
  /** 'songs': each song's own tempo (held through its hand-over, eased between); 'fixed': one BPM all through. */
  tempo: { mode: 'songs' | 'fixed'; bpm?: number };
  items: SetItem[];
  /** The length asked for (s): songs play shorter, and the last ones are left out, to fit (ADR 0202). */
  length?: number;
  /** When it was planned; `edited`: the user changed it since. */
  at: string;
  edited?: boolean;
}

/** The mix's sample rate: every song is resampled to it. */
export const MIX_RATE = 44100;
