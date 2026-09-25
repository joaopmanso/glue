/* GLUE Home's web part talking to its Rust side and to the OS (ADR 0044): settings, the incoming
   folder, events between the two windows, start at login, the folder picker, links. */
import { invoke } from '@tauri-apps/api/core';
import { emit, emitTo, listen } from '@tauri-apps/api/event';

export const API = 'https://glue-api.joaopmanso.workers.dev';
export const WEBSITE = 'https://joaopmanso.github.io/glue/';

/** What GLUE Home keeps (config.json in the app's settings folder, readable by this user only). */
export interface HomeConfig {
  api?: string;
  deviceId: string | null;
  token: string | null;         // the device credential
  name: string;
  user: { email: string | null; name: string | null } | null;
  incoming: string | null;
  running: boolean;             // the service should be on (Stop in the tray turns it off)
  askedAutostart: boolean;      // the "start with this computer?" question was answered
  received?: Received[];        // the last songs received
  glue?: string | null;         // this computer's GLUE folder (the website's), read-only (ADR 0045)
  folders?: Record<string, string>;   // music folder id → where it is on this computer
  autoUpdate?: boolean;         // install updates by itself (on unless turned off)
  serve?: Record<string, boolean>;    // 'profile/collection' → shared with other computers (on unless false)
}
export interface Received { name: string; path: string; from: string; at: number; size: number }

/** What the service tells the settings window and the tray. */
export interface Status { state: 'unpaired' | 'stopped' | 'connecting' | 'online' | 'offline' | 'removed'; text: string; running: boolean; receiving: { name: string; got: number; size: number } | null; received: Received[];
  /** Finding the music folders of the shared collections (by itself). */
  library?: { searching: boolean; found: number; missing: { id: string; name: string; collection: string }[] } }

export const bridge = {
  config: () => invoke<HomeConfig | null>('get_config'),
  saveConfig: (config: HomeConfig) => invoke<void>('set_config', { config }),
  defaultIncoming: () => invoke<string>('default_incoming'),
  deviceName: () => invoke<string>('device_name'),
  begin: (name: string) => invoke<[number, string]>('incoming_begin', { name }),
  write: (id: number, bytes: Uint8Array) => invoke<void>('incoming_write', bytes, { headers: { 'x-id': String(id) } }),
  end: (id: number, ok: boolean) => invoke<string>('incoming_end', { id, ok }),
  trayStatus: (text: string, running: boolean) => invoke<void>('set_status', { text, running }),
  showSettings: () => invoke<void>('show_settings'),
  openLibrary: () => invoke<void>('open_library'),
  // This computer's GLUE library (read-only) and its music files.
  findGlue: () => invoke<string | null>('find_glue_folder'),
  knownFolders: () => invoke<{ home: string | null; music: string | null; documents: string | null; desktop: string | null; downloads: string | null; sep: string }>('known_folders'),
  exists: (path: string) => invoke<boolean>('path_exists', { path }),
  findFolder: (name: string, sample: string) => invoke<string | null>('find_folder', { name, sample }),
  glueRead: (rel: string) => invoke<string>('glue_read', { rel }),
  fileSize: (path: string) => invoke<number>('file_size', { path }),
  fileRead: (path: string, offset: number, len: number) => invoke<ArrayBuffer>('file_read', { path, offset, len }),
  // Between the windows.
  onConfig: (f: (c: HomeConfig) => void) => listen<HomeConfig>('config', e => f(e.payload)),
  onControl: (f: (what: 'start' | 'stop' | 'restart') => void) => listen<'start' | 'stop' | 'restart'>('control', e => f(e.payload)),
  control: (what: 'start' | 'stop' | 'restart') => emitTo('service', 'control', what),
  onStatus: (f: (s: Status) => void) => listen<Status>('status', e => f(e.payload)),
  status: (s: Status) => emit('status', s),
  askStatus: () => emit('status-request'),
  onAskStatus: (f: () => void) => listen('status-request', () => f()),
};

/** The OS: plugins loaded on demand, so the service window doesn't need them. */
export async function pickFolder(start?: string | null): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const r = await open({ directory: true, multiple: false, defaultPath: start ?? undefined, title: 'Where should songs sent to this computer go?' });
  return typeof r === 'string' ? r : null;
}
export async function askYesNo(message: string, title: string, yes: string, no: string): Promise<boolean> {
  const { ask } = await import('@tauri-apps/plugin-dialog');
  return ask(message, { title, kind: 'info', okLabel: yes, cancelLabel: no });
}
export async function autostart() { return import('@tauri-apps/plugin-autostart'); }
export async function openUrl(url: string) { const { openUrl } = await import('@tauri-apps/plugin-opener'); await openUrl(url); }
export async function openFolder(path: string) { const { openPath } = await import('@tauri-apps/plugin-opener'); await openPath(path); }
/** gluehome://pair?code=… links, at launch and while running. */
export async function onPairLink(f: (code: string) => void) {
  const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
  const take = (urls: string[] | null) => { for (const u of urls ?? []) { const m = /[?&]code=([\w-]+)/.exec(u); if (m) f(decodeURIComponent(m[1])); } };
  take(await getCurrent().catch(() => null));
  await onOpenUrl(take);
}
