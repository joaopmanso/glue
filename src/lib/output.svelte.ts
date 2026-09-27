/* Where the music comes out (ADR 0068): the sound cards the browser offers (Chromium's setSinkId on the
   player's element and its AudioContext), remembered in this browser. Browsers play through the
   operating system's shared audio (WASAPI on Windows); ASIO and the like need GLUE Home (a later step).
   Chromium lists every device (with its name) only once the page may use the microphone; before that,
   just the default ones. GLUE asks for that on request, and never records anything. */
import { player } from './player.svelte';
import { lib } from './library.svelte';
import { readPref, writePref } from './prefs';

export interface OutputDevice { id: string; label: string }

class Output {
  /** Picking an output is possible in this browser. */
  readonly supported = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  devices = $state.raw<OutputDevice[]>([]);
  /** The browser tells the devices' names (after the microphone was allowed once). */
  named = $state(false);
  /** The chosen device ('' = the system's default). */
  id = $state(readPref('audioOut', ''));
  private started = false;

  /** List the devices, and use the remembered one (once, when the library opens). */
  async start() {
    if (this.started || !this.supported || !navigator.mediaDevices?.enumerateDevices) return;
    this.started = true;
    navigator.mediaDevices.addEventListener('devicechange', () => void this.refresh());
    await this.refresh();
    if (this.id) await this.choose(this.id, true);
  }
  async refresh() {
    try {
      const ds = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
      this.devices = ds.map((d, i) => ({ id: d.deviceId, label: d.label || 'Output ' + (i + 1) }));
      this.named = ds.some(d => d.label);
      // The chosen one went away (unplugged): back to the default.
      if (this.id && this.devices.length && !this.devices.some(d => d.id === this.id)) { lib.notice = 'The chosen sound output isn’t there any more: playing through the default one.'; await this.choose(''); }
    } catch { this.devices = []; }
  }
  /** Ask once for the microphone, only so the browser lists every device (nothing is recorded). */
  async askNames() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const t of s.getTracks()) t.stop();
    } catch { lib.notice = 'Without that permission the browser only offers the default output.'; }
    await this.refresh();
  }
  async choose(id: string, quiet = false) {
    try {
      await player.setSink(id);
      this.id = id; writePref('audioOut', id);
      if (!quiet) lib.notice = 'Playing through ' + (id ? this.devices.find(d => d.id === id)?.label ?? 'that output' : 'the default output') + '.';
    } catch (e) {
      if (!quiet) lib.notice = 'Couldn’t use that output: ' + (e as Error).message;
      if (id) { this.id = ''; writePref('audioOut', ''); }
    }
  }
  get label() { return this.id ? this.devices.find(d => d.id === this.id)?.label ?? 'Chosen output' : 'Default output'; }
}

export const output = new Output();
