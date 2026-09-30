/* GLUE Home's web part talking to its Rust side and to the OS (ADR 0044): settings, the incoming
   folder, events between the two windows, start at login, the folder picker, links. */
import { invoke } from '@tauri-apps/api/core';
import { emit, emitTo, listen } from '@tauri-apps/api/event';

export const API = 'https://glue-api.joaopmanso.workers.dev';
export const WEBSITE = 'https://joaopmanso.github.io/glue/';

/** What GLUE Home keeps (config.json in the app's settings folder, readable by this user only). */
/** Songs GLUE Home analyses at a time when not set: this computer's cores less 4 (some left for
    everything else), 2 to 12. */
export const autoPool = () => { const n = navigator.hardwareConcurrency || 4; return Math.max(Math.min(2, n), Math.min(12, n - 4)); };

export interface HomeConfig {
  api?: string;
  /** The read-only token for a GLUE tab on this computer (ADR 0104): it reads, and asks the engine to change things. */
  readToken?: string;
  /** The DJ libraries GLUE Home follows (written by its Rust side, ADR 0065). */
  libraries?: unknown[];
  /** The analysis of this computer's songs is paused (ADR 0103): from the settings or a GLUE tab. */
  analysisPaused?: boolean;
  /** Songs analysed at a time (0 or none: automatic, cache.autoPool). */
  analysisWorkers?: number;
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
  localToken?: string;          // what the website on this computer shows the local link (ADR 0048)
  duplicates?: string | null;   // where duplicates the website puts aside go (ADR 0070)
  reminders?: boolean;          // notify of events that need music (ADR 0074; on unless false)
  /** The computer GLUE Home is on (ADR 0108): the account device its shared parts go under; learned from GLUE
      Cloud (its companion) or its music folders. None yet: nothing per computer is written. */
  computer?: string | null;
  /** Why it isn't known (for the Activity page). */
  computerWhy?: string;
}
export interface Received { name: string; path: string; from: string; at: number; size: number }

/** What the service tells the settings window and the tray. */
export interface Status { state: 'unpaired' | 'stopped' | 'connecting' | 'online' | 'offline' | 'removed'; text: string; running: boolean; receiving: { name: string; got: number; size: number } | null; received: Received[];
  /** Finding the music folders of the shared collections (by itself). */
  library?: { searching: boolean; found: number; missing: { id: string; name: string; collection: string }[] };
  /** Making mini spectrograms and analyses of the shared songs (ADR 0046). */
  analysis?: { done: number; total: number; running: boolean };
  /** Analysing this computer's songs for the library (ADR 0103). */
  analysing?: import('./analysis').AnalysisState;
  /** Which computer this is (ADR 0108), and how GLUE Home knows (or why it doesn't). */
  computer?: { id: string | null; why: string };
  /** The library engine (ADR 0104): its revision, and the jobs under way. */
  engine?: import('./engine').EngineStatus;
  /** What GLUE Home did lately, newest first (the settings window shows each new one as a toast). */
  events?: { at: number; text: string }[];
  /** The last look at the events (ADR 0074): when, how many need music, which were just notified. */
  reminders?: { at: number; coming: number; sent: string[] };
  /** What other devices asked since GLUE Home started, by kind (ADR 0083). */
  served?: Record<string, Activity> }
/** How many, the time spent (ms), the bytes. */
export interface Activity { calls: number; ms: number; bytes: number }

export const bridge = {
  config: () => invoke<HomeConfig | null>('get_config'),
  saveConfig: (config: HomeConfig) => invoke<void>('set_config', { config }),
  /** Change some settings over what's saved now, never over a copy held in memory (another window, or the
      local link's folder dialog, may have saved since): `f` sees the current settings and returns only
      what changes (null: nothing). The settings saved. */
  patchConfig: async (f: (cur: HomeConfig) => Partial<HomeConfig> | null): Promise<HomeConfig | null> => {
    const cur = await invoke<HomeConfig | null>('get_config');
    if (!cur) return null;
    const p = f(cur);
    if (!p) return cur;
    const next = { ...cur, ...p } as HomeConfig;
    await invoke<void>('set_config', { config: next });
    return next;
  },
  defaultIncoming: () => invoke<string>('default_incoming'),
  defaultDuplicates: () => invoke<string>('default_duplicates'),
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
  // GLUE Home's own cache (mini spectrograms, analyses) and the incoming folder.
  cacheRead: (rel: string) => invoke<ArrayBuffer>('cache_read', { rel }),
  cacheWrite: (rel: string, bytes: Uint8Array) => invoke<void>('cache_write', bytes, { headers: { 'x-rel': rel } }),
  cacheList: (rel: string) => invoke<string[]>('cache_list', { rel }),
  /** What GLUE Home's own side was asked since it started: the local link, the service page's file reads (ADR 0083). */
  activity: () => invoke<{ seconds: number; counts: Record<string, Activity> }>('activity_now'),
  incomingList: () => invoke<{ name: string; size: number; mtime: number; path: string }[]>('incoming_list'),
  incomingMove: (name: string, to: string) => invoke<string>('incoming_move', { name, to }),
  localPort: () => invoke<number>('local_port'),
  glueRead: (rel: string) => invoke<string>('glue_read', { rel }),
  glueList: (rel: string) => invoke<string[]>('glue_list', { rel }),
  fileSize: (path: string) => invoke<number>('file_size', { path }),
  fileRead: (path: string, offset: number, len: number) => invoke<ArrayBuffer>('file_read', { path, offset, len }),
  /** A cover service's answer (ADR 0086); GLUE Home only reaches Deezer, iTunes and MusicBrainz. */
  webGet: (url: string) => invoke<ArrayBuffer>('web_get', { url }),
  /** A GLUE tab here holds the writer lease (ADR 0087). */
  leaseHeld: () => invoke<boolean>('lease_held'),
  /** The library engine's answer to a website request on the local link (ADR 0104). */
  rpcReply: (id: number, body: string) => invoke<void>('rpc_reply', { id, body }),
  // Between the windows.
  onConfig: (f: (c: HomeConfig) => void) => listen<HomeConfig>('config', e => f(e.payload)),
  /** A website request for the library engine, from the local link (`read`: its read-only token). */
  onRpc: (f: (m: { id: number; body: string; read: boolean }) => void) => listen<{ id: number; body: string; read: boolean }>('rpc', e => f(e.payload)),
  onControl: (f: (what: 'start' | 'stop' | 'restart') => void) => listen<'start' | 'stop' | 'restart'>('control', e => f(e.payload)),
  control: (what: 'start' | 'stop' | 'restart') => emitTo('service', 'control', what),
  onStatus: (f: (s: Status) => void) => listen<Status>('status', e => f(e.payload)),
  status: (s: Status) => emit('status', s),
  askStatus: () => emit('status-request'),
  onAskStatus: (f: () => void) => listen('status-request', () => f()),
  /** The settings' "Check now" for reminders. */
  remindNow: () => emitTo('service', 'remind-now'),
  onRemindNow: (f: () => void) => listen('remind-now', () => f()),
  /** A browser on this computer asked to join it (ADR 0091): its request's body. */
  onAttach: (f: (body: string) => void) => listen<string>('attach', e => f(e.payload)),
};

/** A desktop notification (ADR 0074); false when the OS doesn't allow them. */
export async function notify(title: string, body: string): Promise<boolean> {
  const n = await import('@tauri-apps/plugin-notification');
  let ok = await n.isPermissionGranted();
  if (!ok) ok = (await n.requestPermission()) === 'granted';
  if (ok) n.sendNotification({ title, body });
  return ok;
}

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
