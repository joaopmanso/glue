/* The visualiser in the open player (ADR 0068): festanqueiro/threejs-visualisers, loaded the first time
   it's shown (three.js and the themes are about 1.5 MB), reacting to the music through an analyser
   tapped off the player (made again for each song). Its theme and options are remembered in this
   browser. */
import { player } from './player.svelte';
import { readPref, writePref } from './prefs';
import type { Visualizer, VisualizerTheme, VisualizerThemeId } from 'threejs-visualisers';

type Mod = typeof import('threejs-visualisers');
const readJson = <T>(key: string, fallback: T): T => { try { return JSON.parse(readPref(key, '')) ?? fallback; } catch { return fallback; } };

class Viz {
  /** Shown in the open player. */
  on = $state(readPref('viz', '0') === '1');
  theme = $state(readPref('vizTheme', 'nebula'));
  /** Each theme's chosen options. */
  options = $state.raw<Record<string, Record<string, string>>>(readJson('vizOptions', {}));
  themes = $state.raw<VisualizerTheme[]>([]);
  loading = $state(false);
  error = $state('');
  private mod: Mod | null = null;
  private v: Visualizer | null = null;

  /** On or off. Called from a click: the music's audio graph starts inside it. */
  show(on: boolean) {
    this.on = on; writePref('viz', on ? '1' : '0');
    if (on) player.audioClock();
  }
  private async load(): Promise<Mod | null> {
    if (this.mod) return this.mod;
    this.loading = true; this.error = '';
    try { this.mod = await import('threejs-visualisers'); this.themes = this.mod.VISUALIZER_THEMES; return this.mod; }
    catch (e) { this.error = 'The visualiser couldn’t load: ' + (e as Error).message; return null; }
    finally { this.loading = false; }
  }
  /** Draw into `stage` until `unmount`. */
  async mount(stage: HTMLElement) {
    const mod = await this.load();
    if (!mod || !stage.isConnected || !this.on) return;
    this.unmount();
    const theme = (mod.VISUALIZER_THEMES.some(t => t.id === this.theme) ? this.theme : mod.VISUALIZER_THEMES[0].id) as VisualizerThemeId;
    this.theme = theme;
    player.tap('viz', ctx => mod.createAnalyser(ctx));
    try {
      this.v = new mod.Visualizer(stage, { analyser: () => player.analyser('viz'), theme, themeOptions: this.options[theme], pixelRatio: Math.min(devicePixelRatio, 1.5) });
    } catch (e) { this.error = 'This browser can’t draw it (WebGL): ' + (e as Error).message; player.untap('viz'); }
  }
  unmount() { this.v?.dispose(); this.v = null; player.untap('viz'); }

  get current(): VisualizerTheme | null { return this.themes.find(t => t.id === this.theme) ?? null; }
  /** The chosen value of one of the current theme's options (its first value by default). */
  value(optionId: string) { const o = this.current?.options?.find(x => x.id === optionId); return this.options[this.theme]?.[optionId] ?? o?.values[0].id ?? ''; }
  setTheme(id: string) {
    if (!this.themes.some(t => t.id === id)) return;
    this.theme = id; writePref('vizTheme', id);
    this.v?.setTheme(id as VisualizerThemeId, this.options[id]);
  }
  setOption(optionId: string, valueId: string) {
    this.options = { ...this.options, [this.theme]: { ...this.options[this.theme], [optionId]: valueId } };
    writePref('vizOptions', JSON.stringify(this.options));
    this.v?.setOption(optionId, valueId);
  }
  /** The next or previous theme (keys ← → and 1–9 on the stage). */
  step(dir: 1 | -1) { const i = this.themes.findIndex(t => t.id === this.theme), n = this.themes.length; if (n) this.setTheme(this.themes[(i + dir + n) % n].id); }
}

export const viz = new Viz();
