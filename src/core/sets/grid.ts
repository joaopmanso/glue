/* A song's beat grid for any song (ADR 0199), Prepare's rule (ADR 0052, 0169) without Prepare: the user's grid, else
   the main DJ library's (unless GLUE's BPM is the user's own), else placed on the song's waveform for the BPM in use.
   Pure. */
import { beatGrid, type Waveform } from '../audio/waveform';
import type { Grid } from '../library/grid';

export function gridFor(prep: { bpm?: number; beat0?: number; bar?: number } | null | undefined, bpm: number | null, main: Grid | null, wave: Waveform | null): (Grid & { guessed?: boolean }) | null {
  if (!bpm) return null;
  if (prep?.beat0 != null) return { bpm, beat0: prep.beat0, bar: prep.bar ?? 0 };
  if (main && prep?.bpm == null) return main;
  if (!wave) return { bpm, beat0: 0, bar: 0, guessed: true };
  return { bpm, ...beatGrid(wave.env, wave.envRate, wave.envT0, bpm, { data: wave.peak, rate: wave.rate }) };
}
